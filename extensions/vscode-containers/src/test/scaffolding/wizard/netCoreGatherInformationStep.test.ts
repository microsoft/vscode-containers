/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as semver from 'semver';
import { getNetCoreBaseImages } from '../../../scaffolding/wizard/netCore/NetCoreGatherInformationStep';

suite('(unit) scaffolding/wizard/netCore/NetCoreGatherInformationStep', () => {
    test('Uses stable .NET 11 images for ASP.NET Core', () => {
        const images = getNetCoreBaseImages(semver.coerce('11.0')!, '.NET: ASP.NET Core');

        assert.deepStrictEqual(images, {
            runtimeBaseImage: 'mcr.microsoft.com/dotnet/aspnet:11.0',
            sdkBaseImage: 'mcr.microsoft.com/dotnet/sdk:11.0',
        });
    });

    test('Uses stable .NET 11 Windows images with the ltsc2025 suffix', () => {
        const images = getNetCoreBaseImages(semver.coerce('11.0')!, '.NET: ASP.NET Core', 'Windows');

        assert.deepStrictEqual(images, {
            runtimeBaseImage: 'mcr.microsoft.com/dotnet/aspnet:11.0-nanoserver-ltsc2025',
            sdkBaseImage: 'mcr.microsoft.com/dotnet/sdk:11.0-nanoserver-ltsc2025',
        });
    });
});
