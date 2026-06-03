import fs from 'fs';
import path from 'path';
import patternTelemetryService, {
    type PatternSignalTelemetryMergedEvent,
} from '../src/services/patternTelemetryService.js';

type ReportArgs = {
    fromTs: number | null;
    toTs: number | null;
    windowDays: number;
};

type PatternReportMetric = {
    patternId: string;
    category: 'Bullish' | 'Bearish' | 'Neutral';
    events: number;
    resolvedEvents: number;
    winCount1c: number;
    lossCount1c: number;
    winRate1c: number | null;
    ci95Low: number | null;
    ci95High: number | null;
    avgRet1c: number | null;
    avgRet3c: number | null;
    avgMaxDrawdown3c: number | null;
    symbols: number;
    intervals: string[];
    previousWinRate1c: number | null;
    deltaWinRate1c: number | null;
    recommendation: 'keep' | 'needs_review' | 'insufficient_data';
    reasons: string[];
};

type ReportPayload = {
    schemaVersion: 'pattern_performance_report_v1';
    generatedAt: number;
    range: {
        fromTs: number;
        toTs: number;
        windowDays: number;
    };
    summary: {
        totalEvents: number;
        totalResolved: number;
        patterns: number;
        keep: number;
        needsReview: number;
        insufficientData: number;
    };
    metrics: PatternReportMetric[];
};

function parseDateOrTs(raw: string | undefined): number | null {
    if (!raw) return null;
    const text = String(raw).trim();
    if (!text) return null;
    if (/^\d+$/.test(text)) {
        const n = Number(text);
        if (!Number.isFinite(n)) return null;
        return n > 9_999_999_999 ? n : n * 1000;
    }
    const ts = Date.parse(text);
    return Number.isFinite(ts) ? ts : null;
}

function parseArgs(argv: string[]): ReportArgs {
    const args: ReportArgs = {
        fromTs: null,
        toTs: null,
        windowDays: 7,
    };

    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [rawKey, ...rest] = token.slice(2).split('=');
        const key = rawKey.trim();
        const value = rest.length > 0 ? rest.join('=').trim() : '';
        if (key === 'from') args.fromTs = parseDateOrTs(value);
        if (key === 'to') args.toTs = parseDateOrTs(value);
        if (key === 'windowDays' || key === 'lookbackDays') {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) args.windowDays = Math.floor(n);
        }
    }

    return args;
}

function ensureFinite(value: unknown): number | null {
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
}

function dedupeByEventId(events: PatternSignalTelemetryMergedEvent[]): PatternSignalTelemetryMergedEvent[] {
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
        if ((event.capturedAt || 0) >= (existing.capturedAt || 0)) {
            map.set(event.eventId, event);
        }
    }
    return Array.from(map.values());
}

function wilsonInterval(successes: number, total: number, z: number = 1.96): { low: number; high: number } {
    if (total <= 0) return { low: 0, high: 1 };
    const p = successes / total;
    const z2 = z * z;
    const denom = 1 + z2 / total;
    const center = (p + z2 / (2 * total)) / denom;
    const margin = (z / denom) * Math.sqrt((p * (1 - p) + z2 / (4 * total)) / total);
    return {
        low: Math.max(0, center - margin),
        high: Math.min(1, center + margin),
    };
}

function mean(values: Array<number | null>): number | null {
    const finite = values
        .map((v) => (v == null ? null : Number(v)))
        .filter((v): v is number => v !== null && Number.isFinite(v));
    if (finite.length === 0) return null;
    const sum = finite.reduce((acc, value) => acc + value, 0);
    return sum / finite.length;
}

