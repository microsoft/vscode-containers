/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as fs from 'fs';
import * as path from 'path';
import { l10n } from 'vscode';
import { OCI_METADATA_FILENAME } from './constants';

type JsonObject = Record<string, unknown>;

interface SafeJsonResult {
    json: JsonObject | null;
    parseError: string | null;
}

export interface Descriptor {
    digest?: string;
    mediaType?: string;
    size?: number;
    annotations?: Record<string, string> | null;
    artifactType?: string | null;
    platform?: {
        os?: string;
        architecture?: string;
        variant?: string;
    } | null;
}

export interface NodeRelation {
    relation: string;
    key: string;
}

export interface LayoutNode {
    key: string;
    name: string;
    label: string;
    displayName?: string;
    kind: string;
    digest?: string;
    mediaType?: string | null;
    size?: number | null;
    annotations?: Record<string, string> | null;
    artifactType?: string | null;
    platform?: {
        os?: string;
        architecture?: string;
        variant?: string;
    } | null;
    filePath?: string | null;
    exists: boolean;
    json?: JsonObject | null;
    parseError?: string | null;
    children: NodeRelation[];
}

export interface ParsedLayout {
    rootPath: string;
    layoutPath: string;
    indexPath: string;
    layoutVersion: string | null;
    nodes: LayoutNode[];
    nodesByKey: Record<string, LayoutNode>;
    roots: string[];
}

function pathHasType(filePath: string, type: 'isFile' | 'isDirectory'): boolean {
    try {
        return fs.statSync(filePath)[type]();
    } catch {
        return false;
    }
}

function safeReadJson(filePath: string): SafeJsonResult {
    try {
        return { json: JSON.parse(fs.readFileSync(filePath, 'utf8')) as JsonObject, parseError: null };
    } catch (error) {
        return { json: null, parseError: (error as Error).message };
    }
}

function isJsonMediaType(mediaType: string | undefined | null): boolean {
    if (!mediaType) {
        return true;
    }
    const lower = mediaType.toLowerCase();
    return lower.endsWith('+json') || lower.includes('json');
}

export function digestToPath(rootPath: string, digest: string | undefined): string | null {
    if (!digest || typeof digest !== 'string' || !digest.includes(':')) {
        return null;
    }

    const [algorithm, encoded] = digest.split(':', 2);
    if (!algorithm || !encoded) {
        return null;
    }

    return path.join(rootPath, 'blobs', algorithm, encoded);
}

export function isOciLayoutFolder(rootPath: string): boolean {
    return (
        pathHasType(path.join(rootPath, 'oci-layout'), 'isFile') &&
        pathHasType(path.join(rootPath, 'index.json'), 'isFile') &&
        pathHasType(path.join(rootPath, 'blobs'), 'isDirectory')
    );
}

function getReadableKind(mediaType: string | undefined, json: JsonObject | null): string {
    if (json && Array.isArray((json as Record<string, unknown>).manifests)) {
        return 'image-index';
    }

    if (
        json &&
        (json as Record<string, unknown>).config &&
        Array.isArray((json as Record<string, unknown>).layers)
    ) {
        return 'image-manifest';
    }

    if (
        mediaType === 'application/vnd.oci.image.config.v1+json' ||
        mediaType === 'application/vnd.docker.container.image.v1+json' ||
        (mediaType && mediaType.includes('config'))
    ) {
        return 'config';
    }

    if (mediaType && mediaType.includes('layer')) {
        return 'layer';
    }

    if (mediaType && mediaType.includes('index')) {
        return 'image-index';
    }

    if (mediaType && mediaType.includes('manifest')) {
        return 'image-manifest';
    }

    return 'blob';
}

function joinLabelParts(parts: Array<string | null | undefined>): string {
    return parts.filter(Boolean).join(' • ');
}

function getPlatformLabel(source: unknown): string | null {
    if (!source || typeof source !== 'object') {
        return null;
    }

    const sourceRecord = source as Record<string, string | undefined>;
    const os = sourceRecord.os && sourceRecord.os !== 'unknown' ? sourceRecord.os : undefined;
    const arch =
        sourceRecord.architecture && sourceRecord.architecture !== 'unknown'
            ? sourceRecord.architecture
            : undefined;
    const variant =
        sourceRecord.variant && sourceRecord.variant !== 'unknown' ? sourceRecord.variant : undefined;

    if (os && arch) {
        return `${os}/${arch}${variant ? `/${variant}` : ''}`;
    }

    return os || arch || null;
}

