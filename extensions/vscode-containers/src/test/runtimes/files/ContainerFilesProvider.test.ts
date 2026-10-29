/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccumulatorStream } from '@microsoft/vscode-processutils';
import assert from 'assert';
import { createHash } from 'crypto';
import * as fs from 'fs/promises';
import { mock } from 'node:test';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import { ext } from '../../../extensionVariables';
import { ContainerFilesProvider } from '../../../runtimes/files/ContainerFilesProvider';
import { DockerUri } from '../../../runtimes/files/DockerUri';
import { tarPackStream } from '../../../utils/tarUtils';

suite('(unit) ContainerFilesProvider', () => {
    let provider: ContainerFilesProvider;
    const linuxUri = DockerUri.create('test', '/file.bin', { containerOS: 'linux' }).uri;
    const windowsUri = DockerUri.create('test', '/C:/file.bin', { containerOS: 'windows' }).uri;

    setup(() => {
        provider = new ContainerFilesProvider();
    });

    teardown(() => {
        mock.reset();
        provider.dispose();
    });

    async function pack(source: Buffer): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of await tarPackStream(source, 'container-read-regression.bin')) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    function stubStream(bytes: Buffer): void {
        mock.method(ext, 'streamWithDefaults', async function* () {
            for (let offset = 0; offset < bytes.length; offset += 64 * 1024) {
                yield bytes.subarray(offset, offset + 64 * 1024);
            }
        });
    }

    function largePayload(): Buffer {
        const expected = Buffer.alloc(30_000_000);
        for (let i = 0; i < expected.length; i++) {
            expected[i] = i % 256;
        }
        return expected;
    }

    function deferDestinationDraining(): void {
        const originalWrite = AccumulatorStream.prototype.write;
        mock.method(AccumulatorStream.prototype, 'write', function (this: AccumulatorStream, chunk: Uint8Array) {
            this.cork();
            setImmediate(() => this.uncork());
            return originalWrite.call(this, chunk, undefined, undefined);
        });
    }

    function assertBytes(actual: Uint8Array, expected: Buffer): void {
        assert.strictEqual(actual.length, expected.length);
        assert.deepStrictEqual(Buffer.from(actual), expected);
        assert.strictEqual(createHash('sha256').update(actual).digest('hex'), createHash('sha256').update(expected).digest('hex'));
    }

    test('reads all 30 MB of a binary file with deferred destination draining', async function () {
        this.timeout(30_000);
        const expected = largePayload();
        stubStream(await pack(expected));
        deferDestinationDraining();

        assertBytes(await provider.readFile(linuxUri), expected);
    });

    for (const expected of [Buffer.alloc(0), Buffer.from([0, 255, 128, 13, 10]), Buffer.from('small text file\n')]) {
        test(`reads a ${expected.length}-byte Linux file`, async () => {
            stubStream(await pack(expected));
            assertBytes(await provider.readFile(linuxUri), expected);
        });
    }

    test('preserves raw Windows bytes with deferred destination draining', async () => {
        const expected = Buffer.alloc(150_000, 255);
        stubStream(expected);
        deferDestinationDraining();
        assertBytes(await provider.readFile(windowsUri), expected);
    });

    test('reads an empty Windows file', async () => {
        stubStream(Buffer.alloc(0));
        assertBytes(await provider.readFile(windowsUri), Buffer.alloc(0));
    });

    for (const operatingSystem of ['linux', 'windows'] as const) {
        test(`propagates a ${operatingSystem} generator failure after partial output`, async () => {
            const failure = new Error('container command failed');
            const bytes = operatingSystem === 'linux' ? await pack(Buffer.alloc(150_000)) : Buffer.alloc(150_000);
            mock.method(ext, 'streamWithDefaults', async function* () {
                yield bytes.subarray(0, 1024);
                throw failure;
            });
            await assert.rejects(provider.readFile(operatingSystem === 'linux' ? linuxUri : windowsUri), error => error === failure);
        });
    }

    test('rejects a truncated tar entry instead of returning partial bytes', async () => {
        const archive = await pack(Buffer.alloc(150_000));
        stubStream(archive.subarray(0, 1024));
        await assert.rejects(provider.readFile(linuxUri), /Truncated input/);
    });

    test('rejects an invalid archive', async () => {
        stubStream(Buffer.from('not a tar archive'));
        await assert.rejects(provider.readFile(linuxUri), /Unrecognized archive format/);
    });

    test('rejects a corrupt tar header', async () => {
        const archive = await pack(Buffer.from('file contents'));
        archive[0] ^= 1;
        stubStream(archive);
        await assert.rejects(provider.readFile(linuxUri), /checksum failure/);
    });

    test('rejects an archive with no file entry', async () => {
        stubStream(Buffer.alloc(1024));
        await assert.rejects(provider.readFile(linuxUri), /contains no file|Unrecognized archive format/);
    });

    test('waits for the generator even after the file entry ends', async () => {
        const archive = await pack(Buffer.from('complete entry'));
        const failure = new Error('container command failed after output');
        mock.method(ext, 'streamWithDefaults', async function* () {
            yield archive;
            throw failure;
        });
        await assert.rejects(provider.readFile(linuxUri), error => error === failure);
    });

    test('copies all 30 MB through the VS Code filesystem API', async function () {
        this.timeout(30_000);
        const expected = largePayload();
        stubStream(await pack(expected));
        deferDestinationDraining();
        const registration = vscode.workspace.registerFileSystemProvider('container-read-test', provider);
        const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'container-copy-test-'));
        const destination = vscode.Uri.file(path.join(folder, 'download.bin'));
        try {
            await vscode.workspace.fs.copy(linuxUri.with({ scheme: 'container-read-test' }), destination, { overwrite: true });
            assertBytes(await vscode.workspace.fs.readFile(destination), expected);
        } finally {
            registration.dispose();
            await fs.rm(destination.fsPath, { force: true });
            await fs.rmdir(folder);
        }
    });

    test('opens a text file through the VS Code filesystem provider', async () => {
        const expected = 'complete text file\n';
        stubStream(await pack(Buffer.from(expected)));
        const registration = vscode.workspace.registerFileSystemProvider('container-open-test', provider);
        try {
            const document = await vscode.workspace.openTextDocument(linuxUri.with({ scheme: 'container-open-test', path: '/file.txt' }));
            assert.strictEqual(document.getText(), expected);
        } finally {
            registration.dispose();
        }
    });

    test('rejects filesystem copy when extraction fails', async () => {
        stubStream(Buffer.from('not a tar archive'));
        const registration = vscode.workspace.registerFileSystemProvider('container-copy-error-test', provider);
        const folder = await fs.mkdtemp(path.join(os.tmpdir(), 'container-copy-error-test-'));
        const destination = vscode.Uri.file(path.join(folder, 'download.bin'));
        try {
            await assert.rejects(async () => await vscode.workspace.fs.copy(linuxUri.with({ scheme: 'container-copy-error-test' }), destination), /Unrecognized archive format/);
        } finally {
            registration.dispose();
            await fs.rm(destination.fsPath, { force: true });
            await fs.rmdir(folder);
        }
    });
});
