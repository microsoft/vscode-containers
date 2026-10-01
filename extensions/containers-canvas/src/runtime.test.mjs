/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Tests for the pure parts of the runtime adapter.
//
// Deliberately daemon-free: every function under test takes data and returns
// data, so the suite runs anywhere and fails for exactly one reason. The
// daemon-dependent paths are not faked -- a mock of `docker inspect` would only
// assert that the mock matches the code, which is the least useful thing a test
// can do.
//
// The emphasis is on the two places a mistake is expensive: the mount and
// host-escape checks, which decide whether a container is treated as isolated,
// and the output parsers, which are fed whatever the runtime prints.

import assert from "node:assert/strict";
import test from "node:test";

import { __internals, findTarget } from "./runtime.mjs";

const {
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
} = __internals;

/* ---------------------------------------------------------------- *
 * Output parsing
 * ---------------------------------------------------------------- */

test("parseJsonLines reads newline-delimited objects", () => {
    const out = parseJsonLines('{"Id":"a"}\n{"Id":"b"}\n');
    assert.deepEqual(out.map((r) => r.Id), ["a", "b"]);
});

test("parseJsonLines reads a JSON array, which some versions emit instead", () => {
    assert.deepEqual(parseJsonLines('[{"Id":"a"}]').map((r) => r.Id), ["a"]);
});

test("parseJsonLines tolerates CRLF", () => {
    assert.equal(parseJsonLines('{"Id":"a"}\r\n{"Id":"b"}\r\n').length, 2);
});

test("parseJsonLines skips a malformed row rather than losing the listing", () => {
    // A single bad line must not cost the user every other container.
    const out = parseJsonLines('{"Id":"a"}\nnot json\n{"Id":"b"}');
    assert.deepEqual(out.map((r) => r.Id), ["a", "b"]);
});

test("parseJsonLines returns empty for empty or unparseable input", () => {
    assert.deepEqual(parseJsonLines(""), []);
    assert.deepEqual(parseJsonLines("   \n  "), []);
    assert.deepEqual(parseJsonLines("["), []);
});

test("inferState maps the runtime's prose to a state", () => {
    assert.equal(inferState("Up 3 hours"), "running");
    assert.equal(inferState("Up 2 minutes (Paused)"), "paused");
    assert.equal(inferState("Exited (255) 16 hours ago"), "exited");
    assert.equal(inferState("Created"), "created");
    assert.equal(inferState("Restarting (1) 2 seconds ago"), "restarting");
    assert.equal(inferState("something else"), "unknown");
});

test("parseLabels splits a flat k=v,k=v string", () => {
    assert.deepEqual(parseLabels("a=1,b=2"), { a: "1", b: "2" });
});

test("parseLabels keeps '=' inside a value", () => {
    // Base64 and connection strings both routinely contain '='.
    assert.deepEqual(parseLabels("token=abc=def"), { token: "abc=def" });
});

test("parseLabels accepts the object form and ignores junk", () => {
    assert.deepEqual(parseLabels({ a: 1 }), { a: "1" });
    assert.deepEqual(parseLabels(""), {});
    assert.deepEqual(parseLabels("=novalue"), {});
});

test("formatPorts renders both published and unpublished ports", () => {
    assert.equal(
        formatPorts([{ host_ip: "0.0.0.0", host_port: 8080, container_port: 80, protocol: "tcp" }]),
        "0.0.0.0:8080->80/tcp",
    );
    assert.equal(formatPorts([{ container_port: 443, protocol: "tcp" }]), "443/tcp");
    assert.equal(formatPorts("already a string"), "already a string");
    assert.equal(formatPorts(null), "");
});

/* ---------------------------------------------------------------- *
 * Published port mapping
 * ---------------------------------------------------------------- */

