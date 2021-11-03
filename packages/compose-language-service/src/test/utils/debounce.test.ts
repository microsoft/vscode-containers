/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import { debounce } from '../../service/utils/debounce';

// This delay is used as the delay given to `debounce`, but also assertions are made that each test should take at least (delay - 1) milliseconds (minus 1 is for sanity against rounding)
const delay = 10;

describe('(Unit) debounce', () => {
    describe('Common scenarios', () => {
        it('Should filter multiple calls into one', async () => {
            let x = 0;
            const start = process.hrtime.bigint();

            await new Promise<void>((resolve) => {
                debounce(delay, { callId: 'debounce', uri: 'file:///foo', }, () => {
                    x++;
                    chai.assert.fail('Should not be executing this debounce call');
                });

                debounce(delay, { callId: 'debounce', uri: 'file:///foo', }, () => {
                    x++;
                    resolve();
                });
            });

            const stop = process.hrtime.bigint();
            const elapsedMs = Number((stop - start) / BigInt(1000 * 1000));

            x.should.equal(1); // x should only have been incremented once
            elapsedMs.should.be.greaterThanOrEqual(delay - 1); // It should take at least <delay - 1> ms to get to this point
        });

        it('Should debounce separate call IDs in the same document separately', async () => {
            let x = 0;
            const start = process.hrtime.bigint();

            await Promise.all([
                new Promise<void>((resolve) => {
                    debounce(delay, { callId: 'debounce1', uri: 'file:///foo', }, () => {
                        x++;
                        resolve();
                    });
                }),

                new Promise<void>((resolve) => {
                    debounce(delay, { callId: 'debounce2', uri: 'file:///foo', }, () => {
                        x++;
                        resolve();
                    });
                })
            ]);

            const stop = process.hrtime.bigint();
            const elapsedMs = Number((stop - start) / BigInt(1000 * 1000));

            x.should.equal(2); // x should have been incremented twice
            elapsedMs.should.be.greaterThanOrEqual(delay - 1); // It should take at least <delay - 1> ms to get to this point
        });

        it('Should debounce the same call ID in separate documents separately', async () => {
            let x = 0;
            const start = process.hrtime.bigint();

            await Promise.all([
                new Promise<void>((resolve) => {
                    debounce(delay, { callId: 'debounce', uri: 'file:///foo1', }, () => {
                        x++;
                        resolve();
                    });
                }),

                new Promise<void>((resolve) => {
                    debounce(delay, { callId: 'debounce', uri: 'file:///foo2', }, () => {
                        x++;
                        resolve();
                    });
                })
            ]);

            const stop = process.hrtime.bigint();
            const elapsedMs = Number((stop - start) / BigInt(1000 * 1000));

            x.should.equal(2); // x should have been incremented twice
            elapsedMs.should.be.greaterThanOrEqual(delay - 1); // It should take at least <delay - 1> ms to get to this point
        });

        it('Should pass along the thisArg', async () => {
            const start = process.hrtime.bigint();

            await new Promise<void>((resolve) => {
                const x = {
                    test: function () {
                        this.should.be.ok;
                        this.foo.should.equal(1);
                        resolve();
                    },
                    foo: 1,
                };

                debounce(delay, { callId: 'debounce', uri: 'file:///foo', }, x.test, x);
            });

            const stop = process.hrtime.bigint();
            const elapsedMs = Number((stop - start) / BigInt(1000 * 1000));

            elapsedMs.should.be.greaterThanOrEqual(delay - 1); // It should take at least <delay - 1> ms to get to this point
        });
    });
});
