/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Helper to ensure vscode type placeholders can be loaded for tests

/* eslint-disable no-undef @typescript-eslint/no-var-requires */
const tsConfig = await import("../../tsconfig.json");
const tsConfigPaths = await import("tsconfig-paths");

tsConfigPaths.register({
  baseUrl: tsConfig['tsx'].compilerOptions.baseUrl,
  paths: tsConfig['tsx'].compilerOptions.paths,
});
/* eslint-enable no-undef @typescript-eslint/no-var-requires */
