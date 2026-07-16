/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/*
 * The Azure Artifacts proxy sits behind a load balancer that stamps a random backend shard host
 * (ms-feed-N.pkgs.visualstudio.com) into each package's `dist.tarball`, which pnpm then records
 * in the lockfile, causing churn and CI breakage as shards rotate. Rewriting the host to a stable
 * one fails ERR_PNPM_TARBALL_URL_MISMATCH (pnpm re-verifies against the still-random metadata), so
 * this hook DELETES the field instead: pnpm then derives the standard registry URL, which serves
 * the same tarballs and needs no metadata verification. The lockfile becomes deterministic.
 */

/*
 * A tarball URL is volatile if it points at a load-balancer shard host, or at the stable proxy
 * host (a leftover from a previous rewrite). Either way it should be dropped so pnpm re-derives
 * the standard registry URL.
 */
const VOLATILE_TARBALL = /^https:\/\/(ms-feed-\d+\.pkgs\.visualstudio\.com\/1es-public\/_packaging\/npm-public\/npm\/registry|packagefeedproxy\.microsoft\.io\/npm)\//;

function afterAllResolved(lockfile) {
    for (const pkg of Object.values(lockfile.packages ?? {})) {
        if (VOLATILE_TARBALL.test(pkg?.resolution?.tarball)) {
            delete pkg.resolution.tarball;
        }
    }
    return lockfile;
}

export const hooks = {
    afterAllResolved,
};
