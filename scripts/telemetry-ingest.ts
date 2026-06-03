import fs from 'fs';
import path from 'path';
import patternTelemetryService, {
    type PatternSignalTelemetryMergedEvent,
    type PatternSignalTelemetryOutcome,
} from '../src/services/patternTelemetryService.js';

type IngestSummary = {
    filesProcessed: number;
    filesSkipped: number;
    importedEvents: number;
    dedupedEvents: number;
    mergedOutcomeUpgrades: number;
    parseErrors: number;
    liveDumpFiles: number;
    exportJsonFiles: number;
};

type IngestArgs = {
    inputDir: string | null;
};

type InputCandidate = {
    filePath: string;
    kind: 'live_dump' | 'export_json';
    shouldMoveToProcessed: boolean;
};

type NormalizedOutcomeRecord = {
    eventId: string;
    updatedAt: number;
    outcome: PatternSignalTelemetryOutcome;
};

type LiveDumpLoadResult = {
    events: PatternSignalTelemetryMergedEvent[];
    parseErrors: number;
};

function parseArgs(argv: string[]): IngestArgs {
    const args: IngestArgs = {
        inputDir: null,
    };

    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [rawKey, ...rest] = token.slice(2).split('=');
        const key = rawKey.trim();
        const value = rest.length > 0 ? rest.join('=').trim() : '';
        if (key === 'input-dir' && value) args.inputDir = value;
    }

    return args;
}

function ensureFinite(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeOutcome(raw: unknown): PatternSignalTelemetryOutcome | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const status = String(row.status || '').trim();
    if (!['resolved', 'pending', 'signal_not_found'].includes(status)) return null;

    return {
        status: status as PatternSignalTelemetryOutcome['status'],
        resolvedAt: ensureFinite(row.resolvedAt, Date.now()),
        nextCloseTime1c: row.nextCloseTime1c == null ? null : ensureFinite(row.nextCloseTime1c, Number.NaN),
        nextClosePrice1c: row.nextClosePrice1c == null ? null : ensureFinite(row.nextClosePrice1c, Number.NaN),
        ret1c: row.ret1c == null ? null : ensureFinite(row.ret1c, Number.NaN),
        ret3c: row.ret3c == null ? null : ensureFinite(row.ret3c, Number.NaN),
        maxDrawdown3c: row.maxDrawdown3c == null ? null : ensureFinite(row.maxDrawdown3c, Number.NaN),
        winLoss1c:
            typeof row.winLoss1c === 'boolean'
                ? row.winLoss1c
                : row.winLoss1c === null
                  ? null
                  : null,
        notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : undefined,
    };
}

function normalizeOutcomeRecord(raw: unknown): NormalizedOutcomeRecord | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const eventId = String(row.eventId || '').trim();
    if (!eventId) return null;
    const outcome = normalizeOutcome(row.outcome);
    if (!outcome) return null;
    return {
        eventId,
        updatedAt: ensureFinite(row.updatedAt, Date.now()),
        outcome,
    };
}

function normalizeMergedEvent(raw: unknown): PatternSignalTelemetryMergedEvent | null {
    if (!raw || typeof raw !== 'object') return null;
    const row = raw as Record<string, unknown>;
    const eventId = String(row.eventId || '').trim();
    const symbol = String(row.symbol || '').trim().toUpperCase();
    const interval = String(row.interval || '').trim();
    const patternId = String(row.patternId || '').trim();
    const patternCategory = String(row.patternCategory || '').trim();
    if (!eventId || !symbol || !interval || !patternId) return null;
    if (!['Bullish', 'Bearish', 'Neutral'].includes(patternCategory)) return null;

    const contextRaw = (row.context as Record<string, unknown> | undefined) || {};

    return {
        schemaVersion: 'pattern_signal_event_v1',
        eventId,
        capturedAt: ensureFinite(row.capturedAt, Date.now()),
        tsSignal: ensureFinite(row.tsSignal, 0),
        signalOpenTime: ensureFinite(row.signalOpenTime, 0),
        signalCloseTime: ensureFinite(row.signalCloseTime, 0),
        signalClosePrice: ensureFinite(row.signalClosePrice, Number.NaN),
        symbol,
        interval,
        patternId,
        patternCategory: patternCategory as PatternSignalTelemetryMergedEvent['patternCategory'],
        ruleVersion: String(row.ruleVersion || 'unknown').trim() || 'unknown',
        clientIdHash: String(row.clientIdHash || 'anonymous').trim() || 'anonymous',
        scanGeneratedAt: ensureFinite(row.scanGeneratedAt, 0),
        scannedCount: ensureFinite(row.scannedCount, 0),
        matchedCount: ensureFinite(row.matchedCount, 0),
        forceRefresh: Boolean(row.forceRefresh),
        context: {
            volume24hUsdt:
                contextRaw.volume24hUsdt == null
                    ? null
                    : ensureFinite(contextRaw.volume24hUsdt, Number.NaN),
            fundingRate: contextRaw.fundingRate == null ? null : ensureFinite(contextRaw.fundingRate, Number.NaN),
            oiNotional: contextRaw.oiNotional == null ? null : ensureFinite(contextRaw.oiNotional, Number.NaN),
        },
        outcome: normalizeOutcome(row.outcome),
    };
}