test("parsePublished turns wildcard bind addresses into something connectable", () => {
    // `0.0.0.0` and `[::]` mean "bound on every interface". Neither is a
    // destination: handing `http://0.0.0.0:8080` to a browser is not reliably
    // reachable, and the address that actually connects is loopback.
    for (const raw of ["0.0.0.0:8080->80/tcp", "[::]:8080->80/tcp", "8080->80/tcp"]) {
        const [first] = parsePublished(raw);
        assert.equal(first.host, "localhost", `expected loopback for ${raw}`);
        assert.equal(first.hostPort, "8080");
        assert.equal(first.containerPort, "80");
    }
});

test("parsePublished keeps a specific bind address", () => {
    // Bound to one interface on purpose; that is where it answers.
    assert.equal(parsePublished("127.0.0.1:9000->90/tcp")[0].host, "127.0.0.1");
    assert.equal(parsePublished("192.168.1.5:9000->90/tcp")[0].host, "192.168.1.5");
});

test("parsePublished de-duplicates the v4 and v6 rows docker emits for one mapping", () => {
    const out = parsePublished("0.0.0.0:12375->2375/tcp, [::]:12375->2375/tcp");
    assert.equal(out.length, 1);
});

test("parsePublished ignores udp and unpublished ports", () => {
    assert.deepEqual(parsePublished("53->53/udp"), []);
    assert.deepEqual(parsePublished("80/tcp"), []);
    assert.deepEqual(parsePublished(""), []);
});

test("parsePublished reads every distinct mapping", () => {
    const out = parsePublished("0.0.0.0:12375->2375/tcp, [::]:12375->2375/tcp, 0.0.0.0:18080->8080/tcp");
    assert.deepEqual(out.map((p) => `${p.hostPort}->${p.containerPort}`), ["12375->2375", "18080->8080"]);
});

/* ---------------------------------------------------------------- *
 * Dockerfile reconstruction
 * ---------------------------------------------------------------- */

test("parseInstruction strips the shell wrapper buildkit adds", () => {
    assert.deepEqual(parseInstruction("/bin/sh -c apt-get update"), {
        instruction: "RUN apt-get update",
        verb: "RUN",
    });
});

test("parseInstruction unwraps classic #(nop) metadata layers", () => {
    assert.deepEqual(parseInstruction("/bin/sh -c #(nop)  ENV FOO=bar"), {
        instruction: "ENV FOO=bar",
        verb: "ENV",
    });
});

test("parseInstruction drops spliced build args and the buildkit suffix", () => {
    const out = parseInstruction("RUN |2 A=1 B=2 /bin/sh -c make install # buildkit");
    assert.equal(out.instruction, "RUN make install");
    assert.equal(out.verb, "RUN");
});

test("parseInstruction collapses multi-line commands onto one line", () => {
    const out = parseInstruction("/bin/sh -c set -e \\\n    && make \\\n    && make install");
    assert.ok(!out.instruction.includes("\n"));
    assert.ok(!out.instruction.includes("  "));
});

test("parseInstruction labels an unrecognised layer rather than guessing", () => {
    assert.equal(parseInstruction("").verb, "LAYER");
});

/* ---------------------------------------------------------------- *
 * Reference validation
 * ---------------------------------------------------------------- */

test("assertImageRef accepts the reference shapes the runtime accepts", () => {
    for (const ref of [
        "alpine",
        "alpine:3.20",
        "ghcr.io/owner/name:tag",
        "registry.example.com:5000/team/app:1.2.3",
        "alpine@sha256:0123456789abcdef",
    ]) {
        assert.equal(assertImageRef(ref), ref);
    }
});

test("assertImageRef refuses anything that could become another argument", () => {
    // A leading dash would be read as a flag; whitespace and shell characters
    // have no business in a reference.
    for (const bad of ["-rf", "--privileged", "a b", "a;b", "a|b", "a$(id)", "", "  "]) {
        assert.throws(() => assertImageRef(bad), /Invalid/);
    }
});

