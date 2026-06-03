import { Request, Response, NextFunction } from 'express';
import binanceService from '../services/binanceService.js';
import patternService from '../services/patternService.js';
import patternTelemetryService, { type PatternSignalCategory } from '../services/patternTelemetryService.js';
import logger from '../utils/logger.js';

export class CoinController {
    /**
     * GET /api/coins
     * Fetch all USDT perpetual contracts
     */
    async getCoins(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] GET /api/coins - Request from ${req.ip}`);
            
            const coins = await binanceService.getExchangeInfo();
            
            logger.info(`[API] GET /api/coins - Returning ${coins.length} coins`);
            res.json(coins);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/coins - Error', { error });
            next(error);
        }
    }

    /**
     * GET /api/market-snapshot
     * Fetch 24h snapshot metrics for USDT perpetual contracts.
     */
    async getMarketSnapshot(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] GET /api/market-snapshot - Request from ${req.ip}`);

            const snapshot = await binanceService.getMarketSnapshot();

            logger.info(`[API] GET /api/market-snapshot - Returning ${snapshot.length} rows`);
            res.json(snapshot);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/market-snapshot - Error', { error });
            next(error);
        }
    }

    /**
     * GET /api/funding-snapshot
     * Fetch funding metrics for USDT perpetual contracts.
     */
    async getFundingSnapshot(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] GET /api/funding-snapshot - Request from ${req.ip}`);

            const snapshot = await binanceService.getFundingSnapshot();

            logger.info(`[API] GET /api/funding-snapshot - Returning ${snapshot.length} rows`);
            res.json(snapshot);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/funding-snapshot - Error', { error });
            next(error);
        }
    }

    /**
     * GET /api/oi-snapshot?symbols=BTCUSDT,ETHUSDT
     * Fetch open interest metrics for requested USDT perpetual contracts.
     */
    async getOiSnapshot(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] GET /api/oi-snapshot - Request from ${req.ip}`);

            const rawSymbols = String(req.query.symbols || '').trim();
            const symbols = rawSymbols
                ? rawSymbols
                      .split(',')
                      .map((symbol) => symbol.trim().toUpperCase())
                      .filter(Boolean)
                : [];

            const snapshot = await binanceService.getOiSnapshot(symbols);

            logger.info(`[API] GET /api/oi-snapshot - Returning ${snapshot.length} rows`);
            res.json(snapshot);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/oi-snapshot - Error', { error });
            next(error);
        }
    }

    /**
     * GET /api/patterns
     * Fetch candlestick pattern catalog.
     */
    async getPatternCatalog(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] GET /api/patterns - Request from ${req.ip}`);

            const patterns = patternService.getPatternCatalog();

            logger.info(`[API] GET /api/patterns - Returning ${patterns.length} patterns`);
            res.json(patterns);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/patterns - Error', { error });
            next(error);
        }
    }

    /**
     * GET /api/klines
     * Fetch candlestick data for a symbol
     */
    async getKlines(req: Request, res: Response, next: NextFunction) {
        try {
            const { symbol, interval, limit } = req.query;
            
            logger.info(`[API] GET /api/klines - Request from ${req.ip}`, {
                symbol,
                interval,
                limit
            });

            // Validate parameters
            if (!symbol || !interval) {
                logger.warn('[API] GET /api/klines - Missing required parameters');
                return res.status(400).json({ 
                    error: 'Missing required parameters: symbol, interval' 
                });
            }

            const candles = await binanceService.getCandlestickData(
                symbol as string,
                interval as string,
                limit ? parseInt(limit as string) : 100
            );

            logger.info(`[API] GET /api/klines - Returning ${candles.length} candles for ${symbol}`);
            res.json(candles);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] GET /api/klines - Error', { error });
            next(error);
        }
    }

    /**
     * POST /api/pattern-scan
     * Scan symbols for a selected candlestick pattern on latest closed candle.
     */
    async scanPattern(req: Request, res: Response, next: NextFunction) {
        try {
            logger.info(`[API] POST /api/pattern-scan - Request from ${req.ip}`);

            const patternId = String(req.body?.patternId || '').trim();
            const interval = String(req.body?.interval || '').trim();
            const symbols = Array.isArray(req.body?.symbols)
                ? req.body.symbols
                      .map((symbol: unknown) => String(symbol || '').trim().toUpperCase())
                      .filter(Boolean)
                : [];
            const forceRefresh = Boolean(req.body?.forceRefresh);

            if (!patternId || !interval) {
                return res.status(400).json({
                    error: 'Missing required fields: patternId, interval',
                });
            }

            const result = await patternService.scanPattern({
                patternId,
                interval,
                symbols,
                forceRefresh,
            });

            logger.info('[API] POST /api/pattern-scan - Completed', {
                patternId,
                interval,
                scannedCount: result.scannedCount,
                matchedCount: result.matchedSymbols.length,
            });

            try {
                const patternMeta = patternService
                    .getPatternCatalog()
                    .find((pattern) => pattern.id === result.patternId);
                const patternCategory = (patternMeta?.category || 'Neutral') as PatternSignalCategory;
                const clientIdRaw = String(req.body?.clientId || '').trim();
                const userAgent = String(req.get('user-agent') || '').trim();
                const clientKey = clientIdRaw || `${req.ip || 'unknown'}|${userAgent}`;

                const telemetry = patternTelemetryService.recordPatternScan({
                    patternId: result.patternId,
                    patternCategory,
                    interval: result.interval,
                    ruleVersion: patternService.getRuleVersion(),
                    matchedDetails: result.matchedDetails,
                    scanGeneratedAt: result.generatedAt,
                    scannedCount: result.scannedCount,
                    matchedCount: result.matchedSymbols.length,
                    forceRefresh,
                    clientKey,
                });

                logger.info('[API] POST /api/pattern-scan - Telemetry captured', {
                    patternId: result.patternId,
                    interval: result.interval,
                    written: telemetry.written,
                    skipped: telemetry.skipped,
                });
            } catch (telemetryError) {
                logger.warn('[API] POST /api/pattern-scan - Telemetry capture failed', {
                    error: telemetryError,
                    patternId: result.patternId,
                    interval: result.interval,
                });
            }

            res.json(result);
        } catch (error) {
            const statusCode = (error as any)?.statusCode;
            if (typeof statusCode === 'number') {
                res.status(statusCode);
            }

            logger.error('[API] POST /api/pattern-scan - Error', { error });
            next(error);
        }
    }
}

export default new CoinController();
