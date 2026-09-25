/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The containers canvas, in React + Fluent.
//
// Same data and same loopback API as the hand-rolled canvas; the interest is in
// what the component library gives you for free. The DataGrid below brings
// sortable columns, roving-tabindex keyboard navigation, selection and ARIA
// wiring that the other canvas had to be taught by hand.

import { StrictMode, lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { connectTrpc } from "@microsoft/vscode-ext-webview/webview";
import {
    FluentProvider,
    Badge,
    Button,
    Body1,
    Caption1,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    DataGrid,
    DataGridBody,
    DataGridCell,
    DataGridHeader,
    DataGridHeaderCell,
    DataGridRow,
    Divider,
    Input,
    Link,
    Menu,
    MenuDivider,
    MenuItem,
    MenuList,
    MenuPopover,
    MenuTrigger,
    MessageBar,
    MessageBarActions,
    MessageBarBody,
    Spinner,
    Subtitle2,
    TabList,
    Tab,
    Title3,
    createTableColumn,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import {
    ArrowClockwiseRegular,
    ArrowDownloadRegular,
    TagRegular,
    BoxRegular,
    DeleteRegular,
    LayerRegular,
    PlayRegular,
    PauseRegular,
    ArrowSyncRegular,
    StopRegular,
    ArrowLeftRegular,
    DocumentTextRegular,
    ChatSparkleRegular,
    StethoscopeRegular,
    ShieldCheckmarkRegular,
    CopyRegular,
    OpenRegular,
    DismissRegular,
    PulseRegular,
    FolderOpenRegular,
    WindowConsoleRegular,
    LayerDiagonalRegular,
    DocumentBulletListRegular,
    SendRegular,
} from "@fluentui/react-icons";

import { useCanvasTheme } from "./theme.js";
import { createCanvasVsCodeApi } from "./canvasVsCodeApi.js";

/*
 * Sub-views load on demand rather than up front.
 *
 * Two reasons, and the second is the binding one. The panel opens on the list,
 * so none of these are needed to paint it -- the terminal in particular drags
 * in xterm, which is 337 KB and the single largest thing in the build.
 *
 * More importantly, the extension installer rejects any file over 1 MB, and a
 * single bundle came to 1.35 MB: it installed and then failed to load. Chunking
 * keeps every emitted file comfortably under that ceiling. If a view is ever
 * folded back into the main entry point, check `pnpm build` output sizes before
 * assuming it still installs.
 *
 * `lazy` wants a default export and these are all named, hence the unwrapping.
 */
const lazyView = (load, name) => lazy(() => load().then((module) => ({ default: module[name] })));

const RunImageDialog = lazyView(() => import("./RunImageDialog.jsx"), "RunImageDialog");
const LogView = lazyView(() => import("./LogView.jsx"), "LogView");
const StatsView = lazyView(() => import("./StatsView.jsx"), "StatsView");
const FilesView = lazyView(() => import("./FilesView.jsx"), "FilesView");
const TerminalView = lazyView(() => import("./TerminalView.jsx"), "TerminalView");
const CodeView = lazyView(() => import("./CodeView.jsx"), "CodeView");
const LayersView = lazyView(() => import("./LayersView.jsx"), "LayersView");
const DockerfileView = lazyView(() => import("./DockerfileView.jsx"), "DockerfileView");
const ExecView = lazyView(() => import("./ExecView.jsx"), "ExecView");

const useStyles = makeStyles({
    shell: { height: "100%", display: "flex", flexDirection: "column", backgroundColor: tokens.colorNeutralBackground1 },
    bar: {
        display: "flex",
        alignItems: "center",
        columnGap: "8px",
        ...shorthands.padding("10px", "12px"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke2),
    },
    grow: { flexGrow: 1 },
    body: { flexGrow: 1, minHeight: 0, overflowY: "auto", ...shorthands.padding("0", "12px", "12px") },
    detailHead: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    fields: { display: "grid", gridTemplateColumns: "auto 1fr", columnGap: "16px", rowGap: "6px", ...shorthands.padding("8px", "0") },
    mono: { fontFamily: tokens.fontFamilyMonospace, wordBreak: "break-all" },
    // Grid cells must clip. Container names and image digests are single
    // unbroken tokens, and Fluent's default `overflow: visible` lets one run
    // straight under the next column's content.
    cell: {
        display: "block",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    cellMono: {
        display: "block",
        width: "100%",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
        fontFamily: tokens.fontFamilyMonospace,
    },
    actions: { display: "flex", flexWrap: "wrap", columnGap: "6px", rowGap: "6px", ...shorthands.padding("8px", "0") },
    handoff: { display: "flex", flexDirection: "column", rowGap: "8px", ...shorthands.padding("10px", "0", "4px") },
    output: {
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.padding("8px"),
        maxHeight: "260px",
        overflowY: "auto",
        whiteSpace: "pre-wrap",
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: tokens.fontSizeBase200,
    },
});

/**
 * One tRPC client for the whole panel.
 *
 * `connectTrpc` wants an object with `postMessage`; the shim gives it one backed
 * by POST /rpc and an SSE stream. From here on every call is a typed procedure
 * rather than a URL string, so a renamed route is a build error, not a 404.
 */
let onStateHandler = () => {};
/*
 * Control frames can arrive before React has mounted: the EventSource opens at
 * module scope and the host replays a pending deep-link the moment the stream
 * connects, which is earlier than the first effect. Frames received before a
 * handler registers are queued rather than dropped, otherwise opening the
 * canvas focused on a container lands on the plain list often enough to look
 * random.
 */
let onControlHandler = null;
const pendingControl = [];
const deliverControl = (frame) => {
    if (onControlHandler) onControlHandler(frame);
    else pendingControl.push(frame);
};
const setControlHandler = (handler) => {
    onControlHandler = handler;
    if (!handler) return;
    while (pendingControl.length) handler(pendingControl.shift());
};
const vscodeApi = createCanvasVsCodeApi(
    (state) => onStateHandler(state),
    deliverControl,
);
const { client } = connectTrpc(vscodeApi);

const stateBadge = (value) => {
    if (value === "running") return "success";
    if (value === "exited" || value === "dead") return "danger";
    if (value === "paused") return "warning";
    return "informative";
};

/**
 * One glyph per verb. Previously everything that was not `start` fell through to
 * a stop square, so `restart` and `pause` both read as "stop".
 *
 * `restart` deliberately uses ArrowSync rather than ArrowClockwise: the toolbar's
 * Refresh button already owns the single circular arrow, and re-reading the list
 * is a very different thing from cycling a container.
 */
const OP_ICONS = {
    start: PlayRegular,
    unpause: PlayRegular,
    stop: StopRegular,
    restart: ArrowSyncRegular,
    pause: PauseRegular,
    remove: DeleteRegular,
};

function opIcon(op) {
    const Icon = OP_ICONS[op] ?? PlayRegular;
    return <Icon />;
}

/**
 * Lifecycle verbs that are valid for the item's current state.
 *
 * A paused container cannot be started -- Docker requires `unpause` -- so
 * offering `start` there produced a guaranteed error.
 *
 * The paused row mirrors the running row's ordering so the pause/unpause
 * toggle keeps the same slot: the button under the cursor after pausing is
 * the one that undoes it, rather than Stop sliding into that position.
 */
/**
 * Placeholder shown while a sub-view's chunk is fetched.
 *
 * Deliberately quiet: the chunks are local and small, so on any normal machine
 * this is a single frame. A prominent spinner would flash more than it informs.
 */
function ViewLoading() {
    return (
        <div style={{ padding: "24px", display: "flex", justifyContent: "center" }}>
            <Spinner size="tiny" label="Loading…" />
        </div>
    );
}

function opsFor(item) {
    if (item.kind !== "container") return [];
    if (item.state === "paused") return ["stop", "restart", "unpause", "remove"];
    if (item.state === "running") return ["stop", "restart", "pause", "remove"];
    return ["start", "remove"];
}

/**
 * Which removal a container needs in its current state.
 *
 * Docker refuses to remove a running or paused container without `-f`, so
 * offering the plain verb there would be a guaranteed error. Rather than hide
 * the button until the container is stopped, the confirmation says plainly that
 * the container is running and will be killed first, and shows the exact
 * command. Force is a consequence of what is being removed, not a separate
 * thing to go looking for.
 */
function removeOpFor(item) {
    return item.state === "running" || item.state === "paused" ? "forceRemove" : "remove";
}

function Detail({ item, onBack, onChanged, onRun, onLogs, onStats, onFiles, onTerminal, onLayers, onDockerfile, onExec }) {
    const styles = useStyles();
    const [busy, setBusy] = useState(null);
    const [output, setOutput] = useState(null);
    // Whether `output` is JSON, so it can get the structured viewer rather than
    // the plain box. Command output like `docker start` is not JSON.
    const [outputIsJson, setOutputIsJson] = useState(false);
    const [sent, setSent] = useState(null);
    // Inline tagging: revealed by the `tag` button rather than a dialog, so an
    // image action stays on the image.
    const [tagging, setTagging] = useState(false);
    const [newTag, setNewTag] = useState("");
    // The destructive verb awaiting confirmation, or null. Inline for the same
    // reason tagging is: the question stays next to the thing it is about.
    const [confirming, setConfirming] = useState(null);

    // `Detail` is not keyed by item, so selecting a different row reuses this
    // component and its state. A confirmation left open would then point at the
    // newly selected container -- one click from removing something the user
    // never asked about.
    useEffect(() => { setConfirming(null); }, [item.id]);

    const run = async (label, fn) => {
        setBusy(label);
        setOutput(null);
        setSent(null);
        try {
            const result = await fn();
            const isJson = typeof result !== "string";
            setOutputIsJson(isJson);
            setOutput(isJson ? JSON.stringify(result, null, 2) : result);
            onChanged?.();
        } catch (error) {
            setOutputIsJson(false);
            setOutput(String(error.message ?? error));
        } finally {
            setBusy(null);
        }
    };

    /** Hand this target to chat and report how much evidence actually went. */
    const ask = async (intent) => {
        setBusy(intent);
        setSent(null);
        try {
            const { prompt } = await client.askCopilot.mutate({ intent, id: item.id });
            setSent(prompt.split("\n").length);
        } catch (error) {
            setOutput(String(error.message ?? error));
        } finally {
            setBusy(null);
        }
    };

    const isContainer = item.kind === "container";
    const ops = opsFor(item);

    /** Add a second tag to this image, then collapse the input again. */
    const applyTag = async () => {
        const target = newTag.trim();
        if (!target) return;
        await run("tag", async () => {
            await client.tagImage.mutate({ source: item.ref, target });
            return `Tagged ${item.ref} as ${target}.`;
        });
        setNewTag("");
        setTagging(false);
    };

    // One button per published port. A container commonly publishes more than
    // one and only some of them speak HTTP, so the choice belongs to the user
    // rather than to a guess about which is "the" port.
    const published = isContainer ? (item.publishedPorts ?? []) : [];

    return (
        <div>
            <div className={styles.detailHead}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{isContainer ? item.name : item.ref}</Title3>
                {isContainer ? <Badge appearance="filled" color={stateBadge(item.state)}>{item.state}</Badge> : null}
            </div>

            <div className={styles.fields}>
                <Caption1>Id</Caption1><Body1 className={styles.mono}>{item.shortId}</Body1>
                {isContainer ? <><Caption1>Image</Caption1><Body1 className={styles.mono}>{item.image}</Body1></> : null}
                {isContainer ? <><Caption1>Status</Caption1><Body1>{item.status}</Body1></> : null}
                {isContainer && item.ports ? (
                    <>
                        <Caption1>Ports</Caption1>
                        <Body1 className={styles.mono}>
                            {/* Published ports are links rather than buttons: they
                                are already on screen, a container often publishes
                                several, and only the reader knows which one serves
                                anything worth looking at. Ports that are exposed but
                                not published stay as plain text -- there is no host
                                address to open. */}
                            {published.length > 0
                                ? published.map((port, i) => (
                                    <span key={port.hostPort}>
                                        {i > 0 ? ", " : ""}
                                        <Link
                                            href={`http://${port.host}:${port.hostPort}/`}
                                            title={`Open http://${port.host}:${port.hostPort}/ — container port ${port.containerPort}`}
                                            onClick={(event) => {
                                                // The href is there so the target is
                                                // visible on hover and copyable; the
                                                // canvas cannot navigate to it itself.
                                                event.preventDefault();
                                                run(`open :${port.hostPort}`, async () => {
                                                    const res = await client.previewPort.mutate({ id: item.id, hostPort: port.hostPort });
                                                    return `Asked Copilot to open ${res.url} (HTTP ${res.status}).`;
                                                });
                                            }}
                                        >
                                            {`${port.hostPort}→${port.containerPort}`}
                                        </Link>
                                    </span>
                                ))
                                : item.ports}
                        </Body1>
                    </>
                ) : null}
                {!isContainer ? <><Caption1>Size</Caption1><Body1>{item.size}</Body1></> : null}
                <Caption1>Created</Caption1><Body1>{item.created}</Body1>
            </div>

            <Divider />

            <div className={styles.actions}>
                {ops.map((op) => (
                    <Button
                        key={op}
                        size="small"
                        disabled={Boolean(busy)}
                        icon={opIcon(op)}
                        onClick={() => (op === "remove"
                            ? setConfirming(removeOpFor(item))
                            : run(op, () => client.containerOp.mutate({ op, id: item.id })))}
                    >
                        {op}
                    </Button>
                ))}
                {isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<DocumentTextRegular />}
                        onClick={() => onLogs?.(item)}
                    >
                        logs
                    </Button>
                ) : (
                    <Button
                        size="small"
                        appearance="primary"
                        disabled={Boolean(busy)}
                        icon={<PlayRegular />}
                        onClick={() => onRun?.(item)}
                    >
                        Run…
                    </Button>
                )}
                {!isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<LayerDiagonalRegular />}
                        onClick={() => onLayers?.(item)}
                    >
                        layers
                    </Button>
                ) : null}
                {!isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<DocumentBulletListRegular />}
                        onClick={() => onDockerfile?.(item)}
                    >
                        dockerfile
                    </Button>
                ) : null}
                {isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<PulseRegular />}
                        onClick={() => onStats?.(item)}
                    >
                        stats
                    </Button>
                ) : null}
                {isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<FolderOpenRegular />}
                        onClick={() => onFiles?.(item)}
                    >
                        files
                    </Button>
                ) : null}
                {isContainer && item.state === "running" ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<WindowConsoleRegular />}
                        onClick={() => onTerminal?.(item)}
                    >
                        terminal
                    </Button>
                ) : null}
                {/* The Commands view was previously reachable only through an
                    agent deep-link: `onExec` was passed in and never called, so
                    a person had no way to open it. */}
                {isContainer && item.state === "running" ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        onClick={() => onExec?.(item)}
                    >
                        commands
                    </Button>
                ) : null}
                <Button
                    size="small"
                    disabled={Boolean(busy)}
                    onClick={() => run("inspect", () => client.inspect.query({ id: item.id }))}
                >
                    inspect
                </Button>
                {!isContainer ? (
                    <Button
                        size="small"
                        disabled={Boolean(busy)}
                        icon={<TagRegular />}
                        onClick={() => setTagging((v) => !v)}
                    >
                        tag
                    </Button>
                ) : null}
                {busy ? <Spinner size="tiny" label={busy} /> : null}
            </div>

            {/* Removing a container discards it and anything written inside it
                that is not on a volume, and nothing in the panel can undo that.
                A modal rather than the inline pattern tagging uses: tagging is
                recoverable and this is not, so it is worth interrupting for, and
                `alert` keeps a stray click outside from dismissing it.

                The exact command is shown for the same reason RunImageDialog
                shows its argv: `-f` on a running container kills it first, and
                that belongs in front of the user before the click rather than
                inferred from a verb. */}
            <Dialog
                open={Boolean(confirming)}
                modalType="alert"
                onOpenChange={(_, data) => { if (!data.open) setConfirming(null); }}
            >
                <DialogSurface>
                    <DialogBody>
                        <DialogTitle>Remove {item.name ?? item.shortId}?</DialogTitle>
                        <DialogContent>
                            <Body1>
                                {confirming === "forceRemove"
                                    ? `This container is ${item.state}. It will be killed and removed.`
                                    : "This container will be removed."}
                                {" "}
                                Anything written inside it that is not on a volume is lost, and
                                this cannot be undone.
                            </Body1>
                            <pre className={styles.output}>
                                {`docker rm ${confirming === "forceRemove" ? "-f " : ""}${item.name ?? item.shortId}`}
                            </pre>
                        </DialogContent>
                        <DialogActions>
                            <Button
                                appearance="primary"
                                icon={<DeleteRegular />}
                                disabled={Boolean(busy)}
                                onClick={() => {
                                    const op = confirming;
                                    setConfirming(null);
                                    // The dialog above is what this acknowledges: the
                                    // router refuses a destructive op that nobody asked
                                    // for by name.
                                    run(op, () => client.containerOp.mutate({
                                        op,
                                        id: item.id,
                                        acknowledgeDestructive: true,
                                    }));
                                }}
                            >
                                Remove container
                            </Button>
                            <Button appearance="subtle" onClick={() => setConfirming(null)}>Cancel</Button>
                        </DialogActions>
                    </DialogBody>
                </DialogSurface>
            </Dialog>

            {/* Tagging needs one more value than a button can carry, so the
                input appears in place rather than in a dialog. */}
            {tagging && !isContainer ? (
                <div className={styles.actions}>
                    <Input
                        size="small"
                        value={newTag}
                        placeholder={`New tag for ${item.ref}`}
                        onChange={(_, d) => setNewTag(d.value)}
                        onKeyDown={(e) => { if (e.key === "Enter" && newTag.trim()) applyTag(); }}
                    />
                    <Button
                        size="small"
                        appearance="primary"
                        disabled={Boolean(busy) || !newTag.trim()}
                        onClick={applyTag}
                    >
                        Apply
                    </Button>
                    <Button size="small" appearance="subtle" onClick={() => setTagging(false)}>Cancel</Button>
                </div>
            ) : null}

            {output ? (
                outputIsJson
                    ? <CodeView value={output} language="json" height="360px" inspect />
                    : <div className={styles.output}>{output}</div>
            ) : null}

            <Divider />

            {/* Hand-off to Copilot. The panel sends an intent, never prose: the
                host gathers the evidence so what reaches chat is what the
                runtime reports. */}
            <div className={styles.handoff}>
                <Caption1>Ask Copilot</Caption1>
                <div className={styles.actions}>
                    <Button
                        size="small"
                        appearance="primary"
                        icon={<ChatSparkleRegular />}
                        disabled={Boolean(busy)}
                        onClick={() => ask("explain")}
                    >
                        Explain it
                    </Button>
                    {isContainer && item.state !== "running" ? (
                        <Button
                            size="small"
                            icon={<StethoscopeRegular />}
                            disabled={Boolean(busy)}
                            onClick={() => ask("diagnose")}
                        >
                            Investigate
                        </Button>
                    ) : null}
                    <Button
                        size="small"
                        icon={<ShieldCheckmarkRegular />}
                        disabled={Boolean(busy)}
                        onClick={() => ask("configReview")}
                    >
                        Config review
                    </Button>
                </div>
                {sent ? (
                    <MessageBar intent="success">
                        <MessageBarBody>Sent to Copilot — {sent} lines of gathered evidence.</MessageBarBody>
                    </MessageBar>
                ) : null}
            </div>
        </div>
    );
}

