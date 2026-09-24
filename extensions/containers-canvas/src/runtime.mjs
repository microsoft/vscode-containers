/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Container runtime adapter: detects docker or podman on PATH and exposes a
// normalized view of containers and images.
//
// Every invocation goes through execFile with an argv array and no shell, so
// values coming from the iframe or the agent can never be interpreted as shell
// syntax.

import { execFile, spawn } from "node:child_process";
import { appendFile, mkdir, mkdtemp, open, readdir, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const DEFAULT_TIMEOUT_MS = 20_000;
const MAX_BUFFER = 32 * 1024 * 1024;

/** Subcommands the canvas is allowed to invoke on the container runtime. */
export const ALLOWED_SUBCOMMANDS = new Set([
    "container",
    "diff",
    "df",
    "events",
    "history",
    "image",
    "images",
    "info",
    "inspect",
    "kill",
    "logs",
    "network",
    "pause",
    "port",
    "ps",
    "pull",
    "push",
    "restart",
    "rm",
    "rmi",
    "start",
    "stats",
    "stop",
    "system",
    "tag",
    "top",
    "unpause",
    "version",
    "volume",
    "wait",
]);

const CONTAINER_OPS = {
    start: ["start"],
    stop: ["stop"],
    restart: ["restart"],
    kill: ["kill"],
    pause: ["pause"],
    unpause: ["unpause"],
    remove: ["rm"],
    forceRemove: ["rm", "-f"],
};

const IMAGE_OPS = {
    remove: ["rmi"],
    forceRemove: ["rmi", "-f"],
    history: ["history"],
};

let detected = null;

function exec(bin, args, { timeout = DEFAULT_TIMEOUT_MS } = {}) {
    return new Promise((resolve) => {
        execFile(bin, args, { timeout, maxBuffer: MAX_BUFFER, windowsHide: true }, (error, stdout, stderr) => {
            resolve({
                ok: !error,
                stdout: stdout ?? "",
                stderr: stderr ?? "",
                error: error ? String(error.message || error) : null,
                // `killed` distinguishes "the CLI reported a problem" from "we
                // gave up waiting". Without it a timeout surfaces as Node's
                // generic "Command failed: <argv>" with empty stderr, which
                // reads like the command itself failed.
                timedOut: Boolean(error && error.killed && error.signal === "SIGTERM"),
                timeoutMs: timeout,
                spawnFailed: Boolean(error && (error.code === "ENOENT" || error.code === "EACCES")),
            });
        });
    });
}

function failureMessage(result) {
    if (result.timedOut) {
        return `Timed out after ${Math.round(result.timeoutMs / 1000)}s waiting for the container runtime.`;
    }
    const text = (result.stderr || "").trim() || (result.error || "").trim();
    return text.split("\n").slice(0, 6).join("\n") || "Command failed.";
}

/**
 * Locate a usable runtime. Prefers one whose daemon actually answers; falls
 * back to reporting an installed-but-unreachable CLI so the UI can explain why
 * the list is empty instead of silently showing nothing.
 */
export async function detectRuntime({ force = false } = {}) {
    if (detected && !force) return detected;

    let degraded = null;
    for (const bin of ["docker", "podman"]) {
        const server = await exec(bin, ["version", "--format", "{{.Server.Version}}"], { timeout: 15_000 });
        if (server.ok && server.stdout.trim()) {
            detected = { bin, version: server.stdout.trim(), available: true, error: null };
            return detected;
        }
        if (server.spawnFailed) continue;

        const cli = await exec(bin, ["--version"], { timeout: 10_000 });
        if (cli.ok && !degraded) {
            degraded = {
                bin,
                version: cli.stdout.trim(),
                available: false,
                error: failureMessage(server),
            };
        }
    }

    detected = degraded;
    return detected;
}

function parseJsonLines(stdout) {
    const trimmed = stdout.trim();
    if (!trimmed) return [];
    if (trimmed.startsWith("[")) {
        try {
            const parsed = JSON.parse(trimmed);
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }
    const rows = [];
    for (const line of trimmed.split(/\r?\n/)) {
        const value = line.trim();
        if (!value) continue;
        try {
            rows.push(JSON.parse(value));
        } catch {
            // Skip malformed rows rather than failing the whole listing.
        }
    }
    return rows;
}

function asText(value) {
    if (value == null) return "";
    if (Array.isArray(value)) return value.join(" ");
    return String(value);
}

function formatBytes(value) {
    const bytes = Number(value);
    if (!Number.isFinite(bytes) || bytes <= 0) return "";
    const units = ["B", "kB", "MB", "GB", "TB"];
    let size = bytes;
    let unit = 0;
    while (size >= 1024 && unit < units.length - 1) {
        size /= 1024;
        unit += 1;
    }
    return `${size >= 10 || unit === 0 ? Math.round(size) : size.toFixed(1)} ${units[unit]}`;
}

function formatTimestamp(value) {
    if (value == null || value === "") return "";
    if (typeof value === "number") return new Date(value * 1000).toISOString().replace("T", " ").slice(0, 19);
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() === String(numeric)) {
        return new Date(numeric * 1000).toISOString().replace("T", " ").slice(0, 19);
    }
    return String(value);
}

function formatPorts(value) {
    if (!value) return "";
    if (typeof value === "string") return value;
    if (!Array.isArray(value)) return "";
    return value
        .map((port) => {
            if (typeof port === "string") return port;
            const host = port.host_port ?? port.hostPort;
            const target = port.container_port ?? port.containerPort;
            const proto = port.protocol ?? "tcp";
            const ip = port.host_ip || port.hostIP || "";
            if (!target) return "";
            return host ? `${ip ? `${ip}:` : ""}${host}->${target}/${proto}` : `${target}/${proto}`;
        })
        .filter(Boolean)
        .join(", ");
}

function inferState(status) {
    const value = status.toLowerCase();
    // Paused must be checked before "up": the runtime reports a paused
    // container as "Up 2 minutes (Paused)", so an `up` test first would
    // classify it as running and the UI would offer pause instead of unpause.
    // Only reached when the payload has no `State` field of its own.
    if (value.includes("paused")) return "paused";
    if (value.startsWith("up")) return "running";
    if (value.startsWith("created")) return "created";
    if (value.startsWith("restarting")) return "restarting";
    if (value.startsWith("exited") || value.startsWith("dead")) return "exited";
    return "unknown";
}

function parseLabels(raw) {
    if (!raw) return {};
    if (typeof raw === "object" && !Array.isArray(raw)) {
        return Object.fromEntries(Object.entries(raw).map(([key, value]) => [key, String(value)]));
    }
    const labels = {};
    // Docker emits a flat "k=v,k=v" string. Values may themselves contain "="
    // (and, rarely, commas — those we cannot recover, which matches docker CLI).
    for (const pair of String(raw).split(",")) {
        const at = pair.indexOf("=");
        if (at <= 0) continue;
        labels[pair.slice(0, at).trim()] = pair.slice(at + 1).trim();
    }
    return labels;
}

function normalizeContainer(raw) {
    const id = asText(raw.ID ?? raw.Id ?? "");
    const status = asText(raw.Status ?? "");
    const rawNames = raw.Names ?? raw.Name ?? "";
    const name = (Array.isArray(rawNames) ? rawNames.join(", ") : String(rawNames)).replace(/^\//, "");
    const state = asText(raw.State ?? "").toLowerCase() || inferState(status);
    const size = typeof raw.Size === "number" ? formatBytes(raw.Size) : asText(raw.Size);
    const labels = parseLabels(raw.Labels);
    const ports = formatPorts(raw.Ports);
    return {
        kind: "container",
        id,
        shortId: id.slice(0, 12),
        name: name || id.slice(0, 12),
        image: asText(raw.Image ?? raw.ImageName ?? ""),
        command: asText(raw.Command ?? ""),
        state,
        status: status || state,
        ports,
        publishedPorts: parsePublished(ports),
        created: formatTimestamp(raw.CreatedAt ?? raw.Created ?? ""),
        createdAt: sortableTimestamp(raw.CreatedAt ?? raw.Created ?? ""),
        size,
        sizeBytes: typeof raw.Size === "number" ? raw.Size : parseSizeText(raw.Size),
        networks: Array.isArray(raw.Networks) ? raw.Networks.join(", ") : asText(raw.Networks),
        labels,
        compose: labels["com.docker.compose.project"] ?? "",
        composeService: labels["com.docker.compose.service"] ?? "",
    };
}

/** Pull host ports out of a formatted port string for "open in browser". */
function parsePublished(ports) {
    const found = [];
    for (const match of String(ports).matchAll(/(?:([\d.]+|\[::\]):)?(\d{1,5})->(\d{1,5})\/(tcp|udp)/g)) {
        const [, host, hostPort, containerPort, protocol] = match;
        if (protocol !== "tcp") continue;
        if (found.some((entry) => entry.hostPort === hostPort)) continue;
        // `0.0.0.0` and `[::]` are bind addresses, not destinations: they mean
        // "every interface", and a browser given `http://0.0.0.0` may or may not
        // reach anything depending on the platform. The address that actually
        // connects is loopback.
        const wildcard = !host || host === "[::]" || host === "0.0.0.0" || host === "::";
        found.push({ hostPort, containerPort, host: wildcard ? "localhost" : host });
    }
    return found;
}

function sortableTimestamp(value) {
    if (value == null || value === "") return 0;
    if (typeof value === "number") return value * 1000;
    const numeric = Number(value);
    if (Number.isFinite(numeric) && String(value).trim() === String(numeric)) return numeric * 1000;
    const parsed = Date.parse(String(value).replace(/\s+[A-Z]{3,4}$/, ""));
    return Number.isFinite(parsed) ? parsed : 0;
}

/** "350MB" / "4.1kB (virtual 1.92GB)" -> bytes, for sorting. */
function parseSizeText(value) {
    const match = /(\d+(?:\.\d+)?)\s*([kKmMgGtT]?)i?[bB]/.exec(String(value ?? ""));
    if (!match) return 0;
    const scale = { "": 1, k: 1e3, m: 1e6, g: 1e9, t: 1e12 }[match[2].toLowerCase()] ?? 1;
    return Number(match[1]) * scale;
}

function normalizeImage(raw) {
    const id = asText(raw.ID ?? raw.Id ?? "").replace(/^sha256:/, "");
    const names = Array.isArray(raw.Names) ? raw.Names : [];
    let repository = asText(raw.Repository ?? "");
    let tag = asText(raw.Tag ?? "");
    if ((!repository || repository === "<none>") && names.length > 0) {
        const first = names[0];
        const at = first.lastIndexOf(":");
        repository = at > 0 ? first.slice(0, at) : first;
        tag = at > 0 ? first.slice(at + 1) : "latest";
    }
    const dangling = !repository || repository === "<none>" || tag === "<none>";
    const size = typeof raw.Size === "number" ? formatBytes(raw.Size) : asText(raw.Size);
    return {
        kind: "image",
        id,
        shortId: id.slice(0, 12),
        repository: !repository || repository === "<none>" ? "<none>" : repository,
        registry: repository.includes("/") && repository.split("/")[0].includes(".") ? repository.split("/")[0] : "docker.io",
        tag: tag || "<none>",
        ref: dangling ? id.slice(0, 12) : `${repository}:${tag || "latest"}`,
        dangling,
        size,
        sizeBytes: typeof raw.Size === "number" ? raw.Size : parseSizeText(raw.Size),
        created: formatTimestamp(raw.CreatedAt ?? raw.Created ?? raw.CreatedSince ?? ""),
        createdAt: sortableTimestamp(raw.CreatedAt ?? raw.Created ?? ""),
        containers: asText(raw.Containers ?? ""),
        labels: parseLabels(raw.Labels),
        tags: names,
    };
}

/**
 * Bumped by every operation that changes what `loadState` would return.
 *
 * Load coalescing must never hand back a snapshot taken before a mutation the
 * caller just performed, so an in-flight load is only shareable while this
 * counter is unchanged.
 */
let mutationSeq = 0;

/** Call after anything that creates, destroys or moves a container or image. */
export function invalidateState() {
    mutationSeq += 1;
}

/** The load currently in flight, or null. */
let inflightLoad = null;

/** Read containers and images in one pass, plus the detected runtime. */
export async function loadState({ force = false } = {}) {
    // Every canvas panel keeps its own cache, so a cold start after a reload
    // has N panels asking the same question at the same moment. Each `docker
    // images` call contends with the others -- measured here at 3.3s for one
    // and 15.3s for eight -- until they all breach the timeout and the panels
    // show an error for a runtime that is perfectly healthy. Sharing one load
    // keeps that cost flat no matter how many panels are open.
    if (inflightLoad && inflightLoad.seq === mutationSeq) {
        return inflightLoad.promise;
    }

    const entry = { seq: mutationSeq, promise: null };
    entry.promise = loadStateUncached({ force }).finally(() => {
        if (inflightLoad === entry) inflightLoad = null;
    });
    inflightLoad = entry;
    return entry.promise;
}

async function loadStateUncached({ force = false } = {}) {
    const runtime = await detectRuntime({ force });
    if (!runtime) {
        return {
            runtime: null,
            containers: [],
            images: [],
            error: "No container runtime found. Install Docker or Podman and make sure it is on your PATH.",
            loadedAt: new Date().toISOString(),
        };
    }
    if (!runtime.available) {
        return {
            runtime,
            containers: [],
            images: [],
            error: `${runtime.bin} is installed but not reachable.\n${runtime.error ?? ""}`.trim(),
            loadedAt: new Date().toISOString(),
        };
    }

    const [ps, imgs] = await Promise.all([
        exec(runtime.bin, ["ps", "-a", "--no-trunc", "--format", "{{json .}}"]),
        exec(runtime.bin, ["images", "--no-trunc", "--format", "{{json .}}"]),
    ]);

    const errors = [];
    if (!ps.ok) errors.push(`containers: ${failureMessage(ps)}`);
    if (!imgs.ok) errors.push(`images: ${failureMessage(imgs)}`);

    return {
        runtime,
        containers: ps.ok ? parseJsonLines(ps.stdout).map(normalizeContainer) : [],
        images: imgs.ok ? parseJsonLines(imgs.stdout).map(normalizeImage) : [],
        error: errors.length > 0 ? errors.join("\n") : null,
        loadedAt: new Date().toISOString(),
    };
}

/**
 * Re-read containers only.
 *
 * A container event cannot change the image list, and images are the expensive
 * half of a load -- ~2.5s against ~250ms for containers on a machine with a few
 * hundred images. Reloading both on every start/stop is what made a live panel
 * feel like a slow one. Returns null if the read fails, so the caller can fall
 * back to a full load rather than render a half-truth.
 */
export async function loadContainers() {
    const runtime = await detectRuntime();
    if (!runtime?.available) return null;
    const ps = await exec(runtime.bin, ["ps", "-a", "--no-trunc", "--format", "{{json .}}"]);
    if (!ps.ok) return null;
    return parseJsonLines(ps.stdout).map(normalizeContainer);
}

/**
 * Resolve a user-supplied handle to a row in loaded state. Accepts anything a
 * person would reasonably type: full id, short id, container name, image
 * reference, or one of an image's other tags.
 */
export function findTarget(state, target) {
    if (!target) return null;
    const needle = String(target);
    const container = (state?.containers ?? []).find(
        (item) => [item.id, item.shortId, item.name].includes(needle),
    );
    if (container) return container;
    return (state?.images ?? []).find(
        (item) => [item.id, item.shortId, item.ref].includes(needle) || (item.tags ?? []).includes(needle),
    ) ?? null;
}

async function requireRuntime() {    const runtime = await detectRuntime();
    if (!runtime || !runtime.available) {
        throw new Error(
            runtime
                ? `${runtime.bin} is installed but not reachable. ${runtime.error ?? ""}`.trim()
                : "No container runtime found. Install Docker or Podman and make sure it is on your PATH.",
        );
    }
    return runtime;
}

/** Run an allow-listed runtime subcommand. Returns combined output. */
export async function runCommand(argv, { timeout = 60_000 } = {}) {
    if (!Array.isArray(argv) || argv.length === 0) {
        throw new Error("Provide the command arguments as a non-empty array, e.g. [\"logs\", \"--tail\", \"50\", \"web\"].");
    }
    const args = argv.map((value) => {
        if (typeof value !== "string") throw new Error("Every command argument must be a string.");
        return value;
    });
    if (!ALLOWED_SUBCOMMANDS.has(args[0])) {
        throw new Error(
            `"${args[0]}" is not allowed from this canvas. Allowed subcommands: ${[...ALLOWED_SUBCOMMANDS].sort().join(", ")}. Use the shell tool for anything else.`,
        );
    }
    return execRuntime(args, { timeout });
}

/**
 * Execute against the detected runtime without consulting the allow-list.
 * Private on purpose: only callers that build argv themselves from validated
 * structured input may use it.
 */
/**
 * Subcommands that change what a subsequent `loadState` would return.
 *
 * Kept here rather than at each call site: this is the one function every
 * mutating path already goes through, so a new operation cannot forget to
 * invalidate.
 */
const MUTATING_SUBCOMMANDS = new Set([
    "create", "kill", "pause", "prune", "pull", "restart", "rm", "rmi",
    "run", "start", "stop", "tag", "unpause", "update",
]);

async function execRuntime(args, { timeout = 60_000 } = {}) {
    const runtime = await requireRuntime();
    const result = await exec(runtime.bin, args, { timeout });
    if (MUTATING_SUBCOMMANDS.has(args[0]) || (args[0] === "system" && args[1] === "prune")) {
        invalidateState();
    }
    const output = [result.stdout, result.stderr].map((part) => part.trimEnd()).filter(Boolean).join("\n");
    return {
        command: `${runtime.bin} ${args.join(" ")}`,
        ok: result.ok,
        output: output || (result.ok ? "(no output)" : failureMessage(result)),
    };
}

export async function containerOp(op, id) {
    const argv = CONTAINER_OPS[op];
    if (!argv) throw new Error(`Unknown container operation "${op}". Expected one of: ${Object.keys(CONTAINER_OPS).join(", ")}.`);
    if (!id) throw new Error("A container id or name is required.");
    return runCommand([...argv, id]);
}

export async function imageOp(op, id) {
    const argv = IMAGE_OPS[op];
    if (!argv) throw new Error(`Unknown image operation "${op}". Expected one of: ${Object.keys(IMAGE_OPS).join(", ")}.`);
    if (!id) throw new Error("An image id or reference is required.");
    return runCommand([...argv, id]);
}

export async function containerLogs(id, tail = 200) {
    if (!id) throw new Error("A container id or name is required.");
    const count = Number.isFinite(Number(tail)) ? Math.max(1, Math.min(5000, Math.trunc(Number(tail)))) : 200;
    return runCommand(["logs", "--tail", String(count), id], { timeout: 30_000 });
}

export async function inspect(id) {
    if (!id) throw new Error("A container or image id is required.");
    const result = await runCommand(["inspect", id], { timeout: 30_000 });
    if (!result.ok) throw new Error(result.output);
    try {
        const parsed = JSON.parse(result.output);
        return Array.isArray(parsed) ? (parsed[0] ?? null) : parsed;
    } catch {
        throw new Error(`Could not parse inspect output for "${id}".`);
    }
}

export async function stats() {
    const result = await runCommand(["stats", "--no-stream", "--format", "{{json .}}"], { timeout: 30_000 });
    if (!result.ok) throw new Error(result.output);
    return parseJsonLines(result.output);
}

/* ------------------------------------------------------------------ *
 * Registry + maintenance operations
 * ------------------------------------------------------------------ */

// No `..` anywhere: a reference is not a path, and a traversal segment in one
// is either a mistake or an attempt to reach somewhere else.
const IMAGE_REF_RE = /^(?!.*\.\.)[a-zA-Z0-9][a-zA-Z0-9._\-/:@]{0,255}$/;

function assertImageRef(value, label = "image reference") {
    const text = String(value ?? "").trim();
    if (!IMAGE_REF_RE.test(text)) throw new Error(`Invalid ${label}: "${text}".`);
    return text;
}

export async function tagImage(source, target) {
    return execRuntime(["tag", assertImageRef(source, "source image"), assertImageRef(target, "target tag")]);
}

export async function pullImage(ref) {
    return execRuntime(["pull", assertImageRef(ref)], { timeout: 600_000 });
}

// Deliberately not exposed: pushing needs registry credentials, and nothing
// here handles them. Wired up, it would fail with a raw `denied: requested
// access to the resource is denied` for anyone not already logged in via
// `docker login`. Left here because the shell-out is trivial and correct; it
// wants a credential story, not a button.
export async function pushImage(ref) {
    return execRuntime(["push", assertImageRef(ref)], { timeout: 600_000 });
}

const PRUNE_TARGETS = {
    containers: ["container", "prune", "-f"],
    images: ["image", "prune", "-f"],
    allImages: ["image", "prune", "-a", "-f"],
    buildCache: ["builder", "prune", "-f"],
    networks: ["network", "prune", "-f"],
};

// Not exposed, like `pushImage`: pruning deletes in bulk and cannot be undone,
// so it wants a UI that states exactly what is about to go and asks twice. The
// target map and the reclaimed-space parsing are the fiddly parts and they are
// done; what is missing is the confirmation surface, not the plumbing.
export async function prune(target) {
    const argv = PRUNE_TARGETS[target];
    if (!argv) throw new Error(`Unknown prune target "${target}". Expected one of: ${Object.keys(PRUNE_TARGETS).join(", ")}.`);
    return execRuntime(argv, { timeout: 600_000 });
}

export async function diskUsage() {
    const result = await execRuntime(["system", "df", "--format", "{{json .}}"], { timeout: 60_000 });
    if (!result.ok) return execRuntime(["system", "df"], { timeout: 60_000 });
    return result;
}

export async function containerStats(id) {
    const argv = ["stats", "--no-stream", "--format", "{{json .}}"];
    if (id) argv.push(id);
    const result = await execRuntime(argv, { timeout: 30_000 });
    if (!result.ok) throw new Error(result.output);
    return parseJsonLines(result.output);
}

/* ------------------------------------------------------------------ *
 * Streaming logs
 * ------------------------------------------------------------------ */

/**
 * Follow a container's logs. Returns a stop function.
 * Uses spawn (not execFile) so output arrives incrementally.
 */
export async function followLogs(id, { tail = 100, onData, onEnd } = {}) {
    if (!id) throw new Error("A container id or name is required.");
    const runtime = await requireRuntime();
    const child = spawn(runtime.bin, ["logs", "-f", "--tail", String(tail), id], { windowsHide: true });

    const forward = (chunk) => onData?.(chunk.toString("utf8"));
    child.stdout?.on("data", forward);
    child.stderr?.on("data", forward);
    child.on("error", (error) => onData?.(`\n[log stream error] ${error.message}\n`));
    child.on("close", () => onEnd?.());

    return () => {
        try {
            child.kill();
        } catch {
            /* already gone */
        }
    };
}

/**
 * Follow resource usage for one container, or all of them. Returns a stop
 * function.
 *
 * `docker stats` without `--no-stream` emits a fresh sample roughly once a
 * second, so this needs spawn for the same reason `followLogs` does. Output is
 * line-delimited JSON, but a write can split mid-line, so partial lines are
 * carried until their newline arrives.
 */
export async function followStats(id, { onSample, onEnd } = {}) {
    const runtime = await requireRuntime();
    const argv = ["stats", "--format", "{{json .}}"];
    if (id) argv.push(id);
    const child = spawn(runtime.bin, argv, { windowsHide: true });

    let carry = "";
    child.stdout?.on("data", (chunk) => {
        // `docker stats` redraws using ANSI cursor codes when attached to a
        // TTY; it should not here, but strip them so a stray escape can never
        // corrupt a JSON line.
        // eslint-disable-next-line no-control-regex -- matching ANSI escapes requires the escape character itself
        carry += chunk.toString("utf8").replace(/\u001b\[[0-9;]*[A-Za-z]/g, "");
        let cut;
        while ((cut = carry.indexOf("\n")) !== -1) {
            const line = carry.slice(0, cut).trim();
            carry = carry.slice(cut + 1);
            if (!line) continue;
            try {
                onSample?.(JSON.parse(line));
            } catch {
                // A partial or non-JSON line is not worth killing the stream.
            }
        }
    });
    child.on("error", () => onEnd?.());
    child.on("close", () => onEnd?.());

    return () => {
        try {
            child.kill();
        } catch {
            /* already gone */
        }
    };
}

/* ------------------------------------------------------------------ *
 * Change notification
 *
 * Two mechanisms, deliberately unequal.
 *
 * `docker events` is the real one: it reports create/start/stop/pause/destroy
 * and the image equivalents within milliseconds, for one long-lived process.
 * The 10s poll exists only to catch what the stream misses -- a dropped
 * connection, a daemon restart, a machine resuming from sleep -- so it is
 * deliberately cheap. Measured on this machine: `ps -a` is ~250ms while
 * `images` is ~2.5s, so the poll reads containers only and compares a
 * signature. A full reload happens when that signature moves, not on a timer.
 *
 * One watcher serves every panel in the process. Panels used to each own their
 * refresh, which is how a cold start turned into eight simultaneous `docker
 * images` calls; repeating that on a timer would be worse.
 * ------------------------------------------------------------------ */

/**
 * Event actions that say nothing about the state this canvas renders.
 *
 * The canvas itself provokes most of these: browsing a container's files runs
 * `docker cp` (archive-path, extract-to-dir) and the terminal runs `docker
 * exec` (exec_create, exec_start, exec_die). Treating them as changes would
 * make the panel reload itself every time the user opened a folder.
 */
const IGNORED_EVENT_ACTIONS = new Set([
    "top", "resize", "attach", "detach", "prune",
    "archive-path", "extract-to-dir",
    "exec_create", "exec_start", "exec_die", "exec_detach",
]);

/** Event object types worth reloading for. Networks and volumes are not shown. */
const WATCHED_EVENT_TYPES = new Set(["container", "image"]);

const EVENT_DEBOUNCE_MS = 250;
const POLL_INTERVAL_MS = 10_000;
const RECONNECT_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 30_000];

const changeListeners = new Set();
let watcher = null;

/**
 * Decide whether a parsed daemon event means the canvas must reload.
 *
 * Returns `{ type, action }` when it does, or null. Actions arrive as
 * "health_status: healthy" on some daemons, so only the part before the colon
 * is matched.
 */
function classifyEvent(event) {
    const type = String(event?.Type ?? "");
    const action = String(event?.Action ?? event?.status ?? "").split(":")[0].trim();
    if (!WATCHED_EVENT_TYPES.has(type)) return null;
    if (IGNORED_EVENT_ACTIONS.has(action)) return null;
    return { type, action };
}

/**
 * Build the poll fingerprint from parsed `docker ps -a` rows.
 *
 * Deliberately not the raw `Status` string: that carries humanised uptime
 * ("Up 5 minutes"), which changes on its own every minute and would have the
 * poll ordering a full reload forever on an idle machine. Only the pause
 * marker is extracted from it, because pause is reported as a parenthetical on
 * a still-running container rather than as a distinct `State`.
 */
function containerSignatureFrom(rows) {
    return rows
        .map((row) => {
            const paused = /\(paused\)/i.test(String(row.Status ?? "")) ? "1" : "0";
            return `${row.ID}\u0000${row.State}\u0000${paused}\u0000${row.Ports}\u0000${row.Names}`;
        })
        .sort()
        .join("\u0001");
}

/**
 * Should a poll that saw a changed fingerprint actually announce it?
 *
 * The stream is the fast path, so when it has just reported something the poll
 * is almost certainly looking at that same change after the fact. Staying quiet
 * there keeps the poll a safety net instead of a source of duplicate reloads.
 */
function shouldPollNotify({ changed, msSinceLastNotify, interval = POLL_INTERVAL_MS }) {
    if (!changed) return false;
    return msSinceLastNotify >= interval;
}

/**
 * A cheap fingerprint of every container, used by the safety poll.
 *
 * Includes `Status` as well as `State` because pause is reported as a
 * parenthetical on a running container ("Up 2 minutes (Paused)"), and ports
 * because publishing changes on restart.
 */
async function readContainerSignature() {
    const runtime = await detectRuntime();
    if (!runtime?.available) return null;
    const ps = await exec(runtime.bin, ["ps", "-a", "--no-trunc", "--format", "{{json .}}"]);
    if (!ps.ok) return null;
    return containerSignatureFrom(parseJsonLines(ps.stdout));
}

function createWatcher() {
    let child = null;
    let stopped = false;
    let debounceTimer = null;
    let reconnectTimer = null;
    let attempt = 0;
    let streamUp = false;
    let lastSignature = null;
    let lastNotifiedAt = 0;

    const notify = (change) => {
        lastNotifiedAt = Date.now();
        for (const listener of changeListeners) {
            try {
                listener(change);
            } catch {
                // One bad subscriber must not stop the others being told.
            }
        }
    };

    const notifyDebounced = (change) => {
        // A single `docker run` emits create, attach, connect and start in a
        // burst; one reload should answer all of them.
        if (debounceTimer) clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
            debounceTimer = null;
            notify(change);
        }, EVENT_DEBOUNCE_MS);
        debounceTimer.unref?.();
    };

    const scheduleReconnect = () => {
        if (stopped || reconnectTimer) return;
        const delay = RECONNECT_DELAYS_MS[Math.min(attempt, RECONNECT_DELAYS_MS.length - 1)];
        attempt += 1;
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            void openStream();
        }, delay);
        reconnectTimer.unref?.();
    };

    async function openStream() {
        if (stopped || child) return;
        const runtime = await detectRuntime();
        if (stopped) return;
        if (!runtime?.available) {
            scheduleReconnect();
            return;
        }

        const proc = spawn(runtime.bin, ["events", "--format", "{{json .}}"], { windowsHide: true });
        child = proc;

        // Anything that happened while the stream was down is invisible to it,
        // so treat every (re)connection after a failure as a resync point.
        const wasDown = !streamUp && attempt > 0;
        streamUp = true;
        attempt = 0;
        if (wasDown) notify({ reason: "resync" });

        let carry = "";
        proc.stdout?.on("data", (chunk) => {
            carry += chunk.toString("utf8");
            let cut;
            while ((cut = carry.indexOf("\n")) !== -1) {
                const line = carry.slice(0, cut).trim();
                carry = carry.slice(cut + 1);
                if (!line) continue;
                let event;
                try {
                    event = JSON.parse(line);
                } catch {
                    continue;
                }
                const hit = classifyEvent(event);
                if (hit) notifyDebounced({ reason: "event", ...hit });
            }
        });

        const onGone = () => {
            if (child !== proc) return;
            child = null;
            streamUp = false;
            // Ensure the next successful open counts as a resync even if the
            // very first connection attempt is the one that failed.
            if (attempt === 0) attempt = 1;
            scheduleReconnect();
        };
        proc.on("error", onGone);
        proc.on("close", onGone);
    }

    const poll = async () => {
        if (stopped) return;
        let signature;
        try {
            signature = await readContainerSignature();
        } catch {
            return;
        }
        if (stopped || signature === null) return;

        const first = lastSignature === null;
        const changed = !first && signature !== lastSignature;
        lastSignature = signature;
        if (!shouldPollNotify({ changed, msSinceLastNotify: Date.now() - lastNotifiedAt })) return;
        notify({ reason: "poll" });
    };

    const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);
    pollTimer.unref?.();
    void poll();      // seed the signature without notifying
    void openStream();

    return {
        get streamUp() {
            return streamUp;
        },
        stop() {
            stopped = true;
            clearInterval(pollTimer);
            if (debounceTimer) clearTimeout(debounceTimer);
            if (reconnectTimer) clearTimeout(reconnectTimer);
            try {
                child?.kill();
            } catch {
                /* already gone */
            }
            child = null;
        },
    };
}

