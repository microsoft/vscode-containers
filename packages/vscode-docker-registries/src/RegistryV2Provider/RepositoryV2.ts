/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, ThemeIcon } from "vscode";
import { TagV2 } from "./TagV2";
import { RegistryV2Response, RegistryV2TagsResponseBody } from "./utils/RegistryV2Responses";
import { registryV2Request } from "./utils/registryV2Request";
import { RegistryV2 } from "./RegistryV2";
import { CachingRepositoryBase } from "../CachingProvider/CachingRepositoryBase";

/**
 * Repository implementation for generic V2 registries
 */
export class RepositoryV2 extends CachingRepositoryBase {
    // @inheritdoc
    public get contextValue(): string {
        if (this.parent.isMonolith) {
            return 'RepositoryV2;Monolith;';
        }

        return 'RepositoryV2;';
    }

    // @inheritdoc
    public get iconPath(): ThemeIcon {
        // Loading is done this way to avoid needing anything more than @types/vscode
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const themeIcon: new (id: string) => ThemeIcon = require('vscode').ThemeIcon;
        return new themeIcon('archive');
    }

    // @inheritdoc
    public get label(): string {
        return this.name;
    }

    /**
     * Constructs a `RepositoryV2` object
     * @param parent The parent registry
     * @param name The name of the repository
     */
    public constructor(public readonly parent: RegistryV2, public readonly name: string) {
        super();
    }

    // @inheritdoc
    public async delete(token: CancellationToken): Promise<void> {
        const tags = (await this.getTags(true, token)) as TagV2[];
        await Promise.all(tags.map(t => t.delete(token)));
    }

    /**
     * Disconnects this repository from the monolith repository list
     */
    public async disconnectMonolithRepository(): Promise<void> {
        return this.parent.disconnectMonolithRepository(this.name);
    }

    // @inheritdoc
    protected async getTagsImpl(token: CancellationToken): Promise<TagV2[]> {
        const response: RegistryV2Response<RegistryV2TagsResponseBody> = await registryV2Request('GET', this.parent, `${this.name}/tags/list`, `repository:${this.name}:pull`, token);
        const result = response.body.tags.map(t => new TagV2(this, t));
        await Promise.all(result.map(t => t.getManifest(token)));

        return result;
    }
}
