import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import binanceService from './binanceService.js';
import logger from '../utils/logger.js';

type PatternCategory = 'Bullish' | 'Bearish' | 'Neutral';
type PatternCategoryFolder = 'bullish' | 'bearish' | 'neutral';
type PatternParams = Record<string, number>;
type SeriesKey = 'O' | 'H' | 'L' | 'C' | 'R' | 'B' | 'U' | 'D';
type CompiledRule = (ctx: EvalContext) => boolean;

type PatternRuleItem = {
    pattern: string;
    category: PatternCategory;
    candles: number;
    rules: string[];
    notes?: string;
};

type PatternRuleFile = {
    meta?: {
        source?: string;
        generated_at?: string;
        language?: string;
        assumptions?: string[];
    };
    params: PatternParams;
    patterns: PatternRuleItem[];
};

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
    notes?: string;
    iconPath: string;
    compiledRules: CompiledRule[];
};

type EvalContext = {
    params: PatternParams;
    val: (series: SeriesKey, offset: number) => number;
    range: (series: SeriesKey, start: number, end: number) => number[];
    bullish: (offset: number) => boolean;
    bearish: (offset: number) => boolean;
    doji: (offset: number) => boolean;
    smallBody: (offset: number) => boolean;
    longBody: (offset: number) => boolean;
    gapUp: (i: number, j: number) => boolean;
    gapDown: (i: number, j: number) => boolean;
    midBody: (offset: number) => number;
    downtrend: (offset: number) => boolean;
    uptrend: (offset: number) => boolean;
    marubozuBullish: (offset: number) => boolean;
    marubozuBearish: (offset: number) => boolean;
    median: (values: number[]) => number;
    min: (...values: number[]) => number;
    max: (...values: number[]) => number;
    abs: (value: number) => number;
};

export type PatternCatalogItem = {
    id: string;
    displayName: string;
    category: PatternCategory;
    candles: number;
    iconPath: string;
};

export type PatternScanRequest = {
    symbols: string[];
    interval: string;
    patternId: string;
    forceRefresh?: boolean;
};

export type PatternScanResult = {
    patternId: string;
    interval: string;
    scannedCount: number;
    matchedSymbols: string[];
    matchedDetails: PatternMatchedDetail[];
    generatedAt: number;
};

export type PatternMatchedDetail = {
    symbol: string;
    signalOpenTime: number;
    signalCloseTime: number;
    signalClosePrice: number;
};

class PatternServiceError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'PatternServiceError';
        this.statusCode = statusCode;
    }
}

class PatternService {
    private readonly SCAN_CACHE_TTL_MS = 30 * 1000;
    private readonly SCAN_CONCURRENCY = 6;
    private readonly RULES_FILE_NAME = 'infinityalgo_candlestick_patterns_rules_vi.json';

    private params: PatternParams = {};
    private patternsById = new Map<string, CompiledPattern>();
    private scanCache = new Map<string, { expiresAt: number; data: PatternScanResult }>();
    private ruleVersion = 'unknown';

    constructor() {
        this.loadRulesFromFile();
    }

    getPatternCatalog(): PatternCatalogItem[] {
        return Array.from(this.patternsById.values())
            .sort((a, b) => {
                if (a.category !== b.category) return a.category.localeCompare(b.category);
                return a.displayName.localeCompare(b.displayName);
            })
            .map((pattern) => ({
                id: pattern.id,
                displayName: pattern.displayName,
                category: pattern.category,
                candles: pattern.candles,
                iconPath: pattern.iconPath,
            }));
    }

    getRuleVersion(): string {
        return this.ruleVersion;
    }

