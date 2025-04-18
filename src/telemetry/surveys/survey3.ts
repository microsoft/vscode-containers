/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { l10n } from 'vscode';
import { ext } from '../../extensionVariables';
import { Survey } from './SurveyManager';

const minimumOverallSessions = 10;

export const survey3: Survey = {
    id: 'survey3',
    prompt: l10n.t('How can we make the Container Tools extension better?'),
    buttons: new Map<string, string | undefined>([
        [l10n.t('Take survey'), 'https://aka.ms/dockerextensionsurvey'],
        [l10n.t('Don\'t ask again'), undefined],
    ]),
    activationDelayMs: 60 * 1000,
    isEligible: isEligible,
};

async function isEligible(): Promise<boolean> {
    const overallActivity = ext.activityMeasurementService.getActivityMeasurement('overall');
    return overallActivity.totalSessions >= minimumOverallSessions;
}
