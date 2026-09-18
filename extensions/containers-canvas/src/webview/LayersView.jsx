/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// Image layer explorer.
//
// "Why is this image 244 MB?" is a question `docker history` technically
// answers and practically does not: it prints newest-first, wraps the command
// in shell noise, and gives every layer the same visual weight even though most
// contribute nothing.
//
// This shows layers in *build order* -- the order the Dockerfile reads, which
// is where a fix has to be made -- with a proportional bar so the expensive
// ones are obvious without reading a single number.

import { useCallback, useEffect, useMemo, useState } from "react";
import {
    Badge,
    Button,
    Caption1,
    MessageBar,
    MessageBarBody,
    Spinner,
    Switch,
    Title3,
    Tooltip,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { ArrowLeftRegular, ArrowSortRegular, CopyRegular } from "@fluentui/react-icons";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    bar: { display: "flex", alignItems: "center", columnGap: "12px", flexWrap: "wrap", ...shorthands.padding("0", "0", "10px") },
    grow: { flexGrow: 1 },
    summary: { display: "flex", columnGap: "18px", flexWrap: "wrap", ...shorthands.padding("0", "0", "10px") },
    stat: { display: "flex", flexDirection: "column" },
    statValue: { fontFamily: tokens.fontFamilyMonospace, fontSize: "18px" },
    list: {
        overflowY: "auto",
        maxHeight: "calc(100vh - 300px)",
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
    },
    row: {
        display: "grid",
        gridTemplateColumns: "38px 74px 96px 1fr",
        alignItems: "center",
        columnGap: "10px",
        ...shorthands.padding("6px", "10px"),
        ...shorthands.borderBottom("1px", "solid", tokens.colorNeutralStroke3),
    },
    idx: { color: tokens.colorNeutralForeground3, fontFamily: tokens.fontFamilyMonospace, fontSize: "11px", textAlign: "right" },
    size: { fontFamily: tokens.fontFamilyMonospace, fontSize: "12px", textAlign: "right" },
    sizeMuted: { fontFamily: tokens.fontFamilyMonospace, fontSize: "12px", textAlign: "right", color: tokens.colorNeutralForeground3 },
    instr: {
        fontFamily: tokens.fontFamilyMonospace,
        fontSize: "12px",
        overflow: "hidden",
        textOverflow: "ellipsis",
        whiteSpace: "nowrap",
    },
    track: { height: "14px", backgroundColor: tokens.colorNeutralBackground3, ...shorthands.borderRadius("3px"), overflow: "hidden" },
    fill: { height: "100%", backgroundColor: tokens.colorBrandBackground },
    fillHot: { height: "100%", backgroundColor: tokens.colorPaletteDarkOrangeBackground3 },
    muted: { color: tokens.colorNeutralForeground3, fontStyle: "italic", ...shorthands.padding("12px") },
});

const fmtBytes = (n) => {
    if (!Number.isFinite(n) || n <= 0) return "—";
    const units = ["B", "KB", "MB", "GB"];
    let value = n;
    let i = 0;
    while (value >= 1000 && i < units.length - 1) { value /= 1000; i += 1; }
    return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

export function LayersView({ item, client, onBack, onNotify }) {
    const styles = useStyles();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);
    const [bySize, setBySize] = useState(false);
    const [hideEmpty, setHideEmpty] = useState(true);

    const ref = item.ref && item.ref !== "<none>:<none>" ? item.ref : item.id;

    const load = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            setData(await client.imageLayers.query({ ref }));
        } catch (e) {
            setError(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    }, [client, ref]);

    useEffect(() => { load(); }, [load]);

    const rows = useMemo(() => {
        if (!data) return [];
        const list = hideEmpty ? data.layers.filter((l) => !l.empty) : data.layers;
        return bySize ? [...list].sort((a, b) => b.sizeBytes - a.sizeBytes) : list;
    }, [data, bySize, hideEmpty]);

    // Bars are scaled against the largest layer, not the image total: with one
    // dominant layer everything else would round to an invisible sliver and the
    // chart would say less than the numbers already do.
    const peak = useMemo(() => rows.reduce((max, l) => Math.max(max, l.sizeBytes || 0), 0), [rows]);

    const copyDockerfile = async () => {
        const text = (data?.layers ?? []).map((l) => l.instruction).join("\n");
        try {
            await navigator.clipboard.writeText(text);
            onNotify?.("success", "Layer instructions copied.");
        } catch {
            onNotify?.("error", "Could not copy.");
        }
    };

    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{ref}</Title3>
                {busy ? <Spinner size="tiny" /> : null}
            </div>

            {error ? <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar> : null}

            {data ? (
                <>
                    <div className={styles.summary}>
                        <div className={styles.stat}>
                            <Caption1>Total</Caption1>
                            <span className={styles.statValue}>{fmtBytes(data.totalBytes)}</span>
                        </div>
                        <div className={styles.stat}>
                            <Caption1>Layers with size</Caption1>
                            <span className={styles.statValue}>{data.countSized} / {data.countAll}</span>
                        </div>
                        <div className={styles.stat}>
                            <Caption1>Largest layer</Caption1>
                            <span className={styles.statValue}>
                                {fmtBytes(peak)}
                                {data.totalBytes > 0 ? ` (${Math.round((peak / data.totalBytes) * 100)}%)` : ""}
                            </span>
                        </div>
                    </div>

                    <div className={styles.bar}>
                        <Switch
                            checked={hideEmpty}
                            onChange={(_, d) => setHideEmpty(d.checked)}
                            label="Hide zero-byte layers"
                        />
                        <Tooltip content="Build order is how the Dockerfile reads; by size is how to find the problem" relationship="label">
                            <Switch
                                checked={bySize}
                                onChange={(_, d) => setBySize(d.checked)}
                                label="Sort by size"
                            />
                        </Tooltip>
                        <span className={styles.grow} />
                        <Button size="small" appearance="subtle" icon={<CopyRegular />} onClick={copyDockerfile}>
                            Copy instructions
                        </Button>
                    </div>

                    <div className={styles.list}>
                        {rows.length === 0 ? (
                            <div className={styles.muted}>No layers to show.</div>
                        ) : rows.map((layer) => {
                            const share = peak > 0 ? (layer.sizeBytes / peak) * 100 : 0;
                            // A layer that is most of the image is the answer to
                            // "why is this big", so it is coloured differently.
                            const hot = data.totalBytes > 0 && layer.sizeBytes / data.totalBytes >= 0.25;
                            return (
                                <div key={`${layer.index}-${layer.shortId ?? "x"}`} className={styles.row}>
                                    <span className={styles.idx}>{layer.index}</span>
                                    <span className={layer.empty ? styles.sizeMuted : styles.size}>{fmtBytes(layer.sizeBytes)}</span>
                                    <div className={styles.track}>
                                        <div className={hot ? styles.fillHot : styles.fill} style={{ width: `${share}%` }} />
                                    </div>
                                    <Tooltip content={layer.instruction} relationship="label" withArrow>
                                        <span className={styles.instr}>
                                            <Badge appearance="tint" color={layer.empty ? "subtle" : "informative"} size="small">
                                                {layer.verb}
                                            </Badge>
                                            {" "}
                                            {layer.instruction.replace(/^\w+\s+/, "")}
                                        </span>
                                    </Tooltip>
                                </div>
                            );
                        })}
                    </div>
                </>
            ) : null}
        </div>
    );
}
