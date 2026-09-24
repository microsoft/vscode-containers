/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// An interactive shell inside a container.
//
// xterm.js over a WebSocket to a real PTY, so this behaves like a terminal
// rather than a command box: prompts, line editing, colours, Ctrl-C, and
// full-screen programs like top and vi all work.
//
// The theme is built from the same host tokens as the rest of the panel, so a
// terminal in the Copilot app does not look like a terminal pasted into it.

import { useCallback, useEffect, useRef, useState } from "react";
import {
    Badge,
    Button,
    Caption1,
    MessageBar,
    MessageBarBody,
    Title3,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { ArrowLeftRegular, PlugConnectedRegular, PlugDisconnectedRegular } from "@fluentui/react-icons";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { panelUrl } from "./panelUrl.js";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    grow: { flexGrow: 1 },
    surface: {
        height: "calc(100vh - 210px)",
        minHeight: "240px",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("8px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    },
    term: { height: "100%", width: "100%" },
    note: { color: tokens.colorNeutralForeground3 },
});

/** Read a host token, falling back to a Fluent value. */
const hostToken = (name, fallback) => {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
};

/** The xterm theme, rebuilt from whatever the host currently publishes. */
function buildTermTheme() {
    return {
        background: hostToken("--syntax-color-bg", hostToken("--background-color-muted", "#151b23")),
        foreground: hostToken("--syntax-color-fg", hostToken("--text-color-default", "#f0f6fc")),
        cursor: hostToken("--text-color-default", "#f0f6fc"),
        selectionBackground: hostToken("--background-color-neutral-muted", "#2a313c"),
        // ANSI slots come from the host's syntax palette so a warm theme does
        // not end up with GitHub-dark blues and greens inside the terminal.
        black: hostToken("--background-color-default", "#0d1117"),
        red: hostToken("--text-color-danger", "#f85149"),
        green: hostToken("--text-color-success", "#3fb950"),
        yellow: hostToken("--syntax-color-variable", "#d29922"),
        blue: hostToken("--text-color-link", "#4493f8"),
        magenta: hostToken("--syntax-color-entity", "#bc8cff"),
        cyan: hostToken("--syntax-color-regexp", "#39c5cf"),
        white: hostToken("--text-color-muted", "#b1bac4"),
    };
}

export function TerminalView({ item, onBack }) {
    const styles = useStyles();
    const hostRef = useRef(null);
    const termRef = useRef(null);
    const fitRef = useRef(null);
    const socketRef = useRef(null);
    const [status, setStatus] = useState("connecting");
    const [error, setError] = useState(null);
    const [shell, setShell] = useState(null);
    // Reasons this container is not meaningfully isolated from the host, sent
    // with the ready frame. Advisory: the session opens either way.
    const [risks, setRisks] = useState([]);

    const connect = useCallback(() => {
        const term = termRef.current;
        if (!term) return;
        setError(null);
        setStatus("connecting");

        const fit = fitRef.current;
        try { fit?.fit(); } catch { /* not laid out yet */ }

        const url = panelUrl("./exec", { id: item.id, cols: term.cols, rows: term.rows });
        url.protocol = url.protocol.replace("http", "ws");

        // Close whatever is already there before replacing the ref. Reconnect
        // can be pressed while the previous socket is still connecting, and
        // overwriting the ref orphaned it: the server had already begun
        // starting a PTY that nothing on this side could reach or shut down.
        const previous = socketRef.current;
        if (previous && previous.readyState <= WebSocket.OPEN) {
            try { previous.close(); } catch { /* already gone */ }
        }

        const socket = new WebSocket(url);
        socketRef.current = socket;

        socket.addEventListener("message", (event) => {
            let frame;
            try { frame = JSON.parse(event.data); } catch { return; }
            if (frame.type === "data") term.write(frame.data);
            else if (frame.type === "ready") { setStatus("connected"); setShell(frame.shell); setRisks(frame.risks ?? []); }
            else if (frame.type === "error") { setError(frame.message); setStatus("closed"); }
            else if (frame.type === "exit") {
                setStatus("closed");
                term.write(`\r\n\u001b[90m[session ended${frame.code ? ` — exit ${frame.code}` : ""}]\u001b[0m\r\n`);
            }
        });
        socket.addEventListener("close", () => setStatus((s) => (s === "connected" ? "closed" : s)));
        socket.addEventListener("error", () => setError("Could not open a terminal session."));
    }, [item.id]);

    // Mount xterm once. Recreating it on every reconnect would throw away
    // scrollback, which is usually the reason someone reconnects.
    useEffect(() => {
        const term = new Terminal({
            fontFamily: hostToken("--font-mono", "Consolas, monospace"),
            fontSize: 13,
            cursorBlink: true,
            convertEol: false,
            theme: buildTermTheme(),
        });
        const fit = new FitAddon();
        term.loadAddon(fit);
        term.open(hostRef.current);
        termRef.current = term;
        fitRef.current = fit;
        try { fit.fit(); } catch { /* not laid out yet */ }

        term.onData((data) => {
            const socket = socketRef.current;
            if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "data", data }));
        });

        // The container's shell needs the real viewport size or anything
        // full-screen (top, vi) draws at the wrong dimensions.
        const observer = new ResizeObserver(() => {
            try { fit.fit(); } catch { return; }
            const socket = socketRef.current;
            if (socket?.readyState === WebSocket.OPEN) {
                socket.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
            }
        });
        observer.observe(hostRef.current);

        // xterm is canvas-rendered and outside React's tree, so a host theme
        // change has to be pushed into it.
        const restyle = () => {
            term.options.theme = buildTermTheme();
            term.options.fontFamily = hostToken("--font-mono", "Consolas, monospace");
        };
        window.addEventListener("canvas-theme-changed", restyle);

        connect();
        term.focus();

        return () => {
            window.removeEventListener("canvas-theme-changed", restyle);
            observer.disconnect();
            socketRef.current?.close();
            term.dispose();
        };
    }, [connect]);

    const disconnect = () => {
        socketRef.current?.close();
        setStatus("closed");
    };

    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{item.name ?? item.shortId}</Title3>
                <Badge
                    appearance="filled"
                    color={status === "connected" ? "success" : status === "connecting" ? "informative" : "danger"}
                >
                    {status}
                </Badge>
                {shell ? <Caption1 className={styles.note}>{shell}</Caption1> : null}
                <span className={styles.grow} />
                {status === "connected" ? (
                    <Button icon={<PlugDisconnectedRegular />} onClick={disconnect}>Disconnect</Button>
                ) : (
                    <Button appearance="primary" icon={<PlugConnectedRegular />} onClick={connect}>Reconnect</Button>
                )}
            </div>

            {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}

            {/* Shown when the container is effectively the host. Not a
                confirmation prompt: the user picked this container, and a
                terminal in it is a legitimate thing to want. It exists so the
                panel does not read as a sandbox when it is not one. */}
            {risks.length > 0 ? (
                <MessageBar intent="warning">
                    <MessageBarBody>
                        <strong>This shell is not isolated from your machine.</strong>{" "}
                        {`${item.name} is effectively the host because ${risks.join(" and ")}. `}
                        Commands here can affect the host directly, including files and other containers.
                    </MessageBarBody>
                </MessageBar>
            ) : null}

            <div className={styles.surface}>
                <div className={styles.term} ref={hostRef} />
            </div>
        </div>
    );
}
