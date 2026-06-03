import binanceService from '../src/services/binanceService.js';
import patternTelemetryService, {
    intervalToMs,
    type PatternSignalTelemetryEvent,
    type PatternSignalTelemetryOutcome,
    type PatternSignalTelemetryOutcomeRecord,
} from '../src/services/patternTelemetryService.js';

type Candle = {
    openTime: number;
    closeTime: number;
    close: number;
    low: number;
};

type ResolveArgs = {
    limit: number;
    force: boolean;
};

function parseArgs(argv: string[]): ResolveArgs {
    const args: ResolveArgs = {
        limit: 1000,
        force: false,
    };

    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [rawKey, ...rest] = token.slice(2).split('=');
        const key = rawKey.trim();
        const value = rest.length > 0 ? rest.join('=').trim() : 'true';
        if (key === 'limit') {
            const parsed = Number(value);
            if (Number.isFinite(parsed) && parsed > 0) args.limit = Math.floor(parsed);
        } else if (key === 'force') {
            args.force = value !== 'false';
        }
    }

    return args;
}

function normalizeCandles(raw: unknown): Candle[] {
    if (!Array.isArray(raw)) return [];
    const rows: Candle[] = [];

    for (const row of raw) {
        if (!Array.isArray(row) || row.length < 7) continue;
        const openTime = Number(row[0]);
        const low = Number(row[3]);
        const close = Number(row[4]);
        const closeTime = Number(row[6]);
        if (
            !Number.isFinite(openTime) ||
            !Number.isFinite(low) ||
            !Number.isFinite(close) ||
            !Number.isFinite(closeTime)
        ) {
            continue;
        }

        rows.push({
            openTime,
            closeTime,
            close,
            low,
        });
    }

    rows.sort((a, b) => a.openTime - b.openTime);
    return rows;
}

function dedupeEvents(events: PatternSignalTelemetryEvent[]): PatternSignalTelemetryEvent[] {
    const map = new Map<string, PatternSignalTelemetryEvent>();
    for (const event of events) {
        const existing = map.get(event.eventId);
        if (!existing || event.capturedAt >= existing.capturedAt) {
            map.set(event.eventId, event);
        }
    }
    return Array.from(map.values());
}

function groupBySymbolInterval(events: PatternSignalTelemetryEvent[]): Map<string, PatternSignalTelemetryEvent[]> {
    const map = new Map<string, PatternSignalTelemetryEvent[]>();
    for (const event of events) {
        const key = `${event.symbol}|${event.interval}`;
        const list = map.get(key) || [];
        list.push(event);
        map.set(key, list);
    }
    return map;
}

function locateSignalIndex(candles: Candle[], event: PatternSignalTelemetryEvent): number {
    const exact = candles.findIndex((candle) => candle.closeTime === event.signalCloseTime);
    if (exact >= 0) return exact;

    const tolerance = Math.max(1, Math.floor(intervalToMs(event.interval) / 2));
    let bestIndex = -1;
    let bestDiff = Number.POSITIVE_INFINITY;
    for (let i = 0; i < candles.length; i += 1) {
        const diff = Math.abs(candles[i].closeTime - event.signalCloseTime);
        if (diff <= tolerance && diff < bestDiff) {
            bestDiff = diff;
            bestIndex = i;
        }
    }
    return bestIndex;
}

