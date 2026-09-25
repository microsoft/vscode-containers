/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// "Run image" — the canvas's only creating operation.
//
// Everything else in this panel reads state or moves an existing container
// between lifecycle states. This one brings a container into existence, so the
// shape of the form matters: the common case (pick an image, map a port, go)
// has to stay one field deep, while the long tail of `docker run` flags stays
// reachable without turning the dialog into a wall of inputs.
//
// Multi-value fields are line-based textareas rather than repeater rows. A
// developer already knows `KEY=value` and `8080:80` from the command line, and
// pasting three lines beats clicking "add" three times.

import { useMemo, useState } from "react";
import {
    Accordion,
    AccordionHeader,
    AccordionItem,
    AccordionPanel,
    Button,
    Dialog,
    DialogActions,
    DialogBody,
    DialogContent,
    DialogSurface,
    DialogTitle,
    Dropdown,
    Field,
    Input,
    MessageBar,
    MessageBarBody,
    Option,
    Spinner,
    Switch,
    Textarea,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { PlayRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
    grid: { display: "grid", rowGap: "12px", ...shorthands.padding("4px", "0") },
    two: { display: "grid", gridTemplateColumns: "1fr 1fr", columnGap: "12px" },
    mono: { fontFamily: tokens.fontFamilyMonospace },
    hint: { color: tokens.colorNeutralForeground3 },
    output: {
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        maxHeight: "160px",
        overflowY: "auto",
        backgroundColor: tokens.colorNeutralBackground3,
        ...shorthands.padding("8px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
    },
});

/** Split a textarea into trimmed, non-empty lines. */
const lines = (text) => String(text ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

/**
 * Volume rows are `hostPath:/containerPath` or `hostPath:/containerPath:ro`,
 * matching the `docker run -v` syntax rather than inventing a new one.
 *
 * A Windows source has a drive letter, so a naive split on ":" would tear
 * `C:\src` in half. Split from the right instead.
 */
function parseVolumes(text) {
    return lines(text).map((line) => {
        let rest = line;
        let readOnly = false;
        if (/:ro$/i.test(rest)) {
            readOnly = true;
            rest = rest.slice(0, -3);
        } else if (/:rw$/i.test(rest)) {
            rest = rest.slice(0, -3);
        }
        const cut = rest.lastIndexOf(":");
        if (cut <= 0) throw new Error(`Volume "${line}" needs a host path and a container path, e.g. C:\\src:/app`);
        return { source: rest.slice(0, cut).trim(), target: rest.slice(cut + 1).trim(), readOnly };
    });
}

/**
 * `docker run` command overrides are argv, not a shell line. Splitting on
 * whitespace while honouring quotes keeps "a b" as one argument; there is no
 * shell here to do it for us.
 */
function parseArgv(text) {
    const out = [];
    const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
    let m;
    while ((m = re.exec(String(text ?? "").trim()))) out.push(m[1] ?? m[2] ?? m[3]);
    return out;
}

const RESTART_POLICIES = ["no", "on-failure", "unless-stopped", "always"];

export function RunImageDialog({ open, image, onOpenChange, onRan, client }) {
    const styles = useStyles();
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState(null);
    const [result, setResult] = useState(null);

    const [name, setName] = useState("");
    const [ports, setPorts] = useState("");
    const [env, setEnv] = useState("");
    const [labels, setLabels] = useState("");
    const [volumes, setVolumes] = useState("");
    const [command, setCommand] = useState("");
    const [entrypoint, setEntrypoint] = useState("");
    const [workdir, setWorkdir] = useState("");
    const [user, setUser] = useState("");
    const [network, setNetwork] = useState("");
    const [restart, setRestart] = useState("no");
    const [memory, setMemory] = useState("");
    const [cpus, setCpus] = useState("");
    const [publishAll, setPublishAll] = useState(false);
    const [removeOnExit, setRemoveOnExit] = useState(false);
    const [pull, setPull] = useState(false);

    const reset = () => {
        setError(null); setResult(null); setBusy(false);
        setName(""); setPorts(""); setEnv(""); setLabels(""); setVolumes("");
        setCommand(""); setEntrypoint(""); setWorkdir(""); setUser("");
        setNetwork(""); setRestart("no"); setMemory(""); setCpus("");
        setPublishAll(false); setRemoveOnExit(false); setPull(false);
    };

    // Built eagerly so the dialog can show the exact argv before anything runs:
    // a `docker run` line is the thing a developer can actually audit.
    const preview = useMemo(() => {
        const parts = ["docker", "run", "-d"];
        if (removeOnExit) parts.push("--rm");
        if (pull) parts.push("--pull always");
        if (publishAll) parts.push("-P");
        if (name.trim()) parts.push(`--name ${name.trim()}`);
        for (const p of lines(ports)) parts.push(`-p ${p}`);
        for (const e of lines(env)) parts.push(`-e ${e}`);
        for (const l of lines(labels)) parts.push(`--label ${l}`);
        for (const v of lines(volumes)) parts.push(`-v ${v}`);
        if (network.trim()) parts.push(`--network ${network.trim()}`);
        if (restart && restart !== "no") parts.push(`--restart ${restart}`);
        if (memory.trim()) parts.push(`--memory ${memory.trim()}`);
        if (cpus.trim()) parts.push(`--cpus ${cpus.trim()}`);
        if (workdir.trim()) parts.push(`-w ${workdir.trim()}`);
        if (user.trim()) parts.push(`-u ${user.trim()}`);
        if (entrypoint.trim()) parts.push(`--entrypoint ${entrypoint.trim()}`);
        parts.push(image?.ref ?? image?.shortId ?? "<image>");
        const argv = parseArgv(command);
        if (argv.length) parts.push(argv.join(" "));
        return parts.join(" ");
    }, [image, name, ports, env, labels, volumes, network, restart, memory, cpus, workdir, user, entrypoint, command, publishAll, removeOnExit, pull]);

    const submit = async () => {
        setBusy(true);
        setError(null);
        setResult(null);
        try {
            const spec = {
                image: image?.ref && image.ref !== "<none>:<none>" ? image.ref : image?.id,
                detach: true,
                publishAll, removeOnExit, pull,
                ...(name.trim() && { name: name.trim() }),
                ...(lines(ports).length && { ports: lines(ports) }),
                ...(lines(env).length && { env: lines(env) }),
                ...(lines(labels).length && { labels: lines(labels) }),
                ...(lines(volumes).length && { volumes: parseVolumes(volumes) }),
                ...(parseArgv(command).length && { command: parseArgv(command) }),
                ...(entrypoint.trim() && { entrypoint: entrypoint.trim() }),
                ...(workdir.trim() && { workdir: workdir.trim() }),
                ...(user.trim() && { user: user.trim() }),
                ...(network.trim() && { network: network.trim() }),
                ...(restart && restart !== "no" && { restart }),
                ...(memory.trim() && { memory: memory.trim() }),
                ...(cpus.trim() && { cpus: cpus.trim() }),
            };
            const res = await client.runImage.mutate(spec);
            // `docker run` can exit non-zero for a port clash or a missing
            // image. Report what the runtime said rather than assuming success.
            if (!res.ok) {
                setError(res.output?.trim() || res.error || "docker run failed.");
                setResult(null);
            } else {
                setResult(res);
                onRan?.(res);
            }
        } catch (e) {
            setError(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(_, data) => {
                if (!data.open) reset();
                onOpenChange?.(data.open);
            }}
        >
            <DialogSurface>
                <DialogBody>
                    <DialogTitle>Run {image?.ref ?? image?.shortId ?? "image"}</DialogTitle>
                    <DialogContent>
                        <div className={styles.grid}>
                            {error ? (
                                <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>
                            ) : null}
                            {result ? (
                                <MessageBar intent="success">
                                    <MessageBarBody>
                                        Started {result.containerId ? `container ${result.containerId}` : "container"}.
                                    </MessageBarBody>
                                </MessageBar>
                            ) : null}

                            <Field label="Name" hint="Optional. Docker generates one if left blank.">
                                <Input value={name} onChange={(_, d) => setName(d.value)} placeholder="my-app" />
                            </Field>

                            <Field label="Ports" hint="One per line: 8080:80, or 80, or 8080:80/udp.">
                                <Textarea
                                    className={styles.mono}
                                    value={ports}
                                    onChange={(_, d) => setPorts(d.value)}
                                    placeholder={"8080:80\n8443:443"}
                                    rows={2}
                                />
                            </Field>

                            <Field label="Environment" hint="One KEY=value per line.">
                                <Textarea
                                    className={styles.mono}
                                    value={env}
                                    onChange={(_, d) => setEnv(d.value)}
                                    placeholder={"ASPNETCORE_ENVIRONMENT=Development"}
                                    rows={2}
                                />
                            </Field>

                            <Field label="Labels" hint="One key=value per line.">
                                <Textarea
                                    className={styles.mono}
                                    value={labels}
                                    onChange={(_, d) => setLabels(d.value)}
                                    placeholder={"team=platform"}
                                    rows={2}
                                />
                            </Field>

                            <Accordion collapsible>
                                <AccordionItem value="advanced">
                                    <AccordionHeader>More options</AccordionHeader>
                                    <AccordionPanel>
                                        <div className={styles.grid}>
                                            <Field
                                                label="Volumes"
                                                hint="One per line: C:\src:/app, optionally suffixed :ro. System paths and the container socket are blocked."
                                            >
                                                <Textarea
                                                    className={styles.mono}
                                                    value={volumes}
                                                    onChange={(_, d) => setVolumes(d.value)}
                                                    placeholder={"C:\\src\\myapp:/app:ro"}
                                                    rows={2}
                                                />
                                            </Field>

                                            <Field label="Command" hint="Overrides the image CMD. Quotes are honoured.">
                                                <Input className={styles.mono} value={command} onChange={(_, d) => setCommand(d.value)} placeholder="--urls http://+:80" />
                                            </Field>

                                            <div className={styles.two}>
                                                <Field label="Entrypoint">
                                                    <Input className={styles.mono} value={entrypoint} onChange={(_, d) => setEntrypoint(d.value)} />
                                                </Field>
                                                <Field label="Working dir">
                                                    <Input className={styles.mono} value={workdir} onChange={(_, d) => setWorkdir(d.value)} placeholder="/app" />
                                                </Field>
                                            </div>

                                            <div className={styles.two}>
                                                <Field label="User">
                                                    <Input value={user} onChange={(_, d) => setUser(d.value)} placeholder="1000" />
                                                </Field>
                                                <Field label="Network">
                                                    <Input value={network} onChange={(_, d) => setNetwork(d.value)} placeholder="bridge" />
                                                </Field>
                                            </div>

                                            <div className={styles.two}>
                                                <Field label="Memory limit" hint="e.g. 512m">
                                                    <Input value={memory} onChange={(_, d) => setMemory(d.value)} placeholder="512m" />
                                                </Field>
                                                <Field label="CPU limit" hint="e.g. 1.5">
                                                    <Input value={cpus} onChange={(_, d) => setCpus(d.value)} placeholder="1.5" />
                                                </Field>
                                            </div>

                                            <Field label="Restart policy">
                                                <Dropdown
                                                    value={restart}
                                                    selectedOptions={[restart]}
                                                    onOptionSelect={(_, d) => setRestart(d.optionValue)}
                                                >
                                                    {RESTART_POLICIES.map((p) => <Option key={p} value={p}>{p}</Option>)}
                                                </Dropdown>
                                            </Field>

                                            <Switch checked={publishAll} onChange={(_, d) => setPublishAll(d.checked)} label="Publish all exposed ports (-P)" />
                                            <Switch checked={removeOnExit} onChange={(_, d) => setRemoveOnExit(d.checked)} label="Remove when it exits (--rm)" />
                                            <Switch checked={pull} onChange={(_, d) => setPull(d.checked)} label="Always pull a fresh image" />
                                        </div>
                                    </AccordionPanel>
                                </AccordionItem>
                            </Accordion>

                            <Field label="Command preview" hint="What will run. Validated again before it executes.">
                                <div className={styles.output}>{preview}</div>
                            </Field>
                        </div>
                    </DialogContent>
                    <DialogActions>
                        {busy ? <Spinner size="tiny" label="Starting…" /> : null}
                        <Button appearance="secondary" disabled={busy} onClick={() => { reset(); onOpenChange?.(false); }}>
                            {result ? "Close" : "Cancel"}
                        </Button>
                        <Button appearance="primary" icon={<PlayRegular />} disabled={busy || !image} onClick={submit}>
                            Run
                        </Button>
                    </DialogActions>
                </DialogBody>
            </DialogSurface>
        </Dialog>
    );
}
