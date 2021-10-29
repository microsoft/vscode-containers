/*!--------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { Connection, Disposable } from 'vscode-languageserver';
import { initEvent, TelemetryEvent } from '../../../client/TelemetryEvent';
import { logNormal } from './logNormal';

// One minute flush interval by default
const FlushIntervalMilliseconds = 60 * 1000;

export class TelemetryAggregator implements Disposable {
    private eventBuffer: TelemetryEvent[] = [];
    private readonly timer: NodeJS.Timeout;

    public constructor(private readonly connection: Connection, private readonly interval: number = FlushIntervalMilliseconds) {
        this.timer = setInterval(() => this.flush(), this.interval);
    }

    public dispose(): void {
        clearInterval(this.timer);

        // Flush one last time
        this.flush();
    }

    public logEvent(event: TelemetryEvent): void {
        if (event.suppressAll) {
            // Do nothing, this event is suppressed
        } else if (event.properties.result === 'Succeeded' && event.suppressIfSuccessful) {
            // Do nothing, the event succeeded and has suppressIfSuccessful === true
        } else if (event.properties.result === 'Failed') {
            // Event is an error, send immediately rather than buffering
            this.connection.telemetry.logEvent(event);
        } else {
            // Add it to the event buffer to be flushed on the interval
            this.eventBuffer.push(event);
        }
    }

    private flush(): void {
        try {
            for (const evt of this.getAggregatedEvents()) {
                this.connection.telemetry.logEvent(evt);
            }
        } catch (err) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const error = err instanceof Error ? err : Error((err as any).toString());
            const telemetryFailedEvent = initEvent('telemetryaggregatorfailure');

            telemetryFailedEvent.properties.result = 'Failed';
            telemetryFailedEvent.properties.error = error.name;
            telemetryFailedEvent.properties.errorMessage = error.message;
            telemetryFailedEvent.properties.stack = error.stack;

            this.connection.telemetry.logEvent(telemetryFailedEvent);
        } finally {
            // Finally, clear out the buffer
            this.eventBuffer = [];
        }
    }

    private getAggregatedEvents(): TelemetryEvent[] {
        const aggregated: TelemetryEvent[] = [];
        const eventGroups = new Map<string, TelemetryEvent[]>();

        // Group events according to their grouping strategy
        for (const evt of this.eventBuffer) {
            let key: string;
            switch (evt.groupingStrategy) {
                case 'eventNameAndProperties':
                    key = evt.eventName + JSON.stringify(evt.properties);
                    break;
                case 'eventName':
                default:
                    key = evt.eventName;
                    break;
            }

            if (!eventGroups.has(key)) {
                eventGroups.set(key, []);
            }

            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            eventGroups.get(key)!.push(evt);
        }

        // For each group, aggregate properties and add performance statistics, to get one aggregated event per group
        for (const events of eventGroups.values()) {
            const eventName = events[0].eventName;

            const aggregatedEvent = initEvent(eventName);

            // Aggregate the performance statistics
            const durations = events.map(e => e.measurements.duration ?? undefined).filter(d => d !== undefined) as number[] || [];
            const stats = logNormal(durations);

            aggregatedEvent.measurements.count = events.length;
            aggregatedEvent.measurements.durationMu = stats.mu;
            aggregatedEvent.measurements.durationSigma = stats.sigma;
            aggregatedEvent.measurements.durationMedian = stats.median;

            // Aggregate the properties--this will apply all properties from all events, with the recent events overriding prior events if there is a conflict
            // If the grouping strategy is 'eventNameAndProperties', there will inherently never be conflicts, since their values must be identical
            events.forEach(evt => Object.assign(aggregatedEvent.properties, evt.properties));

            aggregated.push(aggregatedEvent);
        }

        return aggregated;
    }
}
