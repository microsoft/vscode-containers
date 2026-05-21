/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { callWithTelemetryAndErrorHandling, IActionContext } from '@microsoft/vscode-azext-utils';
import * as fs from 'fs';
import * as path from 'path';
import * as vscode from 'vscode';
import { configPrefix } from '../constants';
import { ext } from '../extensionVariables';

const DEFAULT_JSON_DETECTION_MAX_BYTES = 8 * 1024 * 1024;
const JSON_DETECTION_MAX_BYTES_SETTING = 'oci.jsonDetectionMaxBytes';

// Matches "<algorithm>:<hash>" for the digest formats we care about.
const DIGEST_PATTERN = /\b(sha256|sha384|sha512):([a-fA-F0-9]+)\b/g;

interface DescriptorInfo {
    mediaType?: string;
    size?: number;
    artifactType?: string;
    platform?: { os?: string; architecture?: string; variant?: string };
    annotations?: Record<string, string>;
}

function getJsonDetectionMaxBytes(): number {
    const configured = vscode.workspace
        .getConfiguration(configPrefix)
        .get<number>(JSON_DETECTION_MAX_BYTES_SETTING, DEFAULT_JSON_DETECTION_MAX_BYTES);

    if (typeof configured !== 'number' || !Number.isFinite(configured) || configured <= 0) {
        return DEFAULT_JSON_DETECTION_MAX_BYTES;
    }

    return Math.floor(configured);
}

function isLikelyOciDescriptorPath(fsPath: string): boolean {
    const normalized = fsPath.replace(/\\/g, '/');
    if (normalized.endsWith('/index.json') || normalized.endsWith('/oci-layout')) {
        return true;
    }

    return /\/blobs\/[^/]+\/[^/]+$/.test(normalized);
}

function isJsonDocumentContent(text: string): boolean {
    const trimmed = text.trim();
    if (!trimmed) {
        return false;
    }

    const firstChar = trimmed[0];
    if (firstChar !== '{' && firstChar !== '[') {
        return false;
    }

    try {
        JSON.parse(trimmed);
        return true;
    } catch {
        return false;
    }
}

async function ensureJsonLanguageForOciDocument(document: vscode.TextDocument): Promise<void> {
    if (document.uri.scheme !== 'file') {
        return;
    }

    if (document.languageId === 'json' || !isLikelyOciDescriptorPath(document.uri.fsPath)) {
        return;
    }

    try {
        const stat = await vscode.workspace.fs.stat(document.uri);
        if (stat.size > getJsonDetectionMaxBytes()) {
            return;
        }
    } catch {
        return;
    }

    if (!isJsonDocumentContent(document.getText())) {
        return;
    }

    await vscode.languages.setTextDocumentLanguage(document, 'json');
}

function findLayoutRootForPath(fsPath: string): string | undefined {
    let current = path.dirname(fsPath);
    let previous: string | undefined;

    while (current && current !== previous) {
        try {
            if (
                fs.existsSync(path.join(current, 'oci-layout')) &&
                fs.existsSync(path.join(current, 'index.json')) &&
                fs.existsSync(path.join(current, 'blobs'))
            ) {
                return current;
            }
        } catch {
            // ignore and walk up
        }
        previous = current;
        current = path.dirname(current);
    }

    return undefined;
}

function findDigestAtPosition(
    document: vscode.TextDocument,
    position: vscode.Position
): { range: vscode.Range; algorithm: string; hash: string } | undefined {
    const lineText = document.lineAt(position.line).text;
    DIGEST_PATTERN.lastIndex = 0;

    let match: RegExpExecArray | null;
    while ((match = DIGEST_PATTERN.exec(lineText)) !== null) {
        const start = match.index;
        const end = start + match[0].length;
        if (position.character >= start && position.character <= end) {
            return {
                range: new vscode.Range(position.line, start, position.line, end),
                algorithm: match[1].toLowerCase(),
                hash: match[2].toLowerCase(),
            };
        }
    }

    return undefined;
}

