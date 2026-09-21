/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Per-instance loopback HTTP server for the Fluent containers canvas.
//
// The canvas has no `postMessage` channel to the extension host, so this server
// is the transport underneath one: POST /rpc carries inbound tRPC frames into
// the bridge, and GET /events streams outbound frames back. Everything above
// that line -- router, procedures, validation -- is the same code you would
// write for a real VS Code webview.
//
// The runtime adapter is imported from the sibling `containers` extension
// rather than copied, so the two canvases cannot drift apart.

import { createServer } from "node:http";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { WebSocketServer } from "ws";

import { createRpcBridge } from "./src/host-entry.mjs";
import { findTarget, followLogs, followStats, detectRuntime } from "./src/runtime.mjs";
import { createExecSessions } from "./execSessions.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
// When bundled into bundle/host.mjs, HERE is the bundle directory itself rather
// than the extension root, so joining "bundle/webview" would double the segment.
const EXTENSION_ROOT = path.basename(HERE) === "bundle" ? path.dirname(HERE) : HERE;
const WEBVIEW_DIR = path.join(EXTENSION_ROOT, "bundle", "webview");

const MIME = {
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".map": "application/json; charset=utf-8",
};

async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
        size += chunk.length;
        if (size > 1024 * 1024) throw new Error("Request body too large.");
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString("utf8");
}

/*
 * `docker stats` reports human strings ("2.605MiB / 31.32GiB", "0.40%").
 * Parsing them here rather than in the webview keeps the UI free of unit
 * arithmetic and means a chart plots real numbers instead of guessing.
 */
const UNITS = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 };

function toBytes(text) {
    const m = String(text ?? "").trim().match(/^([\d.]+)\s*([a-zA-Z]*)$/);
    if (!m) return null;
    const value = Number(m[1]);
    if (!Number.isFinite(value)) return null;
    return value * (UNITS[m[2].toLowerCase()] ?? 1);
}

function toPercent(text) {
    const value = Number(String(text ?? "").replace("%", "").trim());
    return Number.isFinite(value) ? value : null;
}

/** One `docker stats` line -> a plottable sample. */
function normalizeSample(raw) {
    const [memUsed, memLimit] = String(raw.MemUsage ?? "").split("/");
    const [netRx, netTx] = String(raw.NetIO ?? "").split("/");
    const [blkRead, blkWrite] = String(raw.BlockIO ?? "").split("/");
    return {
        id: raw.ID,
        name: raw.Name,
        at: Date.now(),
        cpu: toPercent(raw.CPUPerc),
        memPercent: toPercent(raw.MemPerc),
        memBytes: toBytes(memUsed),
        memLimitBytes: toBytes(memLimit),
        netRx: toBytes(netRx),
        netTx: toBytes(netTx),
        blkRead: toBytes(blkRead),
        blkWrite: toBytes(blkWrite),
        pids: Number(raw.PIDs) || 0,
    };
}