function getAttestationLabel(annotations: Record<string, string> | null | undefined): string | null {
    return annotations && annotations['vnd.docker.reference.type'] === 'attestation-manifest'
        ? l10n.t('attestation manifest')
        : null;
}

function getPredicateTypeAnnotation(annotations: Record<string, string> | null | undefined): string | null {
    if (!annotations || typeof annotations !== 'object') {
        return null;
    }

    return typeof annotations['in-toto.io/predicate-type'] === 'string'
        ? annotations['in-toto.io/predicate-type']
        : null;
}

function withPlatformLabel(baseLabel: string, platform: unknown): string {
    return joinLabelParts([baseLabel, getPlatformLabel(platform)]);
}

function toSlug(value: string): string {
    return String(value)
        .toLowerCase()
        .replace(/[^a-z0-9.]+/g, '-')
        .replace(/^[-.]+|[-.]+$/g, '');
}

function isSlsaProvenancePredicate(predicateType: string): boolean {
    try {
        const parsed = new URL(predicateType);
        return (
            parsed.hostname === 'slsa.dev' &&
            (parsed.pathname === '/provenance/v1' || parsed.pathname === '/provenance/v0.2')
        );
    } catch {
        return false;
    }
}

function isTrivyVulnerabilityPredicate(predicateType: string): boolean {
    try {
        const parsed = new URL(predicateType);
        return (
            parsed.hostname === 'trivy.dev' && parsed.pathname.startsWith('/attestations/vulnerability/')
        );
    } catch {
        return false;
    }
}

function isVexPredicate(predicateType: string): boolean {
    const normalized = predicateType.toLowerCase();

    if (normalized.includes('openvex')) {
        return true;
    }

    return /(^|[^a-z])vex([^a-z]|$)/.test(normalized);
}

function getInTotoDisplayLabel(node: LayoutNode): string | null {
    if (node.mediaType !== 'application/vnd.in-toto+json') {
        return null;
    }

    const predicateType =
        node.json && typeof (node.json as Record<string, unknown>).predicateType === 'string'
            ? String((node.json as Record<string, unknown>).predicateType).toLowerCase()
            : '';
    let baseLabel = l10n.t('attestation');

    if (isSlsaProvenancePredicate(predicateType)) {
        baseLabel = 'SLSA';
    } else if (isTrivyVulnerabilityPredicate(predicateType)) {
        baseLabel = l10n.t('Trivy Report');
    } else if (isVexPredicate(predicateType)) {
        baseLabel = 'VEX';
    } else if (predicateType === 'https://microsoft.com/spdx/v3.0') {
        baseLabel = l10n.t('MSFT-SBOM (SPDX)');
    } else if (predicateType.includes('spdx')) {
        baseLabel = l10n.t('SBOM (SPDX)');
    } else if (predicateType.includes('cyclonedx')) {
        baseLabel = l10n.t('SBOM (CycloneDX)');
    } else if (predicateType) {
        const leafSegment = predicateType.split('#').pop()?.split('/').pop() ?? '';
        baseLabel = joinLabelParts([l10n.t('attestation'), toSlug(leafSegment) || l10n.t('other')]);
    }

    return withPlatformLabel(baseLabel, node.platform);
}

function getHumanReadableName(node: LayoutNode): string {
    const inTotoLabel = getInTotoDisplayLabel(node);
    if (inTotoLabel) {
        return inTotoLabel;
    }

    if (node.kind === 'image-manifest') {
        const attestationLabel = getAttestationLabel(node.annotations);
        if (attestationLabel) {
            const predicateType = getPredicateTypeAnnotation(node.annotations);
            const baseLabel = predicateType
                ? isVexPredicate(predicateType)
                    ? 'VEX'
                    : joinLabelParts([attestationLabel, predicateType])
                : attestationLabel;
            return withPlatformLabel(baseLabel, node.platform) || node.name;
        }

        return (
            joinLabelParts([
                node.annotations && node.annotations['org.opencontainers.image.ref.name'],
                getPlatformLabel(node.platform),
            ]) || node.name
        );
    }

    if (node.kind === 'image-index') {
        const refName = node.annotations
            ? node.annotations['io.containerd.image.name'] ||
              node.annotations['org.opencontainers.image.ref.name']
            : null;

        if (refName) {
            return node.name === 'index.json' ? `index.json • ${refName}` : refName;
        }

        return node.name === 'index.json' ? node.name : l10n.t('image index');
    }

    if (node.kind === 'config') {
        return withPlatformLabel(l10n.t('image config'), node.json) || node.name;
    }

    if (node.kind === 'layer') {
        return node.annotations && node.annotations['org.opencontainers.image.title']
            ? l10n.t('layer • {0}', node.annotations['org.opencontainers.image.title'])
            : node.name;
    }

    return node.name;
}