function extractEventsFromPayload(payload: unknown): unknown[] {
    if (Array.isArray(payload)) return payload;
    if (!payload || typeof payload !== 'object') return [];
    const row = payload as Record<string, unknown>;
    if (Array.isArray(row.events)) return row.events;
    return [];
}

function outcomeRank(outcome: PatternSignalTelemetryOutcome | null): number {
    if (!outcome) return 0;
    if (outcome.status === 'resolved') return 3;
    if (outcome.status === 'pending') return 2;
    return 1;
}

function pickBetterOutcome(
    a: PatternSignalTelemetryOutcome | null,
    b: PatternSignalTelemetryOutcome | null,
): PatternSignalTelemetryOutcome | null {
    const rankA = outcomeRank(a);
    const rankB = outcomeRank(b);
    if (rankA > rankB) return a;
    if (rankB > rankA) return b;
    if (!a) return b;
    if (!b) return a;
    return ensureFinite(b.resolvedAt, 0) >= ensureFinite(a.resolvedAt, 0) ? b : a;
}

function moveToProcessed(filePath: string, processedDir: string): void {
    const base = path.basename(filePath, path.extname(filePath));
    const ext = path.extname(filePath) || '.json';
    const target = path.join(processedDir, `${base}.${Date.now()}.processed${ext}`);
    try {
        fs.renameSync(filePath, target);
    } catch {
        fs.copyFileSync(filePath, target);
        fs.unlinkSync(filePath);
    }
}

function collectFilesRecursive(rootDir: string): string[] {
    const results: string[] = [];
    const stack = [rootDir];

    while (stack.length > 0) {
        const current = stack.pop() as string;
        const entries = fs.readdirSync(current, { withFileTypes: true });
        for (const entry of entries) {
            const fullPath = path.join(current, entry.name);
            if (entry.isDirectory()) {
                if (entry.name.toLowerCase() === 'processed') continue;
                stack.push(fullPath);
                continue;
            }
            if (!entry.isFile()) continue;
            results.push(fullPath);
        }
    }

    return results;
}

function discoverInputCandidates(inputDir: string, isDefaultInbox: boolean): InputCandidate[] {
    const files = collectFilesRecursive(inputDir);
    const candidates: InputCandidate[] = [];

    for (const filePath of files) {
        const base = path.basename(filePath).toLowerCase();
        const ext = path.extname(filePath).toLowerCase();

        if (base === 'pattern_events.jsonl') {
            candidates.push({
                filePath,
                kind: 'live_dump',
                shouldMoveToProcessed: false,
            });
            continue;
        }

        if (ext === '.json') {
            candidates.push({
                filePath,
                kind: 'export_json',
                shouldMoveToProcessed: isDefaultInbox,
            });
        }
    }

    return candidates.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function readJsonlRows(filePath: string): unknown[] {
    if (!fs.existsSync(filePath)) return [];
    const text = fs.readFileSync(filePath, 'utf8');
    if (!text.trim()) return [];

    const rows: unknown[] = [];
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        try {
            rows.push(JSON.parse(trimmed));
        } catch {
            rows.push(null);
        }
    }
    return rows;
}

function loadMergedEventsFromLiveDump(eventsFilePath: string): LiveDumpLoadResult {
    const result: LiveDumpLoadResult = {
        events: [],
        parseErrors: 0,
    };

    const rawEventRows = readJsonlRows(eventsFilePath);
    const events: PatternSignalTelemetryMergedEvent[] = [];
    for (const rawEvent of rawEventRows) {
        const normalized = normalizeMergedEvent(rawEvent);
        if (!normalized) {
            result.parseErrors += 1;
            continue;
        }
        events.push(normalized);
    }

    const outcomesPath = path.join(path.dirname(eventsFilePath), 'pattern_outcomes.jsonl');
    const outcomeMap = new Map<string, NormalizedOutcomeRecord>();
    if (fs.existsSync(outcomesPath)) {
        const rawOutcomeRows = readJsonlRows(outcomesPath);
        for (const rawOutcome of rawOutcomeRows) {
            const normalized = normalizeOutcomeRecord(rawOutcome);
            if (!normalized) {
                result.parseErrors += 1;
                continue;
            }
            const existing = outcomeMap.get(normalized.eventId);
            if (!existing || normalized.updatedAt >= existing.updatedAt) {
                outcomeMap.set(normalized.eventId, normalized);
            }
        }
    }

    result.events = events.map((event) => {
        const outcomeFromFile = outcomeMap.get(event.eventId)?.outcome || null;
        return {
            ...event,
            outcome: pickBetterOutcome(event.outcome, outcomeFromFile),
        };
    });
    return result;
}