function findDescriptorByDigest(node: unknown, digest: string): DescriptorInfo | undefined {
    if (Array.isArray(node)) {
        for (const item of node) {
            const found = findDescriptorByDigest(item, digest);
            if (found) {
                return found;
            }
        }
        return undefined;
    }

    if (node && typeof node === 'object') {
        const obj = node as Record<string, unknown>;
        if (typeof obj.digest === 'string' && obj.digest.toLowerCase() === digest.toLowerCase()) {
            return {
                mediaType: typeof obj.mediaType === 'string' ? obj.mediaType : undefined,
                size: typeof obj.size === 'number' ? obj.size : undefined,
                artifactType:
                    typeof obj.artifactType === 'string' ? obj.artifactType : undefined,
                platform:
                    obj.platform && typeof obj.platform === 'object'
                        ? (obj.platform as DescriptorInfo['platform'])
                        : undefined,
                annotations:
                    obj.annotations && typeof obj.annotations === 'object'
                        ? (obj.annotations as Record<string, string>)
                        : undefined,
            };
        }

        for (const value of Object.values(obj)) {
            const found = findDescriptorByDigest(value, digest);
            if (found) {
                return found;
            }
        }
    }

    return undefined;
}

function mediaTypeToKind(mediaType: string | undefined): string | undefined {
    if (!mediaType) {
        return undefined;
    }

    const lower = mediaType.toLowerCase();

    if (lower.includes('image.index') || lower.includes('manifest.list')) {
        return vscode.l10n.t('Image Index / Manifest List');
    }
    if (lower.includes('image.manifest') || lower.endsWith('manifest.v2+json')) {
        return vscode.l10n.t('Image Manifest');
    }
    if (lower.includes('image.config') || lower.includes('container.image.v1+json')) {
        return vscode.l10n.t('Image Config');
    }
    if (lower.includes('layer')) {
        if (lower.includes('gzip')) {
            return vscode.l10n.t('Layer (gzip)');
        }
        if (lower.includes('zstd')) {
            return vscode.l10n.t('Layer (zstd)');
        }
        if (lower.includes('+tar')) {
            return vscode.l10n.t('Layer (tar)');
        }
        return vscode.l10n.t('Layer');
    }
    if (lower.includes('artifact.manifest')) {
        return vscode.l10n.t('Artifact Manifest');
    }
    if (lower.includes('signature') || lower.includes('cosign')) {
        return vscode.l10n.t('Signature');
    }
    if (lower.includes('sbom') || lower.includes('spdx') || lower.includes('cyclonedx')) {
        return vscode.l10n.t('SBOM');
    }
    if (lower === 'application/vnd.in-toto+json' || lower.startsWith('application/vnd.in-toto')) {
        return vscode.l10n.t('In-Toto Attestation');
    }

    return undefined;
}

function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes < 0) {
        return `${bytes}`;
    }

    const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
    let value = bytes;
    let unitIndex = 0;
    while (value >= 1024 && unitIndex < units.length - 1) {
        value /= 1024;
        unitIndex += 1;
    }

    if (unitIndex === 0) {
        return `${bytes} ${units[unitIndex]}`;
    }

    const display = value.toFixed(value < 10 ? 2 : 1);
    return `${display} ${units[unitIndex]} (${vscode.l10n.t('{0} bytes', bytes)})`;
}

function tryParseDocumentJson(document: vscode.TextDocument): unknown | undefined {
    try {
        return JSON.parse(document.getText());
    } catch {
        return undefined;
    }
}

function resolveBlobUri(
    document: vscode.TextDocument,
    algorithm: string,
    hash: string
): vscode.Uri | undefined {
    const layoutRoot = findLayoutRootForPath(document.uri.fsPath);
    if (!layoutRoot) {
        return undefined;
    }

    const target = path.join(layoutRoot, 'blobs', algorithm, hash);
    if (!fs.existsSync(target)) {
        return undefined;
    }

    return vscode.Uri.file(target);
}

