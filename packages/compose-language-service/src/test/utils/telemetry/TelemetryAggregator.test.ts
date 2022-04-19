/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { expect } from 'chai';
import { TelemetryEventNotification } from 'vscode-languageserver-protocol';
import { initEvent, TelemetryEvent } from '../../../client/TelemetryEvent';
import { TelemetryAggregator } from '../../../service/utils/telemetry/TelemetryAggregator';
import { TestConnection } from '../../TestConnection';

const TelemetryAggregationInterval = 10;

describe('(Unit) TelemetryAggregator', () => {
    let testConnection: TestConnection;
    let telemetryAggregator: TelemetryAggregator;
    beforeEach('Prepare a language server for testing', async () => {
        testConnection = new TestConnection();
        telemetryAggregator = new TelemetryAggregator(testConnection.server, TelemetryAggregationInterval);
    });

    describe('Common scenarios', () => {
        it('Should return aggregated events', async () => {
            const inputEvent1: TelemetryEvent = initEvent('aggregated');
            inputEvent1.properties.canary = 'canary';
            inputEvent1.measurements.duration = 5;

            const inputEvent2: TelemetryEvent = initEvent('aggregated');
            inputEvent2.properties.canary = 'canary';
            inputEvent2.measurements.duration = 10;

            const expected: TelemetryEvent = initEvent('aggregated');
            expected.properties.canary = 'canary';
            expected.measurements.count = 2;
            expected.measurements.durationMedian = 7;
            expected.measurements.durationMu = 1.956;
            expected.measurements.durationSigma = 0.49;

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent1, inputEvent2], expected);
        });

        it('Should immediately return error events without aggregation', async () => {
            const inputEvent1: TelemetryEvent = initEvent('errorNoAggregation');
            inputEvent1.properties.result = 'Failed';
            inputEvent1.properties.canary = 'canary';
            inputEvent1.measurements.duration = 5;

            const inputEvent2: TelemetryEvent = initEvent('errorNoAggregation');
            inputEvent2.properties.result = 'Failed';
            inputEvent2.properties.canary = 'canary';
            inputEvent2.measurements.duration = 10;

            // This takes advantage of the fact that the listenerPromise below in `awaitTelemetryAndCompare` will immediately resolve with the first event
            const expected: TelemetryEvent = initEvent('errorNoAggregation');
            expected.properties.result = 'Failed';
            expected.properties.canary = 'canary';
            expected.measurements.duration = 5;

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent1, inputEvent2], expected);
        });

        it('Should NOT return successful events if suppressIfSuccessful is true', () => {
            const inputEvent: TelemetryEvent = initEvent('suppressIfSuccessful-Succeeded');
            inputEvent.suppressIfSuccessful = true;

            return awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent], undefined).should.eventually.be.rejectedWith('timed out');
        });

        it('Should return error events if suppressIfSuccessful is true', async () => {
            const inputEvent: TelemetryEvent = initEvent('suppressIfSuccessful-Failed');
            inputEvent.properties.result = 'Failed';
            inputEvent.properties.canary = 'canary';
            inputEvent.suppressIfSuccessful = true;
            inputEvent.measurements.duration = 5;

            const expected: TelemetryEvent = initEvent('suppressIfSuccessful-Failed');
            expected.properties.result = 'Failed';
            expected.properties.canary = 'canary';
            expected.suppressIfSuccessful = true;
            expected.measurements.duration = 5;

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent], expected);
        });

        it('Should NOT return successful events if suppressAll is true', () => {
            const inputEvent: TelemetryEvent = initEvent('suppressAll-Succeeded');
            inputEvent.suppressAll = true;

            return awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent], undefined).should.eventually.be.rejectedWith('timed out');
        });

        it('Should NOT return error events if suppressAll is true', () => {
            const inputEvent: TelemetryEvent = initEvent('suppressAll-Failed');
            inputEvent.properties.result = 'Failed';
            inputEvent.suppressAll = true;

            return awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent], undefined).should.eventually.be.rejectedWith('timed out');
        });

        it('Should respect eventName grouping strategy', async () => {
            const inputEvent1 = initEvent('eventName');
            inputEvent1.groupingStrategy = 'eventName';
            inputEvent1.properties.canary = 'canary1';
            inputEvent1.measurements.duration = 5;

            const inputEvent2: TelemetryEvent = initEvent('eventName');
            inputEvent2.groupingStrategy = 'eventName';
            inputEvent2.properties.canary = 'canary2';
            inputEvent2.measurements.duration = 10;

            const expected: TelemetryEvent = initEvent('eventName');
            expected.properties.canary = 'canary2'; // Should be 'canary2' since the later events override the earlier events
            expected.measurements.count = 2;
            expected.measurements.durationMedian = 7;
            expected.measurements.durationMu = 1.956;
            expected.measurements.durationSigma = 0.49;

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent1, inputEvent2], expected);
        });

        it('Should respect eventNameAndProperties grouping strategy', async () => {
            const inputEvent1 = initEvent('eventNameAndProperties');
            inputEvent1.groupingStrategy = 'eventNameAndProperties';
            inputEvent1.properties.canary = 'canary1';
            inputEvent1.measurements.duration = 5;

            const inputEvent2: TelemetryEvent = initEvent('eventNameAndProperties');
            inputEvent2.groupingStrategy = 'eventNameAndProperties';
            inputEvent2.properties.canary = 'canary2';
            inputEvent2.measurements.duration = 10;

            // This takes advantage of the fact that the listenerPromise below in `awaitTelemetryAndCompare` will resolve with the first event
            const expected: TelemetryEvent = initEvent('eventNameAndProperties');
            expected.properties.canary = 'canary1'; // Should be 'canary1' since the second event won't be aggregated with this one
            expected.measurements.count = 1;
            expected.measurements.durationMedian = 5;
            expected.measurements.durationMu = 1.609;
            expected.measurements.durationSigma = 0;

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent1, inputEvent2], expected);
        });
    });

    describe('Error scenarios', () => {
        it('Should return a telemetry aggregation error if aggregation fails', async () => {
            const inputEvent: TelemetryEvent = initEvent('canary');

            // Deleting the measurements property will cause the aggregation procedure to throw
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            delete (inputEvent as any).measurements;

            const expected: TelemetryEvent = initEvent('telemetryaggregatorfailure');
            expected.properties.result = 'Failed';
            expected.properties.error = 'TypeError';
            expected.properties.errorMessage = 'Cannot read properties of undefined (reading \'duration\')';

            await awaitTelemetryAndCompare(testConnection, telemetryAggregator, [inputEvent], expected);
        });
    });

    afterEach('Cleanup', () => {
        testConnection.dispose();
        telemetryAggregator.dispose();
    });
});

