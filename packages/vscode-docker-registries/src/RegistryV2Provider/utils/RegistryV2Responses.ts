/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Base interface for all V2 registry responses
 */
export interface RegistryV2Response<T> {
    status: number;
    statusText: string;
    succeeded: boolean;
    headers: { [key: string]: string };
    body: T;
}

/**
 * Base interface for the body of V2 registry responses
 */
export interface RegistryV2ResponseBody {
    errors?: RegistryV2BodyError[];
}

/**
 * Interface for V2 registry request errors
 */
export interface RegistryV2BodyError {
    code?: string;
    message?: string;
    detail?: string;
}

/**
 * Interface for V2 registry catalog responses
 */
export interface RegistryV2CatalogResponseBody extends RegistryV2ResponseBody {
    repositories: string[];
}

/**
 * Interface for V2 registry tag list responses
 */
export interface RegistryV2TagsResponseBody extends RegistryV2ResponseBody {
    tags: string[];
}

/**
 * Interface for V2 registry manifest responses
 */
export interface RegistryV2ManifestResponseBody extends RegistryV2ResponseBody {
    tag: string;
    history?: V1Compatibility[];
}

/**
 * Interface for the `V1Compatibility` field on manifest responses
 */
export interface V1Compatibility {
    v1Compatibility?: string;
}

/**
 * Interface for the body of the `V1Compatibility` field on manifest responses. Not exhaustive.
 */
export interface V1CompatibilityBody {
    created?: string;
}
