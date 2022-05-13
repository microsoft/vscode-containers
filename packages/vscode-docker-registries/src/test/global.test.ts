/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';

before('Global setup', function () {
    console.log('Global setup');
    chai.use(chaiAsPromised);
    chai.should();
});