function getNodeLabel(node: LayoutNode): string {
    if (node.displayName) {
        return node.displayName;
    }

    if (node.name) {
        return node.name;
    }

    if (node.digest) {
        return l10n.t('{0} {1}…', getKindDisplayLabel(node.kind), node.digest.slice(0, 19));
    }

    return getKindDisplayLabel(node.kind);
}

export function getKindDisplayLabel(kind: string): string {
    switch (kind) {
        case 'image-index':
            return l10n.t('image index');
        case 'image-manifest':
            return l10n.t('image manifest');
        case 'config':
            return l10n.t('config');
        case 'layer':
            return l10n.t('layer');
        case 'layout':
            return l10n.t('layout');
        case 'blob':
            return l10n.t('blob');
        default:
            return kind;
    }
}

function isDescriptor(value: unknown): value is Descriptor {
    return Boolean(
        value && typeof value === 'object' && typeof (value as Descriptor).digest === 'string'
    );
}

function createDescriptorNode(
    rootPath: string,
    descriptor: Descriptor,
    relationLabel: string,
    nodesByKey: Map<string, LayoutNode>,
    traversalStack: Set<string>
): string {
    const digest = descriptor && descriptor.digest;
    const key = digest
        ? `descriptor:${digest}`
        : `${relationLabel}:${Math.random().toString(16).slice(2)}`;

    if (nodesByKey.has(key)) {
        return key;
    }

    const filePath = digestToPath(rootPath, digest);
    const exists = Boolean(filePath && fs.existsSync(filePath));
    const jsonResult: SafeJsonResult | null =
        exists && filePath && isJsonMediaType(descriptor.mediaType) ? safeReadJson(filePath) : null;

    const node: LayoutNode = {
        key,
        name: relationLabel,
        label: relationLabel,
        kind: getReadableKind(descriptor.mediaType, jsonResult ? jsonResult.json : null),
        digest,
        mediaType: descriptor.mediaType || null,
        size: descriptor.size || null,
        annotations: descriptor.annotations || null,
        artifactType: descriptor.artifactType || null,
        platform: descriptor.platform || null,
        filePath,
        exists,
        json: jsonResult ? jsonResult.json : null,
        parseError: jsonResult ? jsonResult.parseError : null,
        children: [],
    };

    nodesByKey.set(key, node);

    if (!exists || !node.json || traversalStack.has(key)) {
        return key;
    }

    traversalStack.add(key);

    const jsonObject = node.json as Record<string, unknown>;
    const childDescriptors: Array<{ relation: string; descriptor: Descriptor }> = [];

    if (Array.isArray(jsonObject.manifests)) {
        (jsonObject.manifests as Descriptor[]).forEach((childDescriptor) => {
            childDescriptors.push({ relation: l10n.t('manifest'), descriptor: childDescriptor });
        });
    }

    if (isDescriptor(jsonObject.config)) {
        childDescriptors.push({ relation: l10n.t('config'), descriptor: jsonObject.config as Descriptor });
    }

    if (Array.isArray(jsonObject.layers)) {
        (jsonObject.layers as Descriptor[])
            .filter(isDescriptor)
            .forEach((childDescriptor, index) => {
                childDescriptors.push({ relation: l10n.t('layer {0}', index + 1), descriptor: childDescriptor });
            });
    }

    if (isDescriptor(jsonObject.subject)) {
        childDescriptors.push({ relation: l10n.t('subject'), descriptor: jsonObject.subject as Descriptor });
    }

    childDescriptors.forEach(({ relation, descriptor: childDescriptor }) => {
        const childKey = createDescriptorNode(
            rootPath,
            childDescriptor,
            relation,
            nodesByKey,
            traversalStack
        );
        node.children.push({ relation, key: childKey });
    });

    traversalStack.delete(key);
    return key;
}

