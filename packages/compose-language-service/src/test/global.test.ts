/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
import * as fs from 'fs';
import { isMap, isScalar, parseDocument } from 'yaml';

before('Global setup', function () {
    console.log('Global setup');
    chai.use(chaiAsPromised);
    chai.should();
});

describe('Hello', function () {
    it('Should run a test', function () {
        const doc = parseDocument(fs.readFileSync('src/test/samples/docker-compose.yml', { encoding: 'utf-8' }));

        const serviceMap = doc.getIn(['services']);
        if (isMap(serviceMap)) {
            for (const service of serviceMap.items) {
                if (isMap(service.value)) {
                    const image = service.value.getIn(['image'], true);
                    if (isScalar(image)) {
                        const imageName = image.value;
                        console.log(imageName);
                    }
                }
            }
        }
    });
});
