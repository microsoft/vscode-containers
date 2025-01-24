/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/* eslint-disable @typescript-eslint/naming-convention */

// A map of the old settings to their new names. Most are just directly renamed, but some are
// not direct renames, so we need to do this manually.
export const settingsMap: Record<string, string> = {
    "docker.promptForRegistryWhenPushingImages": "containers.promptForRegistryWhenPushingImages",
    "docker.commands.build": "containers.commands.build",
    "docker.commands.run": "containers.commands.run",
    "docker.commands.runInteractive": "containers.commands.runInteractive",
    "docker.commands.attach": "containers.commands.attach",
    "docker.commands.logs": "containers.commands.logs",
    "docker.commands.composeUp": "containers.commands.composeUp",
    "docker.commands.composeUpSubset": "containers.commands.composeUpSubset",
    "docker.commands.composeDown": "containers.commands.composeDown",
    "docker.containers.groupBy": "containers.containers.groupBy",
    "docker.containers.groupByLabel": "containers.containers.groupByLabel",
    "docker.containers.description": "containers.containers.description",
    "docker.containers.label": "containers.containers.label",
    "docker.containers.sortBy": "containers.containers.sortBy",
    "docker.contexts.description": "containers.contexts.description",
    "docker.contexts.label": "containers.contexts.label",
    "docker.contexts.showInStatusBar": "containers.contexts.showInStatusBar",
    "docker.images.groupBy": "containers.images.groupBy",
    "docker.images.description": "containers.images.description",
    "docker.images.label": "containers.images.label",
    "docker.images.sortBy": "containers.images.sortBy",
    "docker.images.checkForOutdatedImages": "containers.images.checkForOutdatedImages",
    "docker.networks.groupBy": "containers.networks.groupBy",
    "docker.networks.description": "containers.networks.description",
    "docker.networks.showBuiltInNetworks": "containers.networks.showBuiltInNetworks",
    "docker.networks.label": "containers.networks.label",
    "docker.networks.sortBy": "containers.networks.sortBy",
    "docker.volumes.groupBy": "containers.volumes.groupBy",
    "docker.volumes.description": "containers.volumes.description",
    "docker.volumes.label": "containers.volumes.label",
    "docker.volumes.sortBy": "containers.volumes.sortBy",
    "docker.imageBuildContextPath": "containers.imageBuildContextPath",
    "docker.truncateLongRegistryPaths": "containers.truncateLongRegistryPaths",
    "docker.truncateMaxLength": "containers.truncateMaxLength",
    "docker.environment": "containers.environment",

    // None of the Dockerfile language server settings changed
    // "docker.languageserver.diagnostics.deprecatedMaintainer": "docker.languageserver.diagnostics.deprecatedMaintainer",
    // "docker.languageserver.diagnostics.emptyContinuationLine": "docker.languageserver.diagnostics.emptyContinuationLine",
    // "docker.languageserver.diagnostics.directiveCasing": "docker.languageserver.diagnostics.directiveCasing",
    // "docker.languageserver.diagnostics.instructionCasing": "docker.languageserver.diagnostics.instructionCasing",
    // "docker.languageserver.diagnostics.instructionCmdMultiple": "docker.languageserver.diagnostics.instructionCmdMultiple",
    // "docker.languageserver.diagnostics.instructionEntrypointMultiple": "docker.languageserver.diagnostics.instructionEntrypointMultiple",
    // "docker.languageserver.diagnostics.instructionHealthcheckMultiple": "docker.languageserver.diagnostics.instructionHealthcheckMultiple",
    // "docker.languageserver.diagnostics.instructionJSONInSingleQuotes": "docker.languageserver.diagnostics.instructionJSONInSingleQuotes",
    // "docker.languageserver.diagnostics.instructionWorkdirRelative": "docker.languageserver.diagnostics.instructionWorkdirRelative",
    // "docker.languageserver.formatter.ignoreMultilineInstructions": "docker.languageserver.formatter.ignoreMultilineInstructions",

    "docker.dockerComposeBuild": "containers.composeBuild", // Changed name
    "docker.dockerComposeDetached": "containers.composeDetached", // Changed name
    "docker.showRemoteWorkspaceWarning": "containers.showRemoteWorkspaceWarning",
    "docker.scaffolding.templatePath": "containers.scaffolding.templatePath",
    "docker.dockerPath": "containers.containerCommand", // Changed name
    "docker.composeCommand": "containers.composeCommand",
    "docker.enableDockerComposeLanguageService": "containers.enableComposeLanguageService" // Changed name
};

/* eslint-enable @typescript-eslint/naming-convention */
