/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Drives the real panel in a real browser against a real Docker daemon.
//
// Every other check in this package reads bytes: unit tests import `src/`, the
// build measures file sizes, the drift check compares hashes. None of them can
// see whether the panel renders, whether a lazily-loaded view arrives, or
// whether a button is connected to anything. That gap has produced real bugs:
//
//   * a `dist/dist/webview` path error that would have blanked every panel
//   * detail and sub-views rendering a stale snapshot after a container changed
//   * a privileged-container warning that was implemented, tested, and never
//     wired to the view
//   * a Commands button that was passed a handler it never called, leaving a
//     documented view unreachable
//
// Each assertion below corresponds to one of those. They are the cases where
// green unit tests said nothing useful.
//
// No new dependencies: the panel server runs in-process, and Edge is driven
// over the DevTools protocol using the `ws` client the server already uses.
//
//   node scripts/verifyPanel.mjs
//
// Requires Docker and Microsoft Edge. Exits 0 with an explanation when either
// is missing, so it never fails a machine that simply cannot run it.

import { execFile, spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

import WebSocket from "ws";

const exec = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const PLAIN = "canvasverify-plain";
const PRIVILEGED = "canvasverify-privileged";
// Created stopped, and destroyed by the Remove button rather than by teardown:
// the point of the check is that the panel can remove a container at all.
const REMOVABLE = "canvasverify-removable";

const results = [];
function record(name, ok, detail) {
    results.push({ name, ok, detail });
    console.error(`  ${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

/* ------------------------------------------------------------------ *
 * Environment
 * ------------------------------------------------------------------ */

async function findEdge() {
    const candidates = [
        join(process.env["ProgramFiles(x86)"] ?? "", "Microsoft/Edge/Application/msedge.exe"),
        join(process.env.ProgramFiles ?? "", "Microsoft/Edge/Application/msedge.exe"),
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        "/usr/bin/microsoft-edge",
        "/usr/bin/google-chrome",
    ];
    const { existsSync } = await import("node:fs");
    return candidates.find((path) => path && existsSync(path)) ?? null;
}

async function dockerReady() {
    try {
        await exec("docker", ["version", "--format", "{{.Server.Os}}"], { timeout: 20_000 });
        return true;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ *
 * A minimal DevTools client
 * ------------------------------------------------------------------ */

async function attachToPage(debugPort, url) {
    // The browser needs a moment before its debugging endpoint answers.
    let version = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        try {
            version = await (await fetch(`http://127.0.0.1:${debugPort}/json/version`)).json();
            break;
        } catch {
            await wait(250);
        }
    }
    if (!version) throw new Error("browser never exposed its debugging endpoint");

    const socket = new WebSocket(version.webSocketDebuggerUrl, { maxPayload: 256 * 1024 * 1024 });
    await new Promise((resolve, reject) => {
        socket.once("open", resolve);
        socket.once("error", reject);
    });

    let nextId = 0;
    const send = (method, params, sessionId) => new Promise((resolve) => {
        const id = ++nextId;
        const onMessage = (raw) => {
            const message = JSON.parse(raw);
            if (message.id !== id) return;
            socket.off("message", onMessage);
            resolve(message);
        };
        socket.on("message", onMessage);
        socket.send(JSON.stringify({ id, method, params, sessionId }));
    });

    const target = await send("Target.createTarget", { url });
    const attached = await send("Target.attachToTarget", { targetId: target.result.targetId, flatten: true });
    const sessionId = attached.result.sessionId;
    await send("Runtime.enable", {}, sessionId);
    await send("Log.enable", {}, sessionId);
    await send("Network.enable", {}, sessionId);

    const consoleErrors = [];
    const failedRequests = [];
    const requestUrls = new Map();
    socket.on("message", (raw) => {
        const message = JSON.parse(raw);
        if (message.method === "Runtime.exceptionThrown") {
            const details = message.params.exceptionDetails;
            consoleErrors.push((details.exception?.description ?? details.text ?? "").split("\n")[0]);
        }
        if (message.method === "Log.entryAdded" && message.params.entry.level === "error") {
            // A console error for a failed request carries no URL, so the
            // network events below are what make it identifiable.
            consoleErrors.push(message.params.entry.text);
        }
        if (message.method === "Network.responseReceived" && message.params.response.status >= 400) {
            failedRequests.push(`${message.params.response.status} ${message.params.response.url}`);
        }
        if (message.method === "Network.requestWillBeSent") {
            requestUrls.set(message.params.requestId, message.params.request.url);
        }
        if (message.method === "Network.loadingFailed") {
            const url = requestUrls.get(message.params.requestId) ?? "(unknown url)";
            failedRequests.push(`${message.params.errorText} ${url}`);
        }
    });

    const evaluate = async (expression) => {
        const reply = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, sessionId);
        if (reply.result?.exceptionDetails) {
            throw new Error(reply.result.exceptionDetails.exception?.description ?? "evaluate failed");
        }
        return reply.result.result.value;
    };

    return { evaluate, consoleErrors, failedRequests, close: () => socket.close() };
}

