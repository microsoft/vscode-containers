/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import * as os from 'os';
import * as path from 'path';
import { getSafeExecPath } from '../utils/getSafeExecPath';

describe('(unit) getSafeExecPath', () => {
    it('Should return the command as is on non-Windows platforms', function () {
        if (os.platform() === 'win32') {
            this.skip(); // Skip this test on Windows
        }

        expect(getSafeExecPath('some-command')).to.equal('some-command');
        expect(getSafeExecPath('/root/command')).to.equal('/root/command');
        expect(getSafeExecPath('./relative-command')).to.equal('./relative-command');
        expect(getSafeExecPath('../relative-command')).to.equal('../relative-command');
        expect(getSafeExecPath('relative/command')).to.equal('relative/command');
    });

    it('Should return an absolute path on Windows', function () {
        if (os.platform() !== 'win32') {
            this.skip(); // Skip this test on non-Windows
        }

        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        const absoluteCommand = process.env.COMSPEC!;

        expect(getSafeExecPath(path.basename(absoluteCommand)).toLowerCase()).to.equal(absoluteCommand.toLowerCase()); // 'cmd' should resolve to the COMSPEC environment variable on Windows
        expect(getSafeExecPath(absoluteCommand)).to.equal(absoluteCommand); // An already-absolute path should not change at all even in casing
    });

    it('Should not alter explicitly relative-pathed commands on Windows', function () {
        if (os.platform() !== 'win32') {
            this.skip(); // Skip this test on non-Windows
        }

        expect(getSafeExecPath('./relative-command')).to.equal('./relative-command');
        expect(getSafeExecPath('../relative-command')).to.equal('../relative-command');
        expect(getSafeExecPath('relative/command')).to.equal('relative/command');

        expect(getSafeExecPath('.\\relative-command')).to.equal('.\\relative-command');
        expect(getSafeExecPath('..\\relative-command')).to.equal('..\\relative-command');
        expect(getSafeExecPath('relative\\command')).to.equal('relative\\command');
    });
});