/**
 * Be told when containers or images change, from any source.
 *
 * The listener receives `{ reason }` -- "event" for a daemon event, "poll" for
 * a change the stream missed, "resync" when the stream reconnects after a drop
 * -- and is expected to reload state itself. No payload is passed because a
 * reload is authoritative and an event is not: events can be missed, coalesced,
 * or arrive for objects that changed again before anyone looked.
 *
 * Returns an unsubscribe function. The underlying stream and timer start with
 * the first subscriber and stop with the last.
 */
export function watchChanges(listener) {
    if (typeof listener !== "function") throw new TypeError("watchChanges requires a function.");
    changeListeners.add(listener);
    if (!watcher) watcher = createWatcher();
    return () => {
        changeListeners.delete(listener);
        if (changeListeners.size === 0 && watcher) {
            watcher.stop();
            watcher = null;
        }
    };
}

/* ------------------------------------------------------------------ *
 * In-container file listing
 *
 * `exec` stays off ALLOWED_SUBCOMMANDS so no caller can pass arbitrary argv.
 * This helper builds a fixed `exec <id> ls -la <path>` invocation with a
 * validated absolute path and no shell, so nothing user-supplied can become
 * a command.
 * ------------------------------------------------------------------ */

export async function listContainerPath(id, dirPath = "/") {
    if (!id) throw new Error("A container id or name is required.");
    const target = String(dirPath || "/");
    if (!target.startsWith("/")) throw new Error("Path must be absolute, e.g. /app.");
    if (target.includes("\0")) throw new Error("Invalid path.");

    const result = await execRuntime(["exec", id, "ls", "-la", target], { timeout: 20_000 });
    if (!result.ok) {
        const hint = /not found|no such file or directory.*(ls|sh)/i.test(result.output)
            ? " This image has no shell or coreutils (distroless/chiseled), so its filesystem cannot be browsed this way."
            : "";
        throw new Error(`${result.output}${hint}`);
    }

    const entries = [];
    for (const line of result.output.split(/\r?\n/)) {
        const match = /^([dlcbps-])(\S{9})\S*\s+\d+\s+(\S+)\s+(\S+)\s+(\d+)\s+(\S+\s+\S+\s+\S+)\s+(.*)$/.exec(line.trim());
        if (!match) continue;
        const [, type, perms, owner, group, size, modified, rawName] = match;
        const name = rawName.split(" -> ")[0];
        if (name === "." || name === "..") continue;
        entries.push({
            name,
            type: type === "d" ? "directory" : type === "l" ? "symlink" : "file",
            link: rawName.includes(" -> ") ? rawName.split(" -> ")[1] : null,
            perms: `${type}${perms}`,
            owner,
            group,
            size: Number(size),
            sizeText: formatBytes(Number(size)) || `${size} B`,
            modified,
            path: `${target.replace(/\/+$/, "")}/${name}`,
        });
    }
    entries.sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === "directory" ? -1 : 1));
    return { path: target, entries, raw: result.output };
}

