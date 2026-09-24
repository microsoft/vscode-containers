/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The logs view.
//
// Reached two ways: the "logs" button on a container, and the agent opening the
// canvas focused on a container because someone asked what its logs say. The
// second path is the reason this is a real view rather than text in the generic
// output box -- if a question routes here instead of to the transcript, the
// panel has to be the better place to read logs, not merely a different one.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
    Badge,
    Button,
    Caption1,
    Dropdown,
    Input,
    Option,
    Spinner,
    Title3,
    Tooltip,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowClockwiseRegular,
    ArrowLeftRegular,
    CopyRegular,
    ArrowDownloadRegular,
    PlayRegular,
    PauseRegular,
    ArrowDownRegular,
    ChatSparkleRegular,
} from "@fluentui/react-icons";

import { panelHref } from "./panelUrl.js";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    bar: { display: "flex", alignItems: "center", columnGap: "8px", flexWrap: "wrap", ...shorthands.padding("0", "0", "8px") },
    grow: { flexGrow: 1 },
    viewer: {
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        lineHeight: "1.5",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        overflowY: "auto",
        // Fills the panel rather than growing without bound: log output is the
        // one thing here that can be arbitrarily long.
        height: "calc(100vh - 210px)",
        minHeight: "200px",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("10px", "12px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    },
    viewerWrap: { position: "relative" },
    jump: {
        position: "absolute",
        right: "16px",
        bottom: "12px",
        boxShadow: tokens.shadow8,
    },
    empty: { color: tokens.colorNeutralForeground3, fontStyle: "italic" },
    line: { display: "block" },
    match: { backgroundColor: tokens.colorNeutralBackground1Selected, ...shorthands.borderRadius("3px") },
});

const TAILS = ["100", "200", "500", "1000", "5000"];

/**
 * Lines kept in memory while following.
 *
 * A container that logs every second fills an unbounded buffer surprisingly
 * fast, and the browser slows down long before the user notices why. Trimming
 * from the front keeps the newest output -- which is what following is for.
 */
const MAX_LINES = 5000;

