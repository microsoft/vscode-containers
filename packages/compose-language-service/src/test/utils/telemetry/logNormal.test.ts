/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { logNormal } from '../../../service/utils/telemetry/logNormal';

describe('(Unit) logNormal', () => {
    describe('Common scenarios', () => {
        it('Should give correct results', () => {
            const testData = [91, 53, 106, 98, 87, 97, 85, 109, 93, 47, 63, 72, 46, 106, 84, 69, 120, 82, 74, 104, 70, 63, 93, 82, 77, 88, 93, 120, 47, 55, 117, 120, 58, 55, 70, 96, 49, 119, 86, 107, 90, 103, 61, 92, 122, 90, 56, 113, 64, 62];

            const result = logNormal(testData);

            result.median.should.equal(81);
            result.mu.should.equal(4.393);
            result.sigma.should.equal(0.286);
        });

        it('Should give sigma of 0 for single item inputs', () => {
            const testData = [91];

            const result = logNormal(testData);

            result.median.should.equal(91);
            result.mu.should.equal(4.511);
            result.sigma.should.equal(0);
        });
    });

    describe('Error scenarios', () => {
        it('Should return 0\'s for undefined or empty inputs', () => {
            const result1 = logNormal(undefined as unknown as []);

            result1.median.should.equal(0);
            result1.mu.should.equal(0);
            result1.sigma.should.equal(0);

            const result2 = logNormal([]);

            result2.median.should.equal(0);
            result2.mu.should.equal(0);
            result2.sigma.should.equal(0);
        });
    });
});
