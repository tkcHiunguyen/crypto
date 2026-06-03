import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { PatternMatchedDetail } from './patternService.js';

export type PatternSignalCategory = 'Bullish' | 'Bearish' | 'Neutral';
export type PatternSignalOutcomeStatus = 'resolved' | 'pending' | 'signal_not_found';

export type PatternSignalTelemetryOutcome = {
    status: PatternSignalOutcomeStatus;
    resolvedAt: number;
    nextCloseTime1c: number | null;
    nextClosePrice1c: number | null;
    ret1c: number | null;
    ret3c: number | null;
    maxDrawdown3c: number | null;
    winLoss1c: boolean | null;
    notes?: string;
};

export type PatternSignalTelemetryEvent = {
    schemaVersion: 'pattern_signal_event_v1';
    eventId: string;
    capturedAt: number;
    tsSignal: number;
    signalOpenTime: number;
    signalCloseTime: number;
    signalClosePrice: number;
    symbol: string;
    interval: string;
    patternId: string;
    patternCategory: PatternSignalCategory;
    ruleVersion: string;
    clientIdHash: string;
    scanGeneratedAt: number;
    scannedCount: number;
    matchedCount: number;
    forceRefresh: boolean;
    context: {
        volume24hUsdt: number | null;
        fundingRate: number | null;
        oiNotional: number | null;
    };
};

export type PatternSignalTelemetryOutcomeRecord = {
    schemaVersion: 'pattern_signal_outcome_v1';
    eventId: string;
    updatedAt: number;
    outcome: PatternSignalTelemetryOutcome;
};

export type PatternSignalTelemetryMergedEvent = PatternSignalTelemetryEvent & {
    outcome: PatternSignalTelemetryOutcome | null;
};

type PatternTelemetryStoragePaths = {
    rootDir: string;
    liveDir: string;
    exportsDir: string;
    inboxDir: string;
    inboxProcessedDir: string;
    warehouseDir: string;
    liveEventsFile: string;
    liveOutcomesFile: string;
    warehouseEventsFile: string;
};

type RecordPatternScanPayload = {
    patternId: string;
    patternCategory: PatternSignalCategory;
    interval: string;
    ruleVersion: string;
    matchedDetails: PatternMatchedDetail[];
    scanGeneratedAt: number;
    scannedCount: number;
    matchedCount: number;
    forceRefresh: boolean;
    clientKey: string;
};

const EVENT_SCHEMA_VERSION = 'pattern_signal_event_v1';
const OUTCOME_SCHEMA_VERSION = 'pattern_signal_outcome_v1';
const IS_PKG_RUNTIME = Boolean((process as NodeJS.Process & { pkg?: unknown }).pkg);
const runtimeBaseDir = IS_PKG_RUNTIME ? path.dirname(process.execPath) : process.cwd();

