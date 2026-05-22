/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as vscode from 'vscode';
import { configPrefix } from '../constants';

const CUSTOM_LABELS_SETTING = 'oci.customLabels';

export interface CustomLabelRule {
    label: string;
    mediaType?: RegExp;
    predicateType?: RegExp;
    artifactType?: RegExp;
}

export interface CustomLabelMatchContext {
    mediaType?: string | null;
    predicateType?: string | null;
    artifactType?: string | null;
}

interface RawRule {
    label?: unknown;
    mediaType?: unknown;
    predicateType?: unknown;
    artifactType?: unknown;
}

function compileGlob(pattern: string): RegExp {
    const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${escaped}$`, 'i');
}

function compileField(value: unknown): RegExp | undefined {
    if (typeof value !== 'string' || value.length === 0) {
        return undefined;
    }

    try {
        return compileGlob(value);
    } catch {
        return undefined;
    }
}

export function loadCustomLabelRules(): CustomLabelRule[] {
    const raw = vscode.workspace
        .getConfiguration(configPrefix)
        .get<RawRule[]>(CUSTOM_LABELS_SETTING, []);

    if (!Array.isArray(raw)) {
        return [];
    }

    const rules: CustomLabelRule[] = [];
    for (const entry of raw) {
        if (!entry || typeof entry !== 'object' || typeof entry.label !== 'string' || entry.label.length === 0) {
            continue;
        }

        const rule: CustomLabelRule = {
            label: entry.label,
            mediaType: compileField(entry.mediaType),
            predicateType: compileField(entry.predicateType),
            artifactType: compileField(entry.artifactType),
        };

        if (!rule.mediaType && !rule.predicateType && !rule.artifactType) {
            continue;
        }

        rules.push(rule);
    }

    return rules;
}

export function matchCustomLabel(
    context: CustomLabelMatchContext,
    rules: CustomLabelRule[]
): string | null {
    for (const rule of rules) {
        if (rule.mediaType && (!context.mediaType || !rule.mediaType.test(context.mediaType))) {
            continue;
        }

        if (rule.predicateType && (!context.predicateType || !rule.predicateType.test(context.predicateType))) {
            continue;
        }

        if (rule.artifactType && (!context.artifactType || !rule.artifactType.test(context.artifactType))) {
            continue;
        }

        return rule.label;
    }

    return null;
}
