/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Read-only viewer for structured output.
//
// This replaced a Monaco editor. Monaco was carried for one reason that
// actually mattered -- folding `docker inspect` output, so you can collapse
// `Config` and `NetworkSettings` and look at the four keys you care about --
// and it cost 6.5 MB of a 7.0 MB bundle to get it.
//
// So the folding is reimplemented directly against the data rather than against
// text: JSON is parsed and its top-level keys become collapsible sections. That
// is the capability people used, at roughly none of the weight. What is
// deliberately not reimplemented: a find widget, bracket matching, and JSON
// parse diagnostics. Anything needing real editing goes to the host editor,
// which is a full editor and already installed.

import { useEffect, useMemo, useState } from "react";
import { makeStyles, shorthands, tokens, Button } from "@fluentui/react-components";
import { ChevronRightRegular, ChevronDownRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
    host: {
        width: "100%",
        boxSizing: "border-box",
        overflow: "auto",
        backgroundColor: "var(--syntax-color-bg, #151b23)",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        lineHeight: "18px",
    },
    // Line-numbered plain text. A grid keeps the gutter from scrolling out of
    // alignment with the code the way a floating absolute column does.
    grid: {
        display: "grid",
        gridTemplateColumns: "auto 1fr",
        columnGap: "12px",
        ...shorthands.padding("8px", "10px"),
    },
    gutter: {
        textAlign: "right",
        userSelect: "none",
        color: "var(--text-color-muted, #7d8590)",
        whiteSpace: "pre",
    },
    code: {
        whiteSpace: "pre",
        color: "var(--syntax-color-fg, #f0f6fc)",
        ...shorthands.margin(0),
        fontFamily: tokens.fontFamilyMonospace,
    },
    tree: { ...shorthands.padding("4px", "0", "8px", "0") },
    section: {
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
    },
    sectionHead: {
        display: "flex",
        alignItems: "center",
        columnGap: "6px",
        width: "100%",
        cursor: "pointer",
        backgroundColor: "transparent",
        ...shorthands.border("0"),
        ...shorthands.padding("5px", "10px"),
        textAlign: "left",
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        color: "var(--syntax-color-fg, #f0f6fc)",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    },
    key: { color: "var(--syntax-color-prettylights-syntax-constant, #79c0ff)" },
    colon: { color: "var(--text-color-muted, #7d8590)", marginRight: "6px" },
    stringVal: { color: "var(--syntax-color-prettylights-syntax-string, #a5d6ff)", wordBreak: "break-all" },
    numberVal: { color: "var(--syntax-color-prettylights-syntax-variable, #ffa657)" },
    boolVal: { color: "var(--syntax-color-prettylights-syntax-keyword, #ff7b72)" },
    nullVal: { color: "var(--text-color-muted, #7d8590)", fontStyle: "italic" },
    row: {
        display: "flex",
        alignItems: "baseline",
        columnGap: "2px",
        ...shorthands.padding("2px", "10px", "2px", "0"),
        whiteSpace: "pre-wrap",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    },
    hint: { color: "var(--text-color-muted, #7d8590)", marginLeft: "auto", paddingLeft: "12px" },
    toolbar: {
        display: "flex",
        columnGap: "6px",
        ...shorthands.padding("6px", "8px"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
    },
});

/** A one-line summary of a collapsed value, so the head is useful while shut. */
function summarize(value) {
    if (Array.isArray(value)) return `[] ${value.length} item${value.length === 1 ? "" : "s"}`;
    if (value && typeof value === "object") {
        const n = Object.keys(value).length;
        return `{} ${n} key${n === 1 ? "" : "s"}`;
    }
    if (typeof value === "string") return value.length > 60 ? `"${value.slice(0, 57)}…"` : `"${value}"`;
    return String(value);
}

function PlainText({ text, className }) {
    const styles = useStyles();
    const lines = useMemo(() => String(text ?? "").split("\n"), [text]);
    // One string for the whole gutter: thousands of sibling elements is the
    // thing that makes large files feel slow.
    const gutter = useMemo(() => lines.map((_, i) => i + 1).join("\n"), [lines]);
    return (
        <div className={styles.grid}>
            <div className={styles.gutter}>{gutter}</div>
            <pre className={className ?? styles.code}>{lines.join("\n")}</pre>
        </div>
    );
}

/** True when a value has children worth collapsing. */
const isBranch = (v) => v !== null && typeof v === "object" && Object.keys(v).length > 0;

/** Render a leaf value with type-appropriate colour. */
function Leaf({ value }) {
    const styles = useStyles();
    if (value === null) return <span className={styles.nullVal}>null</span>;
    switch (typeof value) {
        case "string": return <span className={styles.stringVal}>"{value}"</span>;
        case "number": return <span className={styles.numberVal}>{String(value)}</span>;
        case "boolean": return <span className={styles.boolVal}>{String(value)}</span>;
        default: return <span>{String(value)}</span>;
    }
}

