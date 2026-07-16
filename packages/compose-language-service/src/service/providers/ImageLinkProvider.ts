/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, DocumentLink, DocumentLinkParams } from 'vscode-languageserver';
import { isMap, isScalar, Scalar } from 'yaml';
import { ExtendedParams } from '../ExtendedParams';
import { getCurrentContext } from '../utils/ActionContext';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';
import { ProviderBase } from './ProviderBase';

// A path component (registry hostname, namespace segment, or repository name).
// Hostnames may include dots; repository names may include dots, underscores, dashes.
const PATH_COMPONENT_REGEX = /^[\w][.\w-]*$/;
const TAG_REGEX = /^[.\w-]+$/;
const DIGEST_REGEX = /^[\w.+-]+:[0-9a-f]+$/i;

// Docker Hub's explicit registry hostnames. A reference using any of these is treated
// the same as a bare Docker Hub reference (e.g. `docker.io/library/alpine` === `library/alpine`).
const DOCKER_HUB_REGISTRIES = new Set(['docker.io', 'index.docker.io', 'registry-1.docker.io']);

interface ParsedImageRef {
    /** Registry hostname (e.g. 'ghcr.io', 'mcr.microsoft.com'), or undefined for Docker Hub. */
    registry: string | undefined;
    /** Namespace path between registry and repository (e.g. 'library', 'owner', 'dotnet/core'), or undefined. */
    namespace: string | undefined;
    /** Repository / image name (e.g. 'alpine', 'sdk'). */
    imageName: string;
    /** Optional tag (without the leading colon). */
    tag: string | undefined;
    /** Length of everything except the optional ':tag' suffix — i.e. the part the link should cover. */
    pathLength: number;
}

/**
 * A path component before the first `/` is treated as a registry hostname iff it
 * contains a `.` (domain), contains a `:` (host:port), is exactly `localhost`, or
 * contains an uppercase character (repository namespaces are always lowercase, so an
 * uppercase first component signals a registry host). This matches Docker's reference
 * resolution rules.
 * @see https://github.com/distribution/reference
 */
function isRegistryHost(component: string): boolean {
    return component.includes('.') || component.includes(':') || component === 'localhost' || component !== component.toLowerCase();
}

export function parseImageRef(image: string): ParsedImageRef | undefined {
    if (!image || /\s/.test(image)) {
        return undefined;
    }

    // Split off an optional @digest suffix first (e.g. `@sha256:...`). The digest never
    // forms part of the link target, so it is validated then dropped.
    const atIndex = image.indexOf('@');
    const digest = atIndex >= 0 ? image.substring(atIndex + 1) : undefined;
    const ref = atIndex >= 0 ? image.substring(0, atIndex) : image;

    if (digest !== undefined && !DIGEST_REGEX.test(digest)) {
        return undefined;
    }

    // Split off optional :tag — the tag is the suffix after the last ':' in the
    // final '/'-separated component (so a ':' inside a registry host:port portion
    // is not mistaken for a tag separator).
    const lastSlash = ref.lastIndexOf('/');
    const nameAndTag = lastSlash >= 0 ? ref.substring(lastSlash + 1) : ref;
    const pathPrefix = lastSlash >= 0 ? ref.substring(0, lastSlash) : '';

    const tagColon = nameAndTag.indexOf(':');
    const imageName = tagColon >= 0 ? nameAndTag.substring(0, tagColon) : nameAndTag;
    const tag = tagColon >= 0 ? nameAndTag.substring(tagColon + 1) : undefined;

    if (!PATH_COMPONENT_REGEX.test(imageName)) {
        return undefined;
    }
    if (tag !== undefined && !TAG_REGEX.test(tag)) {
        return undefined;
    }

    // The link covers the registry/namespace/name path only — excluding both the
    // :tag and @digest suffixes.
    const pathLength = ref.length - (tag !== undefined ? tag.length + 1 : 0);

    const pathParts = pathPrefix ? pathPrefix.split('/') : [];

    // Reject path components that don't look like valid hostname/namespace segments.
    // Registry hosts can include `:` (for port); namespace segments cannot.
    for (let i = 0; i < pathParts.length; i++) {
        const part = pathParts[i];
        const allowColon = i === 0 && isRegistryHost(part);
        const partRegex = allowColon ? /^[\w][.\w:-]*$/ : PATH_COMPONENT_REGEX;
        if (!partRegex.test(part)) {
            return undefined;
        }
    }

    let registry: string | undefined;
    let namespace: string | undefined;

    if (pathParts.length === 0) {
        // Plain `alpine` — Docker Hub official image.
    } else if (isRegistryHost(pathParts[0])) {
        registry = pathParts[0];
        if (pathParts.length > 1) {
            namespace = pathParts.slice(1).join('/');
        }
    } else {
        // No explicit registry — everything is a Docker Hub namespace path.
        // Docker Hub only supports a single namespace level (`user/repo`), so reject deeper paths.
        if (pathParts.length > 1) {
            return undefined;
        }
        namespace = pathParts[0];
    }

    return { registry, namespace, imageName, tag, pathLength };
}