function buildOutcome(
    event: PatternSignalTelemetryEvent,
    candles: Candle[],
    signalIndex: number,
): PatternSignalTelemetryOutcome {
    const now = Date.now();
    if (signalIndex < 0) {
        return {
            status: 'signal_not_found',
            resolvedAt: now,
            nextCloseTime1c: null,
            nextClosePrice1c: null,
            ret1c: null,
            ret3c: null,
            maxDrawdown3c: null,
            winLoss1c: null,
            notes: 'signal_close_time_not_found_in_kline_window',
        };
    }

    const signal = candles[signalIndex];
    const next1 = candles[signalIndex + 1];
    if (!next1) {
        return {
            status: 'pending',
            resolvedAt: now,
            nextCloseTime1c: null,
            nextClosePrice1c: null,
            ret1c: null,
            ret3c: null,
            maxDrawdown3c: null,
            winLoss1c: null,
            notes: 'next_candle_not_closed_yet',
        };
    }

    const ret1c = signal.close !== 0 ? (next1.close - signal.close) / signal.close : null;
    const next3 = candles[signalIndex + 3];
    const ret3c = next3 && signal.close !== 0 ? (next3.close - signal.close) / signal.close : null;
    const drawdownWindow = candles.slice(signalIndex + 1, Math.min(signalIndex + 4, candles.length));
    const minLow = drawdownWindow.reduce(
        (acc, candle) => (Number.isFinite(candle.low) ? Math.min(acc, candle.low) : acc),
        Number.POSITIVE_INFINITY,
    );
    const maxDrawdown3c =
        Number.isFinite(minLow) && signal.close !== 0 ? (minLow - signal.close) / signal.close : null;

    let winLoss1c: boolean | null = null;
    if (event.patternCategory === 'Bullish' && ret1c !== null) winLoss1c = ret1c > 0;
    if (event.patternCategory === 'Bearish' && ret1c !== null) winLoss1c = ret1c < 0;

    return {
        status: 'resolved',
        resolvedAt: now,
        nextCloseTime1c: next1.closeTime,
        nextClosePrice1c: next1.close,
        ret1c,
        ret3c,
        maxDrawdown3c,
        winLoss1c,
    };
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const liveEvents = dedupeEvents(patternTelemetryService.readLiveEvents());
    const latestOutcomeMap = patternTelemetryService.readLatestOutcomeByEventId();

    const unresolved = liveEvents.filter((event) => {
        if (args.force) return true;
        const existing = latestOutcomeMap.get(event.eventId);
        if (!existing) return true;
        return existing.outcome.status !== 'resolved';
    });

    if (unresolved.length === 0) {
        console.log('telemetry_resolve_outcomes: no unresolved events');
        return;
    }

    const grouped = groupBySymbolInterval(unresolved);
    const outcomeRecords: PatternSignalTelemetryOutcomeRecord[] = [];
    let fetchErrors = 0;

    for (const [key, events] of grouped.entries()) {
        const [symbol, interval] = key.split('|');
        try {
            const raw = await binanceService.getCandlestickData(symbol, interval, args.limit);
            const candles = normalizeCandles(raw);
            for (const event of events) {
                const signalIndex = locateSignalIndex(candles, event);
                const outcome = buildOutcome(event, candles, signalIndex);
                outcomeRecords.push({
                    schemaVersion: 'pattern_signal_outcome_v1',
                    eventId: event.eventId,
                    updatedAt: Date.now(),
                    outcome,
                });
            }
        } catch (error) {
            fetchErrors += 1;
            for (const event of events) {
                outcomeRecords.push({
                    schemaVersion: 'pattern_signal_outcome_v1',
                    eventId: event.eventId,
                    updatedAt: Date.now(),
                    outcome: {
                        status: 'pending',
                        resolvedAt: Date.now(),
                        nextCloseTime1c: null,
                        nextClosePrice1c: null,
                        ret1c: null,
                        ret3c: null,
                        maxDrawdown3c: null,
                        winLoss1c: null,
                        notes: `fetch_error:${String((error as Error)?.message || error)}`,
                    },
                });
            }
        }
    }

    const written = patternTelemetryService.appendOutcomeRecords(outcomeRecords);
    const resolvedCount = outcomeRecords.filter((row) => row.outcome.status === 'resolved').length;
    const pendingCount = outcomeRecords.filter((row) => row.outcome.status === 'pending').length;
    const notFoundCount = outcomeRecords.filter((row) => row.outcome.status === 'signal_not_found').length;

    console.log(`telemetry_resolve_outcomes: scanned_unresolved=${unresolved.length}`);
    console.log(`telemetry_resolve_outcomes: outcome_records=${outcomeRecords.length}`);
    console.log(`telemetry_resolve_outcomes: written=${written}`);
    console.log(
        `telemetry_resolve_outcomes: resolved=${resolvedCount} pending=${pendingCount} signal_not_found=${notFoundCount} fetch_errors=${fetchErrors}`,
    );
}

main().catch((error) => {
    console.error('telemetry_resolve_outcomes_failed');
    console.error(error);
    process.exit(1);
});
