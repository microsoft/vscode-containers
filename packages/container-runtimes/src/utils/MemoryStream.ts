/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';

/**
 * This acts more or less like C#'s `MemoryStream`
 */
export class MemoryStream extends stream.PassThrough {
    /**
     * Gets the full stream content in a buffer
     * @returns A {@link Buffer} containing the full content of the stream
     */
    public async getBytes(): Promise<Buffer> {
        return new Promise<Buffer>((resolve, reject) => {
            const chunks: Buffer[] = [];

            this.on('data', (chunk: Buffer) => {
                chunks.push(chunk);
            });

            this.on('end', () => {
                resolve(Buffer.concat(chunks));
            });

            this.on('error', (err) => {
                reject(err);
            });
        });
    }

    /**
     * Gets the full stream content in a string
     * @param encoding (Optional) The encoding to use when converting to string
     * @returns A string containing the full content of the stream
     */
    public async getString(encoding?: BufferEncoding): Promise<string> {
        return (await this.getBytes()).toString(encoding);
    }
}
