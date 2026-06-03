
import fs from 'fs';
import path from 'path';
import patternService from '../src/services/patternService.js';
import binanceService from '../src/services/binanceService.js';

type PatternCategory = 'Bullish' | 'Bearish' | 'Neutral';
type TrendExpectation = 'uptrend(0)' | 'downtrend(0)';
type TrendStatus = 'ok' | 'missing' | 'mismatch' | 'not_required';
type AuditStatus = 'PASS' | 'FAIL';

type Candle = {
    openTime: number;
    closeTime: number;
    open: number;
    high: number;
    low: number;
    close: number;
};

type CompiledPattern = {
    id: string;
    displayName: string;
    category: PatternCategory;
    candles: number;
    rules: string[];
    compiledRules: Array<(ctx: unknown) => boolean>;
};

type PatternRuleFile = {
    meta?: Record<string, unknown>;
    params: Record<string, number>;
    patterns: Array<{
        pattern: string;
        category: PatternCategory;
        candles: number;
        rules: string[];
        notes?: string;
    }>;
};

type SyntheticOutcome = {
    foundMatch: boolean;
    bestCoverage: number;
    bestSatisfied: number;
    totalRules: number;
    attempts: number;
    mutationFalseRate: number | null;
    overlapsWith: string[];
};

type HistoricalPatternStats = {
    events: number;
    wins: number;
    hitRate: number | null;
    avgNextReturn: number | null;
    symbolsHit: number;
    oppositeOverlapEvents: number;
};

type TrendAuditEntry = {
    patternId: string;
    category: PatternCategory;
    expectedTrend: TrendExpectation | null;
    existingTrendRules: string[];
    trendStatus: TrendStatus;
    proposal: string | null;
};

type PatternAuditRow = {
    patternId: string;
    category: PatternCategory;
    trendStatus: TrendStatus;
    synthetic: SyntheticOutcome;
    historical: HistoricalPatternStats;
    confidence: number;
    status: AuditStatus;
};

type PairOverlap = {
    pair: string;
    count: number;
    ratio: number;
    categoryA: PatternCategory;
    categoryB: PatternCategory;
};

type AuditConfig = {
    interval: string;
    symbolLimit: number;
    klineLimit: number;
    fetchConcurrency: number;
    syntheticMaxAttempts: number;
    syntheticGapMaxAttempts: number;
    outDir: string;
    historicalEnabled: boolean;
};

type HistoricalRunResult = {
    perPattern: Map<string, HistoricalPatternStats>;
    pairOverlap: PairOverlap[];
    symbolCount: number;
    candleWindowsScanned: number;
    errors: string[];
};

type EvaluatedPattern = {
    matched: boolean;
    satisfiedRules: number;
    totalRules: number;
    ruleResults: boolean[];
};

const DAY_MS = 86_400_000;
const TREND_RULE_RE = /^\s*(uptrend|downtrend)\s*\(\s*-?\d+\s*\)\s*$/i;

const EXPECTED_TREND: Record<string, TrendExpectation | null> = {
    doji: null,
    'long-legged-doji': null,
    'spinning-top': null,

    'belt-hold-bullish': 'downtrend(0)',
    'dragonfly-doji': 'downtrend(0)',
    hammer: 'downtrend(0)',
    'inverted-hammer': 'downtrend(0)',
    'marubozu-bullish': 'uptrend(0)',
    'engulfing-bullish': 'downtrend(0)',
    'bullish-harami': 'downtrend(0)',
    'harami-cross-bullish': 'downtrend(0)',
    'piercing-pattern': 'downtrend(0)',
    'kicking-bullish': 'downtrend(0)',
    'morning-star': 'downtrend(0)',
    'morning-doji-star': 'downtrend(0)',
    'three-inside-up': 'downtrend(0)',
    'three-white-soldiers': 'downtrend(0)',
    'tweezer-bottoms': 'downtrend(0)',
    'upside-tasuki-gap': 'uptrend(0)',
    'abandoned-baby-bullish': 'downtrend(0)',
    'rising-three-methods': 'uptrend(0)',
    'mat-hold': 'uptrend(0)',

    'belt-hold-bearish': 'uptrend(0)',
    'gravestone-doji': 'uptrend(0)',
    'hanging-man': 'uptrend(0)',
    'marubozu-bearish': 'downtrend(0)',
    'shooting-star': 'uptrend(0)',
    'engulfing-bearish': 'uptrend(0)',
    'bearish-harami': 'uptrend(0)',
    'harami-cross-bearish': 'uptrend(0)',
    'dark-cloud-cover': 'uptrend(0)',
    'kicking-bearish': 'uptrend(0)',
    'tweezer-tops': 'uptrend(0)',
    'evening-star': 'uptrend(0)',
    'evening-doji-star': 'uptrend(0)',
    'three-inside-down': 'uptrend(0)',
    'three-black-crows': 'uptrend(0)',
    'downside-tasuki-gap': 'downtrend(0)',
    'abandoned-baby-bearish': 'uptrend(0)',
    'falling-three-methods': 'downtrend(0)',
};