/**
 * Read one file out of a container.
 *
 * `docker cp` rather than `exec cat`: a distroless or chiseled image has no
 * shell and no coreutils -- exactly the images where "is my config actually in
 * there?" is hardest to answer another way -- and `cp` is served by the daemon,
 * so it needs nothing inside the container.
 *
 * The copy lands in a host temp directory that is removed afterwards. Like
 * `listContainerPath`, argv is fixed and the path is validated, so nothing
 * user-supplied can become a command.
 */
export async function readContainerFile(id, filePath, { maxBytes = 2 * 1024 * 1024 } = {}) {
    if (!id) throw new Error("A container id or name is required.");
    const target = String(filePath || "");
    if (!target.startsWith("/")) throw new Error("Path must be absolute, e.g. /app/appsettings.json.");
    if (target.includes("\0")) throw new Error("Invalid path.");

    const scratch = await mkdtemp(path.join(tmpdir(), "canvas-cp-"));
    const landing = path.join(scratch, "payload");
    try {
        const result = await execRuntime(["cp", `${id}:${target}`, landing], { timeout: 60_000 });
        if (!result.ok) throw new Error(result.output);

        const info = await stat(landing);
        if (info.isDirectory()) {
            throw new Error(`"${target}" is a directory. Open it in the browser instead of viewing it as a file.`);
        }
        // Read only up to the cap. A multi-gigabyte file must not be pulled
        // into memory just to discover it is too large to show.
        const handle = await open(landing, "r");
        try {
            const buffer = Buffer.alloc(Math.min(info.size, maxBytes));
            await handle.read(buffer, 0, buffer.length, 0);

            // A NUL byte in the first chunk is the usual heuristic for binary,
            // and it is the one that matters: rendering a binary as text fills
            // the panel with replacement characters.
            const binary = buffer.includes(0);
            return {
                path: target,
                size: info.size,
                truncated: info.size > maxBytes,
                binary,
                text: binary ? null : buffer.toString("utf8"),
            };
        } finally {
            await handle.close();
        }
    } finally {
        await rm(scratch, { recursive: true, force: true }).catch(() => { });
    }
}

