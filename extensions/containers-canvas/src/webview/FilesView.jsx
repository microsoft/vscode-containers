/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Filesystem browser for a container.
//
// The question this answers is "is my config actually in there, and does it say
// what I think it says?" -- which normally costs a `docker exec ls`, then a
// `cat`, then squinting at wrapped output in a terminal.
//
// Two access paths, deliberately, because they fail in different places:
//
//   listing  `docker exec ls` -- needs a shell and coreutils in the image
//   reading  `docker cp`      -- served by the daemon, so it works on
//                               distroless images and on stopped containers
//
// So a distroless container cannot be browsed but its files can still be read
// by typing a path. That is worth surfacing rather than hiding, because those
// are exactly the images where this is hardest to do any other way.

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Badge,
    Body1,
    Button,
    Caption1,
    Input,
    MessageBar,
    MessageBarBody,
    Spinner,
    Title3,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowLeftRegular,
    ArrowUpRegular,
    CopyRegular,
    DocumentRegular,
    FolderRegular,
    LinkRegular,
    OpenRegular,
} from "@fluentui/react-icons";

import { CodeView, languageFor } from "./CodeView.jsx";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    bar: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("0", "0", "8px") },
    grow: { flexGrow: 1 },
    split: { display: "grid", gridTemplateColumns: "minmax(240px, 1fr) 2fr", columnGap: "12px", alignItems: "start" },
    list: {
        maxHeight: "calc(100vh - 260px)",
        overflowY: "auto",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    },
    row: {
        display: "flex",
        alignItems: "center",
        columnGap: "8px",
        width: "100%",
        textAlign: "left",
        cursor: "pointer",
        backgroundColor: "transparent",
        ...shorthands.padding("6px", "10px"),
        ...shorthands.border("0"),
        color: tokens.colorNeutralForeground1,
        fontFamily: tokens.fontFamilyBase,
        fontSize: "13px",
        ":hover": { backgroundColor: tokens.colorNeutralBackground1Hover },
    },
    rowActive: { backgroundColor: tokens.colorNeutralBackground1Selected },
    name: { flexGrow: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
    size: { color: tokens.colorNeutralForeground3, fontVariantNumeric: "tabular-nums" },
    viewer: {
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflow: "auto",
        maxHeight: "calc(100vh - 300px)",
        minHeight: "200px",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("10px", "12px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    },
    muted: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
    fileHead: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("0", "0", "6px") },
});

const parentOf = (p) => {
    const trimmed = p.replace(/\/+$/, "");
    const cut = trimmed.lastIndexOf("/");
    return cut <= 0 ? "/" : trimmed.slice(0, cut);
};