/* ---------------------------------------------------------------- *
 * Mount safety
 * ---------------------------------------------------------------- */

test("assertSafeMount allows an ordinary project directory", () => {
    assert.equal(assertSafeMount("C:\\Users\\me\\project"), "C:\\Users\\me\\project");
    assert.equal(assertSafeMount("/home/me/project"), "/home/me/project");
});

test("assertSafeMount refuses drive roots and POSIX root", () => {
    for (const bad of ["C:\\", "C:/", "/", "//"]) {
        assert.throws(() => assertSafeMount(bad), /Refusing to bind-mount/);
    }
});

test("assertSafeMount refuses system directories", () => {
    for (const bad of [
        "C:\\Windows",
        "C:\\Program Files",
        "C:\\ProgramData\\docker",
        "/etc",
        "/usr/lib",
        "/proc",
    ]) {
        assert.throws(() => assertSafeMount(bad), /Refusing to bind-mount/);
    }
});

test("assertSafeMount refuses the runtime socket and named pipes", () => {
    // Mounting the socket hands the container the host, which is the whole
    // reason the check exists.
    for (const bad of [
        "/var/run/docker.sock",
        "/run/docker.sock",
        "\\\\.\\pipe\\docker_engine",
    ]) {
        assert.throws(() => assertSafeMount(bad), /Refusing to bind-mount/);
    }
});

test("assertSafeMount allows a subdirectory of the users folder", () => {
    // The whole profile root is blocked; a project inside it is not.
    assert.doesNotThrow(() => assertSafeMount("C:\\Users\\me\\src"));
    assert.throws(() => assertSafeMount("C:\\Users\\"), /Refusing to bind-mount/);
});

test("assertSafeMount requires a path at all", () => {
    assert.throws(() => assertSafeMount(""), /needs a host path/);
});

test("assertSafeMount refuses a path that climbs into a blocked directory", () => {
    // Every deny-list pattern anchors on the start of the path, so a mount that
    // reaches a system directory by climbing named the same place while
    // matching none of them.
    for (const bad of [
        "/tmp/../etc",
        "/home/me/../../etc/shadow",
        "C:\\Users\\me\\..\\..\\Windows",
        "/var/lib/../run/docker.sock",
    ]) {
        assert.throws(() => assertSafeMount(bad), /contains a "\.\." segment/, bad);
    }
});

test("assertSafeMount refuses a blocked path hidden behind doubled separators", () => {
    // "//etc" and "/etc" are the same directory to Docker, but only the second
    // matched a rule anchored on one leading separator.
    for (const bad of ["//etc/passwd", "///usr//bin", "C:\\\\Windows\\system32"]) {
        assert.throws(() => assertSafeMount(bad), /Refusing to bind-mount/, bad);
    }
});

test("assertSafeMount still allows an ordinary UNC share", () => {
    // The named-pipe rule depends on the leading double backslash, so
    // collapsing separators must leave a UNC prefix alone.
    assert.doesNotThrow(() => assertSafeMount("\\\\fileserver\\team\\project"));
    assert.throws(() => assertSafeMount("\\\\.\\pipe\\docker_engine"), /Refusing to bind-mount/);
});

/* ---------------------------------------------------------------- *
 * Extraction paths
 * ---------------------------------------------------------------- */

test("extractionBasename refuses a target that would escape its folder", () => {
    // `path.basename("/..")` is "..", and joining that onto the container's
    // folder resolves to the shared extraction directory -- which the caller
    // then removes recursively when the copy turns out to be a directory.
    for (const bad of ["/..", "/a/..", "..", "/../..", "."]) {
        assert.throws(() => extractionBasename(bad), /does not name a file/, bad);
    }
});

