/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { Lazy } from '../../service/utils/Lazy';

describe('(Unit) Lazy', () => {
    describe('Common scenarios', () => {
        it('Should calculate the value only once', () => {
            let x = 0;
            const a = new Lazy<number>(() => {
                return ++x;
            });

            a.value.should.equal(1);
            a.value.should.equal(1); // Shouldn't change after re-requesting the value
            x.should.equal(1);
        });

        it('Should return the correct result for hasValue', () => {
            let x = 0;
            const a = new Lazy<number>(() => {
                return ++x;
            });

            a.hasValue().should.be.false;
            a.value.should.equal(1);
            a.hasValue().should.be.true;
        });

        it('Should allow clearing the value', () => {
            let x = 0;
            const a = new Lazy<number>(() => {
                return ++x;
            });

            a.value.should.equal(1);
            x.should.equal(1);

            a.clear();

            a.value.should.equal(2);
            x.should.equal(2);
        });
    });

    describe('Error scenarios', () => {
        it('Should rethrow errors', () => {
            const a = new Lazy<number>(() => {
                throw new Error('foo');
            });

            expect(() => a.value).to.throw(Error, 'foo');
        });
    });
});
