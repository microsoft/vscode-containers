/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';
import { finished, pipeline } from 'stream/promises';
import type { ReadEntry } from 'tar';
import * as vscode from 'vscode';
import { getTar } from './lazyPackages';

/**
 * Unpack the first file in a tar stream without writing to disk.
 * Waits for both archive consumption and the destination to finish.
 * @param source The archive stream to unpack
 * @param destination The destination stream to unpack to
 * @returns A promise that resolves after extraction completes
 */
export async function tarUnpackStream(source: stream.Readable, destination: stream.Writable): Promise<void> {
    const tar = await getTar();

    let fileEntry: ReadEntry | undefined;
    const parser = new tar.Parser({
        strict: true,
        filter: () => !fileEntry,
        onReadEntry: (entry) => {
            fileEntry = entry;
            entry.pipe(destination);
        }
    });

    const destinationDone = finished(destination, { cleanup: true });
    const sourceDone = pipeline(source, parser).then(() => {
        if (!fileEntry) {
            throw new Error(vscode.l10n.t('The container file archive contains no file.'));
        }
    });
    try {
        await Promise.all([sourceDone, destinationDone]);
    } catch (error) {
        const failure = error instanceof Error ? error : new Error(String(error));
        fileEntry?.unpipe(destination);
        fileEntry?.destroy();
        destination.destroy(failure);
        parser.abort(failure);
        await Promise.allSettled([sourceDone, destinationDone]);
        throw error;
    }
}

/**
 * Given a single file as a buffer, returns a stream of tarball
 * data containing that file.
 * @param source The source file as a buffer.
 * @param sourceFileName The name of the source file (will be written
 * into the tarball)
 * @param atime Optional date when the file was last accessed
 * @param mtime Optional date when the file was last modified
 * @param ctime Optional date when the file was created
 * @param mode Optional unix file mode specifier
 * @param gid Optional unix group id specifier
 * @param uid Optional unix user id specifier
 * @returns A stream to read tarball data from
 */
export async function tarPackStream(source: Buffer, sourceFileName: string, atime: Date = new Date(), mtime: Date = new Date(), ctime: Date = new Date(), mode?: number, gid?: number, uid?: number): Promise<NodeJS.ReadableStream> {
    const tar = await getTar();

    const tarPack = new tar.Pack({ portable: true });
    const readEntry = new tar.ReadEntry(new tar.Header({
        path: sourceFileName,
        type: 'File',
        size: source.length,
        atime,
        mtime,
        ctime,
        mode,
        gid,
        uid,
    }));

    tarPack.add(readEntry);
    readEntry.write(source);
    readEntry.end();
    tarPack.end();

    return stream.Readable.from(tarPack);
}