const fmtBytes = (n) => {
    if (!Number.isFinite(n)) return "";
    const units = ["B", "KB", "MB", "GB"];
    let value = n;
    let i = 0;
    while (value >= 1000 && i < units.length - 1) { value /= 1000; i += 1; }
    return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

/**
 * Turn a listing failure into something actionable.
 *
 * The daemon's own wording ("container <64 hex chars> is not running") is
 * accurate and unreadable, and neither of the two common causes is the user's
 * mistake -- so name the cause and point at the path box, which still works.
 */
function explainListFailure(message, item) {
    if (item.state !== "running") {
        return "This container is not running, so its directories cannot be listed. Files can still be read by typing a full path above.";
    }
    if (/no such file or directory|not found|exec/i.test(message)) {
        return "This image has no shell or coreutils (distroless or chiseled), so its directories cannot be listed. Files can still be read by typing a full path above.";
    }
    return `${message.split("\n")[0]} — files can still be read by typing a full path above.`;
}

export function FilesView({ item, client, onBack, onNotify }) {
    const styles = useStyles();
    const [dir, setDir] = useState("/");
    const [pathInput, setPathInput] = useState("/");
    const [entries, setEntries] = useState(null);
    const [listError, setListError] = useState(null);
    const [listing, setListing] = useState(false);

    const [file, setFile] = useState(null);
    const [fileError, setFileError] = useState(null);
    const [reading, setReading] = useState(false);
    const [opening, setOpening] = useState(false);

    // Rows stay clickable while a request is in flight, so two reads can overlap
    // and the slower one can land last. Each request takes a token and drops its
    // result, error and spinner update unless it is still the current one.
    const listToken = useRef(0);
    const readToken = useRef(0);

    /**
     * Hand the current file to the Copilot editor.
     *
     * The canvas cannot open another canvas itself, so the file is copied to
     * the host here and chat is asked to open that path. Reported as "asked
     * Copilot" rather than "opened" because the last step is the agent's.
     */
    const openInEditor = useCallback(async () => {
        if (!file) return;
        setOpening(true);
        try {
            const res = await client.openInEditor.mutate({ id: item.id, path: file.path });
            onNotify?.(
                "success",
                res.resolvedFrom
                    ? `Asked Copilot to open ${res.path} (${res.resolvedFrom} is a symlink; copied its target).`
                    : `Asked Copilot to open ${res.path}.`,
            );
        } catch (error) {
            onNotify?.("error", `Could not open in the editor: ${String(error?.message ?? error)}`);
        } finally {
            setOpening(false);
        }
    }, [client, file, item.id, onNotify]);

    const list = useCallback(async (next) => {
        const token = ++listToken.current;
        setListing(true);
        setListError(null);
        try {
            const res = await client.listPath.query({ id: item.id, path: next });
            if (token !== listToken.current) return;
            setEntries(res.entries);
            setDir(res.path);
            setPathInput(res.path);
        } catch (error) {
            if (token !== listToken.current) return;
            setEntries(null);
            setListError(String(error?.message ?? error));
        } finally {
            // Only the newest request owns the spinner; an older one finishing
            // must not clear it while the current read is still running.
            if (token === listToken.current) setListing(false);
        }
    }, [client, item.id]);

    useEffect(() => { list("/"); }, [list]);

    const openFile = useCallback(async (filePath) => {
        const token = ++readToken.current;
        setReading(true);
        setFileError(null);
        setFile(null);
        try {
            const next = await client.readFile.query({ id: item.id, path: filePath });
            if (token !== readToken.current) return;
            setFile(next);
        } catch (error) {
            if (token !== readToken.current) return;
            setFileError(String(error?.message ?? error));
        } finally {
            if (token === readToken.current) setReading(false);
        }
    }, [client, item.id]);

    // One box drives both actions: a directory browses, a file opens. Making the
    // user pick the right kind up front would mean knowing the answer already.
    const go = () => {
        const value = pathInput.trim() || "/";
        if (!value.startsWith("/")) {
            setListError("Path must be absolute, e.g. /app.");
            return;
        }
        if (value.endsWith("/")) list(value);
        else openFile(value);
    };

    const copyPath = async (value) => {
        try {
            await navigator.clipboard.writeText(value);
            onNotify?.("success", "Path copied.");
        } catch {
            onNotify?.("error", "Could not copy path.");
        }
    };

    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{item.name ?? item.shortId}</Title3>
                <Badge appearance="filled" color={item.state === "running" ? "success" : "danger"}>{item.state}</Badge>
            </div>

            <div className={styles.bar}>
                <Button
                    appearance="subtle"
                    icon={<ArrowUpRegular />}
                    disabled={dir === "/" || listing}
                    onClick={() => list(parentOf(dir))}
                >
                    Up
                </Button>
                <Input
                    className={styles.grow}
                    value={pathInput}
                    onChange={(_, d) => setPathInput(d.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") go(); }}
                    placeholder="/app/appsettings.json"
                />
                <Button onClick={go} disabled={listing || reading}>Open</Button>
                {listing || reading ? <Spinner size="tiny" /> : null}
            </div>

            {listError ? (
                <MessageBar intent="warning">
                    <MessageBarBody>
                        {/* `docker cp` needs nothing inside the image and does
                            not need the container running, so reading still
                            works when listing cannot. Say so, because an
                            unexplained failure here looks like a dead end. */}
                        {explainListFailure(listError, item)}
                    </MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.split}>
                <div className={styles.list}>
                    {entries === null ? (
                        <div style={{ padding: "10px" }}><Caption1 className={styles.muted}>No listing.</Caption1></div>
                    ) : entries.length === 0 ? (
                        <div style={{ padding: "10px" }}><Caption1 className={styles.muted}>Empty directory.</Caption1></div>
                    ) : entries.map((entry) => (
                        <button
                            key={entry.path}
                            type="button"
                            className={`${styles.row} ${file?.path === entry.path ? styles.rowActive : ""}`}
                            onClick={() => (entry.type === "directory" ? list(entry.path) : openFile(entry.path))}
                            title={`${entry.perms}  ${entry.owner}:${entry.group}  ${entry.modified}`}
                        >
                            {entry.type === "directory" ? <FolderRegular />
                                : entry.type === "symlink" ? <LinkRegular /> : <DocumentRegular />}
                            <span className={styles.name}>{entry.name}</span>
                            {entry.type === "file" ? <span className={styles.size}>{entry.sizeText}</span> : null}
                        </button>
                    ))}
                </div>

                <div>
                    {fileError ? (
                        <MessageBar intent="error"><MessageBarBody>{fileError}</MessageBarBody></MessageBar>
                    ) : null}
                    {file ? (
                        <>
                            <div className={styles.fileHead}>
                                <Body1>{file.path}</Body1>
                                <Caption1 className={styles.muted}>{fmtBytes(file.size)}</Caption1>
                                {file.truncated ? <Badge appearance="tint" color="warning">truncated</Badge> : null}
                                {file.binary ? <Badge appearance="tint" color="informative">binary</Badge> : null}
                                <Button
                                    size="small"
                                    appearance="subtle"
                                    icon={<CopyRegular />}
                                    onClick={() => copyPath(file.path)}
                                >
                                    Copy path
                                </Button>
                                <Button
                                    size="small"
                                    appearance="subtle"
                                    icon={<OpenRegular />}
                                    disabled={opening}
                                    onClick={openInEditor}
                                >
                                    {opening ? "Opening…" : "Open in Copilot editor"}
                                </Button>
                            </div>
                            {file.binary || file.text === "" ? (
                                <div className={styles.viewer}>
                                    {file.binary
                                        ? <span className={styles.muted}>
                                            This is a binary file ({fmtBytes(file.size)}). Showing it as text would be noise.
                                        </span>
                                        : <span className={styles.muted}>This file is empty.</span>}
                                </div>
                            ) : (
                                <CodeView
                                    value={file.text}
                                    language={languageFor(file.path)}
                                    height="calc(100vh - 300px)"
                                />
                            )}
                        </>
                    ) : (
                        <div className={styles.viewer}>
                            <span className={styles.muted}>Select a file, or type a full path above.</span>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
