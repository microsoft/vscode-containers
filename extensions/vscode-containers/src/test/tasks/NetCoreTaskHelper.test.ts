/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import assert from 'assert';
import * as fse from 'fs-extra';
import * as os from 'os';
import * as path from 'path';
import { NetCoreTaskHelper } from '../../tasks/netcore/NetCoreTaskHelper';

suite('(unit) tasks/netcore/NetCoreTaskHelper', () => {
    let tempFolder: string;

    setup(async () => {
        tempFolder = await fse.mkdtemp(path.join(os.tmpdir(), 'netcore-user-secrets-'));
    });

    teardown(async () => {
        await fse.remove(tempFolder);
    });

    const cases = [
        { name: 'Detects an active user secrets property', contents: '<Project><UserSecretsId>app</UserSecretsId></Project>', expected: true },
        { name: 'Matches the property case-insensitively', contents: '<Project><usersecretsid>app</usersecretsid></Project>', expected: true },
        { name: 'Ignores a commented property', contents: '<Project><!-- <UserSecretsId>app</UserSecretsId> --></Project>', expected: false },
        { name: 'Ignores multiline comments', contents: '<Project><!--\n<UserSecretsId>app</UserSecretsId>\n--></Project>', expected: false },
        { name: 'Ignores adjacent comments', contents: '<Project><!-- UserSecretsId --><!-- UserSecretsId --></Project>', expected: false },
        { name: 'Detects an active property after a comment', contents: '<Project><!-- old property --><UserSecretsId>app</UserSecretsId></Project>', expected: true },
        { name: 'Does not join fragments across comments', contents: '<Project>User<!-- comment -->SecretsId</Project>', expected: false },
        { name: 'Does not join fragments across adjacent comments', contents: '<Project>User<!-- first --><!-- second -->SecretsId</Project>', expected: false },
        { name: 'Does not infer secrets for an empty project', contents: '<Project />', expected: false },
        { name: 'Preserves file-based app property detection', contents: '#:property UserSecretsId=app\nConsole.WriteLine("Hello");', expected: true, fileName: 'app.cs' },
    ];

    for (const testCase of cases) {
        test(testCase.name, async () => {
            const appProject = path.join(tempFolder, testCase.fileName ?? 'app.csproj');
            await fse.writeFile(appProject, testCase.contents);

            const helper = new NetCoreTaskHelper();
            assert.strictEqual(await helper['inferUserSecrets']({ appProject }), testCase.expected);
        });
    }
});