async function awaitTelemetryAndCompare(testConnection: TestConnection, telemetryAggregator: TelemetryAggregator, input: TelemetryEvent[], expected: TelemetryEvent | undefined): Promise<void> {
    let timeout: NodeJS.Timeout | undefined = undefined;

    try {
        // Need to connect the listener *before* sending the events, to ensure no timing issues, i.e. with the response being sent before the listener is ready
        const listenerPromise = new Promise<TelemetryEvent>((resolve) => {
            testConnection.client.onNotification(TelemetryEventNotification.type, (telemetry) => {
                resolve(telemetry);
            });
        });

        // A promise that will reject if it times out (if the diagnostics never get sent)
        const failurePromise = new Promise<never>((resolve, reject) => {
            timeout = setTimeout(() => reject('timed out awaiting aggregated telemetry response'), TelemetryAggregationInterval * 10); // This carries some risk of test fragility but we have to draw a line somewhere (*sigh* halting problem)
        });

        for (const inputEvent of input) {
            telemetryAggregator.logEvent(inputEvent);
        }

        // Now await the listener's completion promise to get the result
        const result = await Promise.race<TelemetryEvent>([listenerPromise, failurePromise]);

        expect(result).to.be.ok;

        // Since it'd be impossible to check we'll eliminate the stack from the output event
        if (result.properties.stack) {
            delete result.properties.stack;
        }

        result.should.deep.equal(expected);
    } finally {
        if (timeout) {
            clearTimeout(timeout);
        }
    }
}
