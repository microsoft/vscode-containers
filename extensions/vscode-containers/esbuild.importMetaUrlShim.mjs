/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// The extension bundle is CJS, but dependencies are resolved to their ESM builds via the
// `module` main field. esbuild replaces `import.meta` with `{}` in CJS output, so any dependency
// doing `createRequire(import.meta.url)` receives `undefined` and throws at module init.
// `@azure/storage-common`'s crc64 module does exactly that, which broke uploads to Azure blobs.
// Injecting a real file URL keeps those dependencies working in the bundle.
import { pathToFileURL } from 'url';

// `__filename` is injected by esbuild into the CJS output, where it points at the bundle itself.
export const __importMetaUrl = pathToFileURL(__filename).href;
