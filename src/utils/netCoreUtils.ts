/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { parseError } from '@microsoft/vscode-azext-utils';
import { CommandLineArgs, composeArgs, withArg, withNamedArg, withQuotedArg } from '@microsoft/vscode-processutils';
import * as fse from 'fs-extra';
import * as path from 'path';
import { l10n } from 'vscode';
import { ext } from '../extensionVariables';
import { execAsync } from './execAsync';
import { getTempFileName } from './osUtils';

export async function getNetCoreProjectInfo(target: 'GetBlazorManifestLocations' | 'GetProjectProperties', project: string, additionalProperties?: CommandLineArgs): Promise<string[]> {
    const targetsFile = path.join(ext.context.asAbsolutePath('resources'), 'netCore', `${target}.targets`);
    const outputFile = getTempFileName();

    const args = composeArgs(
        withArg('build'),
        withArg('/r:false'),
        withArg(`/t:${target}`), // Target name doesn't need quoting
        withNamedArg('/p:CustomAfterMicrosoftCommonTargets', `"${targetsFile}"`, { assignValue: true }), // We have to pre-quote the file paths because we cannot simultaneously use `assignValue` and `shouldQuote`
        withNamedArg('/p:CustomAfterMicrosoftCommonCrossTargetingTargets', `"${targetsFile}"`, { assignValue: true }),
        withNamedArg('/p:InfoOutputPath', `"${outputFile}"`, { assignValue: true }),
        withArg(...(additionalProperties ?? [])),
        withQuotedArg(project),
    )();

    try {
        try {
            await execAsync('dotnet', args, { timeout: 20000 });
        } catch (err) {
            const error = parseError(err);
            throw new Error(l10n.t('Unable to determine project information for target \'{0}\' on project \'{1}\' {2}', target, project, error.message));
        }

        if (await fse.pathExists(outputFile)) {
            const contents = await fse.readFile(outputFile, 'utf-8');

            if (contents) {
                return contents.split(/\r?\n/ig);
            }
        }

        throw new Error(l10n.t('Unable to determine project information for target \'{0}\' on project \'{1}\'', target, project));
    } finally {
        if (await fse.pathExists(outputFile)) {
            await fse.unlink(outputFile);
        }
    }
}
