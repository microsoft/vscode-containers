/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// Distribution entry point.
//
// The Copilot CLI only discovers a plugin's extensions under
// `<plugin-root>/com.github.copilot/extensions/<id>/`. That is a distribution
// layout, not a source layout, so rather than keep a second copy of the
// extension in that shape this file points at the real one a few levels up.
//
// A pointer rather than a copy on purpose: two committed copies of the same
// code drift, and the stale one is invisible for exactly as long as the built
// bundle looks current.
//
// Everything the real entry point loads -- `./bundle/host.mjs`, `./server.mjs` --
// resolves relative to itself, so it behaves identically whether it was reached
// through here or directly.
import "../../../extension.mjs";
