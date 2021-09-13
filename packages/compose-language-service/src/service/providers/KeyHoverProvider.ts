/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Hover, HoverParams, MarkupKind } from 'vscode-languageserver';
import { CST } from 'yaml';
import { ExtendedParams } from '../ExtendedParams';
import { ExtendedPosition } from '../ExtendedPosition';
import { yamlRangeToLspRange } from '../utils/yamlRangeToLspRange';
import { ProviderBase } from './ProviderBase';

export class KeyHoverProvider extends ProviderBase<HoverParams & ExtendedParams, Hover | undefined, never, never> {
    public on(params: HoverParams & ExtendedParams, token: CancellationToken): Hover | undefined {
        if (!params.clientCapabilities.textDocument?.hover) {
            return undefined;
        }

        const contentFormat = params.clientCapabilities.textDocument.hover.contentFormat;
        const preferMarkdown = contentFormat?.length ? contentFormat?.[0] === MarkupKind.Markdown : false;

        const extendedPosition = ExtendedPosition.build(params.document, params.position);

        if (extendedPosition.itemType === 'key' && CST.isScalar(extendedPosition.item.key)) {
            const keyInfo = ComposeKeyInfo.find((k) => k.pathRegex.test(extendedPosition.logicalPath));

            if (keyInfo) {
                return {
                    contents: {
                        kind: preferMarkdown ? MarkupKind.Markdown : MarkupKind.PlainText, // If Markdown is preferred, even plaintext will be treated as Markdown--it renders better, has line wrapping, etc.
                        value: (preferMarkdown && keyInfo.markdownContents) || keyInfo.plaintextContents,
                    },
                    range: yamlRangeToLspRange(params.document.textDocument, [extendedPosition.item.key.offset, extendedPosition.item.key.offset + extendedPosition.item.key.source.length]),
                };
            }
        }

        return undefined;
    }
}

interface ComposeKeyInformation {
    pathRegex: RegExp,
    plaintextContents: string,
    markdownContents?: string,
}

const ComposeKeyInfo: ComposeKeyInformation[] = [
    {
        pathRegex: /^\/configs$/i, // `/configs`
        plaintextContents: 'Configurations for services in the project',
    },
    {
        pathRegex: /^\/networks$/i, // `/networks`
        plaintextContents: 'Networks that are shared among multiple services',
    },
    {
        pathRegex: /^\/networks\/[\w-]+\/driver$/i, // `/networks/foo/driver`
        plaintextContents: 'The driver used for this network',
    },
    {
        pathRegex: /^\/secrets$/i, // `/secrets`
        plaintextContents: 'Secrets that are shared among multiple services',
    },
    {
        pathRegex: /^\/services$/i, // `/services`
        plaintextContents: 'The services in your project',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/build$/i, // `/services/foo/build`
        plaintextContents: 'The context used for building the image',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/build\/args$/i, // `/services/foo/build/args`
        plaintextContents: 'Arguments used during the image build process',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/build\/context$/i, // `/services/foo/build/context`
        plaintextContents: 'The context used for building the image',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/build\/dockerfile$/i, // `/services/foo/build/dockerfile`
        plaintextContents: 'The Dockerfile used for building the image',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/command$/i, // `/services/foo/command`
        plaintextContents: 'The command that will be run in the container',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/container_name$/i, // `/services/foo/container_name`
        plaintextContents: 'The name that will be given to the container',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/depends_on$/i, // `/services/foo/depends_on`
        plaintextContents: 'Other services that this service depends on, which will be started before this one',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/entrypoint$/i, // `/services/foo/entrypoint`
        plaintextContents: 'The entrypoint to the application in the container',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/env_file$/i, // `/services/foo/env_file`
        plaintextContents: 'Files containing environment variables that will be included',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/environment$/i, // `/services/foo/environment`
        plaintextContents: 'Environment variables that will be included',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/expose$/i, // `/services/foo/expose`
        plaintextContents: 'Ports exposed to the other services but not to the host machine',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/healthcheck$/i, // `/services/foo/healthcheck`
        plaintextContents: 'A command for checking if the container is healthy',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/image$/i, // `/services/foo/image`
        plaintextContents: 'The image that will be pulled for the service. If `build` is specified, the built image will be given this tag.',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/labels$/i, // `/services/foo/labels`
        plaintextContents: 'Labels that will be given to the container',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/logging$/i, // `/services/foo/logging`
        plaintextContents: 'Settings for logging for this service',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/networks$/i, // `/services/foo/networks`
        plaintextContents: 'The service will be included in these networks, allowing it to reach other containers on the same network',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/ports$/i, // `/services/foo/ports`
        plaintextContents: 'Ports that will be exposed to the host',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/profiles$/i, // `/services/foo/profiles`
        plaintextContents: 'Profiles that this service is a part of. When the profile is started, this service will be started.',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/secrets$/i, // `/services/foo/secrets`
        plaintextContents: 'Secrets the service will have access to',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/user$/i, // `/services/foo/user`
        plaintextContents: 'The username under which the app in the container will be started',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/volumes$/i, // `/services/foo/volumes`
        plaintextContents: 'Named volumes and paths on the host mapped to paths in the container',
    },
    {
        pathRegex: /^\/services\/[\w-]+\/working_dir$/i, // `/services/foo/working_dir`
        plaintextContents: 'The working directory in which the entrypoint or command will be run',
    },
    {
        pathRegex: /^\/version$/i, // `/version`
        plaintextContents: 'The version of the Docker Compose document',
    },
    {
        pathRegex: /^\/volumes$/i, // `/volumes`
        plaintextContents: 'Named volumes that are shared among multiple services',
    },
    {
        pathRegex: /^\/volumes\/[\w-]+\/driver$/i, // `/volumes/foo/driver`
        plaintextContents: 'The driver used for this volume',
    },
];
