/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { RegistryV2ProviderBase } from "../../RegistryV2Provider/RegistryV2ProviderBase";
import { CancellationToken, Disposable, ExtensionContext } from "vscode";
import { RegistryV2 } from "../../RegistryV2Provider/RegistryV2";
import { DockerCredentials } from "../../contracts/DockerCredentials";
import { RegistryV2Simulator } from "./RegistryV2Simulator";
import { RepositoryV2 } from "../../RegistryV2Provider/RepositoryV2";
import { TagV2 } from "../../RegistryV2Provider/TagV2";
import { TestCancellationToken } from "../TestCancellationToken";
import { TestExtensionContext } from "../TestExtensionContext";

export class TestRegistryV2Provider extends RegistryV2ProviderBase implements Disposable {
    public get credentials(): DockerCredentials {
        return {
            service: this.simulator.registryUrl.toString(),
            account: 'test',
            secret: 'test',
        };
    }

    private constructor(public readonly simulator: RegistryV2Simulator, public readonly testExtensionContext: TestExtensionContext, private readonly registryIsMonolith: boolean) {
        super(testExtensionContext as unknown as ExtensionContext);
    }

    public async connectRegistryImpl(registryId: string, token: CancellationToken): Promise<RegistryV2> {
        return RegistryV2.connect(this, registryId, this.testExtensionContext as unknown as ExtensionContext, this.credentials, this.registryIsMonolith, this.registryIsMonolith ? Object.keys(this.simulator.cache) : undefined);
    }

    public static async setup(registryPort: number, authPort: number, registryIsMonolith: boolean): Promise<{ provider: TestRegistryV2Provider; firstReg: RegistryV2; firstRepo: RepositoryV2; firstTag: TagV2 }> {
        const simulator = new RegistryV2Simulator(registryPort, authPort, registryIsMonolith);
        await simulator.startListening();

        const token = new TestCancellationToken();

        const provider = new TestRegistryV2Provider(simulator, new TestExtensionContext(), registryIsMonolith);
        await provider.connectRegistry(token);
        const firstReg = (await provider.getRegistries(true, token))[0] as RegistryV2;
        const firstRepo = (await firstReg.getRepositories(true, token))[0] as RepositoryV2;
        const firstTag = (await firstRepo.getTags(true, token))[0] as TagV2;

        return {
            provider,
            firstReg,
            firstRepo,
            firstTag,
        };
    }

    public dispose(): void {
        this.simulator?.dispose();
    }
}