/**
 * One node of the JSON tree, recursive.
 *
 * Every branch collapses, at any depth -- `HostConfig` is 63 keys and several of
 * those are themselves objects, so folding only the top level just moves the
 * wall of text one click away instead of removing it.
 *
 * `forceOpen` is a generation counter rather than a boolean: Expand/Collapse all
 * bumps it, which re-syncs every node without lifting each node's state into the
 * parent and without remounting the tree.
 */
function JsonNode({ name, value, depth, forceOpen }) {
    const styles = useStyles();
    const branch = isBranch(value);
    // Top level starts open: enough to orient without burying the detail.
    const [open, setOpen] = useState(depth < 1);

    useEffect(() => {
        if (forceOpen === 0) return;
        setOpen(forceOpen > 0);
    }, [forceOpen]);

    if (!branch) {
        return (
            <div className={styles.row} style={{ paddingLeft: depth * 14 + 20 }}>
                <span className={styles.key}>{name}</span>
                <span className={styles.colon}>:</span>
                {value !== null && typeof value === "object"
                    ? <span className={styles.hint}>{Array.isArray(value) ? "[]" : "{}"}</span>
                    : <Leaf value={value} />}
            </div>
        );
    }

    return (
        <div>
            <button
                type="button"
                className={styles.sectionHead}
                style={{ paddingLeft: depth * 14 + 4 }}
                onClick={() => setOpen((v) => !v)}
                aria-expanded={open}
            >
                {open ? <ChevronDownRegular fontSize={12} /> : <ChevronRightRegular fontSize={12} />}
                <span className={styles.key}>{name}</span>
                <span className={styles.hint}>{summarize(value)}</span>
            </button>
            {open
                ? Object.entries(value).map(([k, v]) => (
                    <JsonNode key={k} name={k} value={v} depth={depth + 1} forceOpen={forceOpen} />
                ))
                : null}
        </div>
    );
}

/**
 * Read-only code/output viewer.
 *
 * JSON renders as a collapsible tree, foldable at every depth; everything else
 * is line-numbered plain text. `language` decides whether to attempt a parse.
 */
export function CodeView({ value, language = "json", height = "420px" }) {
    const styles = useStyles();
    const text = String(value ?? "");

    const parsed = useMemo(() => {
        if (language !== "json") return null;
        const trimmed = text.trim();
        if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return null;
        try {
            const v = JSON.parse(trimmed);
            // `docker inspect` always returns an array; unwrap the single entry.
            if (Array.isArray(v) && v.length === 1 && v[0] && typeof v[0] === "object") return v[0];
            return v && typeof v === "object" ? v : null;
        } catch {
            return null;
        }
    }, [text, language]);

    // Positive expands every node, negative collapses; the magnitude only has to
    // change for nodes to notice.
    const [forceOpen, setForceOpen] = useState(0);

    if (!parsed) {
        return (
            <div className={styles.host} style={{ height }}>
                <PlainText text={text} />
            </div>
        );
    }

    const entries = Object.entries(parsed);
    return (
        <div className={styles.host} style={{ height }}>
            <div className={styles.toolbar}>
                <Button size="small" appearance="subtle" onClick={() => setForceOpen((n) => Math.abs(n) + 1)}>Expand all</Button>
                <Button size="small" appearance="subtle" onClick={() => setForceOpen((n) => -(Math.abs(n) + 1))}>Collapse all</Button>
            </div>
            <div className={styles.tree}>
                {entries.map(([name, v]) => (
                    <JsonNode key={name} name={name} value={v} depth={0} forceOpen={forceOpen} />
                ))}
            </div>
        </div>
    );
}

/** Map a container path to a language id, used for display decisions. */
export function languageFor(filePath) {
    const name = String(filePath ?? "").toLowerCase();
    if (/\.(json|jsonc|webmanifest)$/.test(name) || /(^|\/)(package|tsconfig)\.json$/.test(name)) return "json";
    if (/\.(ya?ml)$/.test(name)) return "yaml";
    if (/\.(js|mjs|cjs)$/.test(name)) return "javascript";
    if (/\.(ts|mts|cts)$/.test(name)) return "typescript";
    if (/\.(css)$/.test(name)) return "css";
    if (/\.(html?|xml|csproj|props|targets)$/.test(name)) return "html";
    if (/\.(md|markdown)$/.test(name)) return "markdown";
    if (/\.(sh|bash|profile|bashrc)$/.test(name) || /(^|\/)(entrypoint|docker-entrypoint)$/.test(name)) return "shell";
    if (/dockerfile/.test(name)) return "dockerfile";
    if (/\.(ini|conf|cfg|toml|properties)$/.test(name)) return "ini";
    if (/\.(sql)$/.test(name)) return "sql";
    return "plaintext";
}
