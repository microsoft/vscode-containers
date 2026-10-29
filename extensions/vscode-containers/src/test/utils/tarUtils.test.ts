/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { AccumulatorStream } from '@microsoft/vscode-processutils';
import assert from 'assert';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import { Readable, Writable } from 'stream';
import { tarPackStream, tarUnpackStream } from '../../utils/tarUtils';

suite('(unit) utils/tarUtils', () => {
    async function pack(source: Buffer, name: string): Promise<Buffer> {
        const chunks: Buffer[] = [];
        for await (const chunk of await tarPackStream(source, name)) {
            chunks.push(Buffer.from(chunk));
        }
        return Buffer.concat(chunks);
    }

    test('extracts bytes without creating a file on disk', async () => {
        const name = `container-tar-test-${randomUUID()}.bin`;
        const expected = Buffer.from([0, 255, 128, 13, 10]);
        const destination = new AccumulatorStream();
        const [, bytes] = await Promise.all([
            tarUnpackStream(Readable.from([await pack(expected, name)]), destination),
            destination.getBytes(),
        ]);
        assert.deepStrictEqual(bytes, expected);
        await assert.rejects(fs.stat(path.join(process.cwd(), name)), { code: 'ENOENT' });
        assert.strictEqual(destination.listenerCount('error'), 1);
    });

    test('waits for a slow destination to finish', async () => {
        const expected = Buffer.alloc(150_000, 255);
        const chunks: Buffer[] = [];
        let finalized = false;
        const destination = new Writable({
            highWaterMark: 1024,
            write: (chunk: Buffer, _encoding, callback) => {
                chunks.push(chunk);
                setImmediate(callback);
            },
            final: callback => {
                setImmediate(() => {
                    finalized = true;
                    callback();
                });
            },
        });
        const archive = await pack(expected, 'file.bin');
        async function* source(): AsyncGenerator<Buffer> {
            for (let offset = 0; offset < archive.length; offset += 4096) {
                yield archive.subarray(offset, offset + 4096);
            }
        }
        await tarUnpackStream(Readable.from(source()), destination);
        assert.strictEqual(finalized, true);
        assert.deepStrictEqual(Buffer.concat(chunks), expected);
        assert.strictEqual(destination.listenerCount('error'), 0);
    });

    test('propagates destination errors and closes the source generator', async () => {
        const failure = new Error('destination failed');
        const destination = new Writable({
            write: (_chunk, _encoding, callback) => callback(failure),
        });
        const archive = await pack(Buffer.alloc(150_000), 'file.bin');
        let closed = false;
        async function* source(): AsyncGenerator<Buffer> {
            try {
                for (let offset = 0; offset < archive.length; offset += 1024) {
                    yield archive.subarray(offset, offset + 1024);
                }
            } finally {
                closed = true;
            }
        }
        await assert.rejects(tarUnpackStream(Readable.from(source()), destination), error => error === failure);
        assert.strictEqual(closed, true);
        assert.strictEqual(destination.destroyed, true);
    });

    test('returns only the first file entry', async () => {
        const expected = Buffer.from('first file');
        const first = await pack(expected, 'first.bin');
        const second = await pack(Buffer.from('second file'), 'second.bin');
        const archive = Buffer.concat([first.subarray(0, first.length - 1024), second]);
        const destination = new AccumulatorStream();
        const [, bytes] = await Promise.all([
            tarUnpackStream(Readable.from([archive]), destination),
            destination.getBytes(),
        ]);
        assert.deepStrictEqual(bytes, expected);
    });

    test('rejects when the destination closes before finishing', async () => {
        const destination = new Writable({
            write: (_chunk, _encoding, _callback) => destination.destroy(),
        });
        const archive = await pack(Buffer.alloc(150_000), 'file.bin');
        await assert.rejects(
            tarUnpackStream(Readable.from([archive]), destination),
            /Premature close/,
        );
    });

    test('propagates errors while finalizing the destination', async () => {
        const failure = new Error('destination finalization failed');
        const destination = new Writable({
            write: (_chunk, _encoding, callback) => callback(),
            final: callback => setImmediate(() => callback(failure)),
        });
        const archive = await pack(Buffer.from('complete file'), 'file.bin');
        await assert.rejects(
            tarUnpackStream(Readable.from([archive]), destination),
            error => error === failure,
        );
    });
});
