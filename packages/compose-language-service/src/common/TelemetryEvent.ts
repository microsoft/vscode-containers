/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// These interfaces are loosely copied from https://github.com/microsoft/vscode-azuretools/blob/be03d9a57f66bb25efdd6f2e281052d05b0ec01b/ui/index.d.ts#L536-L592
// Ideally they would just be used directly but I'm reluctant to add the dependency on vscode-azureextensionui, given how much unrelated stuff it contains...

export interface TelemetryEvent {
    /**
     * The event name.
     */
    eventName: string;

    /**
     * Properties of the event. Successful events will be aggregated, and each property from each event attached to the ultimate aggregated event.
     * It is recommended in most cases to sort array properties, in order for them to be functionally treated as sets rather than arrays.
     */
    properties: TelemetryProperties;

    /**
     * Duration measurements for the event
     */
    measurements: TelemetryMeasurements & AggregateTelemetryMeasurements;

    /**
     * How the events will be grouped, either by name only, or name + JSON.stringify(properties)
     */
    groupingStrategy: 'eventName' | 'eventNameAndProperties';

    /**
     * If true, the event will not be sent if it is successful.
     */
    suppressIfSuccessful?: boolean;

    /**
     * If true, the event will not be sent.
     */
    suppressAll?: boolean;
}

interface TelemetryProperties {
    isActivationEvent: 'true' | 'false';
    result: 'Succeeded' | 'Failed' | 'Canceled';
    error?: string;
    errorMessage?: string;
    stack?: string;

    [key: string]: string | undefined;
}

interface TelemetryMeasurements {
    duration?: number;
}

interface AggregateTelemetryMeasurements {
    count?: number;
    durationMu?: number;
    durationSigma?: number;
    durationMedian?: number;
}

export function initEvent(eventName: string): TelemetryEvent {
    return {
        eventName: eventName,
        properties: {
            isActivationEvent: 'false',
            result: 'Succeeded',
        },
        measurements: {},
        groupingStrategy: 'eventNameAndProperties',
    };
}
