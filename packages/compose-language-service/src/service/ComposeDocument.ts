/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ErrorCodes, Position, Range, ResponseError, TextDocumentIdentifier, TextDocumentsConfiguration } from 'vscode-languageserver';
import { DocumentUri, TextDocument } from 'vscode-languageserver-textdocument';
import { Document as YamlDocument, isDocument, Node as YamlNode, parseDocument } from 'yaml';
import { CRLF, DocumentSettings, DocumentSettingsParams, DocumentSettingsRequest, LF } from '../client/DocumentSettings';
import { ExtendedPositionParams, PositionInfo } from './ExtendedParams';
import { getCurrentContext } from './utils/ActionContext';
import { Lazy } from './utils/Lazy';

// The stated behavior of character number in the `Position` class is to roll back to line length if it exceeds the line length. So, this will work for any line <1m characters. That should cover most of them.
const MaximumLineLength = 1000 * 1000;

export class ComposeDocument {
    public readonly yamlDocument = new Lazy(() => this.buildYamlDocument());

    private documentSettings: DocumentSettings | undefined;

    /* private */ #textDocument: TextDocument;
    public get textDocument(): TextDocument {
        return this.#textDocument;
    }

    public get id(): TextDocumentIdentifier {
        return {
            uri: this.textDocument.uri,
        };
    }

    public get uri(): DocumentUri {
        return this.textDocument.uri;
    }

    private constructor(doc: TextDocument) {
        this.#textDocument = doc;
    }

    private update(doc: TextDocument): ComposeDocument {
        this.#textDocument = doc;
        this.yamlDocument.clear();

        return this;
    }

    /**
     * Gets the text of a line at a given line number or position, including the line break (`\n` or `\r\n`) at the end if present
     * @param line The line number or `Position`
     * @returns The line text
     */
    public lineAt(line: Position | number): string {
        // Flatten to a position at the start of the line
        const startOfLine = (typeof line === 'number') ? Position.create(line, 0) : Position.create(line.line, 0);
        const endOfLine = Position.create(startOfLine.line, MaximumLineLength);

        if (startOfLine.line > this.textDocument.lineCount) {
            throw new Error(`Requested line ${startOfLine.line} is out of bounds.`);
        }

        return this.textDocument.getText(Range.create(startOfLine, endOfLine));
    }

    /**
     * Gets settings from the document. If already populated, that will be returned. If supported, the info will be requested from the client.
     * Otherwise, the settings will be heuristically guessed based on document contents.
     * Note: The client is also directed to notify the server if the settings change, via the `DocumentSettingsNotification` notification.
     * @returns The document settings (tab size, line endings, etc.)
     */
    public async getSettings(): Promise<DocumentSettings> {
        // First, try asking the client, if the capability is present
        if (!this.documentSettings) {
            const ctx = getCurrentContext();

            if (ctx.clientCapabilities?.experimental?.documentSettings?.request) {
                const result = await ctx.connection.sendRequest<DocumentSettingsParams, DocumentSettings | null, never>(DocumentSettingsRequest.type, { textDocument: this.id });
                if (result) {
                    this.documentSettings = result;
                }
            }
        }

        // If the capability is not present, or the above didn't get a result for some reason, try heuristically guessing
        if (!this.documentSettings) {
            this.documentSettings = this.guessDocumentSettings();
        }

        return this.documentSettings;
    }

    /**
     * Updates the settings (tab size, line endings, etc.) for the document. This is meant to be called by the server upon receiving a `DocumentSettingsNotification`.
     * @param params The new settings for the document
     */
    public updateSettings(params: DocumentSettings): void {
        this.documentSettings = params;
    }

    /**
     * Gets information about the position, including the tab depth and a logical path describing where in the YAML tree the position is
     * @param params The `ExtendedPositionParams` for the position being queried
     * @returns A `PositionInfo` object with tab depth and logical path
     * @example If the position is in a service foo's `image` key, the logical path would be `/services/foo/image`.
     */
    public async getPositionInfo(params: ExtendedPositionParams): Promise<PositionInfo> {
        const { tabSize } = await this.getSettings();
        const partialPositionInfo = this.getFirstLinePositionInfo(params, tabSize);
        const fullPathParts = [...partialPositionInfo.pathParts];

        // We no longer need to consider position, since the cursor is inherently below this point
        // So now we just scroll upward, ignoring any lines with equal or more indentation than the first line (where the cursor is)
        let currentIndentDepth = partialPositionInfo.cursorIndentDepth;

        for (let i = params.position.line - 1; i >= 0 && currentIndentDepth > 0; i--) {
            const currentLine = this.lineAt(i);
            let indentDepth = MaximumLineLength;
            let result: RegExpExecArray | null;

            /* eslint-disable @typescript-eslint/no-non-null-assertion */
            if ((result = ItemValueRegex.exec(currentLine))) {
                indentDepth = result.groups!['indent'].length / tabSize;

                if (indentDepth < currentIndentDepth) {
                    // If this line is an ItemValue and less indented, then add `<item>` to the path
                    currentIndentDepth = indentDepth;
                    fullPathParts.unshift(Item);
                }
            } else if ((result = KeyValueRegex.exec(currentLine))) {
                indentDepth = result.groups!['indent'].length / tabSize;

                if (indentDepth < currentIndentDepth ||
                    (indentDepth === currentIndentDepth && fullPathParts[0] === Item)) // YAML is too permissive and allows for items to have the same indentation as their parent key, so need to account for that
                {
                    // If this line is a KeyValue (which also includes keys alone) and less indented, add that key to the path
                    currentIndentDepth = indentDepth;
                    fullPathParts.unshift(result.groups!['keyName']);
                }
            }
            /* eslint-enable @typescript-eslint/no-non-null-assertion */
        }

        return {
            path: '/' + fullPathParts.join('/'), // Combine the path
            indentDepth: partialPositionInfo.cursorIndentDepth, // Indent depth is determined entirely from `getFirstLinePositionInfo`
        };
    }

