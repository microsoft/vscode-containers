/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { TextDocument } from 'vscode-languageserver-textdocument';
import { Range } from 'vscode-languageserver-types';
import { Range as YamlRange } from 'yaml/dist/nodes/Node';
import { yamlRangeToLspRange } from '../../service/utils/yamlRangeToLspRange';

describe('(Unit) yamlRangeToLspRange', () => {
    describe('Common scenarios', () => {
        it('Should return the correct result for two-integer ranges', () => {
            const doc = TextDocument.create('file:///foo', 'dockercompose', 1, `version: '123'
services:
  foo:
    image: redis`);

            const result = yamlRangeToLspRange(doc, [4, 29]);
            result.should.deep.equal(Range.create(0, 4, 2, 4));
        });

        it('Should return the correct result for yaml `Range` objects', () => {
            const doc = TextDocument.create('file:///foo', 'dockercompose', 1, `version: '123'
services:
  foo:
    image: redis`);

            const yamlRange: YamlRange = [4, 29, 30];
            const result = yamlRangeToLspRange(doc, yamlRange);
            result.should.deep.equal(Range.create(0, 4, 2, 4));
        });
    });
});