test("extractionBasename treats a backslash as part of the filename", () => {
    // The target is a path inside a Linux container, where a backslash is an
    // ordinary character. Letting Windows semantics split on it would both
    // truncate the name and, once joined again, allow climbing.
    assert.throws(() => extractionBasename("/tmp/a\\..\\..\\evil"), /does not name a file/);
    assert.equal(extractionBasename("/var/log/app.log"), "app.log");
    assert.equal(extractionBasename("/"), "file");
});

/* ---------------------------------------------------------------- *
 * Host-escape detection
 * ---------------------------------------------------------------- */

test("hostEscapeRisks reports nothing for an ordinary container", () => {
    assert.deepEqual(hostEscapeRisks({ HostConfig: { Binds: ["/home/me/app:/app"] } }), []);
});

test("hostEscapeRisks flags a privileged container", () => {
    const risks = hostEscapeRisks({ HostConfig: { Privileged: true } });
    assert.equal(risks.length, 1);
    assert.match(risks[0], /privileged/);
});

test("hostEscapeRisks flags a mounted runtime socket in either form", () => {
    for (const bind of [
        "/var/run/docker.sock:/var/run/docker.sock",
        "\\\\.\\pipe\\docker_engine:/var/run/docker.sock",
    ]) {
        const risks = hostEscapeRisks({ HostConfig: { Binds: [bind] } });
        assert.ok(risks.some((r) => /runtime socket/.test(r)), `expected socket risk for ${bind}`);
    }
});

test("hostEscapeRisks flags elevated capabilities", () => {
    const risks = hostEscapeRisks({ HostConfig: { CapAdd: ["SYS_ADMIN"] } });
    assert.ok(risks.some((r) => /elevated capabilities/.test(r)));
});

test("hostEscapeRisks flags CAP_ALL, however it is spelled", () => {
    // `--cap-add ALL` includes SYS_ADMIN, so the broadest possible grant was
    // the one a list of individual capability names missed.
    for (const caps of [["ALL"], ["CAP_ALL"], ["cap_all"], ["NET_BIND_SERVICE", "ALL"]]) {
        const risks = hostEscapeRisks({ HostConfig: { CapAdd: caps } });
        assert.ok(risks.some((r) => /elevated capabilities/.test(r)), caps.join(","));
    }
    assert.equal(hostEscapeRisks({ HostConfig: { CapAdd: ["CAP_SYS_PTRACE"] } }).length, 1);
});

test("hostEscapeRisks leaves ordinary capabilities alone", () => {
    assert.deepEqual(hostEscapeRisks({ HostConfig: { CapAdd: ["NET_BIND_SERVICE", "CHOWN"] } }), []);
});

test("hostEscapeRisks flags shared host namespaces", () => {
    assert.ok(hostEscapeRisks({ HostConfig: { PidMode: "host" } }).length === 1);
    assert.ok(hostEscapeRisks({ HostConfig: { NetworkMode: "host" } }).length === 1);
});

test("hostEscapeRisks accumulates every reason, not just the first", () => {
    const risks = hostEscapeRisks({
        HostConfig: { Privileged: true, Binds: ["/var/run/docker.sock:/x"], NetworkMode: "host" },
    });
    assert.equal(risks.length, 3);
});

test("hostEscapeRisks copes with a missing or partial inspect payload", () => {
    assert.deepEqual(hostEscapeRisks(undefined), []);
    assert.deepEqual(hostEscapeRisks({}), []);
    assert.deepEqual(hostEscapeRisks({ HostConfig: {} }), []);
});

/* ---------------------------------------------------------------- *
 * Target resolution
 * ---------------------------------------------------------------- */

const state = {
    containers: [{ kind: "container", id: "abc123def456", shortId: "abc123def456".slice(0, 12), name: "web" }],
    images: [{ kind: "image", id: "sha256:deadbeef", shortId: "deadbeef", ref: "alpine:3.20", tags: ["alpine:latest"] }],
};

test("findTarget resolves a container by name, id and short id", () => {
    assert.equal(findTarget(state, "web")?.name, "web");
    assert.equal(findTarget(state, "abc123def456")?.name, "web");
});

