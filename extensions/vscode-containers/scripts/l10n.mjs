/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE.md in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * Localization helper for the Container Tools extension.
 *
 *   node scripts/l10n.mjs           Regenerates `l10n/bundle.l10n.json`, the English template that
 *                                   translations of `vscode.l10n.t(...)` strings are based on. It
 *                                   lists the strings of this extension, of the workspace packages
 *                                   that are bundled with it, and of the dependencies that ship their
 *                                   own `l10n/bundle.l10n.json`.
 *   node scripts/l10n.mjs --check   Fails if that template is out of date, or if a translation would
 *                                   break the UI (e.g. a lost `{0}` placeholder or `command:` link).
 *                                   Missing or stale translations are reported but do not fail, since
 *                                   VS Code falls back to English for any string without a translation.
 *
 * Translations live next to their English sources:
 *   - `package.nls.<locale>.json`      for `%key%` strings in package.json (source: package.nls.json)
 *   - `l10n/bundle.l10n.<locale>.json` for `vscode.l10n.t(...)` strings (source: l10n/bundle.l10n.json)
 * where `<locale>` is a lowercase VS Code display language, e.g. `zh-cn`.
 */

import { getL10nJson } from '@vscode/l10n-dev';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

const extensionDir = path.resolve(import.meta.dirname, '..');
const l10nDir = path.join(extensionDir, 'l10n');
const bundleTemplatePath = path.join(l10nDir, 'bundle.l10n.json');
const nlsTemplatePath = path.join(extensionDir, 'package.nls.json');

const sourceExtensions = new Set(['.ts', '.tsx', '.js', '.jsx']);
// Tests only call `vscode.l10n.t` to compute the strings that the code under test produces
const ignoredDirectories = new Set(['node_modules', 'dist', 'out', 'test']);

async function readJson(file) {
    return JSON.parse(await fs.readFile(file, 'utf8'));
}

async function writeJson(file, value) {
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.writeFile(file, JSON.stringify(value, undefined, 4) + '\n', 'utf8');
}

/**
 * The extension's own `src` plus every workspace package it depends on. esbuild bundles those from
 * source, so their `vscode.l10n.t(...)` strings are looked up in this extension's bundle at runtime.
 */
async function getSourceRoots(manifest) {
    const workspaceDependencies = new Set(
        Object.entries(manifest.dependencies ?? {})
            .filter(([, version]) => version.startsWith('workspace:'))
            .map(([name]) => name)
    );

    const packagesDir = path.resolve(extensionDir, '../../packages');
    const roots = [path.join(extensionDir, 'src')];
    for (const entry of await fs.readdir(packagesDir, { withFileTypes: true })) {
        const packageManifest = path.join(packagesDir, entry.name, 'package.json');
        if (entry.isDirectory() && workspaceDependencies.has((await readJson(packageManifest)).name)) {
            roots.push(path.join(packagesDir, entry.name, 'src'));
        }
    }

    return roots;
}

async function getSourceFiles(root) {
    const files = [];
    for (const entry of await fs.readdir(root, { withFileTypes: true, recursive: true })) {
        const file = path.join(entry.parentPath, entry.name);
        const segments = path.relative(root, file).split(path.sep);
        if (entry.isFile() &&
            sourceExtensions.has(path.extname(file)) &&
            !file.endsWith('.d.ts') &&
            !segments.some(segment => ignoredDirectories.has(segment))) {
            files.push(file);
        }
    }

    return files;
}

/**
 * The strings of the dependencies that ship an `l10n/bundle.l10n.json`, like the `@microsoft/vscode-azext-*`
 * libraries. They are bundled into the extension, and VS Code looks up the `vscode.l10n.t(...)` calls
 * of bundled code in the extension's own bundle, so they are translated along with the extension's strings.
 */
async function getDependencyBundles(manifest) {
    const bundles = [];
    for (const name of Object.keys(manifest.dependencies ?? {}).sort()) {
        const file = path.join(extensionDir, 'node_modules', name, 'l10n', 'bundle.l10n.json');
        const bundle = await fs.readFile(file, 'utf8').catch(error => {
            if (error.code === 'ENOENT') {
                return undefined;
            }

            throw error;
        });

        if (bundle) {
            bundles.push(JSON.parse(bundle));
        }
    }

    return bundles;
}

/**
 * Extracts the `vscode.l10n.t(...)` strings from the sources, followed by those of the dependencies.
 * Files are visited in a fixed order so the result is the same on every machine.
 */
async function extractBundleTemplate() {
    const manifest = await readJson(path.join(extensionDir, 'package.json'));
    const files = (await Promise.all((await getSourceRoots(manifest)).map(getSourceFiles))).flat().sort();
    const sources = await Promise.all(files.map(async file => ({
        extension: path.extname(file),
        contents: await fs.readFile(file, 'utf8'),
    })));

    const template = await getL10nJson(sources);
    for (const bundle of await getDependencyBundles(manifest)) {
        for (const [key, value] of Object.entries(bundle)) {
            template[key] ??= value;
        }
    }

    return template;
}

/** A bundle value is either the message, or `{ message, comment }` when the call has a comment. */
function getMessage(value) {
    return typeof value === 'string' ? value : value?.message;
}

