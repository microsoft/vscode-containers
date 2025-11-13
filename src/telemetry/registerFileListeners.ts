/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { IActionContext, registerEvent } from '@microsoft/vscode-azext-utils';
import * as vscode from 'vscode';
import { ext } from '../extensionVariables';

type DocHandler = (context: IActionContext, doc: vscode.TextDocument) => void;

export function registerFileListeners(): void {
    if (vscode.env.isTelemetryEnabled) {
        registerEvent('dockerfilesave', vscode.workspace.onDidSaveTextDocument, handleDocEvent('dockerfile', (context, doc) => {
            context.telemetry.properties.lineCount = doc.lineCount.toString();

            void ext.activityMeasurementService.recordActivity('overall');
        }));

        registerEvent('composefilesave', vscode.workspace.onDidSaveTextDocument, handleDocEvent('dockercompose', (context, doc) => {
            context.telemetry.properties.lineCount = doc.lineCount.toString();

            void ext.activityMeasurementService.recordActivity('overall');
        }));
    }

    registerEvent('dockerfileopen', vscode.workspace.onDidOpenTextDocument, handleDocEvent('dockerfile'));

    registerEvent('composefileopen', vscode.workspace.onDidOpenTextDocument, handleDocEvent('dockercompose'));
}

function handleDocEvent(languageId: string, additionalHandler?: DocHandler): DocHandler {
    return (context: IActionContext, doc: vscode.TextDocument) => {
        // If it is not the document of type we expect, skip
        if (doc.languageId !== languageId || doc.uri.scheme !== 'file') {
            context.telemetry.suppressAll = true;
            return;
        }

        if (additionalHandler) {
            additionalHandler(context, doc);
        }
    };
}