    async scanPattern({
        symbols,
        interval,
        patternId,
        forceRefresh = false,
    }: PatternScanRequest): Promise<PatternScanResult> {
        const normalizedPatternId = String(patternId || '').trim();
        const pattern = this.patternsById.get(normalizedPatternId);
        if (!pattern) {
            throw new PatternServiceError(`Unknown pattern: ${patternId}`, 400);
        }

        const normalizedSymbols = Array.from(
            new Set(
                (Array.isArray(symbols) ? symbols : [])
                    .map((symbol) => String(symbol || '').trim().toUpperCase())
                    .filter(Boolean),
            ),
        );

        if (normalizedSymbols.length === 0) {
            return {
                patternId: pattern.id,
                interval: String(interval || ''),
                scannedCount: 0,
                matchedSymbols: [],
                matchedDetails: [],
                generatedAt: Date.now(),
            };
        }

        const cacheKey = this.buildScanCacheKey(pattern.id, interval, normalizedSymbols);
        const now = Date.now();
        const cached = this.scanCache.get(cacheKey);
        if (!forceRefresh && cached && cached.expiresAt > now) {
            return cached.data;
        }

        const limit = this.getScanKlineLimit(pattern);
        const checkedSymbols = normalizedSymbols.slice();
        const matchedSymbols: string[] = [];
        const matchedDetails: PatternMatchedDetail[] = [];

        await this.mapWithConcurrency(checkedSymbols, this.SCAN_CONCURRENCY, async (symbol) => {
            try {
                const rawCandles = await binanceService.getCandlestickData(symbol, interval, limit);
                const candles = this.toNormalizedCandles(rawCandles);
                const closedCandles = this.toClosedCandles(candles);
                if (closedCandles.length === 0) return;

                if (this.matchesPattern(closedCandles, pattern)) {
                    matchedSymbols.push(symbol);
                    const signalCandle = closedCandles[closedCandles.length - 1];
                    if (signalCandle) {
                        matchedDetails.push({
                            symbol,
                            signalOpenTime: signalCandle.openTime,
                            signalCloseTime: signalCandle.closeTime,
                            signalClosePrice: signalCandle.close,
                        });
                    }
                }
            } catch (error) {
                logger.warn(`Pattern scan failed for ${symbol}`, { error, patternId: pattern.id, interval });
            }
        });

        matchedSymbols.sort((a, b) => a.localeCompare(b));
        matchedDetails.sort((a, b) => a.symbol.localeCompare(b.symbol));

        const result: PatternScanResult = {
            patternId: pattern.id,
            interval: String(interval || ''),
            scannedCount: checkedSymbols.length,
            matchedSymbols,
            matchedDetails,
            generatedAt: Date.now(),
        };

        this.scanCache.set(cacheKey, {
            expiresAt: Date.now() + this.SCAN_CACHE_TTL_MS,
            data: result,
        });

        return result;
    }

    private loadRulesFromFile() {
        const rulesFilePath = this.getRulesFileCandidates().find((candidate) => fs.existsSync(candidate));
        if (!rulesFilePath) {
            throw new PatternServiceError('Pattern rules file not found', 500);
        }

        const raw = fs.readFileSync(rulesFilePath, 'utf8');
        const parsed = JSON.parse(raw) as PatternRuleFile;

        if (!parsed || !Array.isArray(parsed.patterns) || !parsed.params) {
            throw new PatternServiceError('Invalid pattern rules file format', 500);
        }

        this.params = parsed.params;
        this.ruleVersion = crypto.createHash('sha1').update(raw).digest('hex').slice(0, 12);
        this.patternsById.clear();

        for (const item of parsed.patterns) {
            if (!item?.pattern || !Array.isArray(item.rules) || !item.category) continue;

            const id = String(item.pattern).trim();
            const category = this.normalizeCategory(item.category);
            const candles = Number(item.candles) || 1;
            const iconPath = `/assets/icon/${this.categoryToFolder(category)}/${id}.png`;
            const compiledRules = item.rules.map((rule) => this.compileRuleExpression(rule));

            this.patternsById.set(id, {
                id,
                displayName: this.patternIdToDisplayName(id),
                category,
                candles,
                rules: item.rules.slice(),
                notes: item.notes,
                iconPath,
                compiledRules,
            });
        }

        logger.info(`Pattern rules loaded: ${this.patternsById.size} patterns`, {
            rulesFilePath,
        });
    }