function parseArgs(argv: string[]): Partial<AuditConfig> {
    const parsed: Record<string, string> = {};
    for (const arg of argv) {
        if (!arg.startsWith('--')) continue;
        const [rawKey, ...rest] = arg.slice(2).split('=');
        if (!rawKey) continue;
        parsed[rawKey] = rest.length > 0 ? rest.join('=') : 'true';
    }

    const cfg: Partial<AuditConfig> = {};
    if (parsed.interval) cfg.interval = parsed.interval;
    if (parsed.symbolLimit) cfg.symbolLimit = toPositiveInt(parsed.symbolLimit, 80);
    if (parsed.klineLimit) cfg.klineLimit = toPositiveInt(parsed.klineLimit, 260);
    if (parsed.fetchConcurrency) cfg.fetchConcurrency = toPositiveInt(parsed.fetchConcurrency, 6);
    if (parsed.syntheticMaxAttempts) cfg.syntheticMaxAttempts = toPositiveInt(parsed.syntheticMaxAttempts, 30000);
    if (parsed.syntheticGapMaxAttempts) cfg.syntheticGapMaxAttempts = toPositiveInt(parsed.syntheticGapMaxAttempts, 80000);
    if (parsed.outDir) cfg.outDir = parsed.outDir;
    if (parsed.historical) cfg.historicalEnabled = parsed.historical !== 'false';
    return cfg;
}

function toPositiveInt(value: string, fallback: number): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.floor(parsed);
}

function mulberry32(seed: number): () => number {
    let t = seed >>> 0;
    return () => {
        t += 0x6d2b79f5;
        let r = Math.imul(t ^ (t >>> 15), 1 | t);
        r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
        return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
    };
}