function computeMetrics(
    events: PatternSignalTelemetryMergedEvent[],
    previousEvents: PatternSignalTelemetryMergedEvent[],
): PatternReportMetric[] {
    const byPattern = new Map<string, PatternSignalTelemetryMergedEvent[]>();
    for (const event of events) {
        const list = byPattern.get(event.patternId) || [];
        list.push(event);
        byPattern.set(event.patternId, list);
    }

    const prevByPattern = new Map<string, PatternSignalTelemetryMergedEvent[]>();
    for (const event of previousEvents) {
        const list = prevByPattern.get(event.patternId) || [];
        list.push(event);
        prevByPattern.set(event.patternId, list);
    }

    const metrics: PatternReportMetric[] = [];
    for (const [patternId, rows] of byPattern.entries()) {
        const category = rows[0]?.patternCategory || 'Neutral';
        const resolved = rows.filter((event) => event.outcome?.status === 'resolved');
        const winLossSeries = resolved
            .map((event) => event.outcome?.winLoss1c)
            .filter((value): value is boolean => typeof value === 'boolean');
        const winCount1c = winLossSeries.filter(Boolean).length;
        const lossCount1c = winLossSeries.filter((value) => !value).length;
        const winRate1c =
            category === 'Neutral' || winLossSeries.length === 0 ? null : winCount1c / winLossSeries.length;
        const ci =
            category === 'Neutral' || winLossSeries.length === 0
                ? { low: null, high: null }
                : wilsonInterval(winCount1c, winLossSeries.length);

        const prevRows = prevByPattern.get(patternId) || [];
        const prevResolved = prevRows.filter((event) => event.outcome?.status === 'resolved');
        const prevWinLoss = prevResolved
            .map((event) => event.outcome?.winLoss1c)
            .filter((value): value is boolean => typeof value === 'boolean');
        const previousWinRate1c =
            category === 'Neutral' || prevWinLoss.length === 0
                ? null
                : prevWinLoss.filter(Boolean).length / prevWinLoss.length;

        const deltaWinRate1c =
            winRate1c !== null && previousWinRate1c !== null ? winRate1c - previousWinRate1c : null;

        const avgRet1c = mean(resolved.map((event) => ensureFinite(event.outcome?.ret1c)));
        const avgRet3c = mean(resolved.map((event) => ensureFinite(event.outcome?.ret3c)));
        const avgMaxDrawdown3c = mean(
            resolved.map((event) => ensureFinite(event.outcome?.maxDrawdown3c)),
        );

        const symbols = new Set(rows.map((event) => event.symbol));
        const intervals = Array.from(new Set(rows.map((event) => event.interval))).sort((a, b) =>
            a.localeCompare(b),
        );

        const reasons: string[] = [];
        let recommendation: PatternReportMetric['recommendation'] = 'keep';
        if (resolved.length < 30) {
            recommendation = 'insufficient_data';
            reasons.push('resolved_events_below_30');
        } else if (category !== 'Neutral') {
            if (ci.low !== null && ci.low < 0.5) {
                recommendation = 'needs_review';
                reasons.push('ci95_low_below_0.50');
            }
            if (deltaWinRate1c !== null && deltaWinRate1c <= -0.05) {
                recommendation = 'needs_review';
                reasons.push('week_over_week_win_rate_drop_gt_5pct');
            }
            if (winRate1c !== null && winRate1c < 0.5) {
                recommendation = 'needs_review';
                reasons.push('win_rate_below_0.50');
            }
        }

        metrics.push({
            patternId,
            category,
            events: rows.length,
            resolvedEvents: resolved.length,
            winCount1c,
            lossCount1c,
            winRate1c,
            ci95Low: ci.low,
            ci95High: ci.high,
            avgRet1c,
            avgRet3c,
            avgMaxDrawdown3c,
            symbols: symbols.size,
            intervals,
            previousWinRate1c,
            deltaWinRate1c,
            recommendation,
            reasons,
        });
    }

    metrics.sort((a, b) => {
        if (a.recommendation !== b.recommendation) return a.recommendation.localeCompare(b.recommendation);
        const aw = a.winRate1c ?? -1;
        const bw = b.winRate1c ?? -1;
        return aw - bw;
    });
    return metrics;
}

