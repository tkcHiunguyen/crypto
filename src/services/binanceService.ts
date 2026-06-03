import Binance from 'binance-api-node';
import axios from 'axios';
import logger from '../utils/logger.js';

// Initialize Binance client
const client = Binance.default();

type UsdtPerpetualContract = {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
};

type MarketSnapshotItem = {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: 'PERPETUAL';
    volume24h: number;
    quoteVolume24h: number;
    lastPrice: number;
    priceChangePercent24h: number;
    openTime: number;
    closeTime: number;
};

type FundingSnapshotItem = {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: 'PERPETUAL';
    fundingRate: number;
    markPrice: number;
    nextFundingTime: number;
    time: number;
};

type OiSnapshotItem = {
    symbol: string;
    baseAsset: string;
    quoteAsset: string;
    contractType: 'PERPETUAL';
    openInterest: number;
    markPrice: number;
    openInterestNotional: number;
    time: number;
};

class ServiceError extends Error {
    statusCode: number;

    constructor(message: string, statusCode: number) {
        super(message);
        this.name = 'ServiceError';
        this.statusCode = statusCode;
    }
}

export class BinanceService {
    private readonly CONTRACTS_CACHE_TTL_MS = 10 * 60 * 1000;
    private readonly MARKET_SNAPSHOT_CACHE_TTL_MS = 30 * 1000;
    private readonly FUNDING_SNAPSHOT_CACHE_TTL_MS = 30 * 1000;
    private readonly OI_SNAPSHOT_CACHE_TTL_MS = 30 * 1000;
    private readonly OI_FETCH_CONCURRENCY = 8;
    private contractsCache: { expiresAt: number; data: UsdtPerpetualContract[] } | null = null;
    private marketSnapshotCache: { expiresAt: number; data: MarketSnapshotItem[] } | null = null;
    private fundingSnapshotCache: { expiresAt: number; data: FundingSnapshotItem[] } | null = null;
    private oiSnapshotCacheBySymbol = new Map<string, { expiresAt: number; data: OiSnapshotItem }>();

    private async fetchUsdtPerpetualContracts(forceRefresh: boolean = false): Promise<UsdtPerpetualContract[]> {
        const now = Date.now();
        if (!forceRefresh && this.contractsCache && this.contractsCache.expiresAt > now) {
            return this.contractsCache.data;
        }

        logger.info('Fetching exchange info from Binance Futures');

        const exchangeInfo = await client.futuresExchangeInfo();
        const symbols = exchangeInfo.symbols
            // Keep only active perpetual USDT contracts to avoid stale/delisted symbols.
            .filter((s: any) =>
                s.contractType === 'PERPETUAL' &&
                s.quoteAsset === 'USDT' &&
                s.status === 'TRADING'
            )
            .map((s: any) => ({
                symbol: String(s.symbol),
                baseAsset: String(s.baseAsset),
                quoteAsset: String(s.quoteAsset),
            }));

        this.contractsCache = {
            expiresAt: now + this.CONTRACTS_CACHE_TTL_MS,
            data: symbols,
        };

        return symbols;
    }

    /**
     * Fetch all USDT perpetual contracts from Binance
     */
    async getExchangeInfo() {
        try {
            const symbols = await this.fetchUsdtPerpetualContracts();
            
            logger.info(`Successfully fetched ${symbols.length} USDT perpetual contracts`);
            return symbols;
        } catch (error) {
            logger.error('Error fetching exchange info from Binance', { error });
            throw new ServiceError('Failed to fetch coin list from Binance', 502);
        }
    }