function hashString(input: string): number {
    let hash = 2166136261;
    for (let i = 0; i < input.length; i += 1) {
        hash ^= input.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function randBetween(rng: () => number, min: number, max: number): number {
    return min + rng() * (max - min);
}

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

function canonicalTrendRule(rule: string): string | null {
    const normalized = String(rule || '').replace(/\s+/g, '').toLowerCase();
    const m = normalized.match(/^(uptrend|downtrend)\((-?\d+)\)$/);
    if (!m) return null;
    return `${m[1]}(${m[2]})`;
}

function isTrendRule(rule: string): boolean {
    return TREND_RULE_RE.test(rule);
}

function normalizeRule(rule: string): string {
    return String(rule || '').replace(/\s+/g, '').toLowerCase();
}
function generateRandomCandles(length: number, seed: number): Candle[] {
    const rng = mulberry32(seed);
    const candles: Candle[] = [];
    let price = randBetween(rng, 20, 2000);
    const startTime = Date.now() - length * DAY_MS;

    for (let i = 0; i < length; i += 1) {
        const gapMove = randBetween(rng, -0.06, 0.06);
        const open = Math.max(0.0000001, price * (1 + gapMove));

        const bodyMove = randBetween(rng, -0.12, 0.12);
        const close = Math.max(0.0000001, open * (1 + bodyMove));

        const wickUp = Math.abs(randBetween(rng, 0, 0.15));
        const wickDown = Math.abs(randBetween(rng, 0, 0.15));
        const high = Math.max(open, close) * (1 + wickUp);
        const low = Math.max(0.0000001, Math.min(open, close) * (1 - wickDown));

        candles.push({
            openTime: startTime + i * DAY_MS,
            closeTime: startTime + (i + 1) * DAY_MS,
            open,
            high: Math.max(high, open, close),
            low: Math.min(low, open, close),
            close,
        });

        price = close * (1 + randBetween(rng, -0.02, 0.02));
    }

    return candles;
}

function mutateCandles(base: Candle[], seed: number, relevantStart: number): Candle[] {
    const rng = mulberry32(seed);
    const next = base.map((c) => ({ ...c }));
    const mutations = 1 + Math.floor(rng() * 3);
    const start = clamp(relevantStart, 0, Math.max(0, next.length - 1));

    for (let m = 0; m < mutations; m += 1) {
        const idx = start + Math.floor(rng() * (next.length - start));
        const candle = next[idx];
        if (!candle) continue;

        let open = candle.open * (1 + randBetween(rng, -0.35, 0.35));
        let close = candle.close * (1 + randBetween(rng, -0.35, 0.35));
        open = Math.max(0.0000001, open);
        close = Math.max(0.0000001, close);

        const bodyTop = Math.max(open, close);
        const bodyBottom = Math.min(open, close);
        const upFactor = Math.abs(randBetween(rng, 0, 0.22));
        const downFactor = Math.abs(randBetween(rng, 0, 0.22));

        let high = bodyTop * (1 + upFactor);
        let low = bodyBottom * (1 - downFactor);
        if (rng() < 0.2) {
            high = bodyTop * (1 + Math.abs(randBetween(rng, 0.25, 0.7)));
        }
        if (rng() < 0.2) {
            low = bodyBottom * (1 - Math.abs(randBetween(rng, 0.25, 0.7)));
        }

        next[idx] = {
            ...candle,
            open,
            close,
            high: Math.max(high, open, close),
            low: Math.max(0.0000001, Math.min(low, open, close)),
        };
    }

    return next;
}

function evaluatePattern(patternServiceAny: any, pattern: CompiledPattern, candles: Candle[]): EvaluatedPattern {
    const ctx = patternServiceAny.createEvalContext(candles);
    const ruleResults = pattern.compiledRules.map((ruleFn) => {
        try {
            return Boolean(ruleFn(ctx));
        } catch {
            return false;
        }
    });

    const satisfiedRules = ruleResults.filter(Boolean).length;
    return {
        matched: satisfiedRules === ruleResults.length,
        satisfiedRules,
        totalRules: ruleResults.length,
        ruleResults,
    };
}

function findSyntheticMatch(
    patternServiceAny: any,
    pattern: CompiledPattern,
    trendLookback: number,
    maxAttempts: number,
): {
    bestCandles: Candle[];
    bestEval: EvaluatedPattern;
    matchedCandles: Candle[] | null;
    attemptsUsed: number;
} {
    const length = Math.max(24, pattern.candles + trendLookback + 8);
    const relevantStart = Math.max(0, length - (pattern.candles + trendLookback + 2));
    const seedBase = hashString(`pattern:${pattern.id}`);

    let bestCandles = generateRandomCandles(length, seedBase);
    let bestEval = evaluatePattern(patternServiceAny, pattern, bestCandles);
    let matchedCandles: Candle[] | null = bestEval.matched ? bestCandles : null;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
        const seed = seedBase + attempt * 7919;
        const candidate =
            attempt % 11 === 0
                ? generateRandomCandles(length, seed)
                : mutateCandles(bestCandles, seed, relevantStart);
        const ev = evaluatePattern(patternServiceAny, pattern, candidate);

        if (ev.satisfiedRules > bestEval.satisfiedRules || (ev.matched && !bestEval.matched)) {
            bestEval = ev;
            bestCandles = candidate;
        }

        if (ev.matched) {
            matchedCandles = candidate;
            return {
                bestCandles: candidate,
                bestEval: ev,
                matchedCandles,
                attemptsUsed: attempt,
            };
        }
    }

    return {
        bestCandles,
        bestEval,
        matchedCandles,
        attemptsUsed: maxAttempts,
    };
}

function measureMutationFalseRate(
    patternServiceAny: any,
    pattern: CompiledPattern,
    matchedCandles: Candle[] | null,
): number | null {
    if (!matchedCandles) return null;
    const trials = 60;
    const relevantStart = Math.max(0, matchedCandles.length - (pattern.candles + 8));
    const seedBase = hashString(`mutate:${pattern.id}`);
    let falseCount = 0;

    for (let i = 0; i < trials; i += 1) {
        const mutated = mutateCandles(matchedCandles, seedBase + i * 1337, relevantStart);
        const ev = evaluatePattern(patternServiceAny, pattern, mutated);
        if (!ev.matched) falseCount += 1;
    }

    return falseCount / trials;
}

function computeSyntheticOutcomes(
    patternServiceAny: any,
    patterns: CompiledPattern[],
    trendLookback: number,
    cfg: AuditConfig,
): Map<string, SyntheticOutcome> {
    const outcomes = new Map<string, SyntheticOutcome>();

    for (const pattern of patterns) {
        const hasGapRule = pattern.rules.some((rule) => /gap_up|gap_down/i.test(rule));
        const maxAttempts = hasGapRule ? cfg.syntheticGapMaxAttempts : cfg.syntheticMaxAttempts;
        const solveResult = findSyntheticMatch(patternServiceAny, pattern, trendLookback, maxAttempts);
        const mutationFalseRate = measureMutationFalseRate(
            patternServiceAny,
            pattern,
            solveResult.matchedCandles,
        );
        const overlaps: string[] = [];

        if (solveResult.matchedCandles) {
            for (const other of patterns) {
                if (other.id === pattern.id) continue;
                const ev = evaluatePattern(patternServiceAny, other, solveResult.matchedCandles);
                if (ev.matched) overlaps.push(other.id);
            }
        }

        outcomes.set(pattern.id, {
            foundMatch: solveResult.matchedCandles !== null,
            bestCoverage:
                solveResult.bestEval.totalRules > 0
                    ? solveResult.bestEval.satisfiedRules / solveResult.bestEval.totalRules
                    : 0,
            bestSatisfied: solveResult.bestEval.satisfiedRules,
            totalRules: solveResult.bestEval.totalRules,
            attempts: solveResult.attemptsUsed,
            mutationFalseRate,
            overlapsWith: overlaps.sort((a, b) => a.localeCompare(b)),
        });
    }

    return outcomes;
}
async function mapWithConcurrency<T, R>(
    items: T[],
    concurrency: number,
    task: (item: T) => Promise<R>,
): Promise<R[]> {
    if (items.length === 0) return [];
    const safeConcurrency = Math.max(1, Math.min(concurrency, items.length));
    const queue = items.slice();
    const results: R[] = [];

    const workers = Array.from({ length: safeConcurrency }, async () => {
        while (queue.length > 0) {
            const item = queue.shift();
            if (typeof item === 'undefined') continue;
            const res = await task(item);
            results.push(res);
        }
    });

    await Promise.all(workers);
    return results;
}

function buildInitialHistoricalStats(patterns: CompiledPattern[]): Map<string, HistoricalPatternStats> {
    const m = new Map<string, HistoricalPatternStats>();
    for (const pattern of patterns) {
        m.set(pattern.id, {
            events: 0,
            wins: 0,
            hitRate: null,
            avgNextReturn: null,
            symbolsHit: 0,
            oppositeOverlapEvents: 0,
        });
    }
    return m;
}

async function runHistoricalAudit(
    patternServiceAny: any,
    patterns: CompiledPattern[],
    cfg: AuditConfig,
): Promise<HistoricalRunResult> {
    const perPattern = buildInitialHistoricalStats(patterns);
    const pairCounts = new Map<string, number>();
    const symbolSetByPattern = new Map<string, Set<string>>();
    const returnSumByPattern = new Map<string, number>();
    const errors: string[] = [];

    for (const p of patterns) {
        symbolSetByPattern.set(p.id, new Set<string>());
        returnSumByPattern.set(p.id, 0);
    }

    const marketSnapshot = await binanceService.getMarketSnapshot(false);
    const symbols = marketSnapshot.slice(0, cfg.symbolLimit).map((item) => item.symbol);
    let candleWindowsScanned = 0;

    const symbolCandles = await mapWithConcurrency(symbols, cfg.fetchConcurrency, async (symbol) => {
        try {
            const raw = await binanceService.getCandlestickData(symbol, cfg.interval, cfg.klineLimit);
            const normalized = patternServiceAny.toNormalizedCandles(raw) as Candle[];
            const closed = patternServiceAny.toClosedCandles(normalized) as Candle[];
            return { symbol, candles: closed, error: null as string | null };
        } catch (error) {
            const message = `historical_fetch_error:${symbol}:${String((error as Error)?.message || error)}`;
            return { symbol, candles: [] as Candle[], error: message };
        }
    });

    for (const row of symbolCandles) {
        if (row.error) {
            errors.push(row.error);
            continue;
        }
        const candles = row.candles;
        if (!Array.isArray(candles) || candles.length < 40) continue;

        const warmupStart = Math.max(10, Number(patternServiceAny.params?.trend_lookback || 5) + 4);
        const lastIndex = candles.length - 2;
        if (lastIndex <= warmupStart) continue;

        for (let idx = warmupStart; idx <= lastIndex; idx += 1) {
            const sample = candles.slice(0, idx + 1);
            const nextCandle = candles[idx + 1];
            const currentCandle = candles[idx];
            if (!nextCandle || !currentCandle || currentCandle.close === 0) continue;

            const nextReturn = (nextCandle.close - currentCandle.close) / currentCandle.close;
            const matchedIds: string[] = [];
            const matchedPatterns: CompiledPattern[] = [];

            for (const pattern of patterns) {
                if (sample.length < pattern.candles) continue;
                const matched = patternServiceAny.matchesPattern(sample, pattern) as boolean;
                if (!matched) continue;

                matchedIds.push(pattern.id);
                matchedPatterns.push(pattern);
                const stat = perPattern.get(pattern.id);
                if (!stat) continue;

                stat.events += 1;
                returnSumByPattern.set(pattern.id, (returnSumByPattern.get(pattern.id) || 0) + nextReturn);
                symbolSetByPattern.get(pattern.id)?.add(row.symbol);

                if (pattern.category === 'Bullish' && nextReturn > 0) stat.wins += 1;
                if (pattern.category === 'Bearish' && nextReturn < 0) stat.wins += 1;
            }

            candleWindowsScanned += 1;
            if (matchedPatterns.length <= 1) continue;

            matchedIds.sort((a, b) => a.localeCompare(b));
            for (let i = 0; i < matchedPatterns.length; i += 1) {
                for (let j = i + 1; j < matchedPatterns.length; j += 1) {
                    const a = matchedPatterns[i];
                    const b = matchedPatterns[j];
                    const key = `${a.id}|${b.id}`;
                    pairCounts.set(key, (pairCounts.get(key) || 0) + 1);
                    if (a.category !== b.category) {
                        const statA = perPattern.get(a.id);
                        const statB = perPattern.get(b.id);
                        if (statA) statA.oppositeOverlapEvents += 1;
                        if (statB) statB.oppositeOverlapEvents += 1;
                    }
                }
            }
        }
    }

    for (const pattern of patterns) {
        const stat = perPattern.get(pattern.id);
        if (!stat) continue;
        stat.symbolsHit = symbolSetByPattern.get(pattern.id)?.size || 0;
        stat.avgNextReturn =
            stat.events > 0 ? (returnSumByPattern.get(pattern.id) || 0) / stat.events : null;
        if (pattern.category === 'Neutral') {
            stat.hitRate = null;
        } else {
            stat.hitRate = stat.events > 0 ? stat.wins / stat.events : null;
        }
    }

    const pairOverlap: PairOverlap[] = [];
    for (const [pair, count] of pairCounts.entries()) {
        const [aId, bId] = pair.split('|');
        const a = patterns.find((p) => p.id === aId);
        const b = patterns.find((p) => p.id === bId);
        if (!a || !b) continue;
        const aEvents = perPattern.get(aId)?.events || 0;
        const bEvents = perPattern.get(bId)?.events || 0;
        const denominator = Math.max(1, Math.min(aEvents, bEvents));
        pairOverlap.push({
            pair,
            count,
            ratio: count / denominator,
            categoryA: a.category,
            categoryB: b.category,
        });
    }
    pairOverlap.sort((x, y) => y.count - x.count || y.ratio - x.ratio);

    return {
        perPattern,
        pairOverlap,
        symbolCount: symbols.length,
        candleWindowsScanned,
        errors,
    };
}
function analyzeTrendContext(patterns: CompiledPattern[]): TrendAuditEntry[] {
    return patterns.map((pattern) => {
        const expectedTrend = pattern.id in EXPECTED_TREND ? EXPECTED_TREND[pattern.id] : null;
        const existingTrendRules = pattern.rules
            .map((rule) => canonicalTrendRule(rule))
            .filter((rule): rule is string => Boolean(rule));
        const uniqueExisting = Array.from(new Set(existingTrendRules));

        let trendStatus: TrendStatus = 'not_required';
        let proposal: string | null = null;

        if (!expectedTrend) {
            trendStatus = uniqueExisting.length > 0 ? 'mismatch' : 'not_required';
            if (uniqueExisting.length > 0) {
                proposal = 'Remove trend rule for neutral/ambiguous pattern';
            }
        } else if (uniqueExisting.length === 0) {
            trendStatus = 'missing';
            proposal = `Add rule "${expectedTrend}" as first rule`;
        } else if (uniqueExisting.includes(expectedTrend)) {
            trendStatus = 'ok';
        } else {
            trendStatus = 'mismatch';
            proposal = `Replace trend rule with "${expectedTrend}"`;
        }

        return {
            patternId: pattern.id,
            category: pattern.category,
            expectedTrend,
            existingTrendRules: uniqueExisting,
            trendStatus,
            proposal,
        };
    });
}

function computeRuleSignatureGroups(patterns: CompiledPattern[]): Array<{
    signature: string;
    patterns: string[];
}> {
    const groups = new Map<string, string[]>();

    for (const pattern of patterns) {
        const signature = pattern.rules
            .filter((rule) => !isTrendRule(rule))
            .map((rule) => normalizeRule(rule))
            .sort()
            .join(' && ');
        const list = groups.get(signature) || [];
        list.push(pattern.id);
        groups.set(signature, list);
    }

    return Array.from(groups.entries())
        .filter(([, ids]) => ids.length > 1)
        .map(([signature, ids]) => ({ signature, patterns: ids.sort((a, b) => a.localeCompare(b)) }))
        .sort((a, b) => b.patterns.length - a.patterns.length);
}

function computeConfidence(
    pattern: CompiledPattern,
    trendEntry: TrendAuditEntry,
    synthetic: SyntheticOutcome,
    historical: HistoricalPatternStats,
): { confidence: number; status: AuditStatus } {
    let score = 0;

    score += synthetic.foundMatch ? 35 : 0;
    score += clamp(synthetic.bestCoverage * 30, 0, 30);

    if (trendEntry.trendStatus === 'ok') score += 15;
    if (trendEntry.trendStatus === 'missing') score -= 8;
    if (trendEntry.trendStatus === 'mismatch') score -= 20;

    if (historical.events >= 30) score += 10;
    else if (historical.events >= 10) score += 6;
    else if (historical.events > 0) score += 2;

    if (pattern.category !== 'Neutral' && historical.hitRate !== null) {
        score += clamp((historical.hitRate - 0.5) * 50, -15, 15);
    }

    if (synthetic.mutationFalseRate !== null) {
        score += clamp(synthetic.mutationFalseRate * 10 - 2, -5, 8);
    }

    score -= clamp(historical.oppositeOverlapEvents * 1.2, 0, 22);

    const confidence = Math.round(clamp(score, 0, 100));
    const status: AuditStatus =
        synthetic.foundMatch &&
        confidence >= 60 &&
        trendEntry.trendStatus !== 'mismatch' &&
        !(pattern.category !== 'Neutral' && historical.events >= 20 && historical.hitRate !== null && historical.hitRate < 0.45)
            ? 'PASS'
            : 'FAIL';

    return { confidence, status };
}

function ensureDir(dirPath: string): void {
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
}

function buildProposedRulesFile(ruleFile: PatternRuleFile, trendAudit: TrendAuditEntry[]): PatternRuleFile {
    const trendByPattern = new Map<string, TrendAuditEntry>(trendAudit.map((item) => [item.patternId, item]));

    const nextPatterns = ruleFile.patterns.map((pattern) => {
        const audit = trendByPattern.get(pattern.pattern);
        if (!audit || !audit.expectedTrend) return { ...pattern, rules: pattern.rules.slice() };

        const nonTrendRules = pattern.rules.filter((rule) => !isTrendRule(rule));
        const nextRules = [audit.expectedTrend, ...nonTrendRules];
        return {
            ...pattern,
            rules: nextRules,
        };
    });

    return {
        ...ruleFile,
        meta: {
            ...(ruleFile.meta || {}),
            audit_generated_at: new Date().toISOString(),
            audit_note: 'Generated by scripts/pattern-formula-audit.ts. Review before applying.',
        },
        patterns: nextPatterns,
    };
}
function toMarkdown(
    config: AuditConfig,
    rows: PatternAuditRow[],
    trendAudit: TrendAuditEntry[],
    duplicateSignatures: Array<{ signature: string; patterns: string[] }>,
    pairOverlap: PairOverlap[],
    historical: HistoricalRunResult | null,
): string {
    const missingTrend = trendAudit.filter((x) => x.trendStatus === 'missing');
    const mismatchTrend = trendAudit.filter((x) => x.trendStatus === 'mismatch');
    const failRows = rows.filter((r) => r.status === 'FAIL');
    const passRows = rows.filter((r) => r.status === 'PASS');

    const topOverlapRows = pairOverlap.slice(0, 20);
    const rowLines = rows
        .slice()
        .sort((a, b) => a.status.localeCompare(b.status) || a.confidence - b.confidence)
        .map((row) => {
            const hitRate =
                row.historical.hitRate === null ? '-' : `${(row.historical.hitRate * 100).toFixed(1)}%`;
            const mutRate =
                row.synthetic.mutationFalseRate === null
                    ? '-'
                    : `${(row.synthetic.mutationFalseRate * 100).toFixed(1)}%`;
            return `| ${row.patternId} | ${row.category} | ${row.status} | ${row.confidence} | ${row.trendStatus} | ${row.synthetic.foundMatch ? 'yes' : 'no'} | ${row.synthetic.bestSatisfied}/${row.synthetic.totalRules} | ${mutRate} | ${row.historical.events} | ${hitRate} | ${row.historical.oppositeOverlapEvents} |`;
        });

    const trendProposalLines = trendAudit
        .filter((x) => x.proposal)
        .map((x) => `- \`${x.patternId}\`: ${x.proposal}`);

    const signatureLines =
        duplicateSignatures.length === 0
            ? ['- none']
            : duplicateSignatures.map((g) => `- ${g.patterns.map((p) => `\`${p}\``).join(', ')}`);

    const overlapLines =
        topOverlapRows.length === 0
            ? ['- none']
            : topOverlapRows.map((ov) => {
                  const ratio = `${(ov.ratio * 100).toFixed(1)}%`;
                  return `- \`${ov.pair}\`: count=${ov.count}, ratio=${ratio}, categories=${ov.categoryA}/${ov.categoryB}`;
              });

    const historicalNote = historical
        ? `- Universe: top ${historical.symbolCount} symbols by 24h quote volume\n- Interval: \`${config.interval}\`\n- Candle windows scanned: ${historical.candleWindowsScanned}\n- Fetch errors: ${historical.errors.length}`
        : '- Historical run skipped';

    return [
        '# Candlestick Formula Audit Report',
        '',
        `Generated at: ${new Date().toISOString()}`,
        '',
        '## Method',
        '- Synthetic validation: Monte-Carlo + mutation robustness per pattern.',
        '- Historical validation: walk-forward on closed candles only, no look-ahead in trigger logic.',
        '- Confidence model combines synthetic satisfiability, trend-context consistency, overlap penalty, and historical directional hit-rate.',
        '',
        '## Backtest Configuration',
        `- Interval: \`${config.interval}\``,
        `- Symbol limit: ${config.symbolLimit}`,
        `- Kline limit: ${config.klineLimit}`,
        `- Fetch concurrency: ${config.fetchConcurrency}`,
        historicalNote,
        '',
        '## Headline',
        `- PASS: ${passRows.length}`,
        `- FAIL: ${failRows.length}`,
        `- Missing trend context: ${missingTrend.length}`,
        `- Trend mismatches: ${mismatchTrend.length}`,
        '',
        '## Pattern Table',
        '| Pattern | Category | Status | Confidence | Trend | SyntheticMatch | RuleCoverage | MutationFalseRate | HistoricalEvents | HitRate | OppOverlap |',
        '| --- | --- | --- | ---: | --- | --- | --- | --- | ---: | ---: | ---: |',
        ...rowLines,
        '',
        '## Trend Fix Proposals',
        ...(trendProposalLines.length > 0 ? trendProposalLines : ['- none']),
        '',
        '## Duplicate Shape Groups (ignoring trend rule)',
        ...signatureLines,
        '',
        '## Top Overlap Pairs',
        ...overlapLines,
        '',
        '## Notes',
        '- Backtest statistics are validation evidence, not future performance guarantees.',
    ].join('\n');
}

