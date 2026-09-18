/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/
// What is known about an image's Dockerfile.
//
// The whole design problem here is one distinction, and getting it wrong would
// make this feature actively harmful:
//
//   PROVENANCE is retrieval. A SLSA attestation or an OCI source label names
//   the real repository, commit and path. That is a fact about the image.
//
//   RECONSTRUCTION is inference. `docker history` replays the instructions
//   baked into the layers. It reads like a Dockerfile and is genuinely useful,
//   but it is not the file anyone wrote and cannot be: multi-stage builds leave
//   no trace of earlier stages, COPY sources are content hashes, and comments,
//   formatting and build args were never stored.
//
// So the two are shown separately, the reconstruction is always labelled, and
// the caveats listed are the ones that actually apply to this image rather than
// a generic disclaimer nobody reads.

import { useCallback, useEffect, useState } from "react";
import {
    Badge,
    Body1,
    Button,
    Caption1,
    MessageBar,
    MessageBarBody,
    Spinner,
    Subtitle2,
    Title3,
    makeStyles,
    shorthands,
    tokens,
} from "@fluentui/react-components";
import { ArrowLeftRegular, CopyRegular, CheckmarkCircleRegular, WarningRegular } from "@fluentui/react-icons";

import { CodeView } from "./CodeView.jsx";

const useStyles = makeStyles({
    head: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("12px", "0", "8px") },
    grow: { grow: 1, flexGrow: 1 },
    block: { ...shorthands.padding("0", "0", "12px") },
    sourceCard: {
        display: "flex",
        flexDirection: "column",
        rowGap: "4px",
        ...shorthands.padding("10px", "12px"),
        ...shorthands.borderRadius(tokens.borderRadiusMedium),
        ...shorthands.border("1px", "solid", tokens.colorNeutralStroke2),
        backgroundColor: tokens.colorNeutralBackground2,
    },
    mono: { fontFamily: tokens.fontFamilyMonospace, wordBreak: "break-all" },
    caveats: { ...shorthands.margin("0"), ...shorthands.padding("0", "0", "0", "18px"), color: tokens.colorNeutralForeground3 },
    sectionHead: { display: "flex", alignItems: "center", columnGap: "8px", ...shorthands.padding("4px", "0", "6px") },
});

/**
 * A SLSA configSource uri is `<repo>#<commit>:<subdir>`. Split it so the commit
 * and path are readable instead of buried in one long string.
 */
function splitSourceUri(uri) {
    const hash = String(uri ?? "").indexOf("#");
    if (hash === -1) return { repo: uri, commit: null, subdir: null };
    const repo = uri.slice(0, hash);
    const rest = uri.slice(hash + 1);
    const colon = rest.indexOf(":");
    return colon === -1
        ? { repo, commit: rest, subdir: null }
        : { repo, commit: rest.slice(0, colon), subdir: rest.slice(colon + 1) };
}

/** A browsable URL for the recorded source, when the host is one we can link. */
function browseUrl(uri, entryPoint) {
    const { repo, commit, subdir } = splitSourceUri(uri);
    const gh = /^https?:\/\/github\.com\/([^/]+\/[^/.]+)/.exec(String(repo ?? ""));
    if (!gh || !commit) return null;
    const path = [subdir, entryPoint].filter(Boolean).join("/");
    return `https://github.com/${gh[1]}/blob/${commit}/${path || "Dockerfile"}`;
}

export function DockerfileView({ item, client, onBack, onNotify }) {
    const styles = useStyles();
    const [data, setData] = useState(null);
    const [error, setError] = useState(null);
    const [busy, setBusy] = useState(false);

    const ref = item.ref && item.ref !== "<none>:<none>" ? item.ref : item.id;

    const load = useCallback(async () => {
        setBusy(true);
        setError(null);
        try {
            setData(await client.dockerfile.query({ ref }));
        } catch (e) {
            setError(String(e?.message ?? e));
        } finally {
            setBusy(false);
        }
    }, [client, ref]);

    useEffect(() => { load(); }, [load]);

    const copy = async () => {
        try {
            await navigator.clipboard.writeText(data?.reconstructed?.text ?? "");
            onNotify?.("success", "Reconstruction copied.");
        } catch {
            onNotify?.("error", "Could not copy.");
        }
    };

    const source = data?.provenance?.source ?? null;
    const parts = source ? splitSourceUri(source.uri) : null;
    const link = source ? browseUrl(source.uri, source.entryPoint) : null;

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
                    <div className={styles.block}>
                        <div className={styles.sectionHead}>
                            {source ? <CheckmarkCircleRegular /> : <WarningRegular />}
                            <Subtitle2>Recorded source</Subtitle2>
                            <Badge appearance="tint" color={source ? "success" : "subtle"}>
                                {source ? (source.kind === "slsa-provenance" ? "SLSA provenance" : "OCI label") : "none"}
                            </Badge>
                        </div>

                        {source ? (
                            <div className={styles.sourceCard}>
                                <Caption1>Repository</Caption1>
                                <Body1 className={styles.mono}>{parts.repo}</Body1>
                                {parts.commit ? (
                                    <>
                                        <Caption1>Commit</Caption1>
                                        <Body1 className={styles.mono}>{parts.commit}</Body1>
                                    </>
                                ) : null}
                                {source.platform ? (
                                    <>
                                        <Caption1>Platform</Caption1>
                                        <Body1 className={styles.mono}>{source.platform}</Body1>
                                    </>
                                ) : null}
                                {source.entryPoint || parts.subdir ? (
                                    <>
                                        <Caption1>Path</Caption1>
                                        <Body1 className={styles.mono}>
                                            {[parts.subdir, source.entryPoint].filter(Boolean).join("/")}
                                        </Body1>
                                    </>
                                ) : null}
                                {link ? (
                                    <Caption1>
                                        This is the actual Dockerfile that built the image:{" "}
                                        <a href={link} target="_blank" rel="noreferrer">{link}</a>
                                    </Caption1>
                                ) : (
                                    <Caption1>This is where the actual Dockerfile lives.</Caption1>
                                )}
                            </div>
                        ) : (
                            <MessageBar intent="warning">
                                <MessageBarBody>
                                    {data.provenance.notes[0]
                                        ?? "This image carries no provenance attestation or source label."}
                                </MessageBarBody>
                            </MessageBar>
                        )}
                    </div>

                    <div className={styles.sectionHead}>
                        <Subtitle2>Reconstructed from layer history</Subtitle2>
                        <Badge appearance="tint" color="warning">inferred</Badge>
                        <span className={styles.grow} />
                        <Button size="small" appearance="subtle" icon={<CopyRegular />} onClick={copy}>
                            Copy
                        </Button>
                    </div>

                    {/* Stated before the code, not after: someone scanning this
                        view has to hit the caveat before they trust the text. */}
                    <MessageBar intent="warning">
                        <MessageBarBody>
                            <strong>This is not the original Dockerfile.</strong> It is rebuilt from what the
                            image records, and the following could not be recovered:
                            <ul className={styles.caveats}>
                                {data.reconstructed.lossy.map((note) => <li key={note}>{note}</li>)}
                            </ul>
                        </MessageBarBody>
                    </MessageBar>

                    <CodeView
                        value={data.reconstructed.text}
                        language="dockerfile"
                        height="calc(100vh - 460px)"
                    />
                </>
            ) : null}
        </div>
    );
}
