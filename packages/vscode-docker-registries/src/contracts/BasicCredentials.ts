/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface BasicCredentials {
    readonly username: string;
    readonly secret: string;
}

export interface LoginInformation extends BasicCredentials {
    readonly server: string;
}