    /**
     * Fetch 24h market snapshot for USDT perpetual contracts.
     * Uses a short cache to avoid excessive repeated calls.
     */
    async getMarketSnapshot(forceRefresh: boolean = false): Promise<MarketSnapshotItem[]> {
        try {
            const now = Date.now();
            if (!forceRefresh && this.marketSnapshotCache && this.marketSnapshotCache.expiresAt > now) {
                return this.marketSnapshotCache.data;
            }

            logger.info('Fetching market snapshot (24h stats) from Binance Futures');

            const [contracts, dailyStats] = await Promise.all([
                this.fetchUsdtPerpetualContracts(forceRefresh),
                client.futuresDailyStats(),
            ]);

            const contractBySymbol = new Map<string, UsdtPerpetualContract>(
                contracts.map((contract) => [contract.symbol, contract]),
            );

            const snapshot: MarketSnapshotItem[] = dailyStats
                .map((item: any) => {
                    const symbol = String(item.symbol);
                    const contract = contractBySymbol.get(symbol);
                    if (!contract) return null;

                    const volume24h = Number(item.volume);
                    const quoteVolume24h = Number(item.quoteVolume);
                    const lastPrice = Number(item.lastPrice);
                    const priceChangePercent24h = Number(item.priceChangePercent);
                    const openTime = Number(item.openTime);
                    const closeTime = Number(item.closeTime);

                    return {
                        symbol,
                        baseAsset: contract.baseAsset,
                        quoteAsset: contract.quoteAsset,
                        contractType: 'PERPETUAL' as const,
                        volume24h: Number.isFinite(volume24h) ? volume24h : 0,
                        quoteVolume24h: Number.isFinite(quoteVolume24h) ? quoteVolume24h : 0,
                        lastPrice: Number.isFinite(lastPrice) ? lastPrice : 0,
                        priceChangePercent24h: Number.isFinite(priceChangePercent24h) ? priceChangePercent24h : 0,
                        openTime: Number.isFinite(openTime) ? openTime : 0,
                        closeTime: Number.isFinite(closeTime) ? closeTime : 0,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null)
                .sort((a, b) => b.quoteVolume24h - a.quoteVolume24h);

            this.marketSnapshotCache = {
                expiresAt: now + this.MARKET_SNAPSHOT_CACHE_TTL_MS,
                data: snapshot,
            };

            logger.info(`Successfully fetched market snapshot for ${snapshot.length} USDT perpetual contracts`);
            return snapshot;
        } catch (error) {
            logger.error('Error fetching market snapshot from Binance', { error });
            throw new ServiceError('Failed to fetch market snapshot from Binance', 502);
        }
    }

    /**
     * Fetch funding snapshot for USDT perpetual contracts.
     * Uses a short cache to avoid excessive repeated calls.
     */
    async getFundingSnapshot(forceRefresh: boolean = false): Promise<FundingSnapshotItem[]> {
        try {
            const now = Date.now();
            if (!forceRefresh && this.fundingSnapshotCache && this.fundingSnapshotCache.expiresAt > now) {
                return this.fundingSnapshotCache.data;
            }

            logger.info('Fetching funding snapshot (mark price stream) from Binance Futures');

            const [contracts, markPriceRaw] = await Promise.all([
                this.fetchUsdtPerpetualContracts(forceRefresh),
                (client as any).futuresMarkPrice(),
            ]);

            const contractBySymbol = new Map<string, UsdtPerpetualContract>(
                contracts.map((contract) => [contract.symbol, contract]),
            );

            const markPriceRows = Array.isArray(markPriceRaw) ? markPriceRaw : [markPriceRaw];

            const snapshot: FundingSnapshotItem[] = markPriceRows
                .map((item: any) => {
                    const symbol = String(item.symbol || '');
                    const contract = contractBySymbol.get(symbol);
                    if (!contract) return null;

                    const fundingRate = Number(item.lastFundingRate);
                    const markPrice = Number(item.markPrice);
                    const nextFundingTime = Number(item.nextFundingTime);
                    const time = Number(item.time);

                    return {
                        symbol,
                        baseAsset: contract.baseAsset,
                        quoteAsset: contract.quoteAsset,
                        contractType: 'PERPETUAL' as const,
                        fundingRate: Number.isFinite(fundingRate) ? fundingRate : 0,
                        markPrice: Number.isFinite(markPrice) ? markPrice : 0,
                        nextFundingTime: Number.isFinite(nextFundingTime) ? nextFundingTime : 0,
                        time: Number.isFinite(time) ? time : 0,
                    };
                })
                .filter((item): item is NonNullable<typeof item> => item !== null)
                .sort((a, b) => Math.abs(b.fundingRate) - Math.abs(a.fundingRate));

            this.fundingSnapshotCache = {
                expiresAt: now + this.FUNDING_SNAPSHOT_CACHE_TTL_MS,
                data: snapshot,
            };

            logger.info(`Successfully fetched funding snapshot for ${snapshot.length} USDT perpetual contracts`);
            return snapshot;
        } catch (error) {
            logger.error('Error fetching funding snapshot from Binance', { error });
            throw new ServiceError('Failed to fetch funding snapshot from Binance', 502);
        }
    }

    /**
     * Fetch open interest snapshot for requested USDT perpetual symbols.
     * Scope is controlled by `symbols` and each symbol is cached independently.
     */
    async getOiSnapshot(symbols: string[] = [], forceRefresh: boolean = false): Promise<OiSnapshotItem[]> {
        try {
            const contracts = await this.fetchUsdtPerpetualContracts(forceRefresh);
            const contractBySymbol = new Map<string, UsdtPerpetualContract>(
                contracts.map((contract) => [contract.symbol, contract]),
            );

            const requestedSymbolsRaw =
                symbols.length > 0
                    ? symbols
                    : contracts.map((contract) => contract.symbol);

            const requestedSymbols = Array.from(
                new Set(
                    requestedSymbolsRaw
                        .map((symbol) => String(symbol || '').trim().toUpperCase())
                        .filter((symbol) => contractBySymbol.has(symbol)),
                ),
            );

            if (requestedSymbols.length === 0) {
                return [];
            }

            const fundingSnapshot = await this.getFundingSnapshot(forceRefresh);
            const fundingBySymbol = new Map<string, FundingSnapshotItem>(
                fundingSnapshot.map((item) => [item.symbol, item]),
            );

            const queue = requestedSymbols.slice();
            const results: OiSnapshotItem[] = [];

            const workers = Array.from(
                { length: Math.min(this.OI_FETCH_CONCURRENCY, queue.length) },
                async () => {
                    while (queue.length > 0) {
                        const symbol = queue.shift();
                        if (!symbol) continue;

                        const contract = contractBySymbol.get(symbol);
                        if (!contract) continue;

                        const now = Date.now();
                        const cached = this.oiSnapshotCacheBySymbol.get(symbol);
                        const hasFreshCache =
                            !forceRefresh && cached && cached.expiresAt > now;

                        if (hasFreshCache && cached) {
                            results.push(cached.data);
                            continue;
                        }

                        try {
                            const response = await axios.get(
                                'https://fapi.binance.com/fapi/v1/openInterest',
                                {
                                    params: { symbol },
                                    timeout: 7000,
                                },
                            );

                            const payload = response.data || {};
                            const openInterest = Number(payload.openInterest);
                            const time = Number(payload.time);
                            const funding = fundingBySymbol.get(symbol);
                            const markPrice = Number(funding?.markPrice || 0);
                            const openInterestNotional =
                                Number.isFinite(openInterest) && Number.isFinite(markPrice)
                                    ? openInterest * markPrice
                                    : 0;

                            const item: OiSnapshotItem = {
                                symbol,
                                baseAsset: contract.baseAsset,
                                quoteAsset: contract.quoteAsset,
                                contractType: 'PERPETUAL',
                                openInterest: Number.isFinite(openInterest) ? openInterest : 0,
                                markPrice: Number.isFinite(markPrice) ? markPrice : 0,
                                openInterestNotional: Number.isFinite(openInterestNotional)
                                    ? openInterestNotional
                                    : 0,
                                time: Number.isFinite(time) ? time : Date.now(),
                            };

                            this.oiSnapshotCacheBySymbol.set(symbol, {
                                expiresAt: Date.now() + this.OI_SNAPSHOT_CACHE_TTL_MS,
                                data: item,
                            });

                            results.push(item);
                        } catch (error) {
                            logger.warn(`Failed to fetch open interest for ${symbol}`, { error });

                            // Best-effort fallback: if we have stale cache, still use it.
                            if (cached?.data) {
                                results.push(cached.data);
                            }
                        }
                    }
                },
            );

            await Promise.all(workers);

            return results.sort((a, b) => b.openInterestNotional - a.openInterestNotional);
        } catch (error) {
            logger.error('Error fetching open interest snapshot from Binance', { error });
            throw new ServiceError('Failed to fetch open interest snapshot from Binance', 502);
        }
    }

    /**
     * Fetch candlestick data for a specific symbol
     */
    async getCandlestickData(symbol: string, interval: string, limit: number = 100) {
        try {
            logger.info(`Fetching klines for ${symbol} (${interval}, limit: ${limit})`);
            
            const candles = await client.futuresCandles({
                symbol,
                interval: interval as any,
                limit
            });
            
            // Convert to format expected by frontend
            const formattedCandles = candles.map((c: any) => [
                c.openTime,
                c.open,
                c.high,
                c.low,
                c.close,
                c.volume,
                c.closeTime,
                c.quoteVolume,
                c.trades,
                c.baseAssetVolume,
                c.quoteAssetVolume
            ]);
            
            logger.info(`Successfully fetched ${formattedCandles.length} candles for ${symbol}`);
            return formattedCandles;
        } catch (error) {
            logger.error(`Error fetching klines for ${symbol}`, { error });
            const binanceCode = (error as any)?.code;

            // Binance returns -1122 for symbols not in tradable status.
            if (binanceCode === -1122) {
                throw new ServiceError(`Symbol ${symbol} is not tradable on Binance Futures`, 422);
            }

            throw new ServiceError(`Failed to fetch chart data for ${symbol}`, 502);
        }
    }
}

export default new BinanceService();
