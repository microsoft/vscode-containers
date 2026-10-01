/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This package is plain JavaScript and JSX; every other package here is
// TypeScript. The repository's shared config drives typescript-eslint through
// the project service and includes type-aware rules such as
// `no-floating-promises`, which need a TypeScript program. There is none here,
// so that config errors out rather than degrading.
//
// This composes the parts that do apply: the repository's copyright header
// rule, ESLint's own recommended set, and the TypeScript parser used purely as
// a syntax parser so it can read JSX. The header convention stays shared with
// the rest of the repository while the package is linted for what it is.
//
// Globals are listed explicitly rather than taken from the `globals` package,
// which this repository does not install.

import js from '@eslint/js';
import tsParser from '@typescript-eslint/parser';
import { azExtCopyrightHeaderRule } from '@microsoft/vscode-azext-eng/eslint';

const nodeGlobals = {
    process: 'readonly', console: 'readonly', Buffer: 'readonly',
    URL: 'readonly', URLSearchParams: 'readonly', TextEncoder: 'readonly', TextDecoder: 'readonly',
    fetch: 'readonly', AbortController: 'readonly', structuredClone: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
    setImmediate: 'readonly', queueMicrotask: 'readonly',
};

const browserGlobals = {
    window: 'readonly', document: 'readonly', location: 'readonly', navigator: 'readonly',
    console: 'readonly', fetch: 'readonly', WebSocket: 'readonly', EventSource: 'readonly',
    URL: 'readonly', URLSearchParams: 'readonly', Blob: 'readonly', FileReader: 'readonly',
    AbortController: 'readonly', ResizeObserver: 'readonly', MutationObserver: 'readonly',
    requestAnimationFrame: 'readonly', cancelAnimationFrame: 'readonly',
    setTimeout: 'readonly', clearTimeout: 'readonly', setInterval: 'readonly', clearInterval: 'readonly',
    getComputedStyle: 'readonly', CustomEvent: 'readonly', Event: 'readonly', MessageEvent: 'readonly',
    HTMLElement: 'readonly', Node: 'readonly', TextDecoder: 'readonly', structuredClone: 'readonly',
};

export default [
    {
        // Generated and committed: esbuild's output, regenerated every build.
        ignores: ['bundle/**'],
    },
    js.configs.recommended,
    azExtCopyrightHeaderRule,
    {
        files: ['**/*.{js,mjs,jsx}'],
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 2023,
            sourceType: 'module',
            parserOptions: {
                // Syntax only. Enabling the project service would demand a
                // tsconfig that does not exist and could not describe this package.
                projectService: false,
                project: false,
                ecmaFeatures: { jsx: true },
            },
            globals: nodeGlobals,
        },
        rules: {
            // An unused catch binding is this codebase's idiom for "failure is
            // expected and handled by falling through", so allow it while still
            // reporting unused variables and arguments.
            'no-unused-vars': ['error', {
                args: 'after-used',
                argsIgnorePattern: '^_',
                varsIgnorePattern: '^_',
                caughtErrors: 'none',
                // `const { $schema, ...rest } = x` is the idiomatic way to drop a
                // property; the named binding is meant to be unused.
                ignoreRestSiblings: true,
            }],
            eqeqeq: ['error', 'smart'],
            'no-var': 'error',
            'prefer-const': 'error',
        },
    },
    {
        files: ['src/webview/**/*.{js,jsx}'],
        languageOptions: { globals: browserGlobals },
    },
];