export function parseLayout(rootPath: string): ParsedLayout {
    const layoutPath = path.join(rootPath, 'oci-layout');
    const indexPath = path.join(rootPath, 'index.json');

    if (!isOciLayoutFolder(rootPath)) {
        throw new Error(l10n.t("'{0}' is not an OCI layout folder.", rootPath));
    }

    const layoutJson = safeReadJson(layoutPath);
    const indexJson = safeReadJson(indexPath);

    const nodesByKey = new Map<string, LayoutNode>();
    const traversalStack = new Set<string>();

    const layoutNode: LayoutNode = {
        key: 'layout-file',
        name: 'oci-layout',
        label: 'oci-layout',
        kind: 'layout',
        filePath: layoutPath,
        exists: true,
        json: layoutJson.json,
        parseError: layoutJson.parseError,
        children: [],
    };

    const indexNode: LayoutNode = {
        key: 'index-file',
        name: 'index.json',
        label: 'index.json',
        kind: 'image-index',
        filePath: indexPath,
        exists: true,
        json: indexJson.json,
        parseError: indexJson.parseError,
        children: [],
    };

    nodesByKey.set(layoutNode.key, layoutNode);
    nodesByKey.set(indexNode.key, indexNode);

    const topLevelDescriptors = Array.isArray(
        indexNode.json && (indexNode.json as Record<string, unknown>).manifests
    )
        ? ((indexNode.json as Record<string, unknown>).manifests as Descriptor[])
        : [];

    topLevelDescriptors.forEach((descriptor) => {
        const childKey = createDescriptorNode(
            rootPath,
            descriptor,
            l10n.t('manifest'),
            nodesByKey,
            traversalStack
        );
        indexNode.children.push({ relation: l10n.t('manifest'), key: childKey });
    });

    const imageNames = topLevelDescriptors
        .map(
            (d) =>
                d.annotations &&
                (d.annotations['io.containerd.image.name'] ||
                    d.annotations['org.opencontainers.image.ref.name'])
        )
        .filter((name): name is string => Boolean(name));

    const uniqueNames = [...new Set(imageNames)];

    if (uniqueNames.length > 0) {
        indexNode.annotations = {
            'org.opencontainers.image.ref.name': uniqueNames.join(', '),
        };
    } else {
        const metadataPath = path.join(rootPath, OCI_METADATA_FILENAME);
        const metadataResult = pathHasType(metadataPath, 'isFile') ? safeReadJson(metadataPath) : null;
        const metadataJson = metadataResult?.json ?? null;

        if (metadataJson && typeof metadataJson.reference === 'string') {
            indexNode.annotations = {
                'org.opencontainers.image.ref.name': metadataJson.reference,
            };
        }
    }

    const collectDescendantKeys = (key: string, visited: Set<string>): void => {
        const node = nodesByKey.get(key);
        if (!node || visited.has(key)) {
            return;
        }
        visited.add(key);
        for (const child of node.children) {
            collectDescendantKeys(child.key, visited);
        }
    };

    const nestedKeys = new Set<string>();
    for (const child of indexNode.children) {
        const descendants = new Set<string>();
        collectDescendantKeys(child.key, descendants);
        descendants.delete(child.key);
        for (const key of descendants) {
            nestedKeys.add(key);
        }
    }

    indexNode.children = indexNode.children.filter((child) => !nestedKeys.has(child.key));

    const nodes = Array.from(nodesByKey.values()).map((node) => {
        const enrichedNode = {
            ...node,
            displayName: getHumanReadableName(node),
        };

        return {
            ...enrichedNode,
            label: getNodeLabel(enrichedNode),
        };
    });

    return {
        rootPath,
        layoutPath,
        indexPath,
        layoutVersion:
            layoutNode.json &&
            typeof (layoutNode.json as Record<string, unknown>).imageLayoutVersion === 'string'
                ? String((layoutNode.json as Record<string, unknown>).imageLayoutVersion)
                : null,
        nodes,
        nodesByKey: Object.fromEntries(nodes.map((node) => [node.key, node])),
        roots: [layoutNode.key, indexNode.key],
    };
}
