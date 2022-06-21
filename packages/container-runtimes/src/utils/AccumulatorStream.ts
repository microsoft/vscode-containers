/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as stream from 'stream';

// Caller can pass any writable options except 'write' and 'writev'
type AccumulatorOptions = Omit<stream.WritableOptions, 'write' | 'writev'>;

export class AccumulatorStream extends stream.Writable {
    private accumulatedOutput: string = '';
    public readonly output: Promise<string>;

    public constructor(options?: AccumulatorOptions) {
        super({
            ...options,
            write: (chunk, encoding, callback) => {
                this.accumulatedOutput += chunk.toString();
                callback();
            },
        });

        this.output = new Promise<string>((resolve, reject) => {
            this.on('close', () => {
                resolve(this.accumulatedOutput);
            });

            this.on('error', (err) => {
                reject(err);
            });
        });
    }
}