class OciDescriptorDefinitionProvider implements vscode.DefinitionProvider {
    public provideDefinition(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.DefinitionLink[]> {
        if (!isLikelyOciDescriptorPath(document.uri.fsPath)) {
            return undefined;
        }

        const digest = findDigestAtPosition(document, position);
        if (!digest) {
            return undefined;
        }

        const targetUri = resolveBlobUri(document, digest.algorithm, digest.hash);
        if (!targetUri) {
            return undefined;
        }

        const link: vscode.DefinitionLink = {
            originSelectionRange: digest.range,
            targetUri,
            targetRange: new vscode.Range(0, 0, 0, 0),
        };
        return [link];
    }
}

class OciDescriptorHoverProvider implements vscode.HoverProvider {
    public provideHover(
        document: vscode.TextDocument,
        position: vscode.Position
    ): vscode.ProviderResult<vscode.Hover> {
        if (!isLikelyOciDescriptorPath(document.uri.fsPath)) {
            return undefined;
        }

        const digest = findDigestAtPosition(document, position);
        if (!digest) {
            return undefined;
        }

        const fullDigest = `${digest.algorithm}:${digest.hash}`;
        const parsed = tryParseDocumentJson(document);
        const descriptor =
            parsed !== undefined ? findDescriptorByDigest(parsed, fullDigest) : undefined;

        const targetUri = resolveBlobUri(document, digest.algorithm, digest.hash);

        const lines: string[] = [`**${vscode.l10n.t('OCI Descriptor')}**`, ''];

        const kind = mediaTypeToKind(descriptor?.mediaType);
        if (kind) {
            lines.push(`- **${vscode.l10n.t('Kind')}**: ${kind}`);
        }
        if (descriptor?.mediaType) {
            lines.push(`- **${vscode.l10n.t('Media Type')}**: \`${descriptor.mediaType}\``);
        }
        if (descriptor?.artifactType) {
            lines.push(`- **${vscode.l10n.t('Artifact Type')}**: \`${descriptor.artifactType}\``);
        }
        if (descriptor?.mediaType?.toLowerCase() === 'application/vnd.in-toto+json') {
            const predicateType = descriptor.annotations?.['in-toto.io/predicate-type'];
            if (predicateType) {
                lines.push(`- **${vscode.l10n.t('Predicate Type')}**: \`${predicateType}\``);
            }
        }
        if (typeof descriptor?.size === 'number') {
            lines.push(`- **${vscode.l10n.t('Size')}**: ${formatBytes(descriptor.size)}`);
        }
        if (descriptor?.platform) {
            const { os, architecture, variant } = descriptor.platform;
            const parts = [os, architecture, variant].filter(Boolean).join('/');
            if (parts) {
                lines.push(`- **${vscode.l10n.t('Platform')}**: \`${parts}\``);
            }
        }
        lines.push(`- **${vscode.l10n.t('Digest')}**: \`${fullDigest}\``);

        if (targetUri) {
            const openArgs = encodeURIComponent(JSON.stringify([targetUri.toString()]));
            lines.push('', `[${vscode.l10n.t('Open blob')}](command:vscode.open?${openArgs})`);
        } else {
            lines.push('', `_${vscode.l10n.t('Target blob not found in the layout.')}_`);
        }

        const markdown = new vscode.MarkdownString(lines.join('\n'));
        markdown.isTrusted = true;
        markdown.supportHtml = false;

        return new vscode.Hover(markdown, digest.range);
    }
}

export function registerOciSupport(): void {
    void Promise.all(
        vscode.workspace.textDocuments.map((document) =>
            ensureJsonLanguageForOciDocument(document)
        )
    );

    const selector: vscode.DocumentSelector = [
        { language: 'json', scheme: 'file', pattern: '**/index.json' },
        { language: 'json', scheme: 'file', pattern: '**/oci-layout' },
        { language: 'json', scheme: 'file', pattern: '**/blobs/*/*' },
    ];

    ext.context.subscriptions.push(
        vscode.workspace.onDidOpenTextDocument((document) => {
            void ensureJsonLanguageForOciDocument(document);
        }),
        vscode.languages.registerDefinitionProvider(selector, new OciDescriptorDefinitionProvider()),
        vscode.languages.registerHoverProvider(selector, new OciDescriptorHoverProvider())
    );

    // Restore the last opened OCI layout, if any
    void callWithTelemetryAndErrorHandling('vscode-containers.oci.restoreLayout', async (context: IActionContext) => {
        context.telemetry.suppressIfSuccessful = true;
        context.errorHandling.suppressDisplay = true;
        await ext.ociRoot.refresh(context);
    });
}
