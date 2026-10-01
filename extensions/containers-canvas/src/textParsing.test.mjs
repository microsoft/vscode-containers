/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from "node:assert/strict";
import test from "node:test";
import { splitArgv, splitSourceUri, githubRepo, browseUrl, parseJsonRoot } from "./webview/textParsing.mjs";

test("parseJsonRoot keeps an array root as an array by default", () => {
    // The reported case: FilesView shows real files, where a one-element array
    // is content, not a docker inspect wrapper.
    const out = parseJsonRoot('[{"enabled":true}]');
    assert.ok(Array.isArray(out), "an array root must stay an array");
    assert.equal(out.length, 1);
});

test("parseJsonRoot unwraps a single-entry array only when inspecting", () => {
    const wrapped = '[{"Id":"abc","State":{"Running":true}}]';
    const asInspect = parseJsonRoot(wrapped, { inspect: true });
    assert.ok(!Array.isArray(asInspect), "inspect output is unwrapped");
    assert.equal(asInspect.Id, "abc");

    const asFile = parseJsonRoot(wrapped);
    assert.ok(Array.isArray(asFile), "the same text in a file stays an array");
});

test("parseJsonRoot does not unwrap multi-entry or non-object arrays", () => {
    assert.equal(parseJsonRoot('[{"a":1},{"b":2}]', { inspect: true }).length, 2);
    assert.deepEqual(parseJsonRoot('["only"]', { inspect: true }), ["only"]);
    assert.deepEqual(parseJsonRoot("[null]", { inspect: true }), [null]);
});

test("parseJsonRoot returns empty containers rather than falling back to text", () => {
    // Both used to parse, then render as a blank pane; the viewer now has to be
    // able to tell them apart to say "Empty array" or "Empty object".
    assert.deepEqual(parseJsonRoot("[]"), []);
    assert.deepEqual(parseJsonRoot("{}"), {});
    assert.ok(Array.isArray(parseJsonRoot("[]")));
    assert.ok(!Array.isArray(parseJsonRoot("{}")));
});

test("parseJsonRoot falls back to plain text for non-JSON and scalars", () => {
    assert.equal(parseJsonRoot("hello"), null);
    assert.equal(parseJsonRoot("{not json"), null);
    assert.equal(parseJsonRoot(""), null);
    assert.equal(parseJsonRoot(null), null);
    // Scalars start with neither brace, so they never reach the parser.
    assert.equal(parseJsonRoot("42"), null);
    assert.equal(parseJsonRoot('"a string"'), null);
});

test("parseJsonRoot ignores non-JSON languages", () => {
    assert.equal(parseJsonRoot('{"a":1}', { language: "dockerfile" }), null);
});

test("splitArgv keeps a quoted segment attached to its flag", () => {
    // The reported case: this used to yield three arguments, with the quotes
    // still in them.
    assert.deepEqual(splitArgv('echo --label="hello world"'), ["echo", "--label=hello world"]);
});

test("splitArgv handles plain and quoted arguments", () => {
    assert.deepEqual(splitArgv("top -b -n 1"), ["top", "-b", "-n", "1"]);
    assert.deepEqual(splitArgv('echo "a b"'), ["echo", "a b"]);
    assert.deepEqual(splitArgv("echo 'a b'"), ["echo", "a b"]);
});

test("splitArgv treats the other quote character as literal inside a quote", () => {
    assert.deepEqual(splitArgv(`echo "it's here"`), ["echo", "it's here"]);
    assert.deepEqual(splitArgv(`echo 'say "hi"'`), ["echo", 'say "hi"']);
});

test("splitArgv joins adjacent quoted and unquoted runs", () => {
    assert.deepEqual(splitArgv('a"b"c'), ["abc"]);
    assert.deepEqual(splitArgv('--x="1 2"--y'), ["--x=1 2--y"]);
});

test("splitArgv preserves an explicit empty argument", () => {
    assert.deepEqual(splitArgv(`echo ''`), ["echo", ""]);
    assert.deepEqual(splitArgv('echo ""'), ["echo", ""]);
});

test("splitArgv tolerates odd input", () => {
    assert.deepEqual(splitArgv(""), []);
    assert.deepEqual(splitArgv("   "), []);
    assert.deepEqual(splitArgv(null), []);
    assert.deepEqual(splitArgv("  spaced   out  "), ["spaced", "out"]);
    // Unterminated quote still yields what was typed.
    assert.deepEqual(splitArgv('echo "abc'), ["echo", "abc"]);
});

test("splitArgv leaves shell metacharacters literal", () => {
    assert.deepEqual(splitArgv("cat a | grep b"), ["cat", "a", "|", "grep", "b"]);
});

test("githubRepo keeps dots in the repository name", () => {
    // The reported case: this used to truncate to `org/service`.
    assert.equal(githubRepo("https://github.com/org/service.api"), "org/service.api");
});

test("githubRepo strips only a trailing .git", () => {
    assert.equal(githubRepo("https://github.com/org/service.api.git"), "org/service.api");
    assert.equal(githubRepo("https://github.com/org/repo.git"), "org/repo");
});

test("githubRepo rejects non-GitHub and malformed uris", () => {
    assert.equal(githubRepo("https://gitlab.com/org/repo"), null);
    assert.equal(githubRepo("https://github.com/org"), null);
    assert.equal(githubRepo(""), null);
    assert.equal(githubRepo(null), null);
});

test("splitSourceUri separates commit and subdir", () => {
    assert.deepEqual(splitSourceUri("https://github.com/o/r#abc123:sub/dir"), {
        repo: "https://github.com/o/r", commit: "abc123", subdir: "sub/dir",
    });
    assert.deepEqual(splitSourceUri("https://github.com/o/r#abc123"), {
        repo: "https://github.com/o/r", commit: "abc123", subdir: null,
    });
    assert.equal(splitSourceUri("https://github.com/o/r").commit, null);
});

test("browseUrl links the repository whose name contains a dot", () => {
    assert.equal(
        browseUrl("https://github.com/org/service.api#abc123", "Dockerfile"),
        "https://github.com/org/service.api/blob/abc123/Dockerfile",
    );
});

test("browseUrl falls back to the recorded revision when the uri has no fragment", () => {
    // An OCI `image.source` label carries no fragment; the commit arrives
    // separately as `revision`, and used to be ignored entirely.
    assert.equal(
        browseUrl("https://github.com/org/repo", null, "deadbeef"),
        "https://github.com/org/repo/blob/deadbeef/Dockerfile",
    );
});

test("browseUrl prefers the uri fragment over the revision", () => {
    assert.equal(
        browseUrl("https://github.com/org/repo#fromuri", null, "fromrevision"),
        "https://github.com/org/repo/blob/fromuri/Dockerfile",
    );
});

test("browseUrl joins subdir and entry point", () => {
    assert.equal(
        browseUrl("https://github.com/o/r#abc:services/api", "Dockerfile.prod"),
        "https://github.com/o/r/blob/abc/services/api/Dockerfile.prod",
    );
});

test("browseUrl returns null without a commit or a linkable host", () => {
    assert.equal(browseUrl("https://github.com/org/repo", "Dockerfile"), null);
    assert.equal(browseUrl("https://gitlab.com/org/repo#abc", "Dockerfile"), null);
});