    public static DocumentManagerConfig: TextDocumentsConfiguration<ComposeDocument> = {
        create: (uri, languageId, version, content) => new ComposeDocument(TextDocument.create(uri, languageId, version, content)),
        update: (document, changes, version) => document.update(TextDocument.update(document.textDocument, changes, version)),
    };

    private buildYamlDocument(): YamlDocument<YamlNode> {
        const yamlDocument = parseDocument(this.textDocument.getText(), { merge: true, prettyErrors: true });

        if (!isDocument(yamlDocument)) {
            throw new ResponseError(ErrorCodes.ParseError, 'Malformed YAML document');
        }

        return yamlDocument;
    }

    private guessDocumentSettings(): DocumentSettings {
        const documentText = this.textDocument.getText();

        // For line endings, see if there are any \r
        const eol = /\r/ig.test(documentText) ? CRLF : LF;

        // For tab size, look for the first key with nonzero indentation. If none found, assume 2.
        let tabSize = 2;
        const indentedKeyLineMatch = /^(?<indentation>[ ]+)(?<key>[.\w-]+:\s*)$/im.exec(documentText);

        if (indentedKeyLineMatch?.groups?.['indentation']) {
            tabSize = indentedKeyLineMatch.groups['indentation'].length;
        }

        return {
            eol,
            tabSize,
        };
    }