function mergeIntoWarehouse(
    warehouseMap: Map<string, PatternSignalTelemetryMergedEvent>,
    incoming: PatternSignalTelemetryMergedEvent,
    summary: IngestSummary,
): void {
    const existing = warehouseMap.get(incoming.eventId);
    if (!existing) {
        warehouseMap.set(incoming.eventId, incoming);
        return;
    }

    summary.dedupedEvents += 1;
    const mergedOutcome = pickBetterOutcome(existing.outcome, incoming.outcome);
    if (mergedOutcome !== existing.outcome) {
        summary.mergedOutcomeUpgrades += 1;
    }

    const preferIncoming = ensureFinite(incoming.capturedAt, 0) >= ensureFinite(existing.capturedAt, 0);
    warehouseMap.set(incoming.eventId, {
        ...(preferIncoming ? incoming : existing),
        outcome: mergedOutcome,
    });
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const storage = patternTelemetryService.getStoragePaths();
    const inputDir = args.inputDir ? path.resolve(process.cwd(), args.inputDir) : storage.inboxDir;
    const processedDir = path.join(inputDir, 'processed');
    const isDefaultInbox = path.resolve(inputDir) === path.resolve(storage.inboxDir);
    fs.mkdirSync(inputDir, { recursive: true });
    fs.mkdirSync(processedDir, { recursive: true });

    const candidates = discoverInputCandidates(inputDir, isDefaultInbox);
    const summary: IngestSummary = {
        filesProcessed: 0,
        filesSkipped: 0,
        importedEvents: 0,
        dedupedEvents: 0,
        mergedOutcomeUpgrades: 0,
        parseErrors: 0,
        liveDumpFiles: 0,
        exportJsonFiles: 0,
    };

    if (candidates.length === 0) {
        console.log(`telemetry_ingest: inbox empty (${inputDir})`);
        return;
    }

    const warehouse = patternTelemetryService.readWarehouseEvents();
    const warehouseMap = new Map<string, PatternSignalTelemetryMergedEvent>(
        warehouse.map((event) => [event.eventId, event]),
    );

    for (const candidate of candidates) {
        if (candidate.kind === 'live_dump') {
            summary.liveDumpFiles += 1;
            const loaded = loadMergedEventsFromLiveDump(candidate.filePath);
            summary.parseErrors += loaded.parseErrors;
            if (loaded.events.length === 0) {
                summary.filesSkipped += 1;
                continue;
            }

            for (const incoming of loaded.events) {
                summary.importedEvents += 1;
                mergeIntoWarehouse(warehouseMap, incoming, summary);
            }
            summary.filesProcessed += 1;
            continue;
        }

        summary.exportJsonFiles += 1;
        let payload: unknown;
        try {
            payload = JSON.parse(fs.readFileSync(candidate.filePath, 'utf8'));
        } catch {
            summary.filesSkipped += 1;
            summary.parseErrors += 1;
            if (candidate.shouldMoveToProcessed) {
                moveToProcessed(candidate.filePath, processedDir);
            }
            continue;
        }

        const events = extractEventsFromPayload(payload);
        if (events.length === 0) {
            summary.filesSkipped += 1;
            if (candidate.shouldMoveToProcessed) {
                moveToProcessed(candidate.filePath, processedDir);
            }
            continue;
        }

        let validEventsInFile = 0;
        for (const rawEvent of events) {
            const incoming = normalizeMergedEvent(rawEvent);
            if (!incoming) {
                summary.parseErrors += 1;
                continue;
            }
            validEventsInFile += 1;
            summary.importedEvents += 1;
            mergeIntoWarehouse(warehouseMap, incoming, summary);
        }

        if (validEventsInFile > 0) {
            summary.filesProcessed += 1;
        } else {
            summary.filesSkipped += 1;
        }
        if (candidate.shouldMoveToProcessed) {
            moveToProcessed(candidate.filePath, processedDir);
        }
    }

    patternTelemetryService.writeWarehouseEvents(Array.from(warehouseMap.values()));
    console.log(
        `telemetry_ingest: files_processed=${summary.filesProcessed} files_skipped=${summary.filesSkipped} parse_errors=${summary.parseErrors}`,
    );
    console.log(
        `telemetry_ingest: imported=${summary.importedEvents} deduped=${summary.dedupedEvents} outcome_upgrades=${summary.mergedOutcomeUpgrades}`,
    );
    console.log(
        `telemetry_ingest: source_files live_dump=${summary.liveDumpFiles} export_json=${summary.exportJsonFiles}`,
    );
    console.log(`telemetry_ingest: input_dir=${inputDir}`);
    console.log(`telemetry_ingest: warehouse=${storage.warehouseEventsFile}`);
}

main().catch((error) => {
    console.error('telemetry_ingest_failed');
    console.error(error);
    process.exit(1);
});
