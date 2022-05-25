/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerTag } from "../contracts/DockerTag";
import { CancellationToken, ThemeIcon } from "vscode";
import { RepositoryV2 } from "./RepositoryV2";
import { RegistryV2Response, RegistryV2ManifestResponseBody, V1CompatibilityBody } from "./utils/RegistryV2Responses";
import { registryV2Request } from "./utils/registryV2Request";

/**
 * Interface for tag manifests
 */
export interface Manifest {
    /**
     * The tag digest
     */
    digest: string;

    /**
     * The created date/time of the tag
     */
    created?: string;
}

/**
 * Tag implementation for generic V2 registries
 */
export class TagV2 implements DockerTag {
    // @inheritdoc
    public readonly contextValue = 'TagV2;';

    /**
     * The manifest for the tag (undefined until `getManifest` is called)
     */
    private manifest: Manifest | undefined;

    // @inheritdoc
    public get iconPath(): ThemeIcon {
        // Loading is done this way to avoid needing anything more than @types/vscode
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const themeIcon: new (id: string) => ThemeIcon = require('vscode').ThemeIcon;
        return new themeIcon('tag');
    }

    // @inheritdoc
    public get label(): string {
        return this.reference;
    }

    // @inheritdoc
    public get description(): string {
        return this.manifest?.created ?? '';
    }

    /**
     * Constructs a `TagV2` object
     * @param parent The parent repository
     * @param reference The tag reference (digest or name)
     */
    public constructor(public readonly parent: RepositoryV2, public readonly reference: string) {
    }

    // @inheritdoc
    public async delete(token: CancellationToken): Promise<void> {
        const manifest = await this.getManifest(token);

        if (!manifest) {
            throw new Error('Manifest not found.');
        }

        await registryV2Request('DELETE', this.parent.parent, `${this.parent.name}/manifests/${manifest.digest}`, `repository:${this.parent.name}:*`, token);
    }

    /**
     * Gets the manifest for the tag
     * @param token Cancellation token
     * @internal
     */
    public async getManifest(token: CancellationToken): Promise<Manifest> {
        if (!this.manifest) {
            const response: RegistryV2Response<RegistryV2ManifestResponseBody> = await registryV2Request('GET', this.parent.parent, `${this.parent.name}/manifests/${this.reference}`, `repository:${this.parent.name}:pull`, token);

            const v1BodyString: string | undefined = response.body.history?.[0]?.v1Compatibility;

            if (!v1BodyString) {
                throw new Error('Manifest not readable.');
            }

            const v1Body: V1CompatibilityBody = JSON.parse(v1BodyString);

            this.manifest = {
                digest: response.headers['docker-content-digest'],
                created: v1Body.created,
            };
        }

        return this.manifest;
    }
}
