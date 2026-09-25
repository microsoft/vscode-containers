/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Live resource usage for one container.
//
// The reason this is a canvas feature and not a chat answer: CPU and memory are
// time series. "It is using 4% CPU" is nearly meaningless; "it has been flat at
// 4% for a minute" and "it spikes to 90% every few seconds" are different
// answers to the same question, and only one of them survives being flattened
// into a sentence.

import { useEffect, useMemo, useRef, useState } from "react";
import {
    Badge,
    Button,
    Caption1,
    Subtitle2,
    Title3,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { ArrowLeftRegular, PlayRegular, PauseRegular } from "@fluentui/react-icons";
import { panelHref } from "./panelUrl.js";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    grid: {
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        columnGap: "12px",
        rowGap: "12px",
        ...shorthands.padding("4px", "0", "12px"),
    },
    card: {
        ...shorthands.padding("12px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground2,
        display: "flex",
        flexDirection: "column",
        rowGap: "4px",
    },
    value: { fontFamily: tokens.fontFamilyMonospace, fontSize: "22px", lineHeight: "1.2" },
    sub: { color: tokens.colorNeutralForeground3 },
    spark: { display: "block", width: "100%", height: "44px", marginTop: "4px" },
    waiting: { color: tokens.colorNeutralForeground3, fontStyle: "italic", ...shorthands.padding("12px", "0") },
});

/** Samples retained per metric — about two minutes at one sample/second. */
const WINDOW = 120;

const fmtBytes = (n) => {
    if (n === null || n === undefined || !Number.isFinite(n)) return "—";
    const units = ["B", "KB", "MB", "GB", "TB"];
    let value = n;
    let i = 0;
    while (value >= 1000 && i < units.length - 1) { value /= 1000; i += 1; }
    return `${value < 10 && i > 0 ? value.toFixed(1) : Math.round(value)} ${units[i]}`;
};

/**
 * A sparkline.
 *
 * Two deliberate choices, both learned from the first version looking broken:
 *
 * Points spread across the full width rather than filling in from the right, so
 * a chart with ten samples reads as a chart rather than a stub in the corner.
 *
 * The vertical scale follows the observed peak with a floor, instead of a fixed
 * 0-100. A container idling at 0.4% against a 100% ceiling draws a flat line on
 * the axis, which shows nothing at all. Auto-scaling risks making idle noise
 * look dramatic, so every card states its real peak in words underneath -- the
 * shape is relative, the number is absolute.
 */
function Spark({ points, floor = 1, color }) {
    const styles = useStyles();
    if (points.length < 2) return <svg className={styles.spark} aria-hidden="true" />;
    const peak = Math.max(...points);
    const scale = Math.max(peak * 1.25, floor);
    const step = 100 / (points.length - 1);
    const path = points
        .map((value, i) => `${i === 0 ? "M" : "L"} ${(i * step).toFixed(2)} ${(100 - Math.min(100, (value / scale) * 100)).toFixed(2)}`)
        .join(" ");
    const area = `${path} L 100 100 L 0 100 Z`;
    return (
        <svg className={styles.spark} viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <path d={area} fill={color} opacity="0.18" />
            <path d={path} fill="none" stroke={color} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
        </svg>
    );
}

function Metric({ label, value, sub, points, floor, color }) {
    const styles = useStyles();
    return (
        <div className={styles.card}>
            <Caption1>{label}</Caption1>
            <span className={styles.value}>{value}</span>
            <Caption1 className={styles.sub}>{sub}</Caption1>
            <Spark points={points} floor={floor} color={color} />
        </div>
    );
}