function toFiniteOrNull(value: unknown): number | null {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function ensureNumber(value: unknown, fallback: number): number {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function safeJsonParse(line: string): unknown | null {
    const text = String(line || '').trim();
    if (!text) return null;
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

function intervalToMs(interval: string): number {
    const normalized = String(interval || '').trim().toLowerCase();
    const m = normalized.match(/^(\d+)([mhdw])$/);
    if (!m) return 60_000;
    const amount = Number(m[1]);
    if (!Number.isFinite(amount) || amount <= 0) return 60_000;

    const unit = m[2];
    if (unit === 'm') return amount * 60_000;
    if (unit === 'h') return amount * 3_600_000;
    if (unit === 'd') return amount * 86_400_000;
    if (unit === 'w') return amount * 7 * 86_400_000;
    return 60_000;
}

class PatternTelemetryService {
    private readonly paths: PatternTelemetryStoragePaths;

    constructor() {
        const rootDir = path.resolve(runtimeBaseDir, 'data', 'telemetry');
        const liveDir = path.join(rootDir, 'live');
        const exportsDir = path.join(rootDir, 'exports');
        const inboxDir = path.join(rootDir, 'inbox');
        const inboxProcessedDir = path.join(inboxDir, 'processed');
        const warehouseDir = path.join(rootDir, 'warehouse');

        this.paths = {
            rootDir,
            liveDir,
            exportsDir,
            inboxDir,
            inboxProcessedDir,
            warehouseDir,
            liveEventsFile: path.join(liveDir, 'pattern_events.jsonl'),
            liveOutcomesFile: path.join(liveDir, 'pattern_outcomes.jsonl'),
            warehouseEventsFile: path.join(warehouseDir, 'events.jsonl'),
        };

        this.ensureDirectories();
    }

    getStoragePaths(): PatternTelemetryStoragePaths {
        return { ...this.paths };
    }

    getIntervalMs(interval: string): number {
        return intervalToMs(interval);
    }

    buildClientIdHash(clientKey: string): string {
        const normalized = String(clientKey || '').trim().toLowerCase();
        if (!normalized) return 'anonymous';
        return crypto.createHash('sha1').update(normalized).digest('hex').slice(0, 16);
    }

    buildEventId(args: {
        symbol: string;
        interval: string;
        patternId: string;
        signalCloseTime: number;
        ruleVersion: string;
    }): string {
        const payload = [
            String(args.symbol || '').trim().toUpperCase(),
            String(args.interval || '').trim().toLowerCase(),
            String(args.patternId || '').trim(),
            String(ensureNumber(args.signalCloseTime, 0)),
            String(args.ruleVersion || '').trim(),
        ].join('|');
        return crypto.createHash('sha1').update(payload).digest('hex');
    }

    recordPatternScan(payload: RecordPatternScanPayload): { written: number; skipped: number } {
        const matchedDetails = Array.isArray(payload.matchedDetails) ? payload.matchedDetails : [];
        if (matchedDetails.length === 0) return { written: 0, skipped: 0 };

        const clientIdHash = this.buildClientIdHash(payload.clientKey);
        const now = Date.now();
        const rows: PatternSignalTelemetryEvent[] = [];
        const dedupeInBatch = new Set<string>();
        let skipped = 0;

        for (const detail of matchedDetails) {
            const signalCloseTime = ensureNumber(detail.signalCloseTime, 0);
            const signalOpenTime = ensureNumber(detail.signalOpenTime, signalCloseTime);
            const signalClosePrice = ensureNumber(detail.signalClosePrice, Number.NaN);
            const symbol = String(detail.symbol || '').trim().toUpperCase();
            if (!symbol || !Number.isFinite(signalCloseTime) || !Number.isFinite(signalClosePrice)) {
                skipped += 1;
                continue;
            }

            const eventId = this.buildEventId({
                symbol,
                interval: payload.interval,
                patternId: payload.patternId,
                signalCloseTime,
                ruleVersion: payload.ruleVersion,
            });
            if (dedupeInBatch.has(eventId)) {
                skipped += 1;
                continue;
            }
            dedupeInBatch.add(eventId);

            rows.push({
                schemaVersion: EVENT_SCHEMA_VERSION,
                eventId,
                capturedAt: now,
                tsSignal: signalCloseTime,
                signalOpenTime,
                signalCloseTime,
                signalClosePrice,
                symbol,
                interval: String(payload.interval || '').trim(),
                patternId: String(payload.patternId || '').trim(),
                patternCategory: payload.patternCategory,
                ruleVersion: String(payload.ruleVersion || '').trim() || 'unknown',
                clientIdHash,
                scanGeneratedAt: ensureNumber(payload.scanGeneratedAt, now),
                scannedCount: ensureNumber(payload.scannedCount, 0),
                matchedCount: ensureNumber(payload.matchedCount, rows.length + 1),
                forceRefresh: Boolean(payload.forceRefresh),
                context: {
                    volume24hUsdt: null,
                    fundingRate: null,
                    oiNotional: null,
                },
            });
        }

        if (rows.length > 0) {
            this.appendJsonlRows(this.paths.liveEventsFile, rows);
        }

        return { written: rows.length, skipped };
    }

    readLiveEvents(): PatternSignalTelemetryEvent[] {
        return this.readJsonlRows(this.paths.liveEventsFile)
            .map((row) => this.normalizeEvent(row))
            .filter((row): row is PatternSignalTelemetryEvent => Boolean(row));
    }

    readLiveOutcomeRecords(): PatternSignalTelemetryOutcomeRecord[] {
        return this.readJsonlRows(this.paths.liveOutcomesFile)
            .map((row) => this.normalizeOutcomeRecord(row))
            .filter((row): row is PatternSignalTelemetryOutcomeRecord => Boolean(row));
    }

    appendOutcomeRecords(records: PatternSignalTelemetryOutcomeRecord[]): number {
        const safeRecords = (Array.isArray(records) ? records : []).filter((record) =>
            Boolean(this.normalizeOutcomeRecord(record)),
        );
        if (safeRecords.length === 0) return 0;
        this.appendJsonlRows(this.paths.liveOutcomesFile, safeRecords);
        return safeRecords.length;
    }

    readLatestOutcomeByEventId(
        records: PatternSignalTelemetryOutcomeRecord[] = this.readLiveOutcomeRecords(),
    ): Map<string, PatternSignalTelemetryOutcomeRecord> {
        const m = new Map<string, PatternSignalTelemetryOutcomeRecord>();
        for (const record of records) {
            const existing = m.get(record.eventId);
            if (!existing || record.updatedAt >= existing.updatedAt) {
                m.set(record.eventId, record);
            }
        }
        return m;
    }

    mergeEventsWithOutcomeMap(
        events: PatternSignalTelemetryEvent[],
        outcomeMap: Map<string, PatternSignalTelemetryOutcomeRecord>,
    ): PatternSignalTelemetryMergedEvent[] {
        return events.map((event) => ({
            ...event,
            outcome: outcomeMap.get(event.eventId)?.outcome || null,
        }));
    }

    readWarehouseEvents(): PatternSignalTelemetryMergedEvent[] {
        return this.readJsonlRows(this.paths.warehouseEventsFile)
            .map((row) => this.normalizeMergedEvent(row))
            .filter((row): row is PatternSignalTelemetryMergedEvent => Boolean(row));
    }

    writeWarehouseEvents(events: PatternSignalTelemetryMergedEvent[]): void {
        const sorted = events
            .slice()
            .sort((a, b) => a.tsSignal - b.tsSignal || a.eventId.localeCompare(b.eventId));
        this.writeJsonlRows(this.paths.warehouseEventsFile, sorted);
    }

    private ensureDirectories(): void {
        const dirs = [
            this.paths.rootDir,
            this.paths.liveDir,
            this.paths.exportsDir,
            this.paths.inboxDir,
            this.paths.inboxProcessedDir,
            this.paths.warehouseDir,
        ];
        for (const dir of dirs) {
            fs.mkdirSync(dir, { recursive: true });
        }
    }

    private readJsonlRows(filePath: string): unknown[] {
        if (!fs.existsSync(filePath)) return [];
        const text = fs.readFileSync(filePath, 'utf8');
        if (!text.trim()) return [];
        return text
            .split(/\r?\n/)
            .map((line) => safeJsonParse(line))
            .filter((row): row is unknown => row !== null);
    }

    private writeJsonlRows(filePath: string, rows: unknown[]): void {
        const lines = rows.map((row) => JSON.stringify(row));
        fs.writeFileSync(filePath, `${lines.join('\n')}${lines.length > 0 ? '\n' : ''}`);
    }

    private appendJsonlRows(filePath: string, rows: unknown[]): void {
        if (rows.length === 0) return;
        const lines = rows.map((row) => JSON.stringify(row));
        fs.appendFileSync(filePath, `${lines.join('\n')}\n`);
    }

    private normalizeEvent(raw: unknown): PatternSignalTelemetryEvent | null {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        const eventId = String(row.eventId || '').trim();
        const symbol = String(row.symbol || '').trim().toUpperCase();
        const patternId = String(row.patternId || '').trim();
        const interval = String(row.interval || '').trim();
        const patternCategory = String(row.patternCategory || '').trim() as PatternSignalCategory;
        if (!eventId || !symbol || !patternId || !interval) return null;
        if (!['Bullish', 'Bearish', 'Neutral'].includes(patternCategory)) return null;

        return {
            schemaVersion: EVENT_SCHEMA_VERSION,
            eventId,
            capturedAt: ensureNumber(row.capturedAt, 0),
            tsSignal: ensureNumber(row.tsSignal, 0),
            signalOpenTime: ensureNumber(row.signalOpenTime, 0),
            signalCloseTime: ensureNumber(row.signalCloseTime, 0),
            signalClosePrice: ensureNumber(row.signalClosePrice, Number.NaN),
            symbol,
            interval,
            patternId,
            patternCategory,
            ruleVersion: String(row.ruleVersion || 'unknown').trim() || 'unknown',
            clientIdHash: String(row.clientIdHash || 'anonymous').trim() || 'anonymous',
            scanGeneratedAt: ensureNumber(row.scanGeneratedAt, 0),
            scannedCount: ensureNumber(row.scannedCount, 0),
            matchedCount: ensureNumber(row.matchedCount, 0),
            forceRefresh: Boolean(row.forceRefresh),
            context: {
                volume24hUsdt: toFiniteOrNull((row.context as Record<string, unknown> | undefined)?.volume24hUsdt),
                fundingRate: toFiniteOrNull((row.context as Record<string, unknown> | undefined)?.fundingRate),
                oiNotional: toFiniteOrNull((row.context as Record<string, unknown> | undefined)?.oiNotional),
            },
        };
    }

    private normalizeOutcomeRecord(raw: unknown): PatternSignalTelemetryOutcomeRecord | null {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        const eventId = String(row.eventId || '').trim();
        if (!eventId) return null;
        const outcome = this.normalizeOutcome(row.outcome);
        if (!outcome) return null;

        return {
            schemaVersion: OUTCOME_SCHEMA_VERSION,
            eventId,
            updatedAt: ensureNumber(row.updatedAt, Date.now()),
            outcome,
        };
    }

    private normalizeOutcome(raw: unknown): PatternSignalTelemetryOutcome | null {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        const status = String(row.status || '').trim() as PatternSignalOutcomeStatus;
        if (!['resolved', 'pending', 'signal_not_found'].includes(status)) return null;

        return {
            status,
            resolvedAt: ensureNumber(row.resolvedAt, Date.now()),
            nextCloseTime1c: toFiniteOrNull(row.nextCloseTime1c),
            nextClosePrice1c: toFiniteOrNull(row.nextClosePrice1c),
            ret1c: toFiniteOrNull(row.ret1c),
            ret3c: toFiniteOrNull(row.ret3c),
            maxDrawdown3c: toFiniteOrNull(row.maxDrawdown3c),
            winLoss1c:
                typeof row.winLoss1c === 'boolean'
                    ? row.winLoss1c
                    : row.winLoss1c === null
                      ? null
                      : null,
            notes: typeof row.notes === 'string' && row.notes.trim() ? row.notes.trim() : undefined,
        };
    }

    private normalizeMergedEvent(raw: unknown): PatternSignalTelemetryMergedEvent | null {
        if (!raw || typeof raw !== 'object') return null;
        const row = raw as Record<string, unknown>;
        const event = this.normalizeEvent(row);
        if (!event) return null;
        return {
            ...event,
            outcome: this.normalizeOutcome(row.outcome),
        };
    }
}

const patternTelemetryService = new PatternTelemetryService();

export { intervalToMs };
export default patternTelemetryService;