/* ------------------------------------------------------------------ *
 * Port preview
 * ------------------------------------------------------------------ */

/**
 * Is anything actually answering on a published port, and over which scheme?
 *
 * Opening a browser on a port that nothing is serving produces a connection
 * error the user then has to interpret, so this answers the question first. A
 * published port is a mapping, not a promise: the process inside the container
 * may have died, may never have bound, or may be speaking TLS.
 *
 * Any HTTP response counts as reachable, including 404 and 500 -- something is
 * listening and speaking HTTP, which is what the caller needs to know.
 */
export async function probePort(host, port, { timeoutMs = 4000 } = {}) {
    const target = `${host || "localhost"}:${port}`;
    const attempt = async (scheme) => {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);
        try {
            const res = await fetch(`${scheme}://${target}/`, {
                method: "GET",
                redirect: "manual",
                signal: controller.signal,
            });
            return { reachable: true, scheme, status: res.status };
        } catch (error) {
            return { reachable: false, scheme, error: String(error?.cause?.code ?? error?.message ?? error) };
        } finally {
            clearTimeout(timer);
        }
    };

    const plain = await attempt("http");
    if (plain.reachable) return { ...plain, url: `http://${target}/` };
    // A TLS listener answers an HTTP request with a protocol error rather than
    // a refusal, so it is worth one more try before reporting nothing there.
    if (/EPROTO|SSL|wrong version number|socket hang up/i.test(plain.error ?? "")) {
        const secure = await attempt("https");
        if (secure.reachable) return { ...secure, url: `https://${target}/` };
    }
    return { reachable: false, url: `http://${target}/`, error: plain.error };
}

