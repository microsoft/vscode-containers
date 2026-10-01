/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The command runner and its audit trail.
//
// Rendered as a tab inside the terminal view rather than as its own screen:
// both are "run something in this container", and splitting them meant two
// places to look for what happened.
//
// The agent can execute commands here, which only stays acceptable if the
// person whose container it is can see exactly what ran. So every invocation --
// typed here or issued by the agent -- lands in this list with its argv, exit
// status, duration and full output, and the list is replayed to any panel that
// connects later.

import { useCallback, useMemo, useRef, useState } from "react";
import {
    Badge,
    Button,
    Caption1,
    Input,
    MessageBar,
    MessageBarBody,
    Spinner,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { PlayRegular, BotRegular, PersonRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
    bar: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("10px", "0") },
    grow: { flexGrow: 1 },
    list: { display: "flex", flexDirection: "column", rowGap: "10px", overflowY: "auto", maxHeight: "calc(100vh - 300px)" },
    entry: {
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.overflow("hidden"),
    },
    entryHead: {
        display: "flex",
        alignItems: "center",
        columnGap: "8px",
        backgroundColor: tokens.colorNeutralBackground2,
        ...shorthands.padding("6px", "10px"),
    },
    argv: { fontFamily: tokens.fontFamilyMonospace, fontSize: "12px", flexGrow: 1, wordBreak: "break-all" },
    output: {
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        maxHeight: "260px",
        overflowY: "auto",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("8px", "10px"),
    },
    muted: { color: tokens.colorNeutralForeground3, fontStyle: "italic", ...shorthands.padding("14px", "2px") },
});

/**
 * Split a typed command into argv.
 *
 * Lives in `textParsing.mjs` so the test runner can import it; `node --test`
 * cannot parse JSX. Re-exported here because this is where it is used from.
 */
import { splitArgv } from "./textParsing.mjs";

export { splitArgv };

export function ExecHistory({ item, client, entries, onRan }) {
    const styles = useStyles();
    const [command, setCommand] = useState("");
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    // `busy` state does not update between two keypresses in the same tick, so
    // the guard in `run` reads a ref. Enter used to bypass the disabled Run
    // button entirely and launch duplicate execs.
    const busyRef = useRef(false);

    // Only this container's history: the log is panel-wide, but a view titled
    // with one container must not show another's commands.
    const mine = useMemo(
        () => entries.filter((e) => e.container === (item.name ?? item.shortId)),
        [entries, item],
    );

    const run = useCallback(async () => {
        if (busyRef.current) return;
        const argv = splitArgv(command);
        if (argv.length === 0) return;
        busyRef.current = true;
        setBusy(true);
        setError(null);
        try {
            const result = await client.execCommand.mutate({ id: item.id, argv });
            onRan?.({ ...result, at: new Date().toISOString(), source: "user" });
            setCommand("");
        } catch (e) {
            setError(String(e?.message ?? e));
        } finally {
            busyRef.current = false;
            setBusy(false);
        }
    }, [client, command, item.id, onRan]);

    return (
        <div>
            <div className={styles.bar}>
                <Input
                    className={styles.grow}
                    value={command}
                    onChange={(_, d) => setCommand(d.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && !busy) run(); }}
                    placeholder={'top -b -n 1   (no shell: | > ; are literal)'}
                    disabled={busy || item.state !== "running"}
                />
                <Button
                    appearance="primary"
                    icon={<PlayRegular />}
                    disabled={busy || !command.trim() || item.state !== "running"}
                    onClick={run}
                >
                    Run
                </Button>
                {busy ? <Spinner size="tiny" /> : null}
            </div>

            {item.state !== "running" ? (
                <MessageBar intent="warning">
                    <MessageBarBody>This container is not running, so nothing can be executed in it.</MessageBarBody>
                </MessageBar>
            ) : null}

            {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}

            <div className={styles.list}>
                {mine.length === 0 ? (
                    <div className={styles.muted}>
                        No commands have been run in this container yet. Anything Copilot runs will appear here too.
                    </div>
                ) : [...mine].reverse().map((entry, i) => (
                    <div key={`${entry.at}-${i}`} className={styles.entry}>
                        <div className={styles.entryHead}>
                            {entry.source === "user" ? <PersonRegular /> : <BotRegular />}
                            <span className={styles.argv}>{entry.argv.join(" ")}</span>
                            {entry.hostAccessAcknowledged
                                ? <Badge appearance="tint" color="danger">host access</Badge>
                                : null}
                            <Badge appearance="tint" color={entry.ok ? "success" : "danger"}>
                                {entry.ok ? "ok" : "failed"}
                            </Badge>
                            <Caption1>{entry.durationMs} ms</Caption1>
                        </div>
                        <div className={styles.output}>{entry.output || "(no output)"}</div>
                    </div>
                ))}
            </div>
        </div>
    );
}
