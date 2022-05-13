/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken } from "vscode";
import { RegistryV2 } from "./RegistryV2";
import { CachingRegistryProviderBase } from "../CachingProvider/CachingRegistryProviderBase";

/**
 * Base class for V2 registry provider. This does not implement `connectRegistry` which requires UI prompts.
 */
export abstract class RegistryV2ProviderBase extends CachingRegistryProviderBase {
    // @inheritdoc
    public readonly label = 'Generic Registry V2';
    // @inheritdoc
    public readonly contextValue = 'RegistryV2Provider;';
    // @inheritdoc
    public readonly providerId = 'GenericV2';

    /**
     * Constructs a new `DockerRegistry` object
     */
    protected readonly registryConstructor = RegistryV2;

    // @inheritdoc
    protected abstract connectRegistryImpl(registryId: string, token: CancellationToken): Promise<RegistryV2>;
}
