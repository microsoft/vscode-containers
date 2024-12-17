/*--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, CodeLens, CodeLensParams } from 'vscode-languageserver';
import { ProviderBase } from './ProviderBase';
import { ExtendedParams } from '../ExtendedParams';
import { getCurrentContext } from '../utils/ActionContext';
import { isMap, isPair, isScalar } from 'yaml';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';

export class ServiceStartupCodeLensProvider extends ProviderBase<CodeLensParams & ExtendedParams, CodeLens[] | undefined, never, never> {
    public on(params: CodeLensParams & ExtendedParams, token: CancellationToken): CodeLens[] | undefined {
        const ctx = getCurrentContext();
        ctx.telemetry.properties.isActivationEvent = 'true'; // This happens automatically so we'll treat it as isActivationEvent === true

        const results: CodeLens[] = [];

        if (!params.document.yamlDocument.value.has('services')) {
            return undefined;
        }

        // First add the run-all from the main "services" node
        const documentMap = params.document.yamlDocument.value.contents;
        if (isMap(documentMap)) {
            const servicesNode = documentMap.items.find(item => {
                return isScalar(item.key) && item.key.value === 'services';
            });

            if (isPair(servicesNode)) {
                const servicesKey = servicesNode.key;

                if (isScalar(servicesKey) && servicesKey.range && isMap(servicesNode.value)) {
                    const lens = CodeLens.create(yamlRangeToLspRange(params.document.textDocument, servicesKey.range));
                    lens.command = {
                        title: '$(run-all) Run All Services',
                        command: 'vscode-docker.compose.up',
                        arguments: [
                            /* dockerComposeFileUri: */ params.document.uri
                        ],
                    };
                    results.push(lens);
                }
            }
        }

        // Check for cancellation
        if (token.isCancellationRequested) {
            return undefined;
        }

        // Then add the run-single for each service
        const serviceMap = params.document.yamlDocument.value.getIn(['services']);
        if (isMap(serviceMap)) {
            for (const service of serviceMap.items) {
                // Within each loop we'll check for cancellation (though this is expected to be very fast)
                if (token.isCancellationRequested) {
                    return undefined;
                }

                if (isScalar(service.key) && typeof service.key.value === 'string' && service.key.range) {
                    const lens = CodeLens.create(yamlRangeToLspRange(params.document.textDocument, service.key.range));
                    lens.command = {
                        title: '$(play) Run Service',
                        command: 'vscode-docker.compose.up.subset',
                        arguments: [ // Arguments are from here: https://github.com/microsoft/vscode-docker/blob/a45a3dfc8e582f563292a707bbe56f616f7fedeb/src/commands/compose/compose.ts#L79
                            /* dockerComposeFileUri: */ params.document.uri,
                            /* selectedComposeFileUris: */ undefined,
                            /* preselectedServices: */[service.key.value],
                        ],
                    };
                    results.push(lens);
                }
            }
        }

        return results;
    }
}
