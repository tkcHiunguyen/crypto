import fs from 'fs';
import path from 'path';
import patternTelemetryService, {
    type PatternSignalTelemetryMergedEvent,
} from '../src/services/patternTelemetryService.js';

type ExportArgs = {
    fromTs: number | null;
    toTs: number | null;
    output: string | null;
};

type TelemetryExportPayload = {
    schemaVersion: 'pattern_telemetry_export_v1';
    exportedAt: number;
    source: {
        app: 'crypto2-offline';
        hostname: string;
    };
    range: {
        fromTs: number | null;
        toTs: number | null;
    };
    summary: {
        totalEvents: number;
        resolvedEvents: number;
        pendingEvents: number;
        signalNotFoundEvents: number;
    };
    events: PatternSignalTelemetryMergedEvent[];
};

function parseDateOrTs(raw: string | undefined): number | null {
    if (!raw) return null;
    const text = String(raw).trim();
    if (!text) return null;

    if (/^\d+$/.test(text)) {
        const numeric = Number(text);
        if (!Number.isFinite(numeric)) return null;
        return numeric > 9_999_999_999 ? numeric : numeric * 1000;
    }

    const timestamp = Date.parse(text);
    return Number.isFinite(timestamp) ? timestamp : null;
}

function parseArgs(argv: string[]): ExportArgs {
    const args: ExportArgs = {
        fromTs: null,
        toTs: null,
        output: null,
    };

    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [rawKey, ...rest] = token.slice(2).split('=');
        const key = rawKey.trim();
        const value = rest.length > 0 ? rest.join('=').trim() : '';
        if (key === 'from') args.fromTs = parseDateOrTs(value);
        if (key === 'to') args.toTs = parseDateOrTs(value);
        if (key === 'output' && value) args.output = value;
    }

    return args;
}

function dedupeEvents(events: PatternSignalTelemetryMergedEvent[]): PatternSignalTelemetryMergedEvent[] {
    const map = new Map<string, PatternSignalTelemetryMergedEvent>();
    for (const event of events) {
        const existing = map.get(event.eventId);
        if (!existing) {
            map.set(event.eventId, event);
            continue;
        }

        const existingResolved = existing.outcome?.status === 'resolved';
        const nextResolved = event.outcome?.status === 'resolved';
        if (!existingResolved && nextResolved) {
            map.set(event.eventId, event);
            continue;
        }
        if (
            existingResolved === nextResolved &&
            ensureFinite(event.capturedAt, 0) >= ensureFinite(existing.capturedAt, 0)
        ) {
            map.set(event.eventId, event);
        }
    }

    return Array.from(map.values()).sort(
        (a, b) => ensureFinite(a.tsSignal, 0) - ensureFinite(b.tsSignal, 0),
    );
}

function ensureFinite(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toDateToken(timestamp: number): string {
    const date = new Date(timestamp);
    const y = date.getUTCFullYear();
    const m = String(date.getUTCMonth() + 1).padStart(2, '0');
    const d = String(date.getUTCDate()).padStart(2, '0');
    return `${y}${m}${d}`;
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const events = patternTelemetryService.readLiveEvents();
    const outcomeMap = patternTelemetryService.readLatestOutcomeByEventId();
    const merged = patternTelemetryService.mergeEventsWithOutcomeMap(events, outcomeMap);
    const deduped = dedupeEvents(merged);

    const filtered = deduped.filter((event) => {
        const ts = ensureFinite(event.tsSignal, 0);
        if (args.fromTs !== null && ts < args.fromTs) return false;
        if (args.toTs !== null && ts > args.toTs) return false;
        return true;
    });

    const resolvedEvents = filtered.filter((event) => event.outcome?.status === 'resolved').length;
    const pendingEvents = filtered.filter((event) => event.outcome?.status === 'pending').length;
    const signalNotFoundEvents = filtered.filter(
        (event) => event.outcome?.status === 'signal_not_found',
    ).length;

    const payload: TelemetryExportPayload = {
        schemaVersion: 'pattern_telemetry_export_v1',
        exportedAt: Date.now(),
        source: {
            app: 'crypto2-offline',
            hostname: process.env.COMPUTERNAME || process.env.HOSTNAME || 'unknown',
        },
        range: {
            fromTs: args.fromTs,
            toTs: args.toTs,
        },
        summary: {
            totalEvents: filtered.length,
            resolvedEvents,
            pendingEvents,
            signalNotFoundEvents,
        },
        events: filtered,
    };

    const storage = patternTelemetryService.getStoragePaths();
    const defaultName = `pattern_telemetry_${toDateToken(Date.now())}_${payload.exportedAt}.json`;
    const outputPath = args.output
        ? path.resolve(process.cwd(), args.output)
        : path.join(storage.exportsDir, defaultName);
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`);

    console.log(`telemetry_export: output=${outputPath}`);
    console.log(
        `telemetry_export: total=${payload.summary.totalEvents} resolved=${resolvedEvents} pending=${pendingEvents} signal_not_found=${signalNotFoundEvents}`,
    );
}

main().catch((error) => {
    console.error('telemetry_export_failed');
    console.error(error);
    process.exit(1);
});