/* ------------------------------------------------------------------ *
 * Extraction to the host
 * ------------------------------------------------------------------ */

/**
 * Keep the extraction directory out of the user's version control, and keep it
 * from growing without bound.
 *
 * Files land in the session's working directory because that is what the editor
 * canvas resolves `scope: "repo"` against -- there is nowhere else to put them
 * that the editor can open. That directory is usually a git repository the user
 * cares about, so an entry is added to `.git/info/exclude` rather than
 * `.gitignore`: the exclude file is local and untracked, so nothing appears in
 * their diff either.
 *
 * Old extractions are removed on the way in rather than on close. Closing a
 * panel is the wrong moment -- another panel may be looking at the same file,
 * and the user may still have it open in the editor.
 */
/**
 * The host filename to extract a container path to.
 *
 * `path.basename` alone is not enough. `path.basename("/..")` is `".."`, and
 * `path.join(folder, "..")` is the folder's *parent* -- the shared extraction
 * directory. A container path of `/..` therefore placed the extraction at that
 * root, and the "this is a directory" cleanup that follows would then remove
 * every container's extracted files with it.
 *
 * Splitting is done with POSIX rules because `target` is a path inside a Linux
 * container, where a backslash is an ordinary filename character. On Windows
 * `path.basename` would treat it as a separator and return a different, shorter
 * name; `path.join` would then treat it as a separator again, so a name like
 * `a\..\..\evil` would climb out. Rejecting separators outright closes that.
 */
function extractionBasename(target) {
    const base = path.posix.basename(String(target ?? "").trim()) || "file";
    if (base === "." || base === ".." || /[\\/]/.test(base)) {
        throw new Error(`"${target}" does not name a file that can be extracted.`);
    }
    return base;
}

async function tidyExtractionDir(destDir, { maxAgeMs = 24 * 60 * 60 * 1000, keepRecent = 10 } = {}) {
    const repoExclude = path.join(path.dirname(destDir), ".git", "info", "exclude");
    try {
        const entry = `${path.basename(destDir)}/`;
        const current = await readFile(repoExclude, "utf8").catch(() => null);
        if (current !== null && !current.split(/\r?\n/).some((line) => line.trim() === entry)) {
            await appendFile(repoExclude, `${current.endsWith("\n") ? "" : "\n"}${entry}\n`);
        }
    } catch {
        // Not a git repository, or no permission. Neither is a reason to fail
        // an extraction the user asked for.
    }

    try {
        const cutoff = Date.now() - maxAgeMs;
        const entries = [];
        for (const name of await readdir(destDir)) {
            const child = path.join(destDir, name);
            const info = await stat(child).catch(() => null);
            if (info) entries.push({ child, mtimeMs: info.mtimeMs });
        }
        // Age alone is the wrong test. Nothing here knows whether a file is
        // still open in an editor, and "older than a day" describes plenty of
        // files someone is still reading -- sparing only the newest does not
        // help either, because the extraction that triggers this is always the
        // newest. So keep a generous recent set unconditionally and only
        // consider what falls outside it, which bounds growth without deleting
        // anything a user plausibly still has on screen.
        entries.sort((a, b) => b.mtimeMs - a.mtimeMs);
        for (const entry of entries.slice(keepRecent)) {
            if (entry.mtimeMs < cutoff) await rm(entry.child, { recursive: true, force: true }).catch(() => { });
        }
    } catch {
        // Directory does not exist yet on the first extraction.
    }
}

