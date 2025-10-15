/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, parseError, randomUtils } from '@microsoft/vscode-azext-utils';
import { composeArgs, withArg, withNamedArg } from '@microsoft/vscode-processutils';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { l10n, MessageItem } from 'vscode';
import { execAsync } from '../../utils/execAsync';
import { isMac, isWindows } from '../../utils/osUtils';
import { PlatformOS } from '../../utils/platform';

const knownConfiguredProjects = new Set<string>();
let alreadyTrustedOrSkipped: boolean = false;

export async function trustCertificateIfNecessary(context: IActionContext): Promise<void> {
    if (alreadyTrustedOrSkipped) {
        return;
    }

    if (isWindows()) {
        if (!(await isCertificateTrusted())) {
            const trust: MessageItem = { title: l10n.t('Trust') };
            const message = l10n.t('The ASP.NET Core HTTPS development certificate is not trusted. To trust the certificate, run `dotnet dev-certs https --trust`, or click "Trust" below.');

            // Don't wait
            void context.ui
                .showWarningMessage(message, { modal: false, learnMoreLink: 'https://aka.ms/vscode-docker-dev-certs' }, trust)
                .then(async selection => {
                    if (selection === trust) {
                        const args = composeArgs(
                            withArg('dev-certs', 'https', '--trust'),
                        )();
                        await execAsync('dotnet', args);
                        knownConfiguredProjects.clear(); // Clear the cache so future F5's will not use an untrusted cert
                    }
                });
        }
    } else if (isMac()) {
        if (!(await isCertificateTrusted())) {
            const message = l10n.t('The ASP.NET Core HTTPS development certificate is not trusted. To trust the certificate, run `dotnet dev-certs https --trust`.');

            // Don't wait
            void context.ui.showWarningMessage(
                message,
                { modal: false, learnMoreLink: 'https://aka.ms/vscode-docker-dev-certs' });
        }
    }

    alreadyTrustedOrSkipped = true;
}

export async function exportCertificateIfNecessary(projectFile: string, certificateExportPath: string): Promise<void> {
    if (knownConfiguredProjects.has(projectFile)) {
        return;
    }

    await exportCertificate(projectFile, certificateExportPath);
    knownConfiguredProjects.add(projectFile);
}

export function getHostSecretsFolders(): { hostCertificateFolder: string, hostUserSecretsFolder: string } {
    let appDataEnvironmentVariable: string | undefined;

    if (isWindows()) {
        appDataEnvironmentVariable = process.env.AppData;

        if (appDataEnvironmentVariable === undefined) {
            throw new Error(l10n.t('The environment variable \'AppData\' is not defined. This variable is used to locate the HTTPS certificate and user secrets folders.'));
        }
    }

    return {
        hostCertificateFolder: isWindows() ?
            path.join(appDataEnvironmentVariable, 'ASP.NET', 'Https') :
            path.join(os.homedir(), '.aspnet', 'https'),
        hostUserSecretsFolder: isWindows() ?
            path.join(appDataEnvironmentVariable, 'Microsoft', 'UserSecrets') :
            path.join(os.homedir(), '.microsoft', 'usersecrets'),
    };
}

export function getContainerSecretsFolders(platform: PlatformOS, userName: string | undefined): { containerCertificateFolder: string, containerUserSecretsFolder: string } {
    // If username is undefined, assume 'ContainerUser' for Windows and 'root' for Linux, these are the defaults for .NET
    userName = userName || (platform === 'Windows' ? 'ContainerUser' : 'root');

    // On Windows, the user home directory is at C:\Users\<username>. On Linux, it's /root for root, otherwise /home/<username>
    const userHome = platform === 'Windows' ?
        path.win32.join('C:\\Users', userName) :
        userName === 'root' ? '/root' : path.posix.join('/home', userName);

    return {
        containerCertificateFolder: platform === 'Windows' ?
            path.win32.join(userHome, 'AppData\\Roaming\\ASP.NET\\Https') :
            path.posix.join(userHome, '.aspnet/https'),
        containerUserSecretsFolder: platform === 'Windows' ?
            path.win32.join(userHome, 'AppData\\Roaming\\Microsoft\\UserSecrets') :
            path.posix.join(userHome, '.microsoft/usersecrets'),
    };
}

async function isCertificateTrusted(): Promise<boolean> {
    try {
        const args = composeArgs(
            withArg('dev-certs', 'https', '--check', '--trust'),
        )();
        await execAsync('dotnet', args);
        return true;
    } catch (err) {
        const error = parseError(err);

        if (error.errorType === '6' || error.errorType === '7') {
            return false;
        } else {
            throw err;
        }
    }
}

async function exportCertificate(projectFile: string, certificateExportPath: string): Promise<void> {
    await addUserSecretsIfNecessary(projectFile);
    await exportCertificateAndSetPassword(projectFile, certificateExportPath);
}

async function addUserSecretsIfNecessary(projectFile: string): Promise<void> {
    const contents = await fse.readFile(projectFile, 'utf-8');

    if (/UserSecretsId/i.test(contents)) {
        return;
    }

    // Initialize user secrets for the project
    const args = composeArgs(
        withArg('user-secrets', 'init'),
        withNamedArg('--project', projectFile, { shouldQuote: true }),
        withNamedArg('--id', randomUtils.getRandomHexString(32)),
    )();
    await execAsync('dotnet', args);
}

async function exportCertificateAndSetPassword(projectFile: string, certificateExportPath: string): Promise<void> {
    const password = randomUtils.getRandomHexString(32);

    // Export the certificate
    const exportArgs = composeArgs(
        withArg('dev-certs', 'https'),
        withNamedArg('-ep', certificateExportPath, { shouldQuote: true }),
        withNamedArg('-p', password, { shouldQuote: true }),
    )();
    await execAsync('dotnet', exportArgs);

    // Set the password to dotnet user-secrets
    const userSecretsPasswordArgs = composeArgs(
        withArg('user-secrets'),
        withNamedArg('--project', projectFile, { shouldQuote: true }),
        withArg('set'),
        withNamedArg('Kestrel:Certificates:Development:Password', password, { shouldQuote: true }),
    )();
    await execAsync('dotnet', userSecretsPasswordArgs);
}