    private getRulesFileCandidates(): string[] {
        const cwd = process.cwd();
        const executableDir = path.dirname(process.execPath);

        return [
            path.resolve(cwd, 'data', 'patterns', this.RULES_FILE_NAME),
            path.resolve(cwd, this.RULES_FILE_NAME),
            path.resolve(executableDir, 'data', 'patterns', this.RULES_FILE_NAME),
            path.resolve(executableDir, this.RULES_FILE_NAME),
            path.resolve(executableDir, 'dist', 'data', 'patterns', this.RULES_FILE_NAME),
        ];
    }

    private normalizeCategory(rawCategory: string): PatternCategory {
        const category = String(rawCategory || '').trim().toLowerCase();
        if (category === 'bullish') return 'Bullish';
        if (category === 'bearish') return 'Bearish';
        return 'Neutral';
    }

    private categoryToFolder(category: PatternCategory): PatternCategoryFolder {
        if (category === 'Bullish') return 'bullish';
        if (category === 'Bearish') return 'bearish';
        return 'neutral';
    }

    private patternIdToDisplayName(patternId: string): string {
        return patternId
            .split('-')
            .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
            .join(' ');
    }

    private compileRuleExpression(rule: string): CompiledRule {
        const expression = this.toExecutableExpression(rule);
        const compiled = new Function('ctx', `return Boolean(${expression});`) as (ctx: EvalContext) => boolean;

        return (ctx: EvalContext) => {
            try {
                return Boolean(compiled(ctx));
            } catch {
                return false;
            }
        };
    }

    private toExecutableExpression(rule: string): string {
        let expression = String(rule || '').trim();

        expression = expression.replace(
            /([RBUDOHLC])\[\s*(-?\d+)\s*:\s*(-?\d+)\s*\]/g,
            (_match, series, start, end) => `ctx.range("${series}", ${start}, ${end})`,
        );

        expression = expression.replace(
            /([RBUDOHLC])\[\s*(-?\d+)\s*\]/g,
            (_match, series, index) => `ctx.val("${series}", ${index})`,
        );

        const functionMap: Record<string, string> = {
            'marubozu-bullish': 'ctx.marubozuBullish',
            'marubozu-bearish': 'ctx.marubozuBearish',
            bullish: 'ctx.bullish',
            bearish: 'ctx.bearish',
            doji: 'ctx.doji',
            small_body: 'ctx.smallBody',
            long_body: 'ctx.longBody',
            gap_up: 'ctx.gapUp',
            gap_down: 'ctx.gapDown',
            mid_body: 'ctx.midBody',
            downtrend: 'ctx.downtrend',
            uptrend: 'ctx.uptrend',
            median: 'ctx.median',
            min: 'ctx.min',
            max: 'ctx.max',
            abs: 'ctx.abs',
        };

        for (const [source, target] of Object.entries(functionMap)) {
            const escaped = source.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
            expression = expression.replace(new RegExp(`\\b${escaped}\\s*\\(`, 'g'), `${target}(`);
        }

        for (const paramKey of Object.keys(this.params)) {
            expression = expression.replace(
                new RegExp(`\\b${paramKey}\\b`, 'g'),
                `ctx.params.${paramKey}`,
            );
        }

        return expression;
    }

    private toNormalizedCandles(rawCandles: unknown): Candle[] {
        if (!Array.isArray(rawCandles)) return [];

        const candles: Candle[] = [];
        for (const row of rawCandles) {
            if (!Array.isArray(row) || row.length < 7) continue;

            const openTime = Number(row[0]);
            const open = Number(row[1]);
            const high = Number(row[2]);
            const low = Number(row[3]);
            const close = Number(row[4]);
            const closeTime = Number(row[6]);

            if (
                !Number.isFinite(openTime) ||
                !Number.isFinite(open) ||
                !Number.isFinite(high) ||
                !Number.isFinite(low) ||
                !Number.isFinite(close)
            ) {
                continue;
            }

            candles.push({
                openTime,
                closeTime: Number.isFinite(closeTime) ? closeTime : openTime,
                open,
                high,
                low,
                close,
            });
        }

        candles.sort((a, b) => a.openTime - b.openTime);
        return candles;
    }