function summarizeToStdout(rows: PatternAuditRow[], trendAudit: TrendAuditEntry[]): void {
    const pass = rows.filter((r) => r.status === 'PASS').length;
    const fail = rows.length - pass;
    const missingTrend = trendAudit.filter((x) => x.trendStatus === 'missing').length;
    const mismatchTrend = trendAudit.filter((x) => x.trendStatus === 'mismatch').length;
    console.log(`patterns=${rows.length} pass=${pass} fail=${fail} missingTrend=${missingTrend} mismatchTrend=${mismatchTrend}`);

    const worst = rows
        .slice()
        .sort((a, b) => a.confidence - b.confidence)
        .slice(0, 10);
    console.log('lowest_confidence_patterns:');
    for (const row of worst) {
        console.log(
            `  - ${row.patternId} (${row.category}) status=${row.status} confidence=${row.confidence} trend=${row.trendStatus} events=${row.historical.events}`,
        );
    }
}
async function main() {
    const defaults: AuditConfig = {
        interval: '1d',
        symbolLimit: 80,
        klineLimit: 260,
        fetchConcurrency: 6,
        syntheticMaxAttempts: 30000,
        syntheticGapMaxAttempts: 80000,
        outDir: path.resolve(process.cwd(), 'artifacts', 'pattern-formula-audit'),
        historicalEnabled: true,
    };
    const config: AuditConfig = {
        ...defaults,
        ...parseArgs(process.argv.slice(2)),
    };
    ensureDir(config.outDir);

    const rulesPath = path.resolve(
        process.cwd(),
        'data',
        'patterns',
        'infinityalgo_candlestick_patterns_rules_vi.json',
    );
    const rulesRaw = fs.readFileSync(rulesPath, 'utf8');
    const rulesJson = JSON.parse(rulesRaw) as PatternRuleFile;

    const patternServiceAny = patternService as any;
    const patterns = Array.from(patternServiceAny.patternsById.values()) as CompiledPattern[];
    patterns.sort((a, b) => a.id.localeCompare(b.id));

    const missingExpectation = patterns
        .map((p) => p.id)
        .filter((patternId) => !(patternId in EXPECTED_TREND));
    if (missingExpectation.length > 0) {
        throw new Error(`Expected trend taxonomy missing entries: ${missingExpectation.join(', ')}`);
    }

    const trendLookback = Number(patternServiceAny.params?.trend_lookback || 5);
    const trendAudit = analyzeTrendContext(patterns);
    const syntheticMap = computeSyntheticOutcomes(patternServiceAny, patterns, trendLookback, config);
    const duplicateSignatures = computeRuleSignatureGroups(patterns);

    let historicalResult: HistoricalRunResult | null = null;
    if (config.historicalEnabled) {
        historicalResult = await runHistoricalAudit(patternServiceAny, patterns, config);
    }

    const rows: PatternAuditRow[] = patterns.map((pattern) => {
        const trendEntry = trendAudit.find((entry) => entry.patternId === pattern.id);
        if (!trendEntry) {
            throw new Error(`trendEntry not found for ${pattern.id}`);
        }
        const synthetic = syntheticMap.get(pattern.id);
        if (!synthetic) {
            throw new Error(`synthetic result not found for ${pattern.id}`);
        }

        const historical = historicalResult?.perPattern.get(pattern.id) || {
            events: 0,
            wins: 0,
            hitRate: null,
            avgNextReturn: null,
            symbolsHit: 0,
            oppositeOverlapEvents: 0,
        };

        const scored = computeConfidence(pattern, trendEntry, synthetic, historical);
        return {
            patternId: pattern.id,
            category: pattern.category,
            trendStatus: trendEntry.trendStatus,
            synthetic,
            historical,
            confidence: scored.confidence,
            status: scored.status,
        };
    });

    const proposedRules = buildProposedRulesFile(rulesJson, trendAudit);
    const pairOverlap = historicalResult?.pairOverlap || [];

    const reportJsonPath = path.join(config.outDir, 'pattern_audit_report.json');
    const reportMdPath = path.join(config.outDir, 'pattern_audit_report.md');
    const proposedRulesPath = path.join(config.outDir, 'infinityalgo_candlestick_patterns_rules_vi.proposed.json');

    const reportPayload = {
        generatedAt: new Date().toISOString(),
        config,
        summary: {
            totalPatterns: rows.length,
            pass: rows.filter((r) => r.status === 'PASS').length,
            fail: rows.filter((r) => r.status === 'FAIL').length,
            missingTrend: trendAudit.filter((x) => x.trendStatus === 'missing').length,
            mismatchTrend: trendAudit.filter((x) => x.trendStatus === 'mismatch').length,
        },
        rows,
        trendAudit,
        duplicateSignatures,
        pairOverlap: pairOverlap.slice(0, 100),
        historical: historicalResult
            ? {
                  symbolCount: historicalResult.symbolCount,
                  candleWindowsScanned: historicalResult.candleWindowsScanned,
                  fetchErrorCount: historicalResult.errors.length,
                  fetchErrors: historicalResult.errors.slice(0, 80),
              }
            : null,
    };

    fs.writeFileSync(reportJsonPath, JSON.stringify(reportPayload, null, 2));
    fs.writeFileSync(
        reportMdPath,
        toMarkdown(config, rows, trendAudit, duplicateSignatures, pairOverlap, historicalResult),
    );
    fs.writeFileSync(proposedRulesPath, JSON.stringify(proposedRules, null, 2));

    summarizeToStdout(rows, trendAudit);
    console.log(`report_json=${reportJsonPath}`);
    console.log(`report_md=${reportMdPath}`);
    console.log(`proposed_rules=${proposedRulesPath}`);
}

main().catch((error) => {
    console.error('pattern_formula_audit_failed');
    console.error(error);
    process.exit(1);
});