function toMarkdown(report: ReportPayload): string {
    const rows = report.metrics.map((metric) => {
        const winRate = metric.winRate1c === null ? '-' : `${(metric.winRate1c * 100).toFixed(2)}%`;
        const ci =
            metric.ci95Low === null || metric.ci95High === null
                ? '-'
                : `[${(metric.ci95Low * 100).toFixed(1)}%, ${(metric.ci95High * 100).toFixed(1)}%]`;
        const delta =
            metric.deltaWinRate1c === null ? '-' : `${(metric.deltaWinRate1c * 100).toFixed(2)}%`;
        const avgRet1c = metric.avgRet1c === null ? '-' : `${(metric.avgRet1c * 100).toFixed(3)}%`;
        const avgRet3c = metric.avgRet3c === null ? '-' : `${(metric.avgRet3c * 100).toFixed(3)}%`;
        return `| ${metric.patternId} | ${metric.category} | ${metric.recommendation} | ${metric.events} | ${metric.resolvedEvents} | ${winRate} | ${ci} | ${avgRet1c} | ${avgRet3c} | ${delta} | ${metric.reasons.join(', ') || '-'} |`;
    });

    return [
        '# Pattern Performance Report',
        '',
        `Generated at: ${new Date(report.generatedAt).toISOString()}`,
        '',
        `Range: ${new Date(report.range.fromTs).toISOString()} -> ${new Date(report.range.toTs).toISOString()}`,
        '',
        `Summary: total_events=${report.summary.totalEvents}, resolved=${report.summary.totalResolved}, patterns=${report.summary.patterns}, keep=${report.summary.keep}, needs_review=${report.summary.needsReview}, insufficient_data=${report.summary.insufficientData}`,
        '',
        '| Pattern | Category | Recommendation | Events | Resolved | WinRate1c | CI95 | AvgRet1c | AvgRet3c | WoW Delta | Reasons |',
        '| --- | --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | --- |',
        ...rows,
        '',
    ].join('\n');
}

async function main() {
    const args = parseArgs(process.argv.slice(2));
    const now = Date.now();
    const toTs = args.toTs ?? now;
    const fromTs = args.fromTs ?? now - args.windowDays * 86_400_000;
    if (fromTs >= toTs) {
        throw new Error('Invalid range: from must be earlier than to');
    }

    const deduped = dedupeByEventId(patternTelemetryService.readWarehouseEvents());
    const currentEvents = deduped.filter(
        (event) => ensureFinite(event.tsSignal) !== null && (event.tsSignal >= fromTs && event.tsSignal <= toTs),
    );

    const previousFrom = fromTs - (toTs - fromTs);
    const previousTo = fromTs;
    const previousEvents = deduped.filter(
        (event) =>
            ensureFinite(event.tsSignal) !== null &&
            (event.tsSignal >= previousFrom && event.tsSignal < previousTo),
    );

    const metrics = computeMetrics(currentEvents, previousEvents);
    const summary = {
        totalEvents: currentEvents.length,
        totalResolved: currentEvents.filter((event) => event.outcome?.status === 'resolved').length,
        patterns: metrics.length,
        keep: metrics.filter((metric) => metric.recommendation === 'keep').length,
        needsReview: metrics.filter((metric) => metric.recommendation === 'needs_review').length,
        insufficientData: metrics.filter((metric) => metric.recommendation === 'insufficient_data').length,
    };

    const report: ReportPayload = {
        schemaVersion: 'pattern_performance_report_v1',
        generatedAt: now,
        range: {
            fromTs,
            toTs,
            windowDays: args.windowDays,
        },
        summary,
        metrics,
    };

    const artifactsDir = path.resolve(process.cwd(), 'artifacts');
    fs.mkdirSync(artifactsDir, { recursive: true });
    const jsonPath = path.join(artifactsDir, 'pattern-performance-report.json');
    const mdPath = path.join(artifactsDir, 'pattern-performance-report.md');
    fs.writeFileSync(jsonPath, `${JSON.stringify(report, null, 2)}\n`);
    fs.writeFileSync(mdPath, `${toMarkdown(report)}\n`);

    console.log(`telemetry_report: json=${jsonPath}`);
    console.log(`telemetry_report: md=${mdPath}`);
    console.log(
        `telemetry_report: total_events=${summary.totalEvents} resolved=${summary.totalResolved} keep=${summary.keep} needs_review=${summary.needsReview} insufficient_data=${summary.insufficientData}`,
    );
}

main().catch((error) => {
    console.error('telemetry_report_failed');
    console.error(error);
    process.exit(1);
});
