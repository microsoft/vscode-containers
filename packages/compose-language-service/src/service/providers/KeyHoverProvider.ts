/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { CancellationToken, Hover, HoverParams, MarkupKind, Position, Range } from 'vscode-languageserver';
import { KeyValueRegex } from '../ComposeDocument';
import { ExtendedParams } from '../ExtendedParams';
import { getCurrentContext } from '../utils/ActionContext';
import { ProviderBase } from './ProviderBase';

export class KeyHoverProvider extends ProviderBase<HoverParams & ExtendedParams, Hover | undefined, never, never> {
    public async on(params: HoverParams & ExtendedParams, token: CancellationToken): Promise<Hover | undefined> {
        const ctx = getCurrentContext();
        ctx.telemetry.groupingStrategy = 'eventName'; // The below `hoverMatch` property that is attached will be lossy, but that's not serious; at global scales it will still be representative of usage
        const contentFormat = ctx.clientCapabilities.textDocument?.hover?.contentFormat;
        const preferMarkdown = contentFormat?.length ? contentFormat?.[0] === MarkupKind.Markdown : false;

        const positionInfo = await params.document.getPositionInfo(params);

        for (const keyInfo of ComposeKeyInfo) {
            const pathMatch = keyInfo.pathRegex.exec(positionInfo.path);

            if (!pathMatch) {
                continue;
            }

            const line = params.document.lineAt(params.position);
            const lineMatch = KeyValueRegex.exec(line);

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            const pathKeyName = pathMatch.groups!['keyName']; // Can't be undefined if it matched
            const lineKeyName = lineMatch?.groups?.['keyName'];

            // Need to ensure the key on the line is the same as the key in the path
            // They can be different is because if you are in the whitespace before a key--the path will be in the parent key, but no hover should be provided here
            if (lineKeyName === pathKeyName) {
                const keyIndex = line.indexOf(lineKeyName);

                // Attach the key name to telemetry
                ctx.telemetry.properties.keyName = lineKeyName;

                return {
                    contents: {
                        kind: preferMarkdown ? MarkupKind.Markdown : MarkupKind.PlainText, // If Markdown is preferred, even plaintext will be treated as Markdown--it renders better, has line wrapping, etc.
                        value: (preferMarkdown && keyInfo.markdownContents) || keyInfo.plaintextContents,
                    },
                    range: Range.create(Position.create(params.position.line, keyIndex), Position.create(params.position.line, keyIndex + lineKeyName.length)),
                };
            }
        }

        return undefined;
    }
}

interface ComposeKeyInformation {
    pathRegex: RegExp, // Must contain a group called `keyName` that matches the key
    plaintextContents: string,
    markdownContents?: string,
}

const ComposeKeyInfo: ComposeKeyInformation[] = [
    {
        pathRegex: /^\/(?<keyName>configs)$/i, // `/configs`
        plaintextContents: 'Configurations for services in the project',
    },
    {
        pathRegex: /^\/(?<keyName>networks)$/i, // `/networks`
        plaintextContents: 'Networks that are shared among multiple services',
    },
    {
        pathRegex: /^\/networks\/[.\w-]+\/(?<keyName>driver)$/i, // `/networks/foo/driver`
        plaintextContents: 'The driver used for this network',
    },
    {
        pathRegex: /^\/(?<keyName>secrets)$/i, // `/secrets`
        plaintextContents: 'Secrets that are shared among multiple services',
    },
    {
        pathRegex: /^\/(?<keyName>services)$/i, // `/services`
        plaintextContents: 'The services in your project',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>build)$/i, // `/services/foo/build`
        plaintextContents: 'The context used for building the image',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/build\/(?<keyName>args)$/i, // `/services/foo/build/args`
        plaintextContents: 'Arguments used during the image build process',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/build\/(?<keyName>context)$/i, // `/services/foo/build/context`
        plaintextContents: 'The context used for building the image',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/build\/(?<keyName>dockerfile)$/i, // `/services/foo/build/dockerfile`
        plaintextContents: 'The Dockerfile used for building the image',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>command)$/i, // `/services/foo/command`
        plaintextContents: 'The command that will be run in the container',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>container_name)$/i, // `/services/foo/container_name`
        plaintextContents: 'The name that will be given to the container',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>depends_on)$/i, // `/services/foo/depends_on`
        plaintextContents: 'Other services that this service depends on, which will be started before this one',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>entrypoint)$/i, // `/services/foo/entrypoint`
        plaintextContents: 'The entrypoint to the application in the container',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>env_file)$/i, // `/services/foo/env_file`
        plaintextContents: 'Files containing environment variables that will be included',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>environment)$/i, // `/services/foo/environment`
        plaintextContents: 'Environment variables that will be included',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>expose)$/i, // `/services/foo/expose`
        plaintextContents: 'Ports exposed to the other services but not to the host machine',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>healthcheck)$/i, // `/services/foo/healthcheck`
        plaintextContents: 'A command for checking if the container is healthy',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>image)$/i, // `/services/foo/image`
        plaintextContents: 'The image that will be pulled for the service. If `build` is specified, the built image will be given this tag.',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>labels)$/i, // `/services/foo/labels`
        plaintextContents: 'Labels that will be given to the container',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>logging)$/i, // `/services/foo/logging`
        plaintextContents: 'Settings for logging for this service',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>networks)$/i, // `/services/foo/networks`
        plaintextContents: 'The service will be included in these networks, allowing it to reach other containers on the same network',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>ports)$/i, // `/services/foo/ports`
        plaintextContents: 'Ports that will be exposed to the host',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>profiles)$/i, // `/services/foo/profiles`
        plaintextContents: 'Profiles that this service is a part of. When the profile is started, this service will be started.',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>secrets)$/i, // `/services/foo/secrets`
        plaintextContents: 'Secrets the service will have access to',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>user)$/i, // `/services/foo/user`
        plaintextContents: 'The username under which the app in the container will be started',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>volumes)$/i, // `/services/foo/volumes`
        plaintextContents: 'Named volumes and paths on the host mapped to paths in the container',
    },
    {
        pathRegex: /^\/services\/[.\w-]+\/(?<keyName>working_dir)$/i, // `/services/foo/working_dir`
        plaintextContents: 'The working directory in which the entrypoint or command will be run',
    },
    {
        pathRegex: /^\/(?<keyName>version)$/i, // `/version`
        plaintextContents: 'The version of the Docker Compose document',
    },
    {
        pathRegex: /^\/(?<keyName>volumes)$/i, // `/volumes`
        plaintextContents: 'Named volumes that are shared among multiple services',
    },
    {
        pathRegex: /^\/volumes\/[.\w-]+\/(?<keyName>driver)$/i, // `/volumes/foo/driver`
        plaintextContents: 'The driver used for this volume',
    },
];