/**
 * The parts of a message that must survive translation unchanged, or the UI breaks: argument
 * placeholders, VS Code variables (`${workspaceFolder}`, `${command:pickProcess}`, ... which users
 * copy into their `launch.json`), code spans, links, icons, line breaks, and leading/trailing
 * whitespace.
 */
function getFragile(message) {
    return {
        'placeholders': [...new Set(message.match(/\{\w+\}/g) ?? [])].sort().join(' '),
        'variables': [...new Set(message.match(/\$\{[^}]*\}/g) ?? [])].sort().join(' '),
        'code spans': (message.match(/`[^`]*`/g) ?? []).join(' '),
        'links': (message.match(/\]\([^)\s]*\)|https?:\/\/[^\s"'<>)\]，。；：！？]+/g) ?? []).join(' '),
        'icons': (message.match(/\$\([\w-]+\)/g) ?? []).join(' '),
        'line breaks': String((message.match(/\n/g) ?? []).length),
        'leading whitespace': JSON.stringify(/^\s*/.exec(message)[0]),
        'trailing whitespace': JSON.stringify(/\s*$/.exec(message)[0]),
    };
}

/**
 * @param {Record<string, unknown>} source the English strings, keyed by their translation key
 * @param {Record<string, unknown>} translation the translated strings, keyed the same way
 * @param {(key: string) => string | undefined} getSourceMessage the English message for a key
 */
function compare(source, translation, getSourceMessage) {
    const errors = [];
    const untranslated = Object.keys(source).filter(key => !Object.hasOwn(translation, key));
    const stale = Object.keys(translation).filter(key => !Object.hasOwn(source, key));

    for (const [key, value] of Object.entries(translation)) {
        const sourceMessage = getSourceMessage(key);
        if (sourceMessage === undefined) {
            continue; // Stale, reported separately
        }

        const message = getMessage(value);
        if (typeof message !== 'string') {
            errors.push(`"${key}": the translation must be a string.`);
            continue;
        }

        const expected = getFragile(sourceMessage);
        const actual = getFragile(message);
        for (const name of Object.keys(expected)) {
            if (expected[name] !== actual[name]) {
                errors.push(`"${key}": ${name} differ from the English text (expected ${expected[name] || 'none'}, found ${actual[name] || 'none'}).`);
            }
        }
    }

    return { errors, untranslated, stale };
}

async function listLocales(directory, pattern) {
    const locales = new Map();
    for (const name of await fs.readdir(directory).catch(() => [])) {
        const locale = pattern.exec(name)?.[1];
        if (locale) {
            locales.set(locale, path.join(directory, name));
        }
    }

    return locales;
}

async function check() {
    const problems = [];
    const summaries = [];
    const details = [];

    // 1. The English template must list every string in the source
    const extracted = await extractBundleTemplate();
    const bundleTemplate = await readJson(bundleTemplatePath).catch(() => ({}));
    const templateKeys = Object.keys(bundleTemplate);
    if (Object.keys(extracted).length !== templateKeys.length || !templateKeys.every(key => Object.hasOwn(extracted, key))) {
        problems.push('l10n/bundle.l10n.json is out of date. Run `pnpm run l10n` and commit the result.');
    }

    // 2. Translations must not break the UI
    const nlsTemplate = await readJson(nlsTemplatePath);
    const bundleLocales = await listLocales(l10nDir, /^bundle\.l10n\.(.+)\.json$/);
    const nlsLocales = await listLocales(extensionDir, /^package\.nls\.(.+)\.json$/);

    const files = [
        ...[...bundleLocales].map(([locale, file]) => ({ locale, file, name: 'l10n/bundle.l10n', source: extracted, getSourceMessage: key => getMessage(extracted[key]) })),
        ...[...nlsLocales].map(([locale, file]) => ({ locale, file, name: 'package.nls', source: nlsTemplate, getSourceMessage: key => nlsTemplate[key] })),
    ];

    for (const { locale, file, name, source, getSourceMessage } of files) {
        const { errors, untranslated, stale } = compare(source, await readJson(file), getSourceMessage);
        const label = `${name}.${locale}.json`;

        problems.push(...errors.map(error => `${label}: ${error}`));
        summaries.push(`${label}: ${untranslated.length} untranslated, ${stale.length} stale`);
        details.push(
            ...untranslated.map(key => `${label}: untranslated ${JSON.stringify(key)}`),
            ...stale.map(key => `${label}: stale ${JSON.stringify(key)}`),
        );
    }

    // Keep the routine output short; per-string detail is only interesting to translators
    for (const line of [...summaries, ...(process.argv.includes('--verbose') ? details : [])]) {
        console.log(line);
    }

    if (problems.length) {
        console.error(problems.map(problem => `error: ${problem}`).join('\n'));
        process.exitCode = 1;
    }
}

async function exportTemplate() {
    const template = await extractBundleTemplate();
    await writeJson(bundleTemplatePath, template);
    console.log(`Wrote ${Object.keys(template).length} strings to ${path.relative(process.cwd(), bundleTemplatePath)}`);
}

await (process.argv.includes('--check') ? check() : exportTemplate());
