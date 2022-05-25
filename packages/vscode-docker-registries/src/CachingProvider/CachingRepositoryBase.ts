/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerRepository } from "../contracts/DockerRepository";
import { CancellationToken } from "vscode";
import { DockerTag } from "../contracts/DockerTag";

/**
 * Base class for a caching repository. Handles in-memory caching and cross-session memento caching.
 */
export abstract class CachingRepositoryBase implements DockerRepository {
    // @inheritdoc
    public abstract readonly label: string;
    // @inheritdoc
    public abstract readonly contextValue: string;

    /**
     * In-memory cache
     */
    private cache: DockerTag[] | undefined;

    // @inheritdoc
    public async getTags(refresh: boolean, token: CancellationToken): Promise<DockerTag[]> {
        if (refresh) {
            this.cache = undefined;
        }

        if (this.cache === undefined) {
            this.cache = await this.getTagsImpl(token);
        }

        return this.cache;
    }

    /**
     * Gets the tags for this repository from live data
     * @param token Cancellation token
     */
    protected abstract getTagsImpl(token: CancellationToken): Promise<DockerTag[]>;
}
