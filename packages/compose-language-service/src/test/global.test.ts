/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import { Document, parseDocument } from 'yaml';
import { Pair, Scalar, YAMLMap } from 'yaml/dist/ast';

before('Global setup', function () {
    console.log('Global setup');
    chai.use(chaiAsPromised);
    chai.should();
});

describe('Hello', function () {
    it('Should run a test', function () {
        const doc = parseDocument(fs.readFileSync('D:\\compose-language-service\\src\\test\\samples\\docker-compose.yml', { encoding: 'utf-8' })) as Document.Parsed;

        const services = (doc.contents as YAMLMap)?.get('services')?.items?.map((pair: Pair) => pair.value) as YAMLMap[] ?? [];

        for (const service of services) {
            const image = service?.get('image', true) as Scalar | undefined;

            if (image) {
                return;
            }
        }
    });
});