/**
 * `navigator.clipboard` needs a secure context and a permission the panel is not
 * guaranteed to have, so fall back to the legacy selection trick rather than
 * failing silently. Returns whether the text actually made it to the clipboard.
 */
async function copyText(text) {
    try {
        await navigator.clipboard.writeText(text);
        return true;
    } catch { /* permission or insecure context -- try the fallback */ }
    try {
        const el = document.createElement("textarea");
        el.value = text;
        el.setAttribute("readonly", "");
        el.style.cssText = "position:fixed;top:-1000px;opacity:0";
        document.body.appendChild(el);
        el.select();
        const ok = document.execCommand("copy");
        el.remove();
        return ok;
    } catch {
        return false;
    }
}

function App() {
    const styles = useStyles();
    const theme = useCanvasTheme();


    const [state, setState] = useState({ runtime: null, containers: [], images: [], error: null });
    const [tab, setTab] = useState("containers");
    const [query, setQuery] = useState("");
    const [selected, setSelected] = useState(null);
    const [refreshing, setRefreshing] = useState(false);    // Pulling lives on the Images tab rather than a dialog: it is the one image
    // action with no image to hang off yet.
    const [pullRef, setPullRef] = useState("");
    const [pulling, setPulling] = useState(false);

    const pull = useCallback(async () => {
        const ref = pullRef.trim();
        if (!ref) return;
        setPulling(true);
        try {
            await client.pullImage.mutate({ ref });
            say("success", `Pulled ${ref}.`);
            setPullRef("");
        } catch (error) {
            say("error", String(error?.message ?? error));
        } finally {
            setPulling(false);
        }
    }, [pullRef]);
    // { item, x, y } while a row's context menu is open.
    const [menu, setMenu] = useState(null);
    const [notice, setNotice] = useState(null);
    // The error text that was dismissed, so a *different* failure still shows.
    const [dismissedError, setDismissedError] = useState(null);
    // The image awaiting a `docker run`, or null when the dialog is closed.
    const [runTarget, setRunTarget] = useState(null);
    // Which container's logs are open, or null. Set by the logs button and by
    // the agent deep-linking the panel.
    const [logsFor, setLogsFor] = useState(null);
    // Which container's live resource usage is open, or null.
    const [statsFor, setStatsFor] = useState(null);
    // Which container's filesystem is open, or null.
    const [filesFor, setFilesFor] = useState(null);
    // Which container has an interactive shell open, or null.
    const [termFor, setTermFor] = useState(null);
    // Which image's layer breakdown is open, or null.
    const [layersFor, setLayersFor] = useState(null);
    // Which image's Dockerfile provenance view is open, or null.
    const [dockerfileFor, setDockerfileFor] = useState(null);
    // Which container's command history is open, or null.
    const [execFor, setExecFor] = useState(null);
    // Panel-wide record of commands run through this canvas.
    const [execLog, setExecLog] = useState([]);
    // True once this panel's loopback server has been unreachable long enough
    // to mean it is gone rather than briefly restarting.
    const [disconnected, setDisconnected] = useState(false);

    useEffect(() => {
        // Once the failure clears, forget the dismissal: if it comes back it is
        // news again rather than the same banner the user already closed.
        if (!state.error) setDismissedError(null);
    }, [state.error]);

    const say = useCallback((intent, text) => {
        setNotice({ intent, text });
        setTimeout(() => setNotice(null), 4000);
    }, []);

    // Fluent positions popovers against an element; a right-click has only a
    // point, so hand it a virtual element describing a zero-size rect there.
    const menuTarget = useMemo(() => (menu ? {
        getBoundingClientRect: () => ({
            x: menu.x, y: menu.y, left: menu.x, top: menu.y,
            right: menu.x, bottom: menu.y, width: 0, height: 0,
            toJSON() { return this; },
        }),
    } : null), [menu]);

    const onRowContextMenu = useCallback((event, item) => {
        event.preventDefault();
        setMenu({ item, x: event.clientX, y: event.clientY });
    }, []);

    const menuCopy = useCallback(async (label, value) => {
        setMenu(null);
        const ok = await copyText(value);
        say(ok ? "success" : "error", ok ? `Copied ${label}.` : `Could not copy ${label}.`);
    }, [say]);

    const menuAsk = useCallback(async (item, intent) => {
        setMenu(null);
        try {
            const { prompt } = await client.askCopilot.mutate({ intent, id: item.id });
            say("success", `Sent to Copilot — ${prompt.split("\n").length} lines of evidence.`);
        } catch (error) {
            say("error", String(error?.message ?? error));
        }
    }, [say]);

    const menuOp = useCallback(async (item, op) => {
        setMenu(null);
        try {
            await client.containerOp.mutate({ op, id: item.id });
            say("success", `${op} ${item.name}`);
            setState(await client.refresh.mutate({ force: true }));
        } catch (error) {
            say("error", String(error?.message ?? error));
        }
    }, [say]);

    useEffect(() => {
        // State arrives two ways: a query on mount, and pushes over the same SSE
        // stream the tRPC replies use.
        onStateHandler = setState;
        client.getState.query().then(setState).catch(() => { });
        return () => { onStateHandler = () => {}; };
    }, []);

    /*
     * Deep-link frames from the host.
     *
     * The agent resolves the target before sending, so the panel is told which
     * row to show rather than being handed a search string to guess at. That
     * keeps "show me the logs for web" resolving the same way whether it came
     * from chat or from a click.
     */
    useEffect(() => {
        setControlHandler((frame) => {
            if (frame.type === "exec") {
                setExecLog((prev) => [...prev, frame.entry].slice(-200));
                return;
            }
            if (frame.type === "connection") {
                setDisconnected(!frame.ok);
                return;
            }
            if (frame.type !== "focus") return;
            if (frame.tab) setTab(frame.tab);
            if (frame.view === "list" || !frame.target) {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setFilesFor(null);
                setTermFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                return;
            }
            const target = frame.target;
            if (frame.view === "logs" && target.kind === "container") {
                setSelected(null);
                setStatsFor(null);
                setFilesFor(null);
                setTermFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                setLogsFor(target);
                return;
            }
            if (frame.view === "stats" && target.kind === "container") {
                setSelected(null);
                setLogsFor(null);
                setFilesFor(null);
                setTermFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                setStatsFor(target);
                return;
            }
            if (frame.view === "dockerfile" && target.kind === "image") {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setFilesFor(null);
                setTermFor(null);
                setLayersFor(null);
                setDockerfileFor(target);
                return;
            }
            if (frame.view === "layers" && target.kind === "image") {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setFilesFor(null);
                setTermFor(null);
                setLayersFor(target);
                return;
            }
            if (frame.view === "exec" && target.kind === "container") {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setFilesFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                setTermFor(null);
                setExecFor(target);
                return;
            }
            if (frame.view === "terminal" && target.kind === "container") {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setFilesFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                setTermFor(target);
                return;
            }
            if (frame.view === "files" && target.kind === "container") {
                setSelected(null);
                setLogsFor(null);
                setStatsFor(null);
                setTermFor(null);
                setLayersFor(null);
                setDockerfileFor(null);
                setFilesFor(target);
                return;
            }
            setLogsFor(null);
            setStatsFor(null);
            setFilesFor(null);
            setTermFor(null);
            setLayersFor(null);
            setDockerfileFor(null);
            setSelected(target);
            setTab(target.kind === "image" ? "images" : "containers");
        });
        return () => setControlHandler(null);
    }, []);

    const refresh = useCallback(async () => {
        setRefreshing(true);
        // An explicit refresh is a request to re-check, so stop suppressing a
        // previously dismissed error -- if it is still broken, say so again.
        setDismissedError(null);
        try {
            setState(await client.refresh.mutate({ force: true }));
        } finally {
            setRefreshing(false);
        }
    }, []);

    const items = useMemo(() => {
        const source = tab === "images" ? state.images : state.containers;
        const needle = query.trim().toLowerCase();
        if (!needle) return source;
        return source.filter((item) =>
            `${item.name ?? ""} ${item.ref ?? ""} ${item.image ?? ""} ${item.shortId ?? ""}`.toLowerCase().includes(needle));
    }, [state, tab, query]);

    /*
     * The detail pane reads through to the live list rather than rendering the
     * row object that was clicked.
     *
     * `selected` is a snapshot taken at click time. Every mutation refreshes
     * `state`, which replaces those objects -- so a pane rendering the snapshot
     * keeps showing the state the container had when it was opened. Pausing a
     * container left the badge on "running" and kept offering "pause", because
     * `opsFor` was reading a stale `state` field.
     *
     * Falls back to the snapshot when the target is gone from the list, so the
     * pane renders its final state for the instant between the mutation landing
     * and the effect below closing it, instead of blanking mid-frame.
     */
    const selectedLive = useMemo(() => {
        if (!selected) return null;
        const pool = selected.kind === "image" ? state.images : state.containers;
        return pool.find((candidate) => candidate.id === selected.id) ?? selected;
    }, [selected, state]);

    /*
     * Close the detail pane when its subject stops existing.
     *
     * Without this the fallback above is indefinite: removing a container --
     * or stopping one started with `--rm`, which removes it as a side effect --
     * left the pane showing the last known row, badge still "running", still
     * offering Stop and Restart for something the daemon no longer knows about.
     *
     * Gated on `state.runtime` because the initial state has empty lists before
     * the first load resolves, and that must not read as "everything is gone".
     */
    useEffect(() => {
        if (!selected || !state.runtime) return;
        const pool = selected.kind === "image" ? state.images : state.containers;
        if (pool.some((candidate) => candidate.id === selected.id)) return;
        setSelected(null);
        say("info", `${selected.name ?? selected.ref ?? "That item"} is no longer present.`);
    }, [selected, state, say]);

    /**
     * The same read-through for the sub-views.
     *
     * Logs, stats and files all render a state badge and enable controls from
     * `item.state`, so each was holding the same stale snapshot: stop a
     * container while watching its logs and the badge stayed green with Follow
     * still offered.
     */
    const live = useCallback((snapshot) => {
        if (!snapshot) return snapshot;
        const pool = snapshot.kind === "image" ? state.images : state.containers;
        return pool.find((candidate) => candidate.id === snapshot.id) ?? snapshot;
    }, [state]);

    const columns = useMemo(() => (tab === "images"
        ? [
            createTableColumn({
                columnId: "ref",
                compare: (a, b) => (a.ref ?? "").localeCompare(b.ref ?? ""),
                renderHeaderCell: () => "Reference",
                renderCell: (item) => <span className={styles.cellMono} title={item.ref}>{item.ref}</span>,
            }),
            createTableColumn({
                columnId: "size",
                compare: (a, b) => (a.sizeBytes ?? 0) - (b.sizeBytes ?? 0),
                renderHeaderCell: () => "Size",
                renderCell: (item) => <span className={styles.cell}>{item.size}</span>,
            }),
            createTableColumn({
                columnId: "created",
                compare: (a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0),
                renderHeaderCell: () => "Created",
                renderCell: (item) => <span className={styles.cell} title={item.created}>{item.created}</span>,
            }),
        ]
        : [
            createTableColumn({
                columnId: "name",
                compare: (a, b) => (a.name ?? "").localeCompare(b.name ?? ""),
                renderHeaderCell: () => "Name",
                renderCell: (item) => <span className={styles.cell} title={item.name}>{item.name}</span>,
            }),
            createTableColumn({
                columnId: "state",
                compare: (a, b) => (a.state ?? "").localeCompare(b.state ?? ""),
                renderHeaderCell: () => "State",
                renderCell: (item) => <Badge appearance="filled" color={stateBadge(item.state)}>{item.state}</Badge>,
            }),
            createTableColumn({
                columnId: "image",
                compare: (a, b) => (a.image ?? "").localeCompare(b.image ?? ""),
                renderHeaderCell: () => "Image",
                renderCell: (item) => <span className={styles.cellMono} title={item.image}>{item.image}</span>,
            }),
            createTableColumn({
                columnId: "ports",
                compare: (a, b) => (a.ports ?? "").localeCompare(b.ports ?? ""),
                renderHeaderCell: () => "Ports",
                renderCell: (item) => <span className={styles.cellMono} title={item.ports}>{item.ports}</span>,
            }),
        ]), [tab, styles.cell, styles.cellMono]);

    // Without explicit sizing every column gets an equal share, which is wrong
    // in both directions: State only ever holds a short badge, while names and
    // image digests are long. Columns stay resizable so the split is a starting
    // point, not a rule.
    const columnSizingOptions = useMemo(() => (tab === "images"
        ? {
            ref: { minWidth: 220, defaultWidth: 380, idealWidth: 380 },
            size: { minWidth: 80, defaultWidth: 100, idealWidth: 100 },
            created: { minWidth: 150, defaultWidth: 210, idealWidth: 210 },
        }
        : {
            name: { minWidth: 160, defaultWidth: 260, idealWidth: 260 },
            state: { minWidth: 88, defaultWidth: 96, idealWidth: 96 },
            image: { minWidth: 160, defaultWidth: 260, idealWidth: 260 },
            ports: { minWidth: 160, defaultWidth: 240, idealWidth: 240 },
        }), [tab]);

    return (
        // No className here on purpose: Fluent copies it onto the <body>-level
        // portal node. Sizing lives in index.html, scoped to `#root >`.
        <FluentProvider theme={theme}>
            <div className={styles.shell}>
                <div className={styles.bar}>
                <Input
                    className={styles.grow}
                    value={query}
                    placeholder="Filter by name, image, id…"
                    onChange={(_, data) => setQuery(data.value)}
                />
                <Button
                    appearance="subtle"
                    icon={<ArrowClockwiseRegular />}
                    disabled={refreshing}
                    onClick={refresh}
                >
                    Refresh
                </Button>
                {tab === "images" ? (
                    <>
                        <Input
                            value={pullRef}
                            placeholder="Pull an image, e.g. alpine:3.20"
                            disabled={pulling}
                            onChange={(_, data) => setPullRef(data.value)}
                            onKeyDown={(e) => { if (e.key === "Enter") pull(); }}
                        />
                        <Button
                            appearance="subtle"
                            icon={pulling ? <Spinner size="tiny" /> : <ArrowDownloadRegular />}
                            disabled={pulling || !pullRef.trim()}
                            onClick={pull}
                        >
                            {pulling ? "Pulling…" : "Pull"}
                        </Button>
                    </>
                ) : null}
            </div>

            <div className={styles.body}>
                {disconnected ? (
                    <MessageBar intent="warning">
                        <MessageBarBody>
                            This panel has lost its connection to the extension — it is showing a
                            stale view. Reopening the Containers canvas will reconnect it.
                        </MessageBarBody>
                    </MessageBar>
                ) : null}

                {state.error && state.error !== dismissedError ? (
                    <MessageBar intent="error">
                        <MessageBarBody>{state.error}</MessageBarBody>
                        <MessageBarActions
                            containerAction={
                                <Button
                                    appearance="transparent"
                                    icon={<DismissRegular />}
                                    aria-label="Dismiss error"
                                    onClick={() => setDismissedError(state.error)}
                                />
                            }
                        />
                    </MessageBar>
                ) : null}

                {notice ? (
                    <MessageBar intent={notice.intent}>
                        <MessageBarBody>{notice.text}</MessageBarBody>
                        <MessageBarActions
                            containerAction={
                                <Button
                                    appearance="transparent"
                                    icon={<DismissRegular />}
                                    aria-label="Dismiss"
                                    onClick={() => setNotice(null)}
                                />
                            }
                        />
                    </MessageBar>
                ) : null}

                {/* One boundary for the whole chain: every branch except the
                    list is a lazily-loaded chunk, and they are mutually
                    exclusive, so a single fallback covers all of them. */}
                <Suspense fallback={<ViewLoading />}>
                {logsFor ? (
                    <LogView
                        // Remount per container: follow-on-open is decided from
                        // the container's state at mount, so reusing the
                        // instance would carry the previous container's stream
                        // state onto a different one.
                        key={logsFor.id}
                        item={live(logsFor)}
                        client={client}
                        onBack={() => setLogsFor(null)}
                        onNotify={say}
                    />
                ) : statsFor ? (
                    <StatsView
                        key={statsFor.id}
                        item={live(statsFor)}
                        onBack={() => setStatsFor(null)}
                    />
                ) : filesFor ? (
                    <FilesView
                        key={filesFor.id}
                        item={live(filesFor)}
                        client={client}
                        onBack={() => setFilesFor(null)}
                        onNotify={say}
                    />
                ) : termFor ? (
                    <TerminalView
                        key={termFor.id}
                        item={live(termFor)}
                        onBack={() => setTermFor(null)}
                    />
                ) : layersFor ? (
                    <LayersView
                        key={layersFor.id}
                        item={live(layersFor)}
                        client={client}
                        onBack={() => setLayersFor(null)}
                        onNotify={say}
                    />
                ) : dockerfileFor ? (
                    <DockerfileView
                        key={dockerfileFor.id}
                        item={live(dockerfileFor)}
                        client={client}
                        onBack={() => setDockerfileFor(null)}
                        onNotify={say}
                    />
                ) : execFor ? (
                    <ExecView
                        key={execFor.id}
                        item={live(execFor)}
                        client={client}
                        entries={execLog}
                        onBack={() => setExecFor(null)}
                        onRan={(entry) => setExecLog((prev) => [...prev, entry].slice(-200))}
                    />
                ) : selected ? (
                    <Detail
                        item={selectedLive}
                        onBack={() => setSelected(null)}
                        onChanged={refresh}
                        onRun={setRunTarget}
                        onLogs={setLogsFor}
                        onStats={setStatsFor}
                        onFiles={setFilesFor}
                        onTerminal={setTermFor}
                        onLayers={setLayersFor}
                        onDockerfile={setDockerfileFor}
                        onExec={setExecFor}
                    />
                ) : (
                    <>
                        <TabList selectedValue={tab} onTabSelect={(_, data) => setTab(data.value)}>
                            <Tab value="containers" icon={<BoxRegular />}>Containers ({state.containers.length})</Tab>
                            <Tab value="images" icon={<LayerRegular />}>Images ({state.images.length})</Tab>
                        </TabList>

                        {items.length === 0 ? (
                            <Subtitle2>Nothing matches.</Subtitle2>
                        ) : (
                            <DataGrid
                                // Remount per tab. The two tabs are different
                                // datasets with different columns, and reusing
                                // one grid across them leaves stale rows and a
                                // sort keyed to a column that no longer exists.
                                key={tab}
                                items={items}
                                columns={columns}
                                sortable
                                // An image id is not unique: the same image is
                                // listed once per tag, so 413 image rows share
                                // only 221 ids. Keying rows by id alone gives
                                // duplicate keys and rows multiply on re-sort.
                                getRowId={(item) => (item.kind === "image" ? `${item.id}:${item.ref}` : item.id)}
                                focusMode="composite"
                                resizableColumns
                                columnSizingOptions={columnSizingOptions}
                            >
                                <DataGridHeader>
                                    <DataGridRow>
                                        {({ renderHeaderCell }) => <DataGridHeaderCell>{renderHeaderCell()}</DataGridHeaderCell>}
                                    </DataGridRow>
                                </DataGridHeader>
                                <DataGridBody>
                                    {({ item, rowId }) => (
                                        <DataGridRow
                                            key={rowId}
                                            onClick={() => setSelected(item)}
                                            onContextMenu={(event) => onRowContextMenu(event, item)}
                                        >
                                            {({ renderCell }) => <DataGridCell>{renderCell(item)}</DataGridCell>}
                                        </DataGridRow>
                                    )}
                                </DataGridBody>
                            </DataGrid>
                        )}
                    </>
                )}
                </Suspense>
                </div>
            </div>

            {/* Right-click on a row. The host exposes no context-menu
                contribution point, so this is an ordinary `contextmenu`
                handler: preventDefault suppresses WebView2's own menu and a
                Fluent Menu is positioned at the pointer via a virtual target. */}
            {menu ? (() => {
                const item = menu.item;
                const isContainer = item.kind === "container";
                const ops = opsFor(item);
                return (
                    <Menu
                        open
                        onOpenChange={(_, data) => { if (!data.open) setMenu(null); }}
                        positioning={{ target: menuTarget, position: "below", align: "start" }}
                    >
                        <MenuTrigger disableButtonEnhancement>
                            <span aria-hidden="true" style={{ display: "none" }} />
                        </MenuTrigger>
                        <MenuPopover>
                            <MenuList>
                                <MenuItem
                                    icon={<OpenRegular />}
                                    onClick={() => { setSelected(item); setMenu(null); }}
                                >
                                    Open details
                                </MenuItem>
                                {!isContainer ? (
                                    <>
                                        <MenuItem
                                            icon={<PlayRegular />}
                                            onClick={() => { setRunTarget(item); setMenu(null); }}
                                        >
                                            Run image…
                                        </MenuItem>
                                        <MenuItem
                                            icon={<LayerDiagonalRegular />}
                                            onClick={() => { setLayersFor(item); setMenu(null); }}
                                        >
                                            Inspect layers
                                        </MenuItem>
                                        <MenuItem
                                            icon={<DocumentBulletListRegular />}
                                            onClick={() => { setDockerfileFor(item); setMenu(null); }}
                                        >
                                            Dockerfile source
                                        </MenuItem>
                                    </>
                                ) : (
                                    <>
                                        <MenuItem
                                            icon={<DocumentTextRegular />}
                                            onClick={() => { setStatsFor(null); setLogsFor(item); setMenu(null); }}
                                        >
                                            View logs
                                        </MenuItem>
                                        <MenuItem
                                            icon={<PulseRegular />}
                                            onClick={() => { setLogsFor(null); setStatsFor(item); setMenu(null); }}
                                        >
                                            Live stats
                                        </MenuItem>
                                        <MenuItem
                                            icon={<FolderOpenRegular />}
                                            onClick={() => { setLogsFor(null); setStatsFor(null); setFilesFor(item); setMenu(null); }}
                                        >
                                            Browse files
                                        </MenuItem>
                                        {item.state === "running" ? (
                                            <MenuItem
                                                icon={<WindowConsoleRegular />}
                                                onClick={() => { setLogsFor(null); setStatsFor(null); setFilesFor(null); setTermFor(item); setMenu(null); }}
                                            >
                                                Open terminal
                                            </MenuItem>
                                        ) : null}
                                        <MenuItem
                                                icon={<SendRegular />}
                                                onClick={() => { setLogsFor(null); setStatsFor(null); setFilesFor(null); setTermFor(null); setExecFor(item); setMenu(null); }}
                                        >
                                                Run a command
                                        </MenuItem>
                                    </>
                                )}
                                {ops.length ? <MenuDivider /> : null}
                                {ops.map((op) => (
                                    <MenuItem
                                        key={op}
                                        icon={opIcon(op)}
                                        onClick={() => menuOp(item, op)}
                                    >
                                        {op}
                                    </MenuItem>
                                ))}
                                <MenuDivider />
                                <MenuItem icon={<ChatSparkleRegular />} onClick={() => menuAsk(item, "explain")}>
                                    Ask Copilot to explain
                                </MenuItem>
                                {isContainer && item.state !== "running" ? (
                                    <MenuItem icon={<StethoscopeRegular />} onClick={() => menuAsk(item, "diagnose")}>
                                        Investigate
                                    </MenuItem>
                                ) : null}
                                <MenuItem icon={<ShieldCheckmarkRegular />} onClick={() => menuAsk(item, "configReview")}>
                                    Config review
                                </MenuItem>
                                <MenuDivider />
                                <MenuItem icon={<CopyRegular />} onClick={() => menuCopy("id", item.id)}>
                                    Copy id
                                </MenuItem>
                                <MenuItem
                                    icon={<CopyRegular />}
                                    onClick={() => menuCopy(isContainer ? "name" : "reference", isContainer ? item.name : item.ref)}
                                >
                                    {isContainer ? "Copy name" : "Copy reference"}
                                </MenuItem>
                            </MenuList>
                        </MenuPopover>
                    </Menu>
                );
            })() : null}
            {/* Mounted only while a target is set. It was previously always
                mounted with `open={false}`, which for a lazily-loaded component
                would mean fetching its chunk during first paint and giving up
                the split entirely. */}
            {runTarget ? (
                <Suspense fallback={null}>
                    <RunImageDialog
                        open
                        image={runTarget}
                        client={client}
                        onOpenChange={(open) => { if (!open) setRunTarget(null); }}
                        onRan={(res) => {
                            say("success", res.containerId ? `Started container ${res.containerId}.` : "Container started.");
                            refresh();
                            setTab("containers");
                        }}
                    />
                </Suspense>
            ) : null}
        </FluentProvider>
    );
}

createRoot(document.getElementById("root")).render(
    <StrictMode>
        <App />
    </StrictMode>,
);
