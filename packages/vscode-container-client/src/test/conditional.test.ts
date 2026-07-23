/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { conditional } from '../utils/conditional';

describe('(unit) conditional', () => {
    it('should include string and expression when expression is truthy', () => {
        const result = conditional`label=${'key'}=${'value'}`;
        expect(result).to.equal('label=key=value');
    });

    it('should exclude string literal when expression is empty string', () => {
        const result = conditional`label=${'key'}=${''}`;
        expect(result).to.equal('label=key');
    });

    it('should exclude string literal when expression is null', () => {
        const result = conditional`label=${'key'}=${null}`;
        expect(result).to.equal('label=key');
    });

    it('should exclude string literal when expression is undefined', () => {
        const result = conditional`label=${'key'}=${undefined}`;
        expect(result).to.equal('label=key');
    });

    it('should handle multiple expressions with mixed truthy/falsy values', () => {
        const name = 'env';
        const value = 'production';
        const extra = undefined;
        const result = conditional`label=${name}=${value} extra=${extra}`;
        expect(result).to.equal('label=env=production');
    });

    it('should include the trailing string literal', () => {
        const result = conditional`start=${'value'} end`;
        expect(result).to.equal('start=value end');
    });

    it('should handle single expression', () => {
        const result = conditional`single=${'test'}`;
        expect(result).to.equal('single=test');
    });

    it('should return trailing literal only when all expressions are falsy', () => {
        const result = conditional`${null}${undefined} trailing`;
        expect(result).to.equal(' trailing');
    });
});
