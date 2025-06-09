/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { wslifyPath } from '../utils/wslifyPath';

describe('(unit) wslifyPath tests', () => {
    it('Should wslify Windows paths correctly', () => {
        const windowsPath = 'C:\\Users\\user\\Desktop\\file.txt';
        const wslPath = '/mnt/c/Users/user/Desktop/file.txt';
        expect(wslifyPath(windowsPath)).to.equal(wslPath);
    });

    it('Should wslify Linux paths correctly by doing nothing to them', () => {
        const linuxPath = '/home/user/file.txt';
        expect(wslifyPath(linuxPath)).to.equal(linuxPath);
    });
});