/**
 * Copy a container file onto the host so a real editor can open it.
 *
 * `docker cp` refuses to follow symlinks -- `/etc/os-release` is typically a
 * link to `../usr/lib/os-release` and the copy fails outright -- so the link is
 * resolved inside the container first, when `readlink` is available. Distroless
 * images often have neither, in which case the original path is attempted and
 * the runtime's own error is surfaced.
 *
 * @returns {Promise<{hostPath: string, relative: string, size: number, resolvedFrom: string|null}>}
 */
export async function extractContainerFile(id, filePath, { destDir, maxBytes = 32 * 1024 * 1024 } = {}) {
    if (!id) throw new Error("A container id or name is required.");
    if (!destDir) throw new Error("No destination directory is available for this canvas.");
    const target = String(filePath || "");
    if (!target.startsWith("/")) throw new Error("Path must be absolute, e.g. /app/appsettings.json.");
    if (target.includes("\0")) throw new Error("Invalid path.");

    // Resolve symlinks in-container. Passed as argv with no shell: `sh -lc`
    // would perform command substitution even inside the double quotes
    // `JSON.stringify` produces, and these paths come from the container's own
    // directory listing, so a filename containing `$(...)` would execute. This
    // path also does not go through `execInContainer`, so it would skip the
    // privileged-container check as well.
    //
    // Failure here is not fatal: plenty of images have no `readlink`, and the
    // plain path usually still works.
    let source = target;
    let resolvedFrom = null;
    const probe = await execRuntime(
        ["exec", id, "readlink", "-f", "--", target],
        { timeout: 15_000 },
    );
    if (probe.ok) {
        const resolved = probe.output.trim().split("\n").pop()?.trim();
        if (resolved && resolved.startsWith("/") && resolved !== target) {
            source = resolved;
            resolvedFrom = target;
        }
    }

    const base = extractionBasename(target);
    const safeContainer = String(id).replace(/[^\w.-]/g, "_").slice(0, 40);
    const folder = path.join(destDir, safeContainer);
    await mkdir(folder, { recursive: true });
    await tidyExtractionDir(destDir);
    const hostPath = path.join(folder, base);

    // Belt and braces: `extractionBasename` already refuses anything that could
    // climb, so a hostPath outside its folder means that guard has a hole.
    const inside = path.relative(folder, hostPath);
    if (!inside || inside.startsWith("..") || path.isAbsolute(inside)) {
        throw new Error(`Refusing to extract "${target}" outside its container folder.`);
    }

    const result = await execRuntime(["cp", `${id}:${source}`, hostPath], { timeout: 120_000 });
    if (!result.ok) throw new Error(result.output);

    const info = await stat(hostPath);
    if (info.isDirectory()) {
        await rm(hostPath, { recursive: true, force: true }).catch(() => { });
        throw new Error(`"${target}" is a directory. Open it in the browser instead.`);
    }
    if (info.size > maxBytes) {
        await rm(hostPath, { force: true }).catch(() => { });
        throw new Error(`"${target}" is ${Math.round(info.size / 1024 / 1024)} MB, too large to open in an editor.`);
    }
    return {
        hostPath,
        relative: path.relative(destDir, hostPath).split(path.sep).join("/"),
        size: info.size,
        resolvedFrom,
    };
}

/* ------------------------------------------------------------------ *
 * Image layers
 * ------------------------------------------------------------------ */

/**
 * The Dockerfile instruction a layer came from.
 *
 * `docker history` reports the raw build command, which for older images is
 * wrapped in shell noise (`/bin/sh -c #(nop)  EXPOSE ...`) and for buildkit
 * images carries a `# buildkit` suffix. Neither tells the reader anything, and
 * both push the part that matters off the end of the line.
 */