    private toClosedCandles(candles: Candle[]): Candle[] {
        if (candles.length === 0) return [];
        const now = Date.now();

        const closed = candles.filter((candle) => {
            if (!Number.isFinite(candle.closeTime)) return true;
            return candle.closeTime <= now;
        });

        return closed.length > 0 ? closed : candles.slice(0, -1);
    }

    private matchesPattern(candles: Candle[], pattern: CompiledPattern): boolean {
        if (!Array.isArray(candles) || candles.length === 0) return false;
        if (candles.length < pattern.candles) return false;

        const ctx = this.createEvalContext(candles);
        return pattern.compiledRules.every((rule) => rule(ctx));
    }

    private createEvalContext(candles: Candle[]): EvalContext {
        const currentIndex = candles.length - 1;
        const trendLookback = Number(this.params.trend_lookback || 5);

        const getCandle = (offset: number): Candle | null => {
            const index = currentIndex + offset;
            if (!Number.isFinite(index) || index < 0 || index >= candles.length) return null;
            return candles[index];
        };

        const ctx: EvalContext = {
            params: this.params,
            val: (series: SeriesKey, offset: number): number => {
                const candle = getCandle(offset);
                if (!candle) return Number.NaN;

                switch (series) {
                    case 'O':
                        return candle.open;
                    case 'H':
                        return candle.high;
                    case 'L':
                        return candle.low;
                    case 'C':
                        return candle.close;
                    case 'R':
                        return candle.high - candle.low;
                    case 'B':
                        return Math.abs(candle.close - candle.open);
                    case 'U':
                        return candle.high - Math.max(candle.open, candle.close);
                    case 'D':
                        return Math.min(candle.open, candle.close) - candle.low;
                    default:
                        return Number.NaN;
                }
            },
            range: (series: SeriesKey, start: number, end: number): number[] => {
                if (!Number.isFinite(start) || !Number.isFinite(end) || start === end) return [];
                const values: number[] = [];
                const step = start < end ? 1 : -1;

                for (let offset = start; step > 0 ? offset < end : offset > end; offset += step) {
                    const value = ctx.val(series, offset);
                    if (Number.isFinite(value)) values.push(value);
                }

                return values;
            },
            bullish: (offset: number) => {
                const close = ctx.val('C', offset);
                const open = ctx.val('O', offset);
                return Number.isFinite(close) && Number.isFinite(open) && close > open;
            },
            bearish: (offset: number) => {
                const close = ctx.val('C', offset);
                const open = ctx.val('O', offset);
                return Number.isFinite(close) && Number.isFinite(open) && close < open;
            },
            doji: (offset: number) => {
                const body = ctx.val('B', offset);
                const range = ctx.val('R', offset);
                const epsilon = Number(ctx.params.epsilon || 0);
                return Number.isFinite(body) && Number.isFinite(range) && range > 0 && body <= epsilon * range;
            },
            smallBody: (offset: number) => {
                const body = ctx.val('B', offset);
                const range = ctx.val('R', offset);
                const alpha = Number(ctx.params.alpha || 0);
                return Number.isFinite(body) && Number.isFinite(range) && range > 0 && body <= alpha * range;
            },
            longBody: (offset: number) => {
                const body = ctx.val('B', offset);
                const range = ctx.val('R', offset);
                const beta = Number(ctx.params.beta || 0);
                return Number.isFinite(body) && Number.isFinite(range) && range > 0 && body >= beta * range;
            },
            gapUp: (i: number, j: number) => {
                const lowI = ctx.val('L', i);
                const highJ = ctx.val('H', j);
                return Number.isFinite(lowI) && Number.isFinite(highJ) && lowI > highJ;
            },
            gapDown: (i: number, j: number) => {
                const highI = ctx.val('H', i);
                const lowJ = ctx.val('L', j);
                return Number.isFinite(highI) && Number.isFinite(lowJ) && highI < lowJ;
            },
            midBody: (offset: number) => {
                const open = ctx.val('O', offset);
                const close = ctx.val('C', offset);
                if (!Number.isFinite(open) || !Number.isFinite(close)) return Number.NaN;
                return (open + close) / 2;
            },
            downtrend: (offset: number) => {
                const previousClose = ctx.val('C', offset - 1);
                const lookbackClose = ctx.val('C', offset - trendLookback);
                return (
                    Number.isFinite(previousClose) &&
                    Number.isFinite(lookbackClose) &&
                    previousClose < lookbackClose
                );
            },
            uptrend: (offset: number) => {
                const previousClose = ctx.val('C', offset - 1);
                const lookbackClose = ctx.val('C', offset - trendLookback);
                return (
                    Number.isFinite(previousClose) &&
                    Number.isFinite(lookbackClose) &&
                    previousClose > lookbackClose
                );
            },
            marubozuBullish: (offset: number) => {
                const eta = Number(ctx.params.eta || 0);
                const upper = ctx.val('U', offset);
                const lower = ctx.val('D', offset);
                const range = ctx.val('R', offset);
                return (
                    ctx.bullish(offset) &&
                    ctx.longBody(offset) &&
                    Number.isFinite(range) &&
                    Number.isFinite(upper) &&
                    Number.isFinite(lower) &&
                    upper <= eta * range &&
                    lower <= eta * range
                );
            },
            marubozuBearish: (offset: number) => {
                const eta = Number(ctx.params.eta || 0);
                const upper = ctx.val('U', offset);
                const lower = ctx.val('D', offset);
                const range = ctx.val('R', offset);
                return (
                    ctx.bearish(offset) &&
                    ctx.longBody(offset) &&
                    Number.isFinite(range) &&
                    Number.isFinite(upper) &&
                    Number.isFinite(lower) &&
                    upper <= eta * range &&
                    lower <= eta * range
                );
            },
            median: (values: number[]) => {
                const finite = (Array.isArray(values) ? values : [])
                    .map((value) => Number(value))
                    .filter((value) => Number.isFinite(value))
                    .sort((a, b) => a - b);
                if (finite.length === 0) return Number.NaN;
                const middle = Math.floor(finite.length / 2);
                return finite.length % 2 === 0
                    ? (finite[middle - 1] + finite[middle]) / 2
                    : finite[middle];
            },
            min: (...values: number[]) => {
                const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
                return finite.length > 0 ? Math.min(...finite) : Number.NaN;
            },
            max: (...values: number[]) => {
                const finite = values.map((value) => Number(value)).filter((value) => Number.isFinite(value));
                return finite.length > 0 ? Math.max(...finite) : Number.NaN;
            },
            abs: (value: number) => Math.abs(Number(value)),
        };

        return ctx;
    }

