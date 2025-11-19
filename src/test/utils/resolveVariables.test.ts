/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import * as path from 'path';
import { Uri, WorkspaceFolder, workspace } from 'vscode';
import { resolveVariables } from '../../utils/resolveVariables';

suite('(unit) resolveVariables', () => {
    let originalDescriptor: PropertyDescriptor | undefined;
    let canStubWorkspaceFolders = true;

    suiteSetup(() => {
        originalDescriptor = Object.getOwnPropertyDescriptor(workspace, 'workspaceFolders');

        try {
            Object.defineProperty(workspace, 'workspaceFolders', {
                get: () => undefined,
                configurable: true,
            });

            if (originalDescriptor) {
                Object.defineProperty(workspace, 'workspaceFolders', originalDescriptor);
            } else {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                delete (workspace as any).workspaceFolders;
            }
        } catch (err) {
            console.warn('Unable to stub workspaceFolders; skipping resolveVariables workspace folder tests.', err);
            canStubWorkspaceFolders = false;
        }
    });

    teardown(() => {
        if (!canStubWorkspaceFolders) {
            return;
        }

        if (originalDescriptor) {
            Object.defineProperty(workspace, 'workspaceFolders', originalDescriptor);
        } else {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (workspace as any).workspaceFolders;
        }
    });

    function createFolder(name: string, fsPath: string, index: number): WorkspaceFolder {
        return {
            name,
            index,
            uri: Uri.file(fsPath),
        };
    }

    test('resolves scoped workspace folder by name', function () {
        if (!canStubWorkspaceFolders) {
            this.skip();
        }

        const basePath = path.join('/', 'tmp', 'workspace');
        const webFolder = createFolder('web', path.join(basePath, 'web'), 0);
        const libFolder = createFolder('lib', path.join(basePath, 'lib'), 1);

        Object.defineProperty(workspace, 'workspaceFolders', {
            value: [webFolder, libFolder],
            configurable: true,
        });

        const result = resolveVariables('${workspaceFolder:web}', libFolder);

        assert.strictEqual(result, path.normalize(webFolder.uri.fsPath));
    });

    test('falls back to provided folder for unscoped workspace variable', () => {
        const basePath = path.join('/', 'tmp', 'workspace');
        const libFolder = createFolder('lib', path.join(basePath, 'lib'), 0);

        const result = resolveVariables('${workspaceFolder}', libFolder);

        assert.strictEqual(result, path.normalize(libFolder.uri.fsPath));
    });

    test('leaves scoped variable unchanged when folder name not found', function () {
        if (!canStubWorkspaceFolders) {
            this.skip();
        }

        Object.defineProperty(workspace, 'workspaceFolders', {
            value: undefined,
            configurable: true,
        });

        const value = '${workspaceFolder:missing}';
        const result = resolveVariables(value);

        assert.strictEqual(result, value);
    });
});