export function StatsView({ item, onBack }) {
    const styles = useStyles();
    const [samples, setSamples] = useState([]);
    const [live, setLive] = useState(item.state === "running");
    const [error, setError] = useState(null);
    const sourceRef = useRef(null);

    useEffect(() => {
        if (!live) return undefined;
        setError(null);
        const source = new EventSource(panelHref("./stats", { id: item.id }));
        sourceRef.current = source;
        source.addEventListener("message", (event) => {
            let frame;
            try { frame = JSON.parse(event.data); } catch { return; }
            if (frame.type === "error") { setError(frame.message); return; }
            if (frame.type === "end") { setLive(false); return; }
            if (frame.type !== "sample") return;
            setSamples((prev) => {
                const next = [...prev, frame.sample];
                return next.length > WINDOW ? next.slice(-WINDOW) : next;
            });
        });
        source.addEventListener("error", () => {
            setError("Stats stream disconnected.");
            setLive(false);
        });
        return () => source.close();
    }, [live, item.id]);

    const latest = samples[samples.length - 1] ?? null;

    // Network and block I/O are cumulative totals, so the interesting number is
    // the rate. Differencing consecutive samples turns "1.3 kB transferred ever"
    // into "is it moving right now".
    const rates = useMemo(() => {
        const rx = [];
        const tx = [];
        for (let i = 1; i < samples.length; i++) {
            const dt = (samples[i].at - samples[i - 1].at) / 1000;
            if (dt <= 0) continue;
            rx.push(Math.max(0, (samples[i].netRx - samples[i - 1].netRx) / dt));
            tx.push(Math.max(0, (samples[i].netTx - samples[i - 1].netTx) / dt));
        }
        return { rx, tx };
    }, [samples]);

    const cpuPoints = samples.map((s) => s.cpu ?? 0);
    const memPoints = samples.map((s) => s.memPercent ?? 0);
    const cpuPeak = cpuPoints.length ? Math.max(...cpuPoints) : 0;

    return (
        <div>
            <div className={styles.head}>
                <Button appearance="subtle" icon={<ArrowLeftRegular />} onClick={onBack}>Back</Button>
                <Title3>{item.name ?? item.shortId}</Title3>
                <Badge appearance="filled" color={item.state === "running" ? "success" : "danger"}>{item.state}</Badge>
                <Button
                    appearance={live ? "primary" : "secondary"}
                    icon={live ? <PauseRegular /> : <PlayRegular />}
                    disabled={item.state !== "running"}
                    onClick={() => setLive((on) => !on)}
                >
                    {live ? "Sampling" : "Sample"}
                </Button>
            </div>

            {error ? <Caption1>{error}</Caption1> : null}

            {!latest ? (
                <div className={styles.waiting}>
                    {item.state === "running"
                        ? "Waiting for the first sample…"
                        : "This container is not running, so it has no resource usage to report."}
                </div>
            ) : (
                <>
                    <div className={styles.grid}>
                        <Metric
                            label="CPU"
                            value={`${(latest.cpu ?? 0).toFixed(2)}%`}
                            sub={`peak ${cpuPeak.toFixed(2)}% over ${samples.length}s`}
                            points={cpuPoints}
                            floor={1}
                            color={tokens.colorPaletteGreenForeground1}
                        />
                        <Metric
                            label="Memory"
                            value={fmtBytes(latest.memBytes)}
                            sub={`${(latest.memPercent ?? 0).toFixed(2)}% of ${fmtBytes(latest.memLimitBytes)}`}
                            points={memPoints}
                            floor={0.1}
                            color={tokens.colorBrandForeground1}
                        />
                        <Metric
                            label="Network in"
                            value={`${fmtBytes(rates.rx[rates.rx.length - 1] ?? 0)}/s`}
                            sub={`${fmtBytes(latest.netRx)} total`}
                            points={rates.rx}
                            floor={64}
                            color={tokens.colorPaletteBlueForeground2}
                        />
                        <Metric
                            label="Network out"
                            value={`${fmtBytes(rates.tx[rates.tx.length - 1] ?? 0)}/s`}
                            sub={`${fmtBytes(latest.netTx)} total`}
                            points={rates.tx}
                            floor={64}
                            color={tokens.colorPaletteDarkOrangeForeground1}
                        />
                    </div>
                    <Subtitle2>Also</Subtitle2>
                    <div className={styles.grid}>
                        <div className={styles.card}>
                            <Caption1>Processes</Caption1>
                            <span className={styles.value}>{latest.pids}</span>
                        </div>
                        <div className={styles.card}>
                            <Caption1>Block I/O</Caption1>
                            <span className={styles.value}>{fmtBytes(latest.blkRead)}</span>
                            <Caption1 className={styles.sub}>read · {fmtBytes(latest.blkWrite)} written</Caption1>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