test("findTarget resolves an image by reference and by an additional tag", () => {
    assert.equal(findTarget(state, "alpine:3.20")?.kind, "image");
    assert.equal(findTarget(state, "alpine:latest")?.kind, "image");
    assert.equal(findTarget(state, "deadbeef")?.kind, "image");
});

test("findTarget prefers a container when a name is ambiguous", () => {
    // Containers are what lifecycle verbs act on, so they win.
    const ambiguous = {
        containers: [{ kind: "container", id: "x", shortId: "x", name: "shared" }],
        images: [{ kind: "image", id: "y", shortId: "y", ref: "shared" }],
    };
    assert.equal(findTarget(ambiguous, "shared").kind, "container");
});

test("findTarget returns null rather than guessing", () => {
    assert.equal(findTarget(state, "nope"), null);
    assert.equal(findTarget(state, ""), null);
    assert.equal(findTarget(undefined, "web"), null);
});

/* ------------------------------------------------------------------ *
 * Change watching
 * ------------------------------------------------------------------ */

test("classifyEvent accepts container lifecycle events", () => {
    for (const action of ["create", "start", "stop", "die", "pause", "unpause", "destroy", "rename"]) {
        assert.deepEqual(
            __internals.classifyEvent({ Type: "container", Action: action }),
            { type: "container", action },
            `${action} should trigger a reload`,
        );
    }
});

test("classifyEvent accepts image events", () => {
    for (const action of ["pull", "tag", "untag", "delete"]) {
        assert.deepEqual(__internals.classifyEvent({ Type: "image", Action: action }), { type: "image", action });
    }
});

test("classifyEvent ignores the actions this canvas causes itself", () => {
    // Browsing files runs `docker cp`; the terminal runs `docker exec`. If these
    // counted as changes the panel would reload every time a folder was opened.
    for (const action of ["exec_create", "exec_start", "exec_die", "archive-path", "extract-to-dir", "top", "resize"]) {
        assert.equal(__internals.classifyEvent({ Type: "container", Action: action }), null, `${action} must be ignored`);
    }
});

test("classifyEvent ignores object types the canvas does not render", () => {
    for (const type of ["network", "volume", "daemon", "plugin", "builder"]) {
        assert.equal(__internals.classifyEvent({ Type: type, Action: "create" }), null);
    }
});

test("classifyEvent strips the suffix daemons append to health events", () => {
    // Emitted as `health_status: healthy`, which must not read as a distinct action.
    assert.deepEqual(
        __internals.classifyEvent({ Type: "container", Action: "health_status: healthy" }),
        { type: "container", action: "health_status" },
    );
});

test("classifyEvent falls back to the legacy status field", () => {
    assert.deepEqual(__internals.classifyEvent({ Type: "container", status: "start" }), { type: "container", action: "start" });
});

test("classifyEvent survives malformed events", () => {
    for (const event of [null, undefined, {}, { Type: "container" }, { Action: "start" }]) {
        assert.doesNotThrow(() => __internals.classifyEvent(event));
    }
});

test("containerSignatureFrom changes when a container is paused", () => {
    // Pause shows up in Status, not State, so a State-only signature would miss it.
    const running = [{ ID: "a", State: "running", Status: "Up 2 minutes", Ports: "" }];
    const paused = [{ ID: "a", State: "running", Status: "Up 2 minutes (Paused)", Ports: "" }];
    assert.notEqual(__internals.containerSignatureFrom(running), __internals.containerSignatureFrom(paused));
});

test("containerSignatureFrom ignores ticking uptime text", () => {
    // Status carries humanised uptime that changes on its own every minute. If
    // that reached the signature, the poll would order a full reload forever on
    // a machine where nothing is happening.
    const a = [{ ID: "a", State: "running", Status: "Up 5 minutes", Ports: "" }];
    const b = [{ ID: "a", State: "running", Status: "Up 6 minutes", Ports: "" }];
    assert.equal(__internals.containerSignatureFrom(a), __internals.containerSignatureFrom(b));
});