/** Poll an expression until it returns something truthy. */
async function until(evaluate, expression, label, timeoutMs = 45_000) {
    const startedAt = Date.now();
    for (;;) {
        const value = await evaluate(expression);
        if (value) return value;
        if (Date.now() - startedAt > timeoutMs) throw new Error(`timed out waiting for ${label}`);
        await wait(250);
    }
}

/* ------------------------------------------------------------------ *
 * Page helpers, written against what the panel actually renders
 * ------------------------------------------------------------------ */

const ROWS = `document.querySelectorAll('[role="row"]').length`;

const selectRow = (name) => `(() => {
    const row = [...document.querySelectorAll('[role="row"]')]
        .find((candidate) => candidate.innerText.replace(/\\s+/g, " ").trim().startsWith("${name} "));
    if (!row) return 0;
    row.click();
    return 1;
})()`;

const clickButton = (label) => `(() => {
    const button = [...document.querySelectorAll("button")].find((candidate) =>
        (candidate.innerText || candidate.getAttribute("aria-label") || "").trim().toLowerCase() === "${label}");
    if (!button || button.disabled) return 0;
    button.click();
    return 1;
})()`;

/**
 * Click a control once it exists and is enabled.
 *
 * A lifecycle button is disabled while an operation is in flight, and the state
 * badge is refreshed by a daemon event independently of that. So a control can
 * read as up to date and still reject the click for another half second.
 * Evaluating `clickButton` once silently did nothing in that window, which
 * looked exactly like a missing button.
 */
async function click(evaluate, label, timeoutMs = 30_000) {
    const startedAt = Date.now();
    for (;;) {
        if (await evaluate(clickButton(label))) return true;
        if (Date.now() - startedAt > timeoutMs) return false;
        await wait(250);
    }
}

const DETAIL = `(() => {
    const verbs = ["start", "stop", "restart", "pause", "unpause", "remove"];
    const buttons = [...document.querySelectorAll("button")]
        .map((button) => (button.innerText || button.getAttribute("aria-label") || "").trim().toLowerCase());
    const badges = [...document.querySelectorAll('[class*="fui-Badge"]')].map((badge) => badge.innerText.trim());
    return JSON.stringify({
        state: badges.find((badge) => /^(running|paused|exited|created)$/.test(badge)) ?? "?",
        verbs: [...new Set(buttons.filter((label) => verbs.includes(label)))],
    });
})()`;

const bodyHas = (pattern) => `/${pattern}/i.test(document.body.innerText)`;

/* ------------------------------------------------------------------ *
 * Fixtures
 * ------------------------------------------------------------------ */

const KEEP_ALIVE = 'trap "exit 0" TERM; while :; do sleep 1; done';

async function createFixtures() {
    await removeFixtures();
    await exec("docker", ["run", "-d", "--name", PLAIN, "alpine", "sh", "-c", KEEP_ALIVE]);
    // `create` rather than `run`: `remove` is only offered once a container is
    // stopped, and a created-but-never-started one is in that state without
    // having to wait for it to stop.
    await exec("docker", ["create", "--name", REMOVABLE, "alpine", "sh", "-c", KEEP_ALIVE]);
    let privileged = true;
    try {
        await exec("docker", ["run", "-d", "--name", PRIVILEGED, "--privileged", "alpine", "sh", "-c", KEEP_ALIVE]);
    } catch {
        // Some daemons refuse privileged containers. The rest of the run is
        // still worth doing, so note it rather than aborting.
        privileged = false;
    }
    await wait(1500);
    return { privileged };
}

async function removeFixtures() {
    await exec("docker", ["rm", "-f", PLAIN, PRIVILEGED, REMOVABLE]).catch(() => {});
}

/** Whether the daemon still knows about a container. */
async function containerExists(name) {
    const { stdout } = await exec("docker", ["ps", "-a", "--filter", `name=^${name}$`, "--format", "{{.Names}}"]);
    return stdout.split("\n").map((line) => line.trim()).includes(name);
}

/* ------------------------------------------------------------------ *
 * The run
 * ------------------------------------------------------------------ */

const edge = await findEdge();
if (!edge) {
    console.error("[verify:panel] no Edge or Chrome found; skipping browser verification");
    process.exit(0);
}
if (!await dockerReady()) {
    console.error("[verify:panel] Docker is not reachable; skipping browser verification");
    process.exit(0);
}

