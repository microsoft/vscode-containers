/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Interface for Docker credentials, used for `docker login` commands and authenticating to registries.
 */
export interface DockerCredentials {
    /**
     * The service the credentials are for
     */
    readonly service: string;

    /**
     * The username / account name
     */
    readonly account: string;

    /**
     * The secret (password, personal access token, etc.)
     */
    readonly secret: string;
}