function parseInstruction(createdBy) {
    let text = String(createdBy ?? "").trim();
    text = text.replace(/\s*#\s*buildkit\s*$/i, "");
    // Classic no-op metadata layers: `/bin/sh -c #(nop)  ENV FOO=bar`
    const nop = /^\/bin\/sh\s+-c\s+#\(nop\)\s+(.*)$/s.exec(text);
    if (nop) text = nop[1].trim();
    // The shell wrapper appears both bare (`/bin/sh -c apt-get ...`) and
    // already prefixed by buildkit (`RUN /bin/sh -c apt-get ...`), sometimes
    // with build args spliced in (`RUN |2 A=1 B=2 /bin/sh -c ...`). None of it
    // is information; the command is.
    text = text.replace(/^RUN\s+(?:\|\d+\s+(?:\S+=\S*\s+)*)?\/bin\/sh\s+-c\s+/s, "RUN ");
    const bare = /^\/bin\/sh\s+-c\s+(.*)$/s.exec(text);
    if (bare) text = `RUN ${bare[1].trim()}`;
    // Build commands are written across many lines with heavy indentation,
    // which renders as a wall of gaps in a table cell.
    text = text.replace(/\s+/g, " ").trim();
    const verb = /^([A-Z]{3,10})\b/.exec(text);
    return {
        instruction: text,
        verb: verb ? verb[1] : "LAYER",
    };
}

/**
 * A image's layers, largest-first information intact.
 *
 * Returned in build order (oldest first) because that is how a Dockerfile reads
 * and where a size problem has to be fixed; the UI sorts if it wants to.
 * `empty` marks metadata-only layers (ENV, EXPOSE, WORKDIR) so they can be
 * hidden -- they are usually more than half the rows and never the answer to
 * "what is making this image big".
 */
export async function imageHistory(ref) {
    if (!ref) throw new Error("An image id or reference is required.");
    const result = await execRuntime(["history", "--no-trunc", "--format", "{{json .}}", ref], { timeout: 60_000 });
    if (!result.ok) throw new Error(result.output);

    const rows = parseJsonLines(result.output).map((raw, index) => {
        const sizeBytes = parseSizeText(raw.Size);
        const { instruction, verb } = parseInstruction(raw.CreatedBy);
        return {
            index,
            id: raw.ID && raw.ID !== "<missing>" ? raw.ID : null,
            shortId: raw.ID && raw.ID !== "<missing>" ? String(raw.ID).replace(/^sha256:/, "").slice(0, 12) : null,
            verb,
            instruction,
            sizeBytes,
            sizeText: raw.Size ?? "0B",
            created: raw.CreatedAt ?? null,
            createdSince: raw.CreatedSince ?? null,
            comment: raw.Comment ?? "",
            empty: !(sizeBytes > 0),
        };
    });

    // `docker history` prints newest first. Build order reads better and makes
    // "this COPY is the expensive one" locatable in the Dockerfile.
    rows.reverse();
    rows.forEach((row, i) => { row.index = i; });

    const total = rows.reduce((sum, row) => sum + (row.sizeBytes || 0), 0);
    return {
        ref,
        layers: rows,
        totalBytes: total,
        countAll: rows.length,
        countSized: rows.filter((r) => !r.empty).length,
    };
}

/* ------------------------------------------------------------------ *
 * Running a command in a container
 *
 * This is the one place the canvas runs a caller-supplied command. Two things
 * make that defensible, and both matter:
 *
 * 1. argv is an array passed straight to execFile with no shell. There is
 *    nothing to inject into: `;`, `&&`, pipes, globs and redirection are not
 *    interpreted, they are literal arguments.
 *
 * 2. The container is the security boundary. `rm -rf /` inside a container
 *    destroys that container's filesystem, not the host's -- which is the
 *    point of containers, and why an allow-list of "safe" commands would be
 *    mostly theatre.
 *
 * The exception is where that boundary does not hold: a privileged container,
 * or one with the daemon socket mounted, is effectively the host. Those are
 * refused unless the caller explicitly acknowledges it, because there the
 * usual reasoning stops applying.
 * ------------------------------------------------------------------ */

const HOST_ESCAPE_BINDS = /docker[._-]?sock|docker_engine|^\\\\[.?]\\pipe|\/var\/run\/docker/i;

/**
 * Capabilities that make the container boundary meaningless.
 *
 * `ALL` is the one most worth naming: `--cap-add ALL` grants SYS_ADMIN along
 * with everything else, so a check that only looked for individual capability
 * names let the broadest possible grant through unremarked.
 */
const HOST_ESCAPE_CAPS = new Set(["ALL", "SYS_ADMIN", "SYS_PTRACE", "SYS_MODULE"]);

/** Docker reports capabilities with or without the `CAP_` prefix, and in either case. */
const normaliseCapability = (value) => String(value).trim().toUpperCase().replace(/^CAP_/, "");

/** Reasons this container is not meaningfully isolated from the host. */
function hostEscapeRisks(detail) {
    const host = detail?.HostConfig ?? {};
    const risks = [];
    if (host.Privileged) risks.push("it runs privileged");
    if ((host.Binds ?? []).some((b) => HOST_ESCAPE_BINDS.test(String(b)))) {
        risks.push("it mounts the container runtime socket");
    }
    const elevated = (host.CapAdd ?? []).filter((c) => HOST_ESCAPE_CAPS.has(normaliseCapability(c)));
    if (elevated.length > 0) {
        risks.push(`it has elevated capabilities (${elevated.join(", ")})`);
    }
    if (host.PidMode === "host" || host.NetworkMode === "host") {
        risks.push("it shares a host namespace");
    }
    return risks;
}

/**
 * The same check by container id, for callers that have not already inspected.
 *
 * Used by the interactive terminal, which -- unlike `execInContainer` -- reports
 * the risks rather than refusing, because a person who opened a shell chose the
 * container deliberately. Returns an empty array when the container cannot be
 * inspected, so an advisory check can never be what stops a shell from opening.
 */
export async function containerHostEscapeRisks(id) {
    const detail = await inspect(id).catch(() => null);
    return detail ? hostEscapeRisks(detail) : [];
}

/**
 * Run a command inside a running container and return its output.
 *
 * @param {string} id           container id or name
 * @param {string[]} argv       command and arguments, e.g. ["top","-b","-n","1"]
 * @param {object} [options]
 * @param {boolean} [options.acknowledgeHostAccess] proceed even when the
 *   container is not isolated from the host
 */
export async function execInContainer(id, argv, options = {}) {
    if (!id) throw new Error("A container id or name is required.");
    if (!Array.isArray(argv) || argv.length === 0) {
        throw new Error('Provide the command as an array, e.g. ["top","-b","-n","1"].');
    }
    const args = argv.map((value) => {
        if (typeof value !== "string") throw new Error("Every command argument must be a string.");
        if (value.includes("\0")) throw new Error("Invalid argument.");
        return value;
    });

    const detail = await inspect(id).catch(() => null);
    if (!detail) throw new Error(`No container matches "${id}".`);
    if (!detail.State?.Running) {
        throw new Error(`${detail.Name?.replace(/^\//, "") ?? id} is not running, so nothing can be executed in it.`);
    }

    const risks = hostEscapeRisks(detail);
    if (risks.length > 0 && !options.acknowledgeHostAccess) {
        const error = new Error(
            `Refusing to run a command in "${detail.Name?.replace(/^\//, "") ?? id}" because ${risks.join(" and ")}. ` +
            "A command there is effectively running on the host, not inside a sandbox. " +
            "Re-run with acknowledgeHostAccess if that is genuinely intended.",
        );
        error.code = "HOST_ACCESS_REFUSED";
        error.risks = risks;
        throw error;
    }

    const prefix = ["exec"];
    if (options.user) prefix.push("-u", assertMatch(options.user, /^[A-Za-z0-9_.:-]{1,64}$/, "user", "1000 or app"));
    if (options.workdir) {
        const dir = String(options.workdir);
        if (!dir.startsWith("/")) throw new Error("Working directory must be an absolute path.");
        prefix.push("-w", dir);
    }

    const started = Date.now();
    const result = await execRuntime([...prefix, id, ...args], {
        timeout: Math.max(1000, Math.min(120_000, Number(options.timeout) || 30_000)),
    });
    return {
        container: detail.Name?.replace(/^\//, "") ?? id,
        argv: args,
        command: result.command,
        ok: result.ok,
        output: result.output,
        durationMs: Date.now() - started,
        hostAccessAcknowledged: risks.length > 0,
        risks,
    };
}

/* ------------------------------------------------------------------ *
 * Dockerfile: provenance and reconstruction
 *
 * Two very different things, deliberately kept apart.
 *
 * Provenance is *retrieval*: a BuildKit-built image can carry a SLSA
 * attestation naming the exact repository, commit and path of the Dockerfile
 * that produced it. That is the real file.
 *
 * Reconstruction is *inference*: `docker history` replays the instructions
 * baked into the layers. It is useful for reading, but it is not the original
 * file and cannot be, because multi-stage builds leave no trace of earlier
 * stages, COPY sources are recorded as content hashes, and comments,
 * formatting, .dockerignore and build args are simply gone.
 *
 * Conflating the two would be the whole problem, so this returns both, labelled.
 * ------------------------------------------------------------------ */

/** Instructions that came from the build context rather than a literal path. */
const OPAQUE_SOURCE_RE = /\b(file|dir|multi):[0-9a-f]{16,}/;

/**
 * The recorded origin of an image, if it has one.
 *
 * Order matters: a SLSA attestation is authoritative, OCI labels are a
 * convention the publisher opted into, and neither is guaranteed.
 */
export async function imageProvenance(ref) {
    if (!ref) throw new Error("An image id or reference is required.");

    const notes = [];
    let source = null;

    // OCI labels first: cheap, local, and no registry round-trip.
    const inspected = await inspect(ref).catch(() => null);
    const labels = inspected?.Config?.Labels ?? {};
    const labelSource = labels["org.opencontainers.image.source"];
    if (labelSource) {
        source = {
            kind: "oci-label",
            uri: labelSource,
            revision: labels["org.opencontainers.image.revision"] ?? null,
            entryPoint: null,
        };
    }

    // SLSA provenance is stronger: it names the Dockerfile path too. It lives
    // in the registry, so a local-only image simply has none to fetch.
    const result = await execRuntime(
        ["buildx", "imagetools", "inspect", ref, "--format", "{{json .Provenance}}"],
        { timeout: 60_000 },
    );
    if (result.ok) {
        try {
            const parsed = JSON.parse(result.output);
            // Keyed by platform, and the source path often differs between them
            // -- alpine records `x86` for 386 and `x86_64` for amd64. Taking
            // whichever key came first would link to a different platform's
            // Dockerfile, so prefer the one this machine actually runs.
            const entries = parsed && typeof parsed === "object" ? Object.entries(parsed) : [];
            const preferred = ["linux/amd64", "linux/arm64", "linux/arm64/v8"];
            entries.sort(([a], [b]) => {
                const rank = (key) => {
                    const i = preferred.indexOf(key);
                    return i === -1 ? preferred.length : i;
                };
                return rank(a) - rank(b);
            });
            for (const [platform, entry] of entries) {
                const config = entry?.SLSA?.invocation?.configSource;
                if (config?.uri) {
                    source = {
                        kind: "slsa-provenance",
                        platform,
                        uri: config.uri,
                        revision: config.digest?.sha1 ?? null,
                        entryPoint: config.entryPoint ?? null,
                    };
                    break;
                }
            }
            if (!source) notes.push("The registry has provenance for this image, but it does not record a source repository.");
        } catch {
            notes.push("Provenance was returned but could not be parsed.");
        }
    } else if (/pull access denied|not exist|authorization|unauthorized/i.test(result.output)) {
        notes.push("This image is not in a registry this machine can read, so no provenance attestation could be fetched. Locally built images only carry provenance if they were pushed.");
    } else {
        notes.push("No provenance attestation is available for this image.");
    }

    return { ref, source, notes };
}

/**
 * A readable Dockerfile-shaped rendering of an image's history.
 *
 * Explicitly not "the Dockerfile". The returned `lossy` list names what could
 * not be recovered for *this* image, so the UI can say which caveats actually
 * apply rather than printing a generic disclaimer.
 */
export async function reconstructDockerfile(ref) {
    const { layers } = await imageHistory(ref);
    const lossy = [];

    const body = layers.map((layer) => {
        if (OPAQUE_SOURCE_RE.test(layer.instruction)) {
            return `# source recorded as a content hash, original path unknown\n${layer.instruction}`;
        }
        return layer.instruction;
    });

    if (layers.some((l) => OPAQUE_SOURCE_RE.test(l.instruction))) {
        lossy.push("ADD/COPY sources appear as content hashes; the original paths are not stored in the image.");
    }
    if (layers.some((l) => /^COPY\s+\/\S+\s/.test(l.instruction))) {
        lossy.push("Some COPY layers read from absolute paths, which usually means an earlier build stage that leaves no trace in the final image.");
    }
    lossy.push("Comments, formatting, .dockerignore and build-arg values are not stored in an image and cannot be recovered.");
    lossy.push("No FROM line can be derived: a base image's layers are merged into the history with no marker for where it ended.");

    return {
        ref,
        text: body.join("\n"),
        lineCount: body.length,
        lossy,
    };
}

/* ------------------------------------------------------------------ *
 * docker run
 *
 * `run` is deliberately absent from ALLOWED_SUBCOMMANDS: free-form argv
 * would let a caller mount the host root or the docker socket and escape
 * the container boundary entirely. Instead we accept structured fields,
 * validate each one, and build the argv ourselves.
 * ------------------------------------------------------------------ */

/** Containers started from this canvas are stamped so they can be found later. */
export const CANVAS_LABEL = "copilot.canvas";

const NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,127}$/;
const PORT_RE = /^(?:(\d{1,5}):)?(\d{1,5})(?:\/(tcp|udp))?$/;
const ENV_RE = /^[A-Za-z_][A-Za-z0-9_]*=/;
const LABEL_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*=/;
const NETWORK_RE = /^(bridge|host|none|[a-zA-Z0-9][a-zA-Z0-9_.-]*)$/;
const RESTART_POLICIES = new Set(["no", "on-failure", "unless-stopped", "always"]);
const MEMORY_RE = /^\d+(\.\d+)?[bkmgBKMG]?$/;
const CPUS_RE = /^\d+(\.\d+)?$/;

/** Host paths that must never be bind-mounted into a container. */
const FORBIDDEN_MOUNTS = [
    /^[a-zA-Z]:[\\/]*$/, // a whole Windows drive
    /^[\\/]+$/, // POSIX root
    /^[a-zA-Z]:[\\/]+(windows|program files|program files \(x86\)|programdata)([\\/]|$)/i,
    /^[a-zA-Z]:[\\/]+users[\\/]*$/i, // all user profiles; subdirectories are fine
    /^[\\/](etc|usr|bin|sbin|boot|dev|proc|sys|lib|lib64)([\\/]|$)/i,
    /docker[._-]?(sock|engine)/i, // docker socket / named pipe == host root
    /^\\\\[.?]\\pipe\\/i, // Windows named pipes
];

/**
 * Collapse runs of separators, keeping a leading Windows UNC prefix intact.
 *
 * `//etc/passwd` and `/etc/passwd` name the same directory to Docker, but the
 * deny-list patterns anchor on a single leading separator, so only the second
 * matched. A UNC path genuinely starts with two, and one of the rules depends
 * on that, so it is preserved.
 */
function collapseSeparators(value) {
    const unc = /^\\\\/.test(value) ? "\\\\" : "";
    return unc + value.slice(unc.length).replace(/[\\/]{2,}/g, (run) => run[0]);
}

function assertSafeMount(source) {
    const value = String(source).trim();
    if (!value) throw new Error("A volume mount needs a host path.");

    // Refused before the deny-list rather than resolved against it. Every rule
    // below anchors on the start of the path, so "/tmp/../etc" walked straight
    // past the rule that "/etc" trips over while naming the same directory to
    // Docker. Canonicalising would mean resolving a path for the daemon's
    // platform rather than this process's, so the segment is simply refused --
    // a bind mount has no need to climb.
    if (value.split(/[\\/]+/).includes("..")) {
        throw new Error(
            `Refusing to bind-mount "${value}" because it contains a ".." segment. Name the directory you mean directly.`,
        );
    }

    for (const pattern of FORBIDDEN_MOUNTS) {
        if (pattern.test(value) || pattern.test(collapseSeparators(value))) {
            throw new Error(
                `Refusing to bind-mount "${value}". System paths, drive roots and the container socket are blocked because mounting them hands the container control of the host. Mount a specific project folder instead.`,
            );
        }
    }
    return value;
}

function assertMatch(value, pattern, label, example) {
    const text = String(value).trim();
    if (!pattern.test(text)) throw new Error(`Invalid ${label}: "${text}". Expected something like ${example}.`);
    return text;
}

/**
 * Start a container from an image using validated, structured options.
 *
 * @param {object} spec
 * @param {string} spec.image           Image reference or id (required).
 * @param {string} [spec.name]          Container name.
 * @param {string[]} [spec.ports]       "8080:80" or "80" or "8080:80/udp".
 * @param {string[]} [spec.env]         "KEY=value".
 * @param {string[]} [spec.labels]      "key=value".
 * @param {Array<{source:string,target:string,readOnly?:boolean}>} [spec.volumes]
 * @param {string[]} [spec.command]     Overrides the image CMD.
 * @param {string} [spec.entrypoint]
 * @param {string} [spec.workdir]
 * @param {string} [spec.user]
 * @param {string} [spec.network]
 * @param {string} [spec.restart]
 * @param {string} [spec.memory]        "512m"
 * @param {string} [spec.cpus]          "1.5"
 * @param {boolean} [spec.detach=true]
 * @param {boolean} [spec.removeOnExit=false]
 * @param {boolean} [spec.publishAll=false]
 * @param {boolean} [spec.pull=false]
 */
export async function runImage(spec = {}) {
    const image = String(spec.image ?? "").trim();
    if (!image) throw new Error("An image reference or id is required.");

    const detach = spec.detach !== false;
    const args = ["run"];

    if (detach) args.push("-d");
    if (spec.removeOnExit) args.push("--rm");
    if (spec.pull) args.push("--pull", "always");
    if (spec.publishAll) args.push("-P");

    if (spec.name) args.push("--name", assertMatch(spec.name, NAME_RE, "container name", "my-app"));

    for (const port of spec.ports ?? []) {
        args.push("-p", assertMatch(port, PORT_RE, "port mapping", "8080:80 or 8080:80/udp"));
    }
    for (const variable of spec.env ?? []) {
        args.push("-e", assertMatch(variable, ENV_RE, "environment variable", "ASPNETCORE_ENVIRONMENT=Development"));
    }
    for (const label of spec.labels ?? []) {
        args.push("--label", assertMatch(label, LABEL_RE, "label", "team=platform"));
    }
    for (const volume of spec.volumes ?? []) {
        const source = assertSafeMount(volume.source);
        const target = String(volume.target ?? "").trim();
        if (!target.startsWith("/")) throw new Error(`Volume target must be an absolute container path, got "${target}".`);
        args.push("-v", `${source}:${target}${volume.readOnly ? ":ro" : ""}`);
    }

    if (spec.network) args.push("--network", assertMatch(spec.network, NETWORK_RE, "network", "bridge"));
    if (spec.restart) {
        const policy = String(spec.restart).trim();
        if (!RESTART_POLICIES.has(policy)) {
            throw new Error(`Invalid restart policy "${policy}". Expected one of: ${[...RESTART_POLICIES].join(", ")}.`);
        }
        args.push("--restart", policy);
    }
    if (spec.memory) args.push("--memory", assertMatch(spec.memory, MEMORY_RE, "memory limit", "512m"));
    if (spec.cpus) args.push("--cpus", assertMatch(spec.cpus, CPUS_RE, "cpu limit", "1.5"));
    if (spec.workdir) args.push("-w", String(spec.workdir).trim());
    if (spec.user) args.push("-u", String(spec.user).trim());
    if (spec.entrypoint) args.push("--entrypoint", String(spec.entrypoint).trim());

    // Provenance stamp so canvas-created containers are always findable.
    args.push("--label", `${CANVAS_LABEL}=containers`, "--label", `${CANVAS_LABEL}.created=${new Date().toISOString()}`);

    // Validated here rather than trusted from the caller. `docker run` parses
    // options until its first positional, so an image of "--privileged" is read
    // as a flag and the first element of `command` becomes the image instead --
    // which would hand back a privileged container while every mount, port and
    // capability check above still passed. `assertImageRef` is the same guard
    // `tag`, `pull` and `push` already use.
    args.push(assertImageRef(image));

    for (const part of spec.command ?? []) {
        if (typeof part !== "string") throw new Error("Every command argument must be a string.");
        args.push(part);
    }

    const result = await execRuntime(args, { timeout: detach ? 120_000 : 300_000 });
    return {
        ...result,
        detached: detach,
        containerId: detach && result.ok ? result.output.trim().split(/\s+/).pop()?.slice(0, 12) ?? null : null,
    };
}

/*
 * Internals exposed for tests.
 *
 * These are pure: no daemon, no filesystem, no clock. They are also where the
 * security-relevant decisions live -- which mounts are refused, which
 * containers are not isolated from the host -- so they are the part most worth
 * pinning down. Exported under one clearly-marked name rather than
 * individually, so the module's real API stays legible.
 */
export const __internals = {
    parseJsonLines,
    assertImageRef,
    assertSafeMount,
    extractionBasename,
    hostEscapeRisks,
    parseInstruction,
    formatPorts,
    parsePublished,
    inferState,
    parseLabels,
    classifyEvent,
    containerSignatureFrom,
    shouldPollNotify,
};