export async function startCanvasServer({ instanceId, sendToChat, log, workingDirectory }) {
    const bridge = createRpcBridge({ sendToChat, workingDirectory });
    // The most recent deep-link, replayed to each new stream. Reopening the
    // canvas with a different target overwrites it, so a reconnecting iframe
    // lands where the user was last sent rather than somewhere historical.
    let pendingFocus = null;

    // Set once the port is known; until then nothing can be same-origin anyway.
    let selfOrigin = null;

    /*
     * A capability token for this panel.
     *
     * Minted per instance and carried in the URL the host opens, so the panel
     * has it and a process that merely guessed the port does not. Defence in
     * depth rather than authentication: anything local that can reach this port
     * can usually reach the container runtime directly, so the honest claim is
     * that this raises the cost of a port scan. The origin guard below is what
     * actually keeps web pages out.
     */
    const token = randomBytes(16).toString("hex");

    /** Routes that expose container data or act on containers. */
    const GUARDED = new Set(["/rpc", "/events", "/logs", "/stats"]);

    /**
     * Compare in constant time.
     *
     * Over loopback against a 128-bit value this is not a realistic attack, but
     * a secret compared with `===` is the sort of thing that costs a reviewer's
     * attention, and the fix is one line.
     */
    const tokenMatches = (candidate) => {
        const given = Buffer.from(String(candidate ?? ""), "utf8");
        const expected = Buffer.from(token, "utf8");
        return given.length === expected.length && timingSafeEqual(given, expected);
    };

    const hasToken = (url) => tokenMatches(url.searchParams.get("t"));

    /**
     * Refuse anything a web page could have sent.
     *
     * This server is plain TCP on loopback, and a page the user happens to open
     * can reach that where it could not reach a named pipe or run the runtime
     * CLI. A local process is a different matter -- one that can talk to this
     * port can almost always talk to the container runtime directly -- so the
     * goal here is specifically to exclude browsers, not to authenticate peers.
     *
     * Measured against the real WebView2 panel, which sends
     * `Origin: http://127.0.0.1:<port>` and `Sec-Fetch-Site: same-origin`.
     * Requests with no `Origin` at all (curl, the agent's own probes) are
     * allowed: those are not browsers.
     */
    function fromForeignPage(req) {
        const site = req.headers["sec-fetch-site"];
        // Chromium sends this on every fetch; anything but same-origin/none is
        // a page on another site reaching in.
        if (site && site !== "same-origin" && site !== "none") return true;
        const origin = req.headers.origin;
        if (origin && origin !== selfOrigin) return true;
        return false;
    }

    async function handle(req, res) {
        const url = new URL(req.url ?? "/", "http://127.0.0.1");
        const route = url.pathname;

        if (fromForeignPage(req)) {
            res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("This canvas only serves its own panel.");
            return;
        }

        // Static assets are exempt: they are this bundle, they carry no
        // container data, and the HTML references them with relative URLs that
        // would all need rewriting.
        if (GUARDED.has(route) && !hasToken(url)) {
            res.writeHead(403, { "Content-Type": "text/plain; charset=utf-8" });
            res.end("Missing or invalid panel token.");
            return;
        }

        // Inbound tRPC frames: the iframe's postMessage shim POSTs here.
        if (route === "/rpc") {
            if (req.method !== "POST") {
                res.writeHead(405).end();
                return;
            }
            // Insisting on JSON is not pedantry: `application/json` is not a
            // CORS-safelisted content type, so a cross-origin POST has to be
            // preflighted, and nothing here answers OPTIONS. A page therefore
            // cannot reach this route at all, rather than reaching it blind and
            // simply not being able to read the reply.
            if (!String(req.headers["content-type"] ?? "").toLowerCase().startsWith("application/json")) {
                res.writeHead(415, { "Content-Type": "text/plain; charset=utf-8" });
                res.end("Expected application/json.");
                return;
            }
            try {
                bridge.deliver(JSON.parse(await readBody(req)));
                res.writeHead(202).end();
            } catch {
                if (!res.headersSent) res.writeHead(400).end();
            }
            return;
        }

        // Outbound frames: one SSE stream per iframe.
        if (route === "/events") {
            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write(": connected\n\n");
            const detach = bridge.addSink((message) => {
                try { res.write(`data: ${JSON.stringify(message)}\n\n`); } catch { /* closed */ }
            });
            const heartbeat = setInterval(() => {
                try { res.write(": ping\n\n"); } catch { /* closed */ }
            }, 25_000);
            const cleanup = () => {
                clearInterval(heartbeat);
                detach();
            };
            res.on("close", cleanup);
            res.on("error", cleanup);
            // Replay current state so a fresh iframe paints without waiting.
            const state = bridge.getState();
            if (state) res.write(`data: ${JSON.stringify({ type: "canvas:state", state })}\n\n`);
            // ...and replay the pending focus, because `open()` resolves the
            // deep-link before the iframe exists. Broadcasting at that moment
            // reaches nobody, so the frame is held until a stream connects.
            if (pendingFocus) res.write(`data: ${JSON.stringify(pendingFocus)}\n\n`);
            // Same reasoning for the command log: a panel opened after the
            // agent ran something would otherwise show an empty audit trail,
            // which is worse than no trail at all -- it implies nothing ran.
            for (const entry of bridge.getExecLog()) {
                res.write(`data: ${JSON.stringify({ type: "exec", entry })}\n\n`);
            }
            return;
        }

        // A follow stream: `docker logs -f` piped to the panel.
        //
        // Deliberately not a tRPC procedure. A procedure is request/response,
        // and this is an open-ended stream whose lifetime is the connection --
        // when the panel navigates away or closes, the socket drops and the
        // child process must die with it. Modelling that as its own SSE route
        // makes the ownership obvious.
        if (route === "/logs") {
            const requested = url.searchParams.get("id") ?? "";
            // Resolve against loaded state rather than passing the query string
            // to the runtime: only a container that is actually in the list can
            // be followed.
            const state = bridge.getState() ?? { containers: [], images: [] };
            const target = findTarget(state, requested);
            if (!target || target.kind !== "container") {
                res.writeHead(404, { "Content-Type": "application/json" });
                res.end(JSON.stringify({ error: `No container matches "${requested}".` }));
                return;
            }

            const rawTail = Number(url.searchParams.get("tail"));
            const tail = Number.isFinite(rawTail) ? Math.max(1, Math.min(5000, Math.trunc(rawTail))) : 200;

            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write(": following\n\n");

            let stop = null;
            let closed = false;
            const send = (frame) => {
                if (closed) return;
                try { res.write(`data: ${JSON.stringify(frame)}\n\n`); } catch { /* closed */ }
            };
            const cleanup = () => {
                if (closed) return;
                closed = true;
                try { stop?.(); } catch { /* already gone */ }
                clearInterval(heartbeat);
            };
            const heartbeat = setInterval(() => {
                if (!closed) { try { res.write(": ping\n\n"); } catch { /* closed */ } }
            }, 25_000);

            res.on("close", cleanup);
            res.on("error", cleanup);

            followLogs(target.id, {
                tail,
                onData: (chunk) => send({ type: "log", chunk }),
                onEnd: () => { send({ type: "end" }); cleanup(); res.end(); },
            }).then((stopFn) => {
                stop = stopFn;
                // The socket can close while the runtime is still starting up,
                // which would otherwise leak the child process.
                if (closed) { try { stopFn(); } catch { /* already gone */ } }
            }).catch((error) => {
                send({ type: "error", message: String(error?.message ?? error) });
                cleanup();
                res.end();
            });
            return;
        }

        // Live resource usage. Same shape as /logs: a stream whose lifetime is
        // the connection, so the child dies when the panel navigates away.
        if (route === "/stats") {
            const requested = url.searchParams.get("id") ?? "";
            let targetId = null;
            if (requested) {
                const state = bridge.getState() ?? { containers: [], images: [] };
                const target = findTarget(state, requested);
                if (!target || target.kind !== "container") {
                    res.writeHead(404, { "Content-Type": "application/json" });
                    res.end(JSON.stringify({ error: `No container matches "${requested}".` }));
                    return;
                }
                targetId = target.id;
            }

            res.writeHead(200, {
                "Content-Type": "text/event-stream; charset=utf-8",
                "Cache-Control": "no-cache, no-transform",
                Connection: "keep-alive",
            });
            res.write(": sampling\n\n");

            let stop = null;
            let closed = false;
            const send = (frame) => {
                if (closed) return;
                try { res.write(`data: ${JSON.stringify(frame)}\n\n`); } catch { /* closed */ }
            };
            const cleanup = () => {
                if (closed) return;
                closed = true;
                try { stop?.(); } catch { /* already gone */ }
                clearInterval(heartbeat);
            };
            const heartbeat = setInterval(() => {
                if (!closed) { try { res.write(": ping\n\n"); } catch { /* closed */ } }
            }, 25_000);

            res.on("close", cleanup);
            res.on("error", cleanup);

            followStats(targetId, {
                onSample: (raw) => send({ type: "sample", sample: normalizeSample(raw) }),
                onEnd: () => { send({ type: "end" }); cleanup(); res.end(); },
            }).then((stopFn) => {
                stop = stopFn;
                if (closed) { try { stopFn(); } catch { /* already gone */ } }
            }).catch((error) => {
                send({ type: "error", message: String(error?.message ?? error) });
                cleanup();
                res.end();
            });
            return;
        }

        if (req.method !== "GET") {
            res.writeHead(405).end();
            return;
        }

        const relative = route === "/" ? "index.html" : route.replace(/^\/+/, "");
        const file = path.join(WEBVIEW_DIR, relative);
        // Containment check: the served path must stay inside bundle/webview.
        if (file !== WEBVIEW_DIR && !file.startsWith(WEBVIEW_DIR + path.sep)) {
            res.writeHead(403).end("no");
            return;
        }
        try {
            const body = await readFile(file);
            res.writeHead(200, {
                "Content-Type": MIME[path.extname(file).toLowerCase()] ?? "application/octet-stream",
                "Cache-Control": "no-store",
            });
            res.end(body);
        } catch {
            res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(`Not found: ${relative}. Has \`node build.mjs\` been run?`);
        }
    }

    const server = createServer((req, res) => {
        handle(req, res).catch((error) => {
            if (res.headersSent) {
                res.end();
                return;
            }
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: String(error?.message || error) }));
        });
    });

    await new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(0, "127.0.0.1", () => {
            server.removeListener("error", reject);
            selfOrigin = `http://127.0.0.1:${server.address().port}`;
            resolve();
        });
    });

    /*
     * Terminal transport.
     *
     * A WebSocket rather than the SSE + POST pair used elsewhere: a terminal is
     * genuinely bidirectional and latency-sensitive, and every keystroke going
     * out as its own HTTP request would be both slow and ugly.
     *
     * One socket owns exactly one shell. The session is killed when the socket
     * closes, so navigating away or closing the panel cannot leave a shell
     * running inside a container.
     */
    const execs = createExecSessions({ runtimeBin: (await detectRuntime())?.bin ?? "docker" });
    // `verifyClient` runs before the upgrade completes, so a page is refused at
    // the handshake rather than getting a live socket onto a container shell.
    // WebSocket upgrades are not subject to CORS, so this check is the only
    // thing standing between a foreign page and `docker exec`.
    const wss = new WebSocketServer({
        server,
        path: "/exec",
        verifyClient: ({ req }) => {
            if (fromForeignPage(req)) return false;
            // Upgrades bypass CORS entirely, so this is the only check standing
            // between a page and a shell inside a container.
            return hasToken(new URL(req.url ?? "/", "http://127.0.0.1"));
        },
    });

    wss.on("connection", async (socket, req) => {
        const requested = new URL(req.url ?? "/", "http://127.0.0.1").searchParams.get("id") ?? "";
        const send = (frame) => {
            if (socket.readyState === socket.OPEN) socket.send(JSON.stringify(frame));
        };

        const state = bridge.getState() ?? { containers: [], images: [] };
        const target = findTarget(state, requested);
        if (!target || target.kind !== "container") {
            send({ type: "error", message: `No container matches "${requested}".` });
            socket.close();
            return;
        }
        if (target.state !== "running") {
            send({ type: "error", message: `${target.name} is not running, so there is nothing to attach a shell to.` });
            socket.close();
            return;
        }

        let sessionId = null;
        try {
            const started = await execs.start({
                containerId: target.id,
                cols: Number(new URL(req.url, "http://127.0.0.1").searchParams.get("cols")) || 80,
                rows: Number(new URL(req.url, "http://127.0.0.1").searchParams.get("rows")) || 24,
                onData: (chunk) => send({ type: "data", data: chunk }),
                onExit: (code) => { send({ type: "exit", code }); socket.close(); },
            });
            sessionId = started.id;
            send({ type: "ready", shell: started.shell, container: target.name });
        } catch (error) {
            send({ type: "error", message: String(error?.message ?? error) });
            socket.close();
            return;
        }

        socket.on("message", (raw) => {
            let frame;
            try { frame = JSON.parse(raw.toString()); } catch { return; }
            if (frame.type === "data" && typeof frame.data === "string") {
                execs.write(sessionId, frame.data);
            } else if (frame.type === "resize") {
                execs.resize(sessionId, frame.cols, frame.rows);
            }
        });

        const done = () => { if (sessionId) execs.kill(sessionId); };
        socket.on("close", done);
        socket.on("error", done);
    });

    const port = server.address().port;

    try {
        await bridge.refresh({ force: false });
    } catch (error) {
        log?.(`containers-canvas: initial load failed — ${error?.message ?? error}`, "warning");
    }

    return {
        url: `http://127.0.0.1:${port}/#t=${token}`,
        refresh: (options) => bridge.refresh(options),
        getState: () => bridge.getState(),
        describeProcedures: () => bridge.describeProcedures(),
        callProcedure: (name, input) => bridge.callProcedure(name, input),
        findTarget: (target) => findTarget(bridge.getState() ?? { containers: [], images: [] }, target),
        /**
         * Push a control frame to every open iframe for this instance.
         *
         * Used to deep-link the panel when the agent opens it: "show me the
         * logs for web" should arrive as a focused view, not as a list the
         * user then has to navigate themselves.
         */
        broadcast: (frame) => {
            if (frame?.type === "focus") pendingFocus = frame;
            bridge.broadcast(frame);
        },
        async close() {
            // Shells first: a leaked `docker exec` outlives the panel and keeps
            // a process running inside the user's container.
            execs.disposeAll();
            wss.close();
            bridge.dispose();
            await new Promise((resolve) => server.close(resolve));
        },
    };
}
