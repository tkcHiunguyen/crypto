/* global LightweightCharts */

class ChartComponent {
    constructor(container, symbol) {
        this.container = container;
        this.symbol = symbol;
        this.chart = null;
        this.series = null;
        this.resizeObserver = null;
        this.resizeRaf = null;
        this.resizePaused = false;
        this.pendingResize = null;
        this.lastAppliedWidth = 0;
        this.lastAppliedHeight = 0;

        this.minW = 280;
        this.minH = 170;

        this.init();
    }

    getDimensions() {
        const width = Math.max(this.minW, Math.floor(this.container.clientWidth || this.minW));
        const height = Math.max(this.minH, Math.floor(this.container.clientHeight || this.minH));
        return { width, height };
    }

    toDate(time) {
        if (typeof time === "number") {
            return new Date(time * 1000);
        }

        if (
            time &&
            typeof time === "object" &&
            typeof time.year === "number" &&
            typeof time.month === "number" &&
            typeof time.day === "number"
        ) {
            return new Date(Date.UTC(time.year, time.month - 1, time.day));
        }

        return new Date(Number.NaN);
    }

    formatTickTime(time, locale) {
        const date = this.toDate(time);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleTimeString(locale || undefined, {
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    }

    formatCrosshairTime(time) {
        const date = this.toDate(time);
        if (Number.isNaN(date.getTime())) return "";
        return date.toLocaleString(undefined, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
            hour: "2-digit",
            minute: "2-digit",
            hour12: false,
        });
    }

    init() {
        const { width, height } = this.getDimensions();

        this.chart = LightweightCharts.createChart(this.container, {
            layout: {
                background: { type: "Solid", color: "#0f172a" },
                textColor: "#cbd5e1",
                attributionLogo: false,
            },
            grid: {
                vertLines: { color: "#1e293b" },
                horzLines: { color: "#1e293b" },
            },
            width,
            height,
            localization: {
                locale: navigator.language || "en-US",
                timeFormatter: (time) => this.formatCrosshairTime(time),
            },
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: "#334155",
                tickMarkFormatter: (time, _tickMarkType, locale) =>
                    this.formatTickTime(time, locale),
            },
            rightPriceScale: {
                borderColor: "#334155",
            },
            crosshair: {
                mode: LightweightCharts.CrosshairMode.Normal,
            },
        });

        // Keep this explicit update for compatibility with bundled/CDN version differences.
        this.chart.applyOptions({
            layout: {
                attributionLogo: false,
            },
        });

        if (typeof this.chart.addCandlestickSeries === "function") {
            this.series = this.chart.addCandlestickSeries(this.getSeriesOptions());
        } else {
            this.series = this.chart.addSeries(
                LightweightCharts.CandlestickSeries,
                this.getSeriesOptions(),
            );
        }

        this.resizeObserver = new ResizeObserver((entries) => {
            for (const entry of entries) {
                if (entry.target !== this.container) continue;

                const w = Math.floor(entry.contentRect.width);
                const h = Math.floor(entry.contentRect.height);
                if (w <= 0 || h <= 0) continue;

                const nextW = Math.max(w, this.minW);
                const nextH = Math.max(h, this.minH);

                if (this.resizePaused) {
                    this.pendingResize = { width: nextW, height: nextH };
                    continue;
                }

                this.applyResize(nextW, nextH);
            }
        });

        this.resizeObserver.observe(this.container);
    }

    getSeriesOptions() {
        return {
            upColor: "#22c55e",
            downColor: "#ef4444",
            borderVisible: false,
            wickUpColor: "#22c55e",
            wickDownColor: "#ef4444",
        };
    }

    updateData(data) {
        if (this.series) this.series.setData(data);
    }

    updateCandle(candle) {
        if (this.series) this.series.update(candle);
    }

    applyResize(width, height) {
        if (!this.chart) return;
        if (width === this.lastAppliedWidth && height === this.lastAppliedHeight) return;

        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
        }

        this.resizeRaf = requestAnimationFrame(() => {
            this.chart.applyOptions({ width, height });
            this.lastAppliedWidth = width;
            this.lastAppliedHeight = height;
            this.resizeRaf = null;
        });
    }

    forceResize() {
        const { width, height } = this.getDimensions();
        this.applyResize(width, height);
    }

    setResizePaused(isPaused) {
        this.resizePaused = Boolean(isPaused);
        if (this.resizePaused) return;

        if (this.pendingResize) {
            this.applyResize(this.pendingResize.width, this.pendingResize.height);
            this.pendingResize = null;
            return;
        }

        this.forceResize();
    }

    destroy() {
        if (this.resizeRaf) {
            cancelAnimationFrame(this.resizeRaf);
            this.resizeRaf = null;
        }
        if (this.resizeObserver) this.resizeObserver.disconnect();
        if (this.chart) this.chart.remove();
    }
}