test("containerSignatureFrom notices a rename", () => {
    const a = [{ ID: "a", State: "running", Status: "Up", Ports: "", Names: "before" }];
    const b = [{ ID: "a", State: "running", Status: "Up", Ports: "", Names: "after" }];
    assert.notEqual(__internals.containerSignatureFrom(a), __internals.containerSignatureFrom(b));
});

test("shouldPollNotify stays quiet when nothing changed", () => {
    assert.equal(__internals.shouldPollNotify({ changed: false, msSinceLastNotify: 60_000 }), false);
});

test("shouldPollNotify announces a change the stream did not report", () => {
    assert.equal(__internals.shouldPollNotify({ changed: true, msSinceLastNotify: 60_000 }), true);
});

test("shouldPollNotify defers to the stream when it just reported something", () => {
    // Otherwise every event-driven change would be reloaded a second time when
    // the next poll noticed the same difference.
    assert.equal(__internals.shouldPollNotify({ changed: true, msSinceLastNotify: 1_000 }), false);
});

test("shouldPollNotify announces once the interval has fully elapsed", () => {
    assert.equal(__internals.shouldPollNotify({ changed: true, msSinceLastNotify: 10_000, interval: 10_000 }), true);
    assert.equal(__internals.shouldPollNotify({ changed: true, msSinceLastNotify: 9_999, interval: 10_000 }), false);
});

test("containerSignatureFrom changes when published ports change", () => {
    const before = [{ ID: "a", State: "running", Status: "Up 1 second", Ports: "" }];
    const after = [{ ID: "a", State: "running", Status: "Up 1 second", Ports: "0.0.0.0:8080->80/tcp" }];
    assert.notEqual(__internals.containerSignatureFrom(before), __internals.containerSignatureFrom(after));
});

test("containerSignatureFrom ignores row ordering", () => {
    const a = [{ ID: "a", State: "running", Status: "Up", Ports: "" }, { ID: "b", State: "exited", Status: "Exited (0)", Ports: "" }];
    assert.equal(__internals.containerSignatureFrom(a), __internals.containerSignatureFrom([...a].reverse()));
});

test("containerSignatureFrom notices a container appearing or disappearing", () => {
    const one = [{ ID: "a", State: "running", Status: "Up", Ports: "" }];
    const two = [...one, { ID: "b", State: "running", Status: "Up", Ports: "" }];
    assert.notEqual(__internals.containerSignatureFrom(one), __internals.containerSignatureFrom(two));
    assert.equal(__internals.containerSignatureFrom([]), "");
});

test("containerSignatureFrom does not confuse adjacent fields", () => {
    // A naive join on a common separator would make these two collide.
    const a = [{ ID: "a", State: "running", Status: "Up", Ports: "x" }];
    const b = [{ ID: "a", State: "running", Status: "Up\u0000x", Ports: "" }];
    assert.notEqual(__internals.containerSignatureFrom(a), __internals.containerSignatureFrom(b));
});

test("containerHostEscapeRisks reports nothing for an ordinary container", () => {
    assert.deepEqual(__internals.hostEscapeRisks({ HostConfig: {} }), []);
});

test("hostEscapeRisks names every reason, so the warning can list them", () => {
    // The terminal joins these with "and" into a sentence, so each has to read
    // as a clause rather than a label.
    const risks = __internals.hostEscapeRisks({
        HostConfig: { Privileged: true, Binds: ["/var/run/docker.sock:/var/run/docker.sock"] },
    });
    assert.deepEqual(risks, ["it runs privileged", "it mounts the container runtime socket"]);
    assert.match(`because ${risks.join(" and ")}`, /because it runs privileged and it mounts/);
});
