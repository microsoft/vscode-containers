/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DockerClient, WslcClient } from '@microsoft/vscode-container-client';
import { ShellQuoting } from '@microsoft/vscode-processutils';
import assert from 'assert';
import * as os from 'os';
import * as path from 'path';
import { getNetSdkImageArchivePath, getNetSdkLoadCommand, isWslcRuntimeSelected } from '../../tasks/netSdk/netSdkTaskUtils';
import { ext } from '../../extensionVariables';

function asStrings(args: ReadonlyArray<string | { value: string; quoting: ShellQuoting }>): string[] {
    return args.map(a => typeof a === 'string' ? a : a.value);
}

suite('(unit) tasks/netSdk/netSdkTaskUtils', () => {
    // `getNetSdkImageArchivePath` builds the temp tar path, but production only *invokes* it for
    // wslc: `NetSdkRunTaskProvider` computes `isWslcRuntimeSelected() ? getNetSdkImageArchivePath(...)
    // : undefined`, so docker/podman never produce (or load, or clean up) a tar archive. The
    // `isWslcRuntimeSelected` suite below locks in that gate.
    suite('getNetSdkImageArchivePath', () => {
        test('Returns a unique .tar path under the OS temp dir', () => {
            const first = getNetSdkImageArchivePath('myapp');
            const second = getNetSdkImageArchivePath('myapp');

            assert.ok(first.startsWith(os.tmpdir()), `Expected ${first} to be under ${os.tmpdir()}`);
            assert.ok(first.endsWith('.tar'), `Expected ${first} to end with .tar`);
            // A GUID is included so repeated/concurrent runs never collide.
            assert.notStrictEqual(first, second);
        });

        test('Appends the default `dev` tag to the archive file name', () => {
            const base = path.basename(getNetSdkImageArchivePath('myapp'));
            assert.ok(base.startsWith('myapp_dev-'), `Unexpected archive name: ${base}`);
        });

        test('Sanitizes unsafe characters (slashes, colons) from the image name', () => {
            const base = path.basename(getNetSdkImageArchivePath('registry.io/my-app'));
            assert.ok(!base.includes('/') && !base.includes('\\'), `Archive name should not contain slashes: ${base}`);
            assert.ok(!base.includes(':'), `Archive name should not contain colons: ${base}`);
            // `.` and `-` are safe and preserved; `/` and the tag `:` become `_`.
            assert.ok(base.startsWith('registry.io_my-app_dev-'), `Unexpected archive name: ${base}`);
        });
    });

    suite('isWslcRuntimeSelected', () => {
        let originalManager: typeof ext.runtimeManager;
        let selectedId: string;

        setup(() => {
            // The tsx test instance has its own `ext`, so `ext.runtimeManager` isn't populated
            // (see getNetSdkLoadCommand below). Stub it so we can drive the selected client id.
            originalManager = ext.runtimeManager;
            ext.runtimeManager = {
                getSelectedClientId: () => selectedId,
            } as unknown as typeof ext.runtimeManager;
        });

        teardown(() => {
            ext.runtimeManager = originalManager;
        });

        test('Returns true when wslc is the selected container client', () => {
            selectedId = WslcClient.ClientId;
            assert.strictEqual(isWslcRuntimeSelected(), true);
        });

        test('Returns false when docker is selected', () => {
            selectedId = DockerClient.ClientId;
            assert.strictEqual(isWslcRuntimeSelected(), false);
        });
    });

    suite('getNetSdkLoadCommand', () => {
        let originalManager: typeof ext.runtimeManager;

        setup(() => {
            // The test host runs against the TS source (tsx), which has its own `ext` instance
            // separate from the activated (bundled) extension, so `ext.runtimeManager` isn't
            // populated. Stub it with a minimal fake; the load args are client-independent.
            originalManager = ext.runtimeManager;
            ext.runtimeManager = {
                getClient: async () => ({ commandName: 'wslc' }),
            } as unknown as typeof ext.runtimeManager;
        });

        teardown(() => {
            ext.runtimeManager = originalManager;
        });

        test('Produces `load --input <archive>` args', async () => {
            const archive = path.join(os.tmpdir(), 'my-image_dev-1234.tar');
            const { command, args } = await getNetSdkLoadCommand(archive);
            assert.strictEqual(command, 'wslc');
            assert.deepStrictEqual(asStrings(args), ['load', '--input', archive]);
        });
    });
});