export function LogView({ item, client, onBack, onNotify }) {
    const styles = useStyles();
    const [tail, setTail] = useState("200");
    const [text, setText] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [filter, setFilter] = useState("");
    // Following is the default for a running container: opening a log view is
    // almost always a question about what is happening now, and having to click
    // to see current output makes the view feel stale on arrival. A stopped
    // container has nothing to follow, so it opens as a plain tail.
    const [following, setFollowing] = useState(item.state === "running");
    const [streamError, setStreamError] = useState(null);
    const [pinned, setPinned] = useState(true);
    const [asking, setAsking] = useState(false);
    const viewerRef = useRef(null);
    const atBottomRef = useRef(true);

    const load = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            const res = await client.logs.query({ id: item.id, tail: Number(tail) });
            setText(res.output ?? "");
        } catch (e) {
            setError(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    }, [client, item.id, tail]);

    useEffect(() => { if (!following) load(); }, [load, following]);

    /*
     * Follow mode.
     *
     * The stream replays `tail` lines itself, so entering follow mode replaces
     * the buffer rather than appending to what the one-shot read already
     * fetched -- otherwise the last screenful appears twice.
     *
     * Chunks are not line-aligned: a write can split mid-line, so a partial
     * trailing line is held back until its newline arrives.
     */
    useEffect(() => {
        if (!following) return undefined;
        setStreamError(null);
        setText("");
        let carry = "";
        const source = new EventSource(panelHref("./logs", { id: item.id, tail }));

        const append = (ready) => setText((previous) => {
            const merged = previous ? `${previous}\n${ready}` : ready;
            const lines = merged.split("\n");
            return lines.length > MAX_LINES ? lines.slice(-MAX_LINES).join("\n") : merged;
        });

        /** Emit whatever is held back, for a last line that never got a newline. */
        const flush = () => {
            if (!carry) return;
            const ready = carry;
            carry = "";
            append(ready);
        };

        source.addEventListener("message", (event) => {
            let frame;
            try { frame = JSON.parse(event.data); } catch { return; }
            if (frame.type === "error") { setStreamError(frame.message); return; }
            // A container that exits without a trailing newline leaves its last
            // line in `carry`. Stopping the stream without flushing dropped it,
            // which is exactly the line someone following logs is waiting for.
            if (frame.type === "end") { flush(); setFollowing(false); return; }
            if (frame.type !== "log") return;

            carry += frame.chunk;
            const cut = carry.lastIndexOf("\n");
            if (cut === -1) return;
            const ready = carry.slice(0, cut);
            carry = carry.slice(cut + 1);
            append(ready);
        });

        source.addEventListener("error", () => {
            // EventSource retries on its own; a container that stops mid-follow
            // would otherwise reconnect forever against a dead stream.
            flush();
            setStreamError("Log stream disconnected.");
            setFollowing(false);
        });

        return () => source.close();
    }, [following, item.id, tail]);

    // Keep the newest output in view, but only when the reader has not scrolled
    // up to look at something: yanking the viewport back is worse than stale.
    // `useLayoutEffect` so the jump happens before the browser paints -- with a
    // plain effect the first frame renders at the top and visibly snaps down.
    useLayoutEffect(() => {
        const el = viewerRef.current;
        if (el && atBottomRef.current) el.scrollTop = el.scrollHeight;
    }, [text]);

    const jumpToLatest = () => {
        const el = viewerRef.current;
        if (!el) return;
        el.scrollTop = el.scrollHeight;
        atBottomRef.current = true;
        setPinned(true);
    };

    const onScroll = () => {
        const el = viewerRef.current;
        if (!el) return;
        const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        atBottomRef.current = bottom;
        setPinned(bottom);
    };

    const lines = useMemo(() => {
        const all = (text ?? "").split("\n");
        const needle = filter.trim().toLowerCase();
        if (!needle) return { shown: all, total: all.length };
        return { shown: all.filter((l) => l.toLowerCase().includes(needle)), total: all.length };
    }, [text, filter]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(text ?? "");
            onNotify?.("success", "Logs copied.");
        } catch {
            onNotify?.("error", "Could not copy logs.");
        }
    };

    /*
     * Hand these logs to Copilot.
     *
     * Sends the *selection* -- tail and filter -- not the text on screen. The
     * host re-reads and re-filters, so what reaches chat is what the runtime
     * reports rather than whatever this component happened to be rendering,
     * and a stale buffer cannot become a false quotation.
     */
    const askCopilot = async () => {
        setAsking(true);
        try {
            const { prompt } = await client.askCopilot.mutate({
                intent: "logs",
                id: item.id,
                tail: Number(tail),
                ...(filter.trim() && { filter: filter.trim() }),
            });
            onNotify?.("success", `Sent to Copilot — ${prompt.split("\n").length} lines of evidence.`);
        } catch (e) {
            onNotify?.("error", String(e?.message ?? e));
        } finally {
            setAsking(false);
        }
    };

    const save = () => {
        const blob = new Blob([text ?? ""], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${item.name ?? item.shortId}-logs.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const isEmpty = text !== null && text.trim() === "";

    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{item.name ?? item.shortId}</Title3>
                <Badge appearance="filled" color={item.state === "running" ? "success" : "danger"}>{item.state}</Badge>
            </div>

            <div className={styles.bar}>
                <Input
                    className={styles.grow}
                    value={filter}
                    onChange={(_, d) => setFilter(d.value)}
                    placeholder="Filter lines…"
                />
                <Tooltip content="How many lines to read from the end" relationship="label">
                    <Dropdown
                        style={{ minWidth: "110px" }}
                        value={`last ${tail}`}
                        selectedOptions={[tail]}
                        onOptionSelect={(_, d) => setTail(d.optionValue)}
                    >
                        {TAILS.map((t) => <Option key={t} value={t}>{`last ${t}`}</Option>)}
                    </Dropdown>
                </Tooltip>
                <Tooltip
                    content={item.state === "running"
                        ? (following ? "Stop following" : "Stream new lines as they are written")
                        : "Only a running container produces new output"}
                    relationship="label"
                >
                    <Button
                        appearance={following ? "primary" : "secondary"}
                        icon={following ? <PauseRegular /> : <PlayRegular />}
                        disabled={item.state !== "running"}
                        onClick={() => setFollowing((on) => !on)}
                    >
                        {following ? "Following" : "Follow"}
                    </Button>
                </Tooltip>
                <Button appearance="subtle" icon={<ArrowClockwiseRegular />} disabled={busy || following} onClick={load}>Refresh</Button>
                <Button appearance="subtle" icon={<CopyRegular />} disabled={!text} onClick={copy}>Copy</Button>
                <Button appearance="subtle" icon={<ArrowDownloadRegular />} disabled={!text} onClick={save}>Save</Button>
                <Tooltip
                    content={filter.trim()
                        ? `Ask Copilot about the ${lines.shown.length} matching lines`
                        : "Ask Copilot about these logs"}
                    relationship="label"
                >
                    <Button
                        appearance="primary"
                        icon={<ChatSparkleRegular />}
                        disabled={!text || asking}
                        onClick={askCopilot}
                    >
                        Ask Copilot
                    </Button>
                </Tooltip>
                {busy ? <Spinner size="tiny" /> : null}
            </div>

            {streamError ? <Caption1>{streamError}</Caption1> : null}
            {filter.trim() ? (
                <Caption1>{lines.shown.length} of {lines.total} lines match “{filter.trim()}”.</Caption1>
            ) : null}

            <div className={styles.viewerWrap}>
                <div className={styles.viewer} ref={viewerRef} onScroll={onScroll} tabIndex={0} role="log" aria-live={following ? "polite" : "off"}>
                    {error ? error
                        : isEmpty ? <span className={styles.empty}>This container has not written any log output.</span>
                            : text === null ? <span className={styles.empty}>Reading…</span>
                                : lines.shown.join("\n")}
                </div>
                {/* Scrolling up while following would otherwise be a dead end:
                    new lines keep arriving off-screen with no way back but a
                    manual drag to the bottom. */}
                {!pinned && text ? (
                    <Button
                        className={styles.jump}
                        size="small"
                        appearance="primary"
                        icon={<ArrowDownRegular />}
                        onClick={jumpToLatest}
                    >
                        {following ? "Jump to live" : "Jump to end"}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