    private getScanKlineLimit(pattern: CompiledPattern): number {
        const trendLookback = Math.max(5, Number(this.params.trend_lookback || 5));
        const base = Math.max(40, pattern.candles + trendLookback + 16);
        return Math.min(200, base);
    }

    private buildScanCacheKey(patternId: string, interval: string, symbols: string[]): string {
        const normalizedSymbols = symbols
            .map((symbol) => String(symbol || '').trim().toUpperCase())
            .filter(Boolean)
            .sort();
        const digest = crypto
            .createHash('sha1')
            .update(normalizedSymbols.join(','))
            .digest('hex');
        return `${patternId}|${interval}|${normalizedSymbols.length}|${digest}`;
    }

    private async mapWithConcurrency<T>(
        items: T[],
        concurrency: number,
        task: (item: T) => Promise<void>,
    ): Promise<void> {
        if (items.length === 0) return;
        let cursor = 0;

        const workers = Array.from(
            { length: Math.min(Math.max(concurrency, 1), items.length) },
            async () => {
                while (cursor < items.length) {
                    const currentIndex = cursor;
                    cursor += 1;
                    const item = items[currentIndex];
                    await task(item);
                }
            },
        );

        await Promise.all(workers);
    }
}

export { PatternServiceError };
export default new PatternService();