    /**
     * This method is responsible for determining the part of the logical path for the line where the cursor is, given the
     * cursor's position.
     * This is similar to the body of `getPositionInfo` but differs in a key way--the position is on this line, so the
     * character position can fundamentally affect what the logical path is
     * @param params Parameters including position
     * @param tabSize The tab size (needed to determine indent depth)
     * @returns The part(s) of the logical path at the current line
     */
    private getFirstLinePositionInfo(params: ExtendedPositionParams, tabSize: number): { pathParts: string[], cursorIndentDepth: number } {
        const currentLine = this.lineAt(params.position);
        const pathParts: string[] = [];
        let cursorIndentDepth = 0;

        let result: RegExpExecArray | null;

        /* eslint-disable @typescript-eslint/no-non-null-assertion */
        if ((result = LineWithCommentRegex.exec(currentLine))) {
            const commentSepPosition = currentLine.indexOf(result.groups!['commentSep']);

            // If the cursor is in a comment, then it's not "in" the document per se, but in the comment
            // So the path will only be "/<comment>", and the cursorIndentDepth is set to -1 to short-circuit the loop above
            if (params.position.character > commentSepPosition) {
                return {
                    pathParts: [Comment],
                    cursorIndentDepth: -1,
                };
            }
        }

        if ((result = ItemKeyValueRegex.exec(currentLine))) {
            // First, see if it's an ItemKeyValue, i.e. `  - foo: bar`
            const itemSepPosition = currentLine.indexOf(result.groups!['itemInd']);
            const keySepPosition = currentLine.indexOf(result.groups!['keyInd'], itemSepPosition);
            const indentLength = result.groups!['indent'].length;
            const keyName = result.groups!['keyName'];

            cursorIndentDepth = indentLength / tabSize;

            if (params.position.character > keySepPosition) {
                // If the position is after the key separator, we're in the value
                pathParts.unshift(Value);
                pathParts.unshift(keyName);
                pathParts.unshift(Item);
            } else if (params.position.character === keySepPosition) {
                // If the position is at the key separator, we're on the separator
                pathParts.unshift(Sep);
                pathParts.unshift(keyName);
                pathParts.unshift(Item);
            } else if (params.position.character > itemSepPosition) {
                // Otherwise if the position is after the item separator, we're in the key
                pathParts.unshift(keyName);
                pathParts.unshift(Item);
            } else if (params.position.character === itemSepPosition) {
                // If we're at the item separator, we're at the item separator (of course)
                pathParts.unshift(Sep);
                pathParts.unshift(Item);
            } else if (params.position.character < indentLength) {
                // Otherwise if we're somewhere within the indentation, we're not at a "position" within this line, but we do need to consider the indent depth
                cursorIndentDepth = params.position.character / tabSize;
            }
        } else if ((result = KeyValueRegex.exec(currentLine))) {
            // Next, check if it's a standard KeyValue, i.e. `  foo: bar`
            const keySepPosition = currentLine.indexOf(result.groups!['keyInd']);
            const indentLength = result.groups!['indent'].length;
            const keyName = result.groups!['keyName'];

            cursorIndentDepth = indentLength / tabSize;

            if (params.position.character > keySepPosition) {
                // If the position is after the key separator, we're in the value
                pathParts.unshift(Value);
                pathParts.unshift(keyName);
            } else if (params.position.character === keySepPosition) {
                // If the position is at the key separator, we're on the separator
                pathParts.unshift(Sep);
                pathParts.unshift(keyName);
            } else if (params.position.character >= indentLength) {
                // If the position is after the indent, we're in the key
                pathParts.unshift(keyName);
            } else if (params.position.character < indentLength) {
                // Otherwise if we're somewhere within the indentation, we're not at a "position" within this line, but we do need to consider the indent depth
                cursorIndentDepth = params.position.character / tabSize;
            }
        } else if ((result = ItemValueRegex.exec(currentLine))) {
            // Next, check if it's an ItemValue, i.e. `  - foo`
            const itemSepPosition = currentLine.indexOf(result.groups!['itemInd']);
            const indentLength = result.groups!['indent'].length;

            cursorIndentDepth = indentLength / tabSize;

            if (params.position.character > itemSepPosition) {
                // If the position is after the item separator, we're in the value
                pathParts.unshift(Value);
                pathParts.unshift(Item);
            } else if (params.position.character === itemSepPosition) {
                // If we're at the item separator, we're at the item separator (of course)
                pathParts.unshift(Sep);
                pathParts.unshift(Item);
            } else if (params.position.character < indentLength) {
                // Otherwise if we're somewhere within the indentation, we're not at a "position" within this line, but we do need to consider the indent depth
                cursorIndentDepth = params.position.character / tabSize;
            }
        } else if ((result = ValueRegex.exec(currentLine))) {
            // Next, check if it's a value alone, i.e. `  foo`
            const indentLength = result.groups!['indent'].length;

            cursorIndentDepth = indentLength / tabSize;

            if (params.position.character >= indentLength) {
                // If the position is after the indent, we're in the value
                pathParts.unshift(Value);
            } else if (params.position.character < indentLength) {
                // Otherwise if we're somewhere within the indentation, we're not at a "position" within this line, but we do need to consider the indent depth
                cursorIndentDepth = params.position.character / tabSize;
            }
        } else if ((result = WhitespaceRegex.exec(currentLine))) {
            // Last, check if it's whitespace only
            const indentLength = result.groups!['indent'].length;

            cursorIndentDepth = indentLength / tabSize;

            if (params.position.character < indentLength) {
                // Simply need to determine the indent depth
                cursorIndentDepth = params.position.character / tabSize;
            }
        }
        /* eslint-enable @typescript-eslint/no-non-null-assertion */

        return {
            pathParts,
            cursorIndentDepth,
        };
    }
}

// IMPORTANT: For all of these regular expressions, the groups present *and* their names are very important.
// Removal or alteration would break `getPositionInfo` and `getFirstLinePositionInfo`

// A regex for matching a standard key/value line, i.e. `key: value`
// Exported for use by KeyHoverProvider
export const KeyValueRegex = /^(?<indent> *)(?<key>(?<keyName>[.\w-]+)(?<keyInd>(?<keySep>:) *))(?<value>.*)$/im;

// A regex for matching an item/value line, i.e. `- value`
const ItemValueRegex = /^(?<indent> *)(?<itemInd>(?<itemSep>-) *)(?<value>.*)$/im;

// A regex for matching an item/key/value line, i.e. `- key: value`. This will be the top line of a flow map.
const ItemKeyValueRegex = /^(?<indent> *)(?<itemInd>(?<itemSep>-) *)(?<key>(?<keyName>[.\w-]+)(?<keyInd>(?<keySep>:) *))(?<value>.*)$/im;

// A regex for matching any value line
const ValueRegex = /^(?<indent> *)(?<value>\S+)$/im;

// A regex for matching a whitespace-only line
const WhitespaceRegex = /^(?<indent> *)$/im;

// A regex for matching any line with a comment (or if the whole line is a comment)
// TODO: This will match a 'string with a #', which is *not* a comment, but currently this will not affect any end scenarios
// TODO: The closest I've gotten is /(['"])?.*(?<commentSep>#)(?:(?!\1).)*$/im
const LineWithCommentRegex = /^.*(?<commentSep>#).*$/im;

// Constants for marking non-key parts of a logical path
const Value = '<value>';
const Item = '<item>';
const Sep = '<sep>';
const Comment = '<comment>';