function buildLinkUri(ref: ParsedImageRef, imageTypes: Set<string>): string | undefined {
    // Registry hostnames are case-insensitive; normalize before matching known registries.
    const registry = ref.registry?.toLowerCase();

    // Docker Hub — either no registry hostname in the reference, or one of Docker Hub's
    // explicit hostnames. Docker Hub only supports a single namespace level, so skip deeper paths.
    if (registry === undefined || DOCKER_HUB_REGISTRIES.has(registry)) {
        if (ref.namespace === undefined) {
            imageTypes.add('dockerHub');
            return `https://hub.docker.com/_/${ref.imageName}`;
        }
        if (ref.namespace.includes('/')) {
            return undefined;
        }
        imageTypes.add('dockerHubNamespaced');
        return `https://hub.docker.com/r/${ref.namespace}/${ref.imageName}`;
    }

    // Microsoft Container Registry — images are mirrored to a Docker Hub page
    // under the `microsoft-<namespace>-<name>` convention.
    if (registry === 'mcr.microsoft.com' && ref.namespace !== undefined) {
        imageTypes.add('mcr');
        return `https://hub.docker.com/_/microsoft-${ref.namespace.replace(/\//g, '-')}-${ref.imageName}`;
    }

    // GitHub Container Registry — link to the package page on github.com.
    // Only the `ghcr.io/<owner>/<package>` form maps cleanly; deeper paths are skipped.
    if (registry === 'ghcr.io' && ref.namespace !== undefined && !ref.namespace.includes('/')) {
        imageTypes.add('ghcr');
        return `https://github.com/${ref.namespace}/${ref.imageName}/pkgs/container/${ref.imageName}`;
    }

    // Quay.io — link to the public repository page.
    if (registry === 'quay.io' && ref.namespace !== undefined && !ref.namespace.includes('/')) {
        imageTypes.add('quay');
        return `https://quay.io/repository/${ref.namespace}/${ref.imageName}`;
    }

    return undefined;
}


export class ImageLinkProvider extends ProviderBase<DocumentLinkParams & ExtendedParams, DocumentLink[] | undefined, never, never> {
    public on(params: DocumentLinkParams & ExtendedParams, token: CancellationToken): Promise<DocumentLink[] | undefined> {
        const ctx = getCurrentContext();
        ctx.telemetry.properties.isActivationEvent = 'true'; // This happens automatically so we'll treat it as isActivationEvent === true

        const results: DocumentLink[] = [];
        const imageTypes = new Set<string>();

        const serviceMap = params.document.yamlDocument.value.getIn(['services']);
        if (isMap(serviceMap)) {
            for (const service of serviceMap.items) {
                // Within each loop we'll check for cancellation (though this is expected to be very fast)
                if (token.isCancellationRequested) {
                    return Promise.resolve(undefined);
                }

                if (isMap(service.value)) {
                    const image = service.value.getIn(['image'], true);
                    const hasBuild = service.value.has('build');
                    if (!hasBuild && isScalar(image) && typeof image.value === 'string') {
                        const quoteOffset = (image.type === Scalar.QUOTE_SINGLE || image.type === Scalar.QUOTE_DOUBLE) ? 1 : 0; // Offset if the scalar is quoted
                        const link = ImageLinkProvider.getLinkForImage(image.value, imageTypes);

                        if (link && image.range) {
                            results.push(DocumentLink.create(yamlRangeToLspRange(params.document.textDocument, [quoteOffset + image.range[0] + link.start, quoteOffset + image.range[0] + link.start + link.length]), link.uri));
                        }
                    }
                }
            }
        }

        ctx.telemetry.properties.imageTypes = Array.from(imageTypes.values()).sort().join(',');

        return Promise.resolve(results);
    }

    private static getLinkForImage(image: string, imageTypes: Set<string>): { uri: string, start: number, length: number } | undefined {
        const ref = parseImageRef(image);
        if (!ref) {
            return undefined;
        }

        const uri = buildLinkUri(ref, imageTypes);
        if (!uri) {
            return undefined;
        }

        return { uri, start: 0, length: ref.pathLength };
    }
}