const { startCanvasServer } = await import(pathToFileURL(join(here, "..", "bundle", "host.mjs")).href);

let server = null;
let browser = null;
let profile = null;
let page = null;

try {
    const { privileged } = await createFixtures();
    server = await startCanvasServer({ sendToChat: () => {}, workingDirectory: process.cwd() });

    profile = await mkdtemp(join(tmpdir(), "canvas-verify-"));
    const debugPort = 9333 + Math.floor(Math.random() * 400);
    browser = spawn(edge, [
        "--headless=new",
        `--remote-debugging-port=${debugPort}`,
        `--user-data-dir=${profile}`,
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-gpu",
        "about:blank",
    ], { windowsHide: true, stdio: "ignore" });

    page = await attachToPage(debugPort, server.url);

    /* 1. The panel renders at all. A bad asset path blanks it entirely. */
    const rows = await until(page.evaluate, ROWS, "the container list to render");
    record("panel renders the container list", rows > 0, `${rows} rows`);

    /* 2. Selecting a container shows its detail with lifecycle controls. */
    await until(page.evaluate, selectRow(PLAIN), "the fixture container row");
    await wait(1200);
    const selected = JSON.parse(await page.evaluate(DETAIL));
    record(
        "selecting a running container offers its lifecycle verbs",
        selected.state === "running" && selected.verbs.includes("pause"),
        `state=${selected.state} verbs=${JSON.stringify(selected.verbs)}`,
    );

    /* 3. The staleness bug: pausing must update the badge and the offered verbs.
          The detail pane used to render the snapshot taken at click time. */
    await click(page.evaluate, "pause");
    let paused = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
        paused = JSON.parse(await page.evaluate(DETAIL));
        if (paused.state === "paused") break;
        await wait(500);
    }
    record(
        "pausing updates the badge and swaps pause for unpause",
        paused.state === "paused" && paused.verbs.includes("unpause") && !paused.verbs.includes("pause"),
        `state=${paused.state} verbs=${JSON.stringify(paused.verbs)}`,
    );

    const unpaused = await click(page.evaluate, "unpause");
    record("unpausing is accepted", unpaused);
    // The Commands button only renders while the container is running, and the
    // panel learns that from a daemon event a second or two later. Waiting a
    // fixed interval here raced that and made the next check look like a
    // missing button.
    await until(
        page.evaluate,
        `${DETAIL}.includes('"state":"running"') ? 1 : 0`,
        "the container to report running again",
    );

    /* 4. The unwired-handler bug: Commands was reachable only by deep-link.
          Asserted on the argv input's placeholder, which is unique to that
          view. A placeholder is an attribute, not text, so it has to be
          queried rather than matched against innerText. */
    const openedCommands = await click(page.evaluate, "commands");
    const inCommands = openedCommands
        ? await until(
            page.evaluate,
            `[...document.querySelectorAll("input,textarea")].some((field) => /no shell/i.test(field.placeholder ?? "")) ? 1 : 0`,
            "the Commands view",
            20_000,
        ).catch(() => false)
        : false;
    record("the commands button opens the Commands view", Boolean(openedCommands && inCommands));
    if (openedCommands) {
        await click(page.evaluate, "back");
        await wait(1200);
    }

    /* 5. Code splitting: a sub-view's chunk must actually arrive. */
    await click(page.evaluate, "logs");
    const logsLoaded = await until(page.evaluate, bodyHas("follow|no log output"), "the logs view chunk", 30_000);
    record("a lazily-loaded view fetches its chunk and renders", Boolean(logsLoaded));
    await click(page.evaluate, "back");
    await wait(1200);

    /* 6. The terminal warning that was implemented but never shown. */
    if (privileged) {
        await click(page.evaluate, "back");
        await wait(800);
        await until(page.evaluate, selectRow(PRIVILEGED), "the privileged container row");
        await wait(1000);
        await click(page.evaluate, "terminal");
        let warned = false;
        for (let attempt = 0; attempt < 40; attempt += 1) {
            warned = await page.evaluate(bodyHas("not isolated from your machine"));
            if (warned) break;
            await wait(500);
        }
        record("a privileged container warns that its shell reaches the host", Boolean(warned));
    } else {
        record("a privileged container warns that its shell reaches the host", true, "skipped: daemon refused a privileged container");
    }

    /* 7. Removing a container from the panel.
     *
     * The backend accepted `remove` and `forceRemove` from the start and the
     * skill told the agent the panel's own controls ask before destroying
     * anything, but no control offered either: a stopped container could only
     * be started. Three assertions cover the gap — that the verb is offered,
     * that confirming it destroys the container, and that a running container
     * takes the same route rather than erroring on a missing `-f`.
     *
     * The confirmation button is deliberately labelled differently from the
     * verb that opens it. Two controls reading "remove" in one pane are
     * ambiguous to a person and indistinguishable to this harness.
     */
    // Check 6 leaves the terminal sub-view open, which is one level deeper than
    // the detail pane the other checks return from. Rather than counting clicks
    // — which silently breaks whenever a check above changes depth — go back
    // until the row is reachable.
    let atRemovable = false;
    for (let attempt = 0; attempt < 4 && !atRemovable; attempt += 1) {
        atRemovable = Boolean(await page.evaluate(selectRow(REMOVABLE)));
        if (atRemovable) break;
        await click(page.evaluate, "back", 5_000);
        await wait(800);
    }
    if (!atRemovable) {
        await until(page.evaluate, selectRow(REMOVABLE), "the removable container row");
    }
    await wait(1000);

    const stopped = JSON.parse(await page.evaluate(DETAIL));
    record(
        "a stopped container offers remove",
        stopped.verbs.includes("remove"),
        `state=${stopped.state} verbs=${JSON.stringify(stopped.verbs)}`,
    );

    const askedToRemove = await click(page.evaluate, "remove");
    const confirmShown = askedToRemove
        ? await until(page.evaluate, bodyHas("cannot be undone"), "the remove confirmation", 10_000).catch(() => false)
        : false;

    let gone = false;
    if (confirmShown && await click(page.evaluate, "remove container")) {
        for (let attempt = 0; attempt < 40; attempt += 1) {
            if (!await containerExists(REMOVABLE)) { gone = true; break; }
            await wait(500);
        }
    }
    record(
        "confirming remove destroys the container",
        Boolean(confirmShown && gone),
        confirmShown ? "" : "the confirmation never appeared",
    );

    /* 8. Force removal of a running container.
     *
     * `docker rm` without `-f` fails on a running container, so the panel picks
     * `forceRemove` from the container's state. The check that matters is that
     * the confirmation says so — the command shown must carry `-f`, or a person
     * is agreeing to something milder than what runs.
     */
    let forced = false;
    let saidForce = false;
    for (let attempt = 0; attempt < 4; attempt += 1) {
        if (await page.evaluate(selectRow(PLAIN))) break;
        await click(page.evaluate, "back", 5_000);
        await wait(800);
    }
    await wait(1000);
    if (await click(page.evaluate, "remove")) {
        saidForce = await until(
            page.evaluate,
            `/docker rm -f/.test(document.body.innerText) ? 1 : 0`,
            "the forced-removal command in the confirmation",
            10_000,
        ).catch(() => false);
        if (saidForce && await click(page.evaluate, "remove container")) {
            for (let attempt = 0; attempt < 40; attempt += 1) {
                if (!await containerExists(PLAIN)) { forced = true; break; }
                await wait(500);
            }
        }
    }
    record(
        "a running container is force-removed, and the confirmation says so",
        Boolean(saidForce && forced),
        saidForce ? "" : "the confirmation did not show `docker rm -f`",
    );

    /* 9. Nothing the panel asked for came back an error, and nothing threw.
     *
     * Cancelled requests are reported separately rather than failed on. A
     * browser aborts a request whose result is no longer wanted, which happens
     * legitimately when navigating between views. One abort is also observed on
     * `/rpc` during startup, before any interaction: state still arrives and the
     * panel renders, so it costs one wasted request rather than correctness. The
     * cause has not been established — it is not StrictMode, since this is a
     * production React build — so it is surfaced here rather than filtered away.
     */
    const aborted = page.failedRequests.filter((entry) => entry.startsWith("net::ERR_ABORTED"));
    const broken = page.failedRequests.filter((entry) => !entry.startsWith("net::ERR_ABORTED") && !/favicon/i.test(entry));
    record("no failed or error responses", broken.length === 0, broken.slice(0, 3).join(" | "));
    if (aborted.length > 0) {
        console.error(`  note  ${aborted.length} cancelled request(s), which is expected on navigation`);
    }

    const thrown = page.consoleErrors.filter((line) => !/Failed to load resource/i.test(line));
    record("no console errors during the run", thrown.length === 0, thrown.slice(0, 2).join(" | "));
} finally {
    page?.close();
    if (browser) {
        try {
            browser.kill();
        } catch {
            /* already gone */
        }
    }
    await server?.close?.().catch(() => {});
    await removeFixtures();
    if (profile) await rm(profile, { recursive: true, force: true }).catch(() => {});
}

const failed = results.filter((result) => !result.ok);
console.error(`\n[verify:panel] ${results.length - failed.length}/${results.length} checks passed`);
process.exit(failed.length === 0 ? 0 : 1);
