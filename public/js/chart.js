/* global $ */

let selectedCoins = new Set();
let allCoins = [];
let marketSnapshotBySymbol = new Map();
let fundingSnapshotBySymbol = new Map();
let oiSnapshotBySymbol = new Map();
let isLoading = false;
let isLoadingMarketSnapshot = false;
let isLoadingFundingSnapshot = false;
let isLoadingOiSnapshot = false;
let isLoadingPatternCatalog = false;
let isLoadingPatternScan = false;
let marketSnapshotLastUpdatedAt = 0;
let fundingSnapshotLastUpdatedAt = 0;
let oiSnapshotLastUpdatedAt = 0;
let patternScanLastUpdatedAt = 0;
let minVolume24hFilter = 0;
let minFundingRateFilter = null;
let maxFundingRateFilter = null;
let minOiNotionalFilter = 0;
let activePatternId = "";
let patternCatalog = [];
let patternMatchedSymbols = new Set();
let patternScanCacheKey = "";
let patternScanToken = 0;
let patternCategoryFilter = "All";
let patternScanPromise = null;

const chartInstances = {};
let lazyObserver = null;
let chartsPerPage = 52;
let pagedSymbols = [];
let currentChartPage = 1;
let currentRenderCycle = 0;
let currentChartInterval = "15m";
let currentChartLimit = 100;
let activeToolPanel = "market";
let marketCoinCountText = "Coins (0)";
let marketCoinCountRawText = "Coins (0)";
let activeToolsFilterEditor = "";

const MAX_CONCURRENT_REQUESTS = 5;
const activeRequests = new Set();
const requestQueue = [];
const SEARCH_SUGGESTION_LIMIT = 10;
const SEARCH_DEBOUNCE_MS = 450;
let searchDebounceTimer = null;
let latestSearchToken = 0;
const PANEL_ORDER = ["market", "tools", "layout"];
const TOOL_FILTER_IDS = ["liquidity", "funding", "oi", "pattern"];
const SETTINGS_STORAGE_KEY = "crypto2-ui-settings-v1";
const VALID_LANGUAGES = ["en", "vi"];
const VALID_THEMES = ["cyan", "amber", "emerald"];
const DEFAULT_UI_SETTINGS = Object.freeze({
    compactCards: false,
    calmBackground: false,
    reduceMotion: false,
    language: "en",
    theme: "cyan",
    chartsPerPage: 52,
});
const VALID_CHARTS_PER_PAGE = [24, 36, 52, 64];
const UI_TEXT = {
    en: {
        panel_market_title: "Market Controls",
        panel_tools_title: "Tools",
        panel_settings_title: "Settings",
        panel_tools_subtitle: "Filters and utilities",
        panel_settings_subtitle: "Visual and display options",
        tooltip_menu: "Menu",
        tooltip_tools: "Tools",
        tooltip_settings: "Settings",
        aria_open_menu: "Open menu panel",
        aria_open_tools: "Open tools panel",
        aria_open_settings: "Open settings panel",
        dock_label: "Dock",
        skip_to_charts: "Skip to charts",
        topbar_title: "Futures Radar",
        topbar_subtitle: "Realtime Binance perpetual watchboard",
        search_symbol: "Search symbol",
        search_placeholder: "Search symbol to auto-render charts…",
        stale_notice: "Data may be stale for this timeframe.",
        load_latest: "Load latest",
        empty_pick_symbols: "Pick symbols and press Render Charts",
        empty_no_symbols_pattern: "No symbols match pattern",
        empty_no_symbols_selected: "No symbols selected",
        scanning_pattern: "Scanning pattern…",
        hide_panel: "Hide panel",
        hide_tool_panel: "Hide tool panel",
        btn_get_coins: "Get Coins",
        btn_select_all: "Select All",
        btn_clear: "Clear",
        label_chart_interval: "Chart Interval",
        menu_select_interval: "Select interval",
        label_candle_limit: "Candle Limit",
        menu_select_limit: "Select limit",
        btn_render_charts: "Render Charts",
        market_tip: "Tip: use the left tool dock to reopen this panel.",
        settings_intro_title: "Quick Settings",
        settings_intro_desc: "Light settings for better readability. Changes are saved on this device.",
        settings_display_label: "Display",
        settings_compact_title: "Compact charts",
        settings_compact_desc: "Use smaller chart cards to fit more content.",
        settings_calm_title: "Calm background",
        settings_calm_desc: "Reduce glow and grid noise in the workspace.",
        settings_motion_title: "Reduce motion",
        settings_motion_desc: "Disable most transitions and animations.",
        settings_language_label: "Language",
        settings_language_en: "English",
        settings_language_vi: "Vietnamese",
        settings_theme_label: "Accent Theme",
        settings_theme_cyan: "Neon Cyan",
        settings_theme_amber: "Solar Amber",
        settings_theme_emerald: "Neo Emerald",
        settings_charts_per_page: "Charts per page",
        settings_reset: "Reset to defaults",
        settings_summary_active: "Active",
        settings_summary_compact_on: "compact on",
        settings_summary_compact_off: "compact off",
        settings_summary_calm_on: "calm bg on",
        settings_summary_calm_off: "calm bg off",
        settings_summary_motion_on: "motion low",
        settings_summary_motion_off: "motion normal",
        status_settings_updated: "Settings updated",
        status_settings_reset: "Settings reset to defaults",
        status_charts_per_page_set: "Charts per page set to {count}",
        status_panel_opened: "{panel} opened",
        status_tool_panel_expanded: "Tool panel expanded",
        status_tool_panel_collapsed: "Tool panel collapsed",
        status_ready: "Ready",
        no_matching_symbols: "No matching symbols",
        interval_1m: "1 Minute",
        interval_5m: "5 Minutes",
        interval_15m: "15 Minutes",
        interval_1h: "1 Hour",
        interval_4h: "4 Hours",
        interval_1d: "1 Day",
        limit_50: "50 Candles",
        limit_100: "100 Candles",
        limit_200: "200 Candles",
        limit_500: "500 Candles",
        limit_1000: "1000 Candles",
        coin_count: "Coins ({count})",
        loading: "Loading…",
        error: "Error",
    },
    vi: {
        panel_market_title: "Tổng quan thị trường",
        panel_tools_title: "Công cụ",
        panel_settings_title: "Cài đặt",
        panel_tools_subtitle: "Bộ lọc và tiện ích",
        panel_settings_subtitle: "Tùy chỉnh giao diện",
        tooltip_menu: "Menu",
        tooltip_tools: "Công cụ",
        tooltip_settings: "Cài đặt",
        aria_open_menu: "Mở bảng menu",
        aria_open_tools: "Mở bảng công cụ",
        aria_open_settings: "Mở bảng cài đặt",
        dock_label: "Dock",
        skip_to_charts: "Bỏ qua đến biểu đồ",
        topbar_title: "Radar Futures",
        topbar_subtitle: "Bảng theo dõi perpetual Binance theo thời gian thực",
        search_symbol: "Tìm symbol",
        search_placeholder: "Tìm symbol để tự động vẽ biểu đồ…",
        stale_notice: "Dữ liệu có thể đã cũ ở khung thời gian này.",
        load_latest: "Tải mới nhất",
        empty_pick_symbols: "Chọn symbol và bấm Render Charts",
        empty_no_symbols_pattern: "Không có symbol nào khớp mẫu nến",
        empty_no_symbols_selected: "Chưa có symbol nào được chọn",
        scanning_pattern: "Đang quét mẫu nến…",
        hide_panel: "Ẩn bảng",
        hide_tool_panel: "Ẩn bảng công cụ",
        btn_get_coins: "Tải coin",
        btn_select_all: "Chọn tất cả",
        btn_clear: "Bỏ chọn",
        label_chart_interval: "Khung thời gian",
        menu_select_interval: "Chọn khung thời gian",
        label_candle_limit: "Số lượng nến",
        menu_select_limit: "Chọn giới hạn nến",
        btn_render_charts: "Vẽ biểu đồ",
        market_tip: "Mẹo: dùng tool dock bên trái để mở lại bảng này.",
        settings_intro_title: "Cài đặt nhanh",
        settings_intro_desc: "Tùy chỉnh nhẹ để dễ nhìn hơn. Cài đặt được lưu trên máy này.",
        settings_display_label: "Hiển thị",
        settings_compact_title: "Biểu đồ gọn",
        settings_compact_desc: "Thu nhỏ card biểu đồ để hiển thị được nhiều hơn.",
        settings_calm_title: "Nền nhẹ",
        settings_calm_desc: "Giảm độ rạng và độ nhiễu của nền.",
        settings_motion_title: "Giảm chuyển động",
        settings_motion_desc: "Tắt bớt hiệu ứng chuyển cảnh và animation.",
        settings_language_label: "Ngôn ngữ",
        settings_language_en: "Tiếng Anh",
        settings_language_vi: "Tiếng Việt",
        settings_theme_label: "Màu chủ đề",
        settings_theme_cyan: "Xanh Neon",
        settings_theme_amber: "Vàng Amber",
        settings_theme_emerald: "Xanh Emerald",
        settings_charts_per_page: "Số biểu đồ mỗi trang",
        settings_reset: "Đặt lại mặc định",
        settings_summary_active: "Đang bật",
        settings_summary_compact_on: "gọn bật",
        settings_summary_compact_off: "gọn tắt",
        settings_summary_calm_on: "nền nhẹ bật",
        settings_summary_calm_off: "nền nhẹ tắt",
        settings_summary_motion_on: "giảm chuyển động",
        settings_summary_motion_off: "chuyển động bình thường",
        status_settings_updated: "Đã cập nhật cài đặt",
        status_settings_reset: "Đã đặt lại cài đặt mặc định",
        status_charts_per_page_set: "Đã đặt {count} biểu đồ mỗi trang",
        status_panel_opened: "Đã mở {panel}",
        status_tool_panel_expanded: "Đã mở bảng công cụ",
        status_tool_panel_collapsed: "Đã ẩn bảng công cụ",
        status_ready: "Sẵn sàng",
        no_matching_symbols: "Không tìm thấy symbol phù hợp",
        interval_1m: "1 Phút",
        interval_5m: "5 Phút",
        interval_15m: "15 Phút",
        interval_1h: "1 Giờ",
        interval_4h: "4 Giờ",
        interval_1d: "1 Ngày",
        limit_50: "50 Nến",
        limit_100: "100 Nến",
        limit_200: "200 Nến",
        limit_500: "500 Nến",
        limit_1000: "1000 Nến",
        coin_count: "Coins ({count})",
        loading: "Đang tải…",
        error: "Lỗi",
    },
};
const INTERVAL_LABEL_KEY_BY_VALUE = {
    "1m": "interval_1m",
    "5m": "interval_5m",
    "15m": "interval_15m",
    "1h": "interval_1h",
    "4h": "interval_4h",
    "1d": "interval_1d",
};
const LIMIT_LABEL_KEY_BY_VALUE = {
    50: "limit_50",
    100: "limit_100",
    200: "limit_200",
    500: "limit_500",
    1000: "limit_1000",
};
const PANEL_TRANSITION_MS = 340;
const STALE_CHECK_INTERVAL_MS = 30000;
const STALE_THRESHOLD_MULTIPLIER = 2;
const STALE_THRESHOLD_MIN_MS = 2 * 60 * 1000;
const STALE_THRESHOLD_MAX_MS = 30 * 60 * 1000;
const REALTIME_WS_BASE_URL = "wss://fstream.binance.com/stream?streams=";
const REALTIME_RECONNECT_MIN_MS = 1500;
const REALTIME_RECONNECT_MAX_MS = 15000;
const MARKET_SNAPSHOT_CLIENT_CACHE_MS = 30 * 1000;
const FUNDING_SNAPSHOT_CLIENT_CACHE_MS = 30 * 1000;
const OI_SNAPSHOT_CLIENT_CACHE_MS = 30 * 1000;
const PATTERN_SCAN_CLIENT_CACHE_MS = 30 * 1000;
const FUNDING_EXTREME_RATE_ABS = 0.0003; // 0.03%
const FUNDING_RATE_EPSILON = 1e-10;
const OPEN_CANDLE_UP_COLOR = "#38bdf8";
const OPEN_CANDLE_DOWN_COLOR = "#fb923c";
let uiSettings = { ...DEFAULT_UI_SETTINGS };
const INTERVAL_MS_MAP = {
    "1m": 1 * 60 * 1000,
    "5m": 5 * 60 * 1000,
    "15m": 15 * 60 * 1000,
    "1h": 60 * 60 * 1000,
    "4h": 4 * 60 * 60 * 1000,
    "1d": 24 * 60 * 60 * 1000,
};
const PANEL_CONFIG = {
    market: {
        titleKey: "panel_market_title",
        subtitle: () => marketCoinCountText,
    },
    tools: {
        titleKey: "panel_tools_title",
        subtitle: () => t("panel_tools_subtitle"),
    },
    layout: {
        titleKey: "panel_settings_title",
        subtitle: () => t("panel_settings_subtitle"),
    },
};
const chartSnapshotBySymbol = new Map();
let staleCheckTimer = null;
let refreshLatestInProgress = false;
let realtimeSocket = null;
let realtimeReconnectTimer = null;
let realtimeReconnectDelayMs = REALTIME_RECONNECT_MIN_MS;
let realtimeDesiredKey = "";
let realtimeDesiredConfig = null;
let staleNoticeRefreshTimer = null;
let sidebarResizeUnlockTimer = null;

function setStatus(message) {
    const $live = $("#statusLive");
    if ($live.length) $live.text(message);
}

function getUiLanguage() {
    const language = String(uiSettings.language || "").trim().toLowerCase();
    return VALID_LANGUAGES.includes(language) ? language : DEFAULT_UI_SETTINGS.language;
}

function getUiTheme() {
    const theme = String(uiSettings.theme || "").trim().toLowerCase();
    return VALID_THEMES.includes(theme) ? theme : DEFAULT_UI_SETTINGS.theme;
}

function t(key, replacements = {}) {
    const language = getUiLanguage();
    const source = UI_TEXT[language] || UI_TEXT.en;
    const fallback = UI_TEXT.en || {};
    let text = source[key] ?? fallback[key] ?? key;
    Object.entries(replacements).forEach(([name, value]) => {
        text = text.replaceAll(`{${name}}`, String(value));
    });
    return text;
}

function getPanelTitle(panelId) {
    const config = PANEL_CONFIG[panelId];
    if (!config) return "";
    return t(config.titleKey);
}

function getIntervalLabelByValue(value) {
    const key = INTERVAL_LABEL_KEY_BY_VALUE[String(value || "").trim()];
    return key ? t(key) : String(value || "");
}

function getLimitLabelByValue(value) {
    const numeric = Number(value);
    const key = LIMIT_LABEL_KEY_BY_VALUE[numeric];
    return key ? t(key) : `${numeric}`;
}

function localizeMarketCoinCountText(rawText) {
    const text = String(rawText || "").trim();
    const coinMatch = text.match(/^Coins\s*\((\d+)\)$/i);
    if (coinMatch) {
        return t("coin_count", { count: coinMatch[1] });
    }
    if (text.toLowerCase().startsWith("loading")) return t("loading");
    if (text.toLowerCase() === "error") return t("error");
    return text;
}

function normalizeChartsPerPage(value) {
    const parsed = Number.parseInt(String(value || ""), 10);
    if (VALID_CHARTS_PER_PAGE.includes(parsed)) return parsed;
    return DEFAULT_UI_SETTINGS.chartsPerPage;
}

function sanitizeUiSettings(rawSettings) {
    const raw = rawSettings && typeof rawSettings === "object" ? rawSettings : {};
    return {
        compactCards: Boolean(raw.compactCards),
        calmBackground: Boolean(raw.calmBackground),
        reduceMotion: Boolean(raw.reduceMotion),
        language: VALID_LANGUAGES.includes(String(raw.language || "").toLowerCase())
            ? String(raw.language).toLowerCase()
            : DEFAULT_UI_SETTINGS.language,
        theme: VALID_THEMES.includes(String(raw.theme || "").toLowerCase())
            ? String(raw.theme).toLowerCase()
            : DEFAULT_UI_SETTINGS.theme,
        chartsPerPage: normalizeChartsPerPage(raw.chartsPerPage),
    };
}

function loadUiSettings() {
    try {
        const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (!stored) {
            uiSettings = { ...DEFAULT_UI_SETTINGS };
            chartsPerPage = uiSettings.chartsPerPage;
            return;
        }

        const parsed = JSON.parse(stored);
        uiSettings = sanitizeUiSettings(parsed);
        chartsPerPage = uiSettings.chartsPerPage;
    } catch {
        uiSettings = { ...DEFAULT_UI_SETTINGS };
        chartsPerPage = uiSettings.chartsPerPage;
    }
}

function persistUiSettings() {
    try {
        localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(uiSettings));
    } catch {
        // Ignore storage errors in private mode/quota environments.
    }
}

function applyUiSettingsToDocument() {
    const $body = $("body");
    $body.toggleClass("ui-compact-cards", Boolean(uiSettings.compactCards));
    $body.toggleClass("ui-calm-background", Boolean(uiSettings.calmBackground));
    $body.toggleClass("ui-reduced-motion", Boolean(uiSettings.reduceMotion));
    $body.attr("data-theme", getUiTheme());
    $("html").attr("lang", getUiLanguage());
    chartsPerPage = normalizeChartsPerPage(uiSettings.chartsPerPage);
}

function syncSettingsControls() {
    $("#settingCompactCards").prop("checked", Boolean(uiSettings.compactCards));
    $("#settingCalmBackground").prop("checked", Boolean(uiSettings.calmBackground));
    $("#settingReduceMotion").prop("checked", Boolean(uiSettings.reduceMotion));
    $("#settingLanguage").val(getUiLanguage());
    $("#settingTheme").val(getUiTheme());
    $("#settingChartsPerPage").val(String(normalizeChartsPerPage(uiSettings.chartsPerPage)));
}

function updateDropdownLabelsForLanguage() {
    $("#intervalMenu .interval-item").each(function () {
        const value = String($(this).attr("data-value") || "").trim();
        const label = getIntervalLabelByValue(value);
        if (!label) return;
        $(this).attr("data-label", label).text(label);
    });

    $("#limitMenu .limit-item").each(function () {
        const value = Number($(this).attr("data-value"));
        const label = getLimitLabelByValue(value);
        if (!label) return;
        $(this).attr("data-label", label).text(label);
    });

    const intervalValue = String($("#interval").val() || "15m");
    const limitValue = Number($("#limit").val() || 100);
    $("#intervalLabel").text(getIntervalLabelByValue(intervalValue));
    $("#limitLabel").text(getLimitLabelByValue(limitValue));
}

function applyLanguageToStaticUi() {
    const currentPanel = PANEL_CONFIG[activeToolPanel] ? activeToolPanel : "market";
    const panelTitle = getPanelTitle(currentPanel);
    if (panelTitle) {
        $("#sidebarTitle").text(panelTitle);
    }
    $("#coinCount").text(PANEL_CONFIG[currentPanel].subtitle());

    $("#skipToChartsLink").text(t("skip_to_charts"));
    $("#dockLabel").text(t("dock_label"));
    $("#topbarTitle").text(t("topbar_title"));
    $("#topbarSubtitle").text(t("topbar_subtitle"));
    $("#coinSearchLabel").text(t("search_symbol"));
    $("#coinSearch").attr("placeholder", t("search_placeholder"));
    $("#staleNoticeText").text(t("stale_notice"));
    $("#reloadLatestBtn").text(t("load_latest"));
    $("#chartEmptyState").text(t("empty_pick_symbols"));
    $("#patternScanMainLoaderText").text(t("scanning_pattern"));

    $("#sidebarCloseBtn")
        .attr("title", t("hide_panel"))
        .attr("aria-label", t("hide_tool_panel"));

    $("#getCoinsBtn").text(t("btn_get_coins"));
    $("#selectAllBtn").text(t("btn_select_all"));
    $("#clearBtn").text(t("btn_clear"));
    $("#intervalFieldLabel").text(t("label_chart_interval"));
    $("#intervalMenuTitle").text(t("menu_select_interval"));
    $("#limitFieldLabel").text(t("label_candle_limit"));
    $("#limitMenuTitle").text(t("menu_select_limit"));
    $("#renderBtn").text(t("btn_render_charts"));
    $("#marketTipText").text(t("market_tip"));

    $("#settingsIntroTitle").text(t("settings_intro_title"));
    $("#settingsIntroDesc").text(t("settings_intro_desc"));
    $("#settingsDisplayLabel").text(t("settings_display_label"));
    $("#settingsCompactTitle").text(t("settings_compact_title"));
    $("#settingsCompactDesc").text(t("settings_compact_desc"));
    $("#settingsCalmTitle").text(t("settings_calm_title"));
    $("#settingsCalmDesc").text(t("settings_calm_desc"));
    $("#settingsMotionTitle").text(t("settings_motion_title"));
    $("#settingsMotionDesc").text(t("settings_motion_desc"));
    $("#settingLanguageLabel").text(t("settings_language_label"));
    $("#settingLanguage option[value=\"en\"]").text(t("settings_language_en"));
    $("#settingLanguage option[value=\"vi\"]").text(t("settings_language_vi"));
    $("#settingThemeLabel").text(t("settings_theme_label"));
    $("#settingTheme option[value=\"cyan\"]").text(t("settings_theme_cyan"));
    $("#settingTheme option[value=\"amber\"]").text(t("settings_theme_amber"));
    $("#settingTheme option[value=\"emerald\"]").text(t("settings_theme_emerald"));
    $("#settingChartsPerPageLabel").text(t("settings_charts_per_page"));
    $("#settingsResetBtn").text(t("settings_reset"));

    const $marketBtn = $(".tool-rail-item[data-panel=\"market\"]");
    const $toolsBtn = $(".tool-rail-item[data-panel=\"tools\"]");
    const $settingsBtn = $(".tool-rail-item[data-panel=\"layout\"]");

    $marketBtn
        .attr("data-tooltip", t("tooltip_menu"))
        .attr("title", t("tooltip_menu"))
        .attr("aria-label", t("aria_open_menu"));
    $toolsBtn
        .attr("data-tooltip", t("tooltip_tools"))
        .attr("title", t("tooltip_tools"))
        .attr("aria-label", t("aria_open_tools"));
    $settingsBtn
        .attr("data-tooltip", t("tooltip_settings"))
        .attr("title", t("tooltip_settings"))
        .attr("aria-label", t("aria_open_settings"));

    updateDropdownLabelsForLanguage();
}

function updateSettingsSummary() {
    const parts = [
        `${chartsPerPage}/page`,
        uiSettings.compactCards ? t("settings_summary_compact_on") : t("settings_summary_compact_off"),
        uiSettings.calmBackground ? t("settings_summary_calm_on") : t("settings_summary_calm_off"),
        uiSettings.reduceMotion ? t("settings_summary_motion_on") : t("settings_summary_motion_off"),
    ];
    $("#settingsSummary").text(`${t("settings_summary_active")}: ${parts.join(" · ")}`);
}

function applyUiSettings({ rerender = false, statusMessage = "" } = {}) {
    uiSettings = sanitizeUiSettings(uiSettings);
    applyUiSettingsToDocument();
    marketCoinCountText = localizeMarketCoinCountText(marketCoinCountRawText);
    applyLanguageToStaticUi();
    persistUiSettings();
    syncSettingsControls();
    updateSettingsSummary();

    if (rerender && pagedSymbols.length > 0) {
        currentChartPage = Math.min(currentChartPage, getTotalPages());
        renderChartPage();
    }

    if (statusMessage) {
        setStatus(statusMessage);
    }
}

function resetUiSettings() {
    uiSettings = { ...DEFAULT_UI_SETTINGS };
    applyUiSettings({
        rerender: true,
        statusMessage: t("status_settings_reset"),
    });
}

function normalizeToolsFilterId(filterId) {
    const normalized = String(filterId || "").trim().toLowerCase();
    return TOOL_FILTER_IDS.includes(normalized) ? normalized : "";
}

function isFilterAppliedById(filterId) {
    const normalized = normalizeToolsFilterId(filterId);
    if (normalized === "liquidity") return minVolume24hFilter > 0;
    if (normalized === "funding") return hasFundingFilter();
    if (normalized === "oi") return minOiNotionalFilter > 0;
    if (normalized === "pattern") return hasPatternFilter();
    return false;
}

function getToolsFilterValueLabel(filterId) {
    const normalized = normalizeToolsFilterId(filterId);
    if (normalized === "liquidity") {
        return minVolume24hFilter > 0 ? `>= ${formatCompactNumber(minVolume24hFilter)}` : "Off";
    }
    if (normalized === "funding") {
        return hasFundingFilter() ? formatFundingFilterLabel() : "Off";
    }
    if (normalized === "oi") {
        return minOiNotionalFilter > 0 ? `>= ${formatCompactNumber(minOiNotionalFilter)}` : "Off";
    }
    if (normalized === "pattern") {
        return hasPatternFilter() ? getPatternDisplayName(activePatternId) : "Off";
    }
    return "Off";
}

function updateToolsFilterQuickStates() {
    TOOL_FILTER_IDS.forEach((filterId) => {
        const $card = $(`.filter-quick-card[data-filter-target="${filterId}"]`);
        if ($card.length === 0) return;

        const isApplied = isFilterAppliedById(filterId);
        const isOpen = filterId === activeToolsFilterEditor;

        $card
            .attr("data-applied", isApplied ? "true" : "false")
            .attr("data-open", isOpen ? "true" : "false");

        $card
            .find(".filter-quick-btn")
            .attr("aria-expanded", isOpen ? "true" : "false")
            .attr("aria-pressed", isApplied ? "true" : "false");

        $card
            .find(".filter-quick-clear")
            .prop("disabled", !isApplied)
            .attr("aria-disabled", isApplied ? "false" : "true");

        $(`#quickFilterValue-${filterId}`).text(getToolsFilterValueLabel(filterId));
    });
}

function updateToolsFilterEditorUI() {
    $("#panel-tools .tool-filter-module").each(function () {
        const filterId = normalizeToolsFilterId($(this).attr("data-filter-module"));
        const isOpen = filterId !== "" && filterId === activeToolsFilterEditor;
        $(this)
            .toggleClass("is-open", isOpen)
            .toggleClass("hidden", !isOpen)
            .attr("aria-hidden", isOpen ? "false" : "true")
            .prop("hidden", !isOpen);
    });

    updateToolsFilterQuickStates();
}

function setActiveToolsFilterEditor(filterId, { forceOpen = false } = {}) {
    const normalized = normalizeToolsFilterId(filterId);
    if (!normalized) {
        activeToolsFilterEditor = "";
        updateToolsFilterEditorUI();
        return;
    }

    if (!forceOpen && activeToolsFilterEditor === normalized) {
        activeToolsFilterEditor = "";
    } else {
        activeToolsFilterEditor = normalized;
    }

    updateToolsFilterEditorUI();
}

async function clearFilterById(filterId) {
    const normalized = normalizeToolsFilterId(filterId);
    if (!normalized) return;
    if (!isFilterAppliedById(normalized)) return;

    if (normalized === "liquidity") {
        await resetVolumeFilter();
    } else if (normalized === "funding") {
        await resetFundingFilter();
    } else if (normalized === "oi") {
        await resetOiFilter();
    } else if (normalized === "pattern") {
        resetPatternFilter();
    }
}

function formatElapsed(ms) {
    const totalSeconds = Math.max(1, Math.floor(ms / 1000));
    if (totalSeconds < 60) return `${totalSeconds}s`;

    const totalMinutes = Math.floor(totalSeconds / 60);
    if (totalMinutes < 60) return `${totalMinutes}m`;

    const totalHours = Math.floor(totalMinutes / 60);
    if (totalHours < 24) return `${totalHours}h`;

    const totalDays = Math.floor(totalHours / 24);
    return `${totalDays}d`;
}

function formatCompactNumber(num) {
    if (!Number.isFinite(num)) return "0";
    return new Intl.NumberFormat("en-US", {
        notation: "compact",
        maximumFractionDigits: 2,
    }).format(num);
}

function formatIntegerNumber(num) {
    if (!Number.isFinite(num)) return "0";
    return new Intl.NumberFormat("en-US", {
        maximumFractionDigits: 0,
    }).format(Math.round(num));
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatVolumeThresholdLabel(threshold) {
    if (!Number.isFinite(threshold) || threshold <= 0) return "0";
    return `${formatCompactNumber(threshold)} (${formatIntegerNumber(threshold)})`;
}

function parseVolumeThresholdInput(rawValue) {
    const text = String(rawValue || "").trim();
    if (!text) return 0;

    const normalized = text
        .replace(/\s+/g, "")
        .replace(/,/g, "")
        .replace(/_/g, "")
        .toLowerCase();
    const match = normalized.match(/^(\d+(\.\d+)?)([kmb])?$/);
    if (!match) return null;

    const base = Number(match[1]);
    if (!Number.isFinite(base) || base < 0) return null;

    const suffix = match[3];
    let multiplier = 1;
    if (suffix === "k") multiplier = 1_000;
    else if (suffix === "m") multiplier = 1_000_000;
    else if (suffix === "b") multiplier = 1_000_000_000;

    const parsed = Math.round(base * multiplier);
    if (!Number.isFinite(parsed) || parsed < 0) return null;
    return parsed;
}

function parseFundingRateInput(rawValue) {
    const text = String(rawValue || "").trim();
    if (!text) return null;

    const normalized = text.replace(/[%\s,_]/g, "");
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return undefined;

    return parsed / 100;
}

function isNumberEqual(a, b, epsilon = FUNDING_RATE_EPSILON) {
    return Math.abs(Number(a) - Number(b)) <= epsilon;
}

function fundingBoundsEqual(minA, maxA, minB, maxB) {
    const hasMinA = Number.isFinite(minA);
    const hasMaxA = Number.isFinite(maxA);
    const hasMinB = Number.isFinite(minB);
    const hasMaxB = Number.isFinite(maxB);

    if (hasMinA !== hasMinB || hasMaxA !== hasMaxB) return false;
    if (hasMinA && !isNumberEqual(minA, minB)) return false;
    if (hasMaxA && !isNumberEqual(maxA, maxB)) return false;
    return true;
}

function formatFundingRatePercent(rate, maximumFractionDigits = 4) {
    if (!Number.isFinite(rate)) return "0%";
    return new Intl.NumberFormat("en-US", {
        style: "percent",
        maximumFractionDigits,
        minimumFractionDigits: 0,
    }).format(rate);
}

function formatFundingInputValue(rate) {
    if (!Number.isFinite(rate)) return "";
    const percentValue = rate * 100;
    return String(percentValue.toFixed(4)).replace(/\.?0+$/, "");
}

function hasAnyFundingBound(minRate, maxRate) {
    return Number.isFinite(minRate) || Number.isFinite(maxRate);
}

function hasFundingFilter() {
    return hasAnyFundingBound(minFundingRateFilter, maxFundingRateFilter);
}

function setFundingInputDisplay(minRate, maxRate) {
    $("#minFundingRateInput").val(formatFundingInputValue(minRate));
    $("#maxFundingRateInput").val(formatFundingInputValue(maxRate));
}

function setFundingInputsValidity(isValid) {
    $("#minFundingRateInput")
        .attr("aria-invalid", isValid ? "false" : "true")
        .toggleClass("is-invalid", !isValid);
    $("#maxFundingRateInput")
        .attr("aria-invalid", isValid ? "false" : "true")
        .toggleClass("is-invalid", !isValid);
}

function getFundingBoundsFromInput() {
    const minRaw = $("#minFundingRateInput").val();
    const maxRaw = $("#maxFundingRateInput").val();
    const minParsed = parseFundingRateInput(minRaw);
    const maxParsed = parseFundingRateInput(maxRaw);

    if (minParsed === undefined || maxParsed === undefined) {
        return { isValid: false, min: null, max: null, reason: "Invalid funding rate input" };
    }

    const minRate = minParsed === null ? null : minParsed;
    const maxRate = maxParsed === null ? null : maxParsed;

    if (
        Number.isFinite(minRate) &&
        Number.isFinite(maxRate) &&
        Number(minRate) > Number(maxRate)
    ) {
        return { isValid: false, min: minRate, max: maxRate, reason: "Min funding cannot be greater than max funding" };
    }

    return { isValid: true, min: minRate, max: maxRate, reason: "" };
}

function fundingRateMatchesBounds(rate, minRate, maxRate) {
    if (!Number.isFinite(rate)) return false;
    if (Number.isFinite(minRate) && rate < Number(minRate)) return false;
    if (Number.isFinite(maxRate) && rate > Number(maxRate)) return false;
    return true;
}

function fundingRateMatches(rate) {
    return fundingRateMatchesBounds(rate, minFundingRateFilter, maxFundingRateFilter);
}

function passesFundingFilter(coin) {
    if (!hasFundingFilter()) return true;
    const snapshot = fundingSnapshotBySymbol.get(coin.symbol);
    const rate = Number(snapshot?.fundingRate);
    return fundingRateMatches(rate);
}

function formatFundingFilterLabel(minRate = minFundingRateFilter, maxRate = maxFundingRateFilter) {
    const hasMin = Number.isFinite(minRate);
    const hasMax = Number.isFinite(maxRate);

    if (!hasMin && !hasMax) return "off";
    if (hasMin && hasMax) {
        return `${formatFundingRatePercent(Number(minRate))} to ${formatFundingRatePercent(Number(maxRate))}`;
    }
    if (hasMin) return `>= ${formatFundingRatePercent(Number(minRate))}`;
    return `<= ${formatFundingRatePercent(Number(maxRate))}`;
}

function getFundingMatchedCountByBounds(minRate, maxRate) {
    if (allCoins.length === 0) return 0;
    if (!hasAnyFundingBound(minRate, maxRate)) return allCoins.length;
    if (fundingSnapshotBySymbol.size === 0) return 0;

    return allCoins.filter((coin) => {
        const snapshot = fundingSnapshotBySymbol.get(coin.symbol);
        const rate = Number(snapshot?.fundingRate);
        return fundingRateMatchesBounds(rate, minRate, maxRate);
    }).length;
}

function getFundingMatchedCount() {
    return getFundingMatchedCountByBounds(minFundingRateFilter, maxFundingRateFilter);
}

function setFundingPreviewMessage(message, tone = "neutral") {
    const $preview = $("#fundingPreviewState");
    if ($preview.length === 0) return;
    $preview.text(message);
    $preview.attr("data-tone", tone);
}

function updateFundingPresetButtons() {
    const bounds = getFundingBoundsFromInput();
    if (!bounds.isValid) {
        $(".funding-preset-chip")
            .attr("data-active", "false")
            .attr("aria-pressed", "false");
        return;
    }

    $(".funding-preset-chip").each(function () {
        const presetMin = parseFundingRateInput($(this).attr("data-funding-min") || "");
        const presetMax = parseFundingRateInput($(this).attr("data-funding-max") || "");
        const isActive = fundingBoundsEqual(bounds.min, bounds.max, presetMin, presetMax);
        $(this)
            .attr("data-active", isActive ? "true" : "false")
            .attr("aria-pressed", isActive ? "true" : "false");
    });
}

function updateFundingMarketStats() {
    const $positive = $("#fundingPositiveStat");
    const $negative = $("#fundingNegativeStat");
    const $extreme = $("#fundingExtremeStat");
    if ($positive.length === 0 || $negative.length === 0 || $extreme.length === 0) return;

    if (fundingSnapshotBySymbol.size === 0) {
        $positive.text("-");
        $negative.text("-");
        $extreme.text("-");
        return;
    }

    let positive = 0;
    let negative = 0;
    let extreme = 0;

    fundingSnapshotBySymbol.forEach((snapshot) => {
        const rate = Number(snapshot?.fundingRate);
        if (!Number.isFinite(rate)) return;

        if (rate > 0) positive += 1;
        if (rate < 0) negative += 1;
        if (Math.abs(rate) >= FUNDING_EXTREME_RATE_ABS) extreme += 1;
    });

    const total = fundingSnapshotBySymbol.size;
    $positive.text(`${positive}/${total}`);
    $negative.text(`${negative}/${total}`);
    $extreme.text(`${extreme}/${total}`);
}

function updateFundingPreviewState() {
    const bounds = getFundingBoundsFromInput();
    const hasInputValue =
        String($("#minFundingRateInput").val() || "").trim().length > 0 ||
        String($("#maxFundingRateInput").val() || "").trim().length > 0;

    updateFundingPresetButtons();
    updateFundingMarketStats();

    if (!bounds.isValid) {
        setFundingInputsValidity(false);
        setFundingPreviewMessage("Preview: invalid funding value", "danger");
        return;
    }

    setFundingInputsValidity(true);

    if (allCoins.length === 0) {
        setFundingPreviewMessage("Preview: load symbols first", "neutral");
        return;
    }

    if (hasAnyFundingBound(bounds.min, bounds.max) && fundingSnapshotBySymbol.size === 0) {
        if (isLoadingFundingSnapshot) {
            setFundingPreviewMessage("Preview: loading funding snapshot…", "neutral");
            return;
        }

        const message = hasInputValue
            ? "Preview unavailable: click Apply or Refresh funding"
            : "Preview: set range or use presets";
        setFundingPreviewMessage(message, "warning");
        return;
    }

    const matched = getFundingMatchedCountByBounds(bounds.min, bounds.max);
    const total = allCoins.length;
    const isApplied = fundingBoundsEqual(
        bounds.min,
        bounds.max,
        minFundingRateFilter,
        maxFundingRateFilter,
    );

    if (!hasAnyFundingBound(bounds.min, bounds.max)) {
        const label = isApplied ? "Applied" : "Preview";
        setFundingPreviewMessage(`${label}: all ${total} symbols`, isApplied ? "success" : "neutral");
        return;
    }

    if (matched <= 0) {
        const label = isApplied ? "Applied" : "Preview";
        setFundingPreviewMessage(
            `${label}: no symbols in ${formatFundingFilterLabel(bounds.min, bounds.max)}`,
            "warning",
        );
        return;
    }

    const label = isApplied ? "Applied" : "Preview";
    setFundingPreviewMessage(
        `${label}: ${matched}/${total} symbols in ${formatFundingFilterLabel(bounds.min, bounds.max)}`,
        isApplied ? "success" : "neutral",
    );
}

function setVolumeInputDisplay(threshold) {
    const $input = $("#minVolumeInput");
    if ($input.length === 0) return;
    $input.val(threshold > 0 ? formatIntegerNumber(threshold) : "");
}

function getVolumeInputThreshold() {
    return parseVolumeThresholdInput($("#minVolumeInput").val());
}

function setVolumeInputValidity(isValid) {
    const $input = $("#minVolumeInput");
    if ($input.length === 0) return;

    $input.attr("aria-invalid", isValid ? "false" : "true");
    $input.toggleClass("is-invalid", !isValid);
}

function setOiInputDisplay(threshold) {
    const $input = $("#minOiInput");
    if ($input.length === 0) return;
    $input.val(threshold > 0 ? formatIntegerNumber(threshold) : "");
}

function getOiInputThreshold() {
    return parseVolumeThresholdInput($("#minOiInput").val());
}

function setOiInputValidity(isValid) {
    const $input = $("#minOiInput");
    if ($input.length === 0) return;

    $input.attr("aria-invalid", isValid ? "false" : "true");
    $input.toggleClass("is-invalid", !isValid);
}

function setOiPreviewMessage(message, tone = "neutral") {
    const $preview = $("#oiPreviewState");
    if ($preview.length === 0) return;

    $preview.text(message);
    $preview.attr("data-tone", tone);
}

function getMatchedCoinCountByOiThreshold(threshold) {
    if (!Array.isArray(allCoins) || allCoins.length === 0) return 0;
    if (threshold <= 0) return allCoins.length;
    if (oiSnapshotBySymbol.size === 0) return null;

    let matched = 0;
    allCoins.forEach((coin) => {
        const snapshot = oiSnapshotBySymbol.get(coin.symbol);
        const oiNotional = Number(snapshot?.openInterestNotional || 0);
        if (Number.isFinite(oiNotional) && oiNotional >= threshold) {
            matched += 1;
        }
    });

    return matched;
}

function updateOiPresetButtons() {
    const parsed = getOiInputThreshold();
    $("#oiPresetChips .volume-preset-chip").each(function () {
        const threshold = Number($(this).data("oiThreshold") || 0);
        const isActive = parsed !== null && threshold === parsed;
        $(this)
            .attr("data-active", isActive ? "true" : "false")
            .attr("aria-pressed", isActive ? "true" : "false");
    });
}

function updateOiPreviewState() {
    const rawValue = String($("#minOiInput").val() || "").trim();
    const parsed = getOiInputThreshold();
    const hasValue = rawValue.length > 0;

    updateOiPresetButtons();

    if (parsed === null) {
        setOiInputValidity(false);
        setOiPreviewMessage("Preview: invalid value. Example: 50m or 50,000,000", "danger");
        return;
    }

    setOiInputValidity(true);

    if (allCoins.length === 0) {
        setOiPreviewMessage("Preview: load symbols first", "neutral");
        return;
    }

    const threshold = parsed;
    if (threshold > 0 && oiSnapshotBySymbol.size === 0) {
        if (isLoadingOiSnapshot) {
            setOiPreviewMessage("Preview: loading OI snapshot…", "neutral");
            return;
        }
        const message = hasValue
            ? "Preview unavailable: click Apply or Refresh OI"
            : "Preview: enter a threshold or pick a preset";
        setOiPreviewMessage(message, "warning");
        return;
    }

    const matched = getMatchedCoinCountByOiThreshold(threshold);
    if (matched === null) {
        setOiPreviewMessage("Preview unavailable: OI snapshot missing", "warning");
        return;
    }

    const total = allCoins.length;
    const isApplied = threshold === minOiNotionalFilter;
    if (threshold <= 0) {
        const label = isApplied ? "Applied" : "Preview";
        setOiPreviewMessage(`${label}: all ${total} symbols`, isApplied ? "success" : "neutral");
        return;
    }

    if (matched <= 0) {
        const label = isApplied ? "Applied" : "Preview";
        setOiPreviewMessage(
            `${label}: no symbols match >= ${formatVolumeThresholdLabel(threshold)} USDT OI`,
            "warning",
        );
        return;
    }

    const label = isApplied ? "Applied" : "Preview";
    setOiPreviewMessage(
        `${label}: ${matched}/${total} symbols >= ${formatVolumeThresholdLabel(threshold)} USDT OI`,
        isApplied ? "success" : "neutral",
    );
}

function setVolumePreviewMessage(message, tone = "neutral") {
    const $preview = $("#volumePreviewState");
    if ($preview.length === 0) return;

    $preview.text(message);
    $preview.attr("data-tone", tone);
}

function getMatchedCoinCountByThreshold(threshold) {
    if (!Array.isArray(allCoins) || allCoins.length === 0) return 0;
    if (threshold <= 0) return allCoins.length;
    if (marketSnapshotBySymbol.size === 0) return null;

    let matched = 0;
    allCoins.forEach((coin) => {
        const snapshot = marketSnapshotBySymbol.get(coin.symbol);
        const quoteVolume = Number(snapshot?.quoteVolume24h || 0);
        if (Number.isFinite(quoteVolume) && quoteVolume >= threshold) {
            matched += 1;
        }
    });

    return matched;
}

function updateVolumePresetButtons() {
    const parsed = getVolumeInputThreshold();
    $(".volume-preset-chip").each(function () {
        const threshold = Number($(this).data("volumeThreshold") || 0);
        const isActive = parsed !== null && threshold === parsed;
        $(this)
            .attr("data-active", isActive ? "true" : "false")
            .attr("aria-pressed", isActive ? "true" : "false");
    });
}

function updateVolumePreviewState() {
    const rawValue = String($("#minVolumeInput").val() || "").trim();
    const parsed = getVolumeInputThreshold();
    const hasValue = rawValue.length > 0;

    if (parsed === null) {
        setVolumeInputValidity(false);
        setVolumePreviewMessage("Preview: invalid value. Example: 5m or 5,000,000", "danger");
        return;
    }

    setVolumeInputValidity(true);

    if (allCoins.length === 0) {
        setVolumePreviewMessage("Preview: load symbols first", "neutral");
        return;
    }

    const threshold = parsed;
    if (threshold > 0 && marketSnapshotBySymbol.size === 0) {
        if (isLoadingMarketSnapshot) {
            setVolumePreviewMessage("Preview: loading 24h snapshot…", "neutral");
            return;
        }
        const message = hasValue
            ? "Preview unavailable: click Apply or Refresh snapshot"
            : "Preview: enter a threshold or pick a preset";
        setVolumePreviewMessage(message, "warning");
        return;
    }

    const matched = getMatchedCoinCountByThreshold(threshold);
    if (matched === null) {
        setVolumePreviewMessage("Preview unavailable: market snapshot missing", "warning");
        return;
    }

    const total = allCoins.length;
    const isAppliedValue = threshold === minVolume24hFilter;

    if (threshold <= 0) {
        const label = isAppliedValue ? "Applied" : "Preview";
        setVolumePreviewMessage(`${label}: all ${total} symbols`, isAppliedValue ? "success" : "neutral");
        return;
    }

    if (matched <= 0) {
        const label = isAppliedValue ? "Applied" : "Preview";
        setVolumePreviewMessage(
            `${label}: no symbols match >= ${formatVolumeThresholdLabel(threshold)} USDT`,
            "warning",
        );
        return;
    }

    const label = isAppliedValue ? "Applied" : "Preview";
    setVolumePreviewMessage(
        `${label}: ${matched}/${total} symbols >= ${formatVolumeThresholdLabel(threshold)} USDT`,
        isAppliedValue ? "success" : "neutral",
    );
}

function hasPatternFilter() {
    return String(activePatternId || "").trim().length > 0;
}

function passesBaseFilters(coin) {
    if (minVolume24hFilter > 0) {
        const marketSnapshot = marketSnapshotBySymbol.get(coin.symbol);
        const quoteVolume = Number(marketSnapshot?.quoteVolume24h || 0);
        if (!Number.isFinite(quoteVolume) || quoteVolume < minVolume24hFilter) {
            return false;
        }
    }

    if (hasFundingFilter() && !passesFundingFilter(coin)) {
        return false;
    }

    if (minOiNotionalFilter > 0) {
        const oiSnapshot = oiSnapshotBySymbol.get(coin.symbol);
        const oiNotional = Number(oiSnapshot?.openInterestNotional || 0);
        if (!Number.isFinite(oiNotional) || oiNotional < minOiNotionalFilter) {
            return false;
        }
    }

    return true;
}

function passesPatternFilter(coin) {
    if (!hasPatternFilter()) return true;
    return patternMatchedSymbols.has(coin.symbol);
}

function getBaseFilteredCoins(coins) {
    if (!Array.isArray(coins) || coins.length === 0) return [];
    return coins.filter((coin) => passesBaseFilters(coin));
}

function getActiveCoinsByFilters(coins) {
    if (!Array.isArray(coins) || coins.length === 0) return [];
    return coins.filter((coin) => passesBaseFilters(coin) && passesPatternFilter(coin));
}

function getActiveCoins() {
    return getActiveCoinsByFilters(allCoins);
}

function getActiveCoinSymbolSet() {
    return new Set(getActiveCoins().map((coin) => coin.symbol));
}

function updateVolumeFilterState() {
    const $state = $("#volumeFilterState");
    if ($state.length === 0) {
        updateToolsFilterQuickStates();
        return;
    }

    if (minVolume24hFilter <= 0) {
        $state.text("Active filter: off");
        updateToolsFilterQuickStates();
        return;
    }

    const activeCount = getActiveCoins().length;
    const totalCount = allCoins.length;
    $state.text(
        `Active filter: >= ${formatVolumeThresholdLabel(minVolume24hFilter)} USDT (${activeCount}/${totalCount})`,
    );
    updateToolsFilterQuickStates();
}

function updateFundingFilterState() {
    const $state = $("#fundingFilterState");
    if ($state.length === 0) {
        updateToolsFilterQuickStates();
        return;
    }

    if (!hasFundingFilter()) {
        $state.text("Funding filter: off");
        updateToolsFilterQuickStates();
        return;
    }

    if (fundingSnapshotBySymbol.size === 0) {
        $state.text(`Funding filter: ${formatFundingFilterLabel()} (snapshot required)`);
        updateToolsFilterQuickStates();
        return;
    }

    const matchedCount = getFundingMatchedCount();
    const totalCount = allCoins.length;
    $state.text(`Funding filter: ${formatFundingFilterLabel()} (${matchedCount}/${totalCount})`);
    updateToolsFilterQuickStates();
}

function updateOiFilterState() {
    const $state = $("#oiFilterState");
    if ($state.length === 0) {
        updateToolsFilterQuickStates();
        return;
    }

    if (minOiNotionalFilter <= 0) {
        $state.text("OI filter: off");
        updateToolsFilterQuickStates();
        return;
    }

    if (oiSnapshotBySymbol.size === 0) {
        $state.text(`OI filter: >= ${formatVolumeThresholdLabel(minOiNotionalFilter)} USDT (snapshot required)`);
        updateToolsFilterQuickStates();
        return;
    }

    const matchedCount = getMatchedCoinCountByOiThreshold(minOiNotionalFilter) ?? 0;
    const totalCount = allCoins.length;
    $state.text(`OI filter: >= ${formatVolumeThresholdLabel(minOiNotionalFilter)} USDT (${matchedCount}/${totalCount})`);
    updateToolsFilterQuickStates();
}

function getPatternById(patternId) {
    return patternCatalog.find((pattern) => pattern.id === patternId) || null;
}

function getPatternDisplayName(patternId) {
    const pattern = getPatternById(patternId);
    if (!pattern) return patternId || "";
    return pattern.displayName || pattern.id;
}

function updatePatternSelectionHint() {
    const $hint = $("#patternSelectionHint");
    if ($hint.length === 0) return;

    if (!hasPatternFilter()) {
        $hint.text("Select one pattern icon to filter symbols.");
        return;
    }

    const active = getPatternById(activePatternId);
    if (!active) {
        $hint.text("Selected pattern is unavailable.");
        return;
    }

    const category = String(active.category || "").toLowerCase();
    const candles = Number(active.candles || 1);
    $hint.text(
        `Selected: ${active.displayName} (${category}) • needs ${candles} candle${candles > 1 ? "s" : ""}.`,
    );
}

function updatePatternFilterState() {
    const $state = $("#patternFilterState");
    if ($state.length === 0) {
        updateToolsFilterQuickStates();
        return;
    }

    if (!hasPatternFilter()) {
        $state.text("Pattern filter: off");
        updateToolsFilterQuickStates();
        return;
    }

    const baseCount = getBaseFilteredCoins(allCoins).length;
    const matchedCount = patternMatchedSymbols.size;
    $state.text(
        `Pattern filter: ${getPatternDisplayName(activePatternId)} (${matchedCount}/${baseCount})`,
    );
    updateToolsFilterQuickStates();
}

function updatePatternSnapshotMeta() {
    const $meta = $("#patternSnapshotMeta");
    if ($meta.length === 0) return;

    if (!hasPatternFilter()) {
        $meta.text("Snapshot: not scanned");
        return;
    }

    if (isLoadingPatternScan) {
        $meta.text("Snapshot: scanning pattern…");
        return;
    }

    if (patternScanLastUpdatedAt <= 0) {
        $meta.text("Snapshot: not scanned");
        return;
    }

    const ageMs = Date.now() - patternScanLastUpdatedAt;
    $meta.text(`Snapshot: updated ${formatElapsed(ageMs)} ago (${patternMatchedSymbols.size} matches)`);
}

function updatePatternScanVisualState() {
    const isLoading = Boolean(isLoadingPatternScan);
    const $grid = $("#patternIconGrid");
    if ($grid.length) {
        $grid.attr("data-loading", isLoading ? "true" : "false");
    }

    const $mainLoader = $("#patternScanMainLoader");
    if ($mainLoader.length) {
        if (isLoading) {
            const patternName = hasPatternFilter() ? getPatternDisplayName(activePatternId) : "pattern";
            $("#patternScanMainLoaderText").text(`Scanning ${patternName}…`);
            $mainLoader.removeClass("hidden").prop("hidden", false);
        } else {
            $mainLoader.addClass("hidden").prop("hidden", true);
        }
    }
}

function updateVolumeSnapshotMeta() {
    const $meta = $("#volumeSnapshotMeta");
    if ($meta.length === 0) return;

    if (isLoadingMarketSnapshot) {
        $meta.text("Snapshot: loading 24h market stats…");
        return;
    }

    if (marketSnapshotLastUpdatedAt <= 0 || marketSnapshotBySymbol.size === 0) {
        $meta.text("Snapshot: not loaded");
        return;
    }

    const ageMs = Date.now() - marketSnapshotLastUpdatedAt;
    $meta.text(`Snapshot: updated ${formatElapsed(ageMs)} ago (${marketSnapshotBySymbol.size} symbols)`);
}

function updateFundingSnapshotMeta() {
    const $meta = $("#fundingSnapshotMeta");
    if ($meta.length === 0) return;

    if (isLoadingFundingSnapshot) {
        $meta.text("Snapshot: loading funding stats…");
        return;
    }

    if (fundingSnapshotLastUpdatedAt <= 0 || fundingSnapshotBySymbol.size === 0) {
        $meta.text("Snapshot: not loaded");
        return;
    }

    const ageMs = Date.now() - fundingSnapshotLastUpdatedAt;
    $meta.text(`Snapshot: updated ${formatElapsed(ageMs)} ago (${fundingSnapshotBySymbol.size} symbols)`);
}

function updateOiSnapshotMeta() {
    const $meta = $("#oiSnapshotMeta");
    if ($meta.length === 0) return;

    if (isLoadingOiSnapshot) {
        $meta.text("Snapshot: loading open interest…");
        return;
    }

    if (oiSnapshotLastUpdatedAt <= 0 || oiSnapshotBySymbol.size === 0) {
        $meta.text("Snapshot: not loaded");
        return;
    }

    const ageMs = Date.now() - oiSnapshotLastUpdatedAt;
    $meta.text(`Snapshot: updated ${formatElapsed(ageMs)} ago (${oiSnapshotBySymbol.size} symbols)`);
}

async function fetchMarketSnapshot(forceRefresh = false) {
    if (isLoadingMarketSnapshot) return;

    const now = Date.now();
    const stillFresh =
        marketSnapshotBySymbol.size > 0 &&
        now - marketSnapshotLastUpdatedAt < MARKET_SNAPSHOT_CLIENT_CACHE_MS;

    if (!forceRefresh && stillFresh) return;

    isLoadingMarketSnapshot = true;
    updateVolumeSnapshotMeta();

    try {
        const res = await fetch("/api/market-snapshot");
        if (!res.ok) throw new Error(`Failed to fetch market snapshot (${res.status})`);

        const snapshot = await res.json();
        if (!Array.isArray(snapshot)) throw new Error("Unexpected market snapshot payload");

        marketSnapshotBySymbol = new Map(
            snapshot.map((item) => [String(item.symbol), item]),
        );
        marketSnapshotLastUpdatedAt = Date.now();

        updateVolumeFilterState();
        updateVolumeSnapshotMeta();
        updateVolumePreviewState();
        setStatus(`Loaded market snapshot for ${snapshot.length} symbols`);
    } catch (error) {
        console.error("Failed to fetch market snapshot:", error);
        setStatus("Failed to load market snapshot");
        updateVolumeSnapshotMeta();
        updateVolumePreviewState();
    } finally {
        isLoadingMarketSnapshot = false;
        updateVolumeSnapshotMeta();
        updateVolumePreviewState();
    }
}

async function fetchFundingSnapshot(forceRefresh = false) {
    if (isLoadingFundingSnapshot) return;

    const now = Date.now();
    const stillFresh =
        fundingSnapshotBySymbol.size > 0 &&
        now - fundingSnapshotLastUpdatedAt < FUNDING_SNAPSHOT_CLIENT_CACHE_MS;

    if (!forceRefresh && stillFresh) return;

    isLoadingFundingSnapshot = true;
    updateFundingSnapshotMeta();

    try {
        const res = await fetch("/api/funding-snapshot");
        if (!res.ok) throw new Error(`Failed to fetch funding snapshot (${res.status})`);

        const snapshot = await res.json();
        if (!Array.isArray(snapshot)) throw new Error("Unexpected funding snapshot payload");

        fundingSnapshotBySymbol = new Map(
            snapshot.map((item) => [String(item.symbol), item]),
        );
        fundingSnapshotLastUpdatedAt = Date.now();

        updateFundingFilterState();
        updateFundingSnapshotMeta();
        updateFundingPreviewState();
        setStatus(`Loaded funding snapshot for ${snapshot.length} symbols`);
    } catch (error) {
        console.error("Failed to fetch funding snapshot:", error);
        setStatus("Failed to load funding snapshot");
        updateFundingSnapshotMeta();
        updateFundingPreviewState();
    } finally {
        isLoadingFundingSnapshot = false;
        updateFundingSnapshotMeta();
        updateFundingPreviewState();
    }
}

async function fetchOiSnapshot(symbols = [], forceRefresh = false) {
    if (isLoadingOiSnapshot) return;

    const requestedSymbols = Array.from(
        new Set(
            (Array.isArray(symbols) ? symbols : [])
                .map((symbol) => String(symbol || "").trim().toUpperCase())
                .filter(Boolean),
        ),
    );

    const scopedSymbols =
        requestedSymbols.length > 0
            ? requestedSymbols
            : allCoins.map((coin) => coin.symbol);

    if (scopedSymbols.length === 0) return;

    const now = Date.now();
    const hasAllRequested = scopedSymbols.every((symbol) => oiSnapshotBySymbol.has(symbol));
    const stillFresh =
        hasAllRequested &&
        oiSnapshotBySymbol.size > 0 &&
        now - oiSnapshotLastUpdatedAt < OI_SNAPSHOT_CLIENT_CACHE_MS;

    if (!forceRefresh && stillFresh) return;

    isLoadingOiSnapshot = true;
    updateOiSnapshotMeta();

    try {
        const params = new URLSearchParams();
        params.set("symbols", scopedSymbols.join(","));
        const res = await fetch(`/api/oi-snapshot?${params.toString()}`);
        if (!res.ok) throw new Error(`Failed to fetch OI snapshot (${res.status})`);

        const snapshot = await res.json();
        if (!Array.isArray(snapshot)) throw new Error("Unexpected OI snapshot payload");

        snapshot.forEach((item) => {
            if (!item || !item.symbol) return;
            oiSnapshotBySymbol.set(String(item.symbol), item);
        });
        oiSnapshotLastUpdatedAt = Date.now();

        updateOiFilterState();
        updateOiSnapshotMeta();
        updateOiPreviewState();
        setStatus(`Loaded OI snapshot for ${snapshot.length} symbols`);
    } catch (error) {
        console.error("Failed to fetch OI snapshot:", error);
        setStatus("Failed to load OI snapshot");
        updateOiSnapshotMeta();
        updateOiPreviewState();
    } finally {
        isLoadingOiSnapshot = false;
        updateOiSnapshotMeta();
        updateOiPreviewState();
    }
}

function normalizePatternCategoryFilter(category) {
    const value = String(category || "").trim();
    if (value === "Bullish" || value === "Bearish" || value === "Neutral" || value === "All") {
        return value;
    }
    return "All";
}

function getPatternCardTone(category) {
    const normalized = String(category || "").toLowerCase();
    if (normalized === "bullish") return "bullish";
    if (normalized === "bearish") return "bearish";
    return "neutral";
}

function updatePatternCategoryChips() {
    const normalizedCategory = normalizePatternCategoryFilter(patternCategoryFilter);
    patternCategoryFilter = normalizedCategory;

    $("#patternCategoryChips .pattern-category-chip").each(function () {
        const category = normalizePatternCategoryFilter($(this).attr("data-pattern-category"));
        const isActive = category === normalizedCategory;
        $(this)
            .attr("data-active", isActive ? "true" : "false")
            .attr("aria-pressed", isActive ? "true" : "false");
    });
}

function renderPatternIconGrid() {
    const $grid = $("#patternIconGrid");
    if ($grid.length === 0) return;

    const normalizedCategory = normalizePatternCategoryFilter(patternCategoryFilter);
    patternCategoryFilter = normalizedCategory;

    const visiblePatterns = patternCatalog
        .filter((pattern) => {
            if (normalizedCategory === "All") return true;
            return String(pattern.category || "Neutral") === normalizedCategory;
        })
        .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")));

    if (!Array.isArray(visiblePatterns) || visiblePatterns.length === 0) {
        $grid.html('<div class="pattern-grid-empty">No patterns available in this group.</div>');
        return;
    }

    const cards = visiblePatterns
        .map((pattern) => {
            const patternId = String(pattern.id || "").trim();
            const displayName = String(pattern.displayName || patternId);
            const category = String(pattern.category || "Neutral");
            const candles = Number(pattern.candles || 1);
            const iconPath = String(pattern.iconPath || "").trim();
            const isActive = patternId === activePatternId;
            const activeAttr = isActive ? "true" : "false";

            return `
                <button
                    type="button"
                    class="pattern-icon-card"
                    data-pattern-id="${escapeHtml(patternId)}"
                    data-active="${activeAttr}"
                    data-tone="${getPatternCardTone(category)}"
                    aria-pressed="${activeAttr}"
                    aria-selected="${activeAttr}"
                    aria-label="${escapeHtml(displayName)} pattern"
                    title="${escapeHtml(displayName)}"
                >
                    <div class="pattern-icon-thumb-wrap">
                        <img class="pattern-icon-thumb" src="${escapeHtml(iconPath)}" alt="${escapeHtml(displayName)} icon" loading="lazy" decoding="async" width="84" height="44" />
                    </div>
                    <div class="pattern-icon-name">${escapeHtml(displayName)}</div>
                    <div class="pattern-icon-meta">${escapeHtml(category)} • ${candles}C</div>
                </button>
            `;
        })
        .join("");

    $grid.html(cards);
}

function renderPatternSelectOptions() {
    const $select = $("#patternSelect");
    if ($select.length === 0) return;

    const grouped = {
        Bullish: [],
        Bearish: [],
        Neutral: [],
    };

    patternCatalog.forEach((pattern) => {
        const category = String(pattern.category || "");
        if (grouped[category]) {
            grouped[category].push(pattern);
        }
    });

    const options = ['<option value="">Off</option>'];
    Object.entries(grouped).forEach(([category, patterns]) => {
        if (!Array.isArray(patterns) || patterns.length === 0) return;
        options.push(`<optgroup label="${escapeHtml(category)}">`);
        patterns
            .sort((a, b) => String(a.displayName || "").localeCompare(String(b.displayName || "")))
            .forEach((pattern) => {
                const candles = Number(pattern.candles || 1);
                const label = `${pattern.displayName} (${candles})`;
                options.push(`<option value="${escapeHtml(pattern.id)}">${escapeHtml(label)}</option>`);
            });
        options.push("</optgroup>");
    });

    $select.html(options.join(""));
    $select.val(activePatternId || "");
    updatePatternCategoryChips();
    renderPatternIconGrid();
    updatePatternSelectionHint();
}

async function fetchPatternCatalog(forceRefresh = false) {
    if (isLoadingPatternCatalog) return;
    if (!forceRefresh && Array.isArray(patternCatalog) && patternCatalog.length > 0) {
        renderPatternSelectOptions();
        return;
    }

    isLoadingPatternCatalog = true;
    try {
        const res = await fetch("/api/patterns");
        if (!res.ok) throw new Error(`Failed to fetch pattern catalog (${res.status})`);

        const payload = await res.json();
        if (!Array.isArray(payload)) throw new Error("Unexpected pattern catalog payload");

        patternCatalog = payload
            .filter((item) => item && item.id)
            .map((item) => ({
                id: String(item.id),
                displayName: String(item.displayName || item.id),
                category: String(item.category || "Neutral"),
                candles: Number(item.candles || 1),
                iconPath: String(item.iconPath || ""),
            }));

        renderPatternSelectOptions();
        setStatus(`Loaded ${patternCatalog.length} candlestick patterns`);
    } catch (error) {
        console.error("Failed to fetch pattern catalog:", error);
        setStatus("Failed to load pattern catalog");
    } finally {
        isLoadingPatternCatalog = false;
    }
}

function buildPatternScanCacheKey(symbols, interval, patternId) {
    const symbolKey = Array.from(
        new Set(
            (Array.isArray(symbols) ? symbols : [])
                .map((symbol) => String(symbol || "").trim().toUpperCase())
                .filter(Boolean),
        ),
    )
        .sort()
        .join(",");

    return `${patternId}|${interval}|${symbolKey}`;
}

async function scanActivePattern(forceRefresh = false) {
    if (!hasPatternFilter()) {
        patternMatchedSymbols = new Set();
        patternScanCacheKey = "";
        patternScanLastUpdatedAt = 0;
        isLoadingPatternScan = false;
        updatePatternFilterState();
        updatePatternSnapshotMeta();
        updatePatternScanVisualState();
        return;
    }

    if (isLoadingPatternScan && patternScanPromise) {
        await patternScanPromise.catch(() => undefined);
        if (!hasPatternFilter()) return;
    }

    const activeCoins = getBaseFilteredCoins(allCoins);
    const symbols = activeCoins.map((coin) => coin.symbol);
    const interval = String($("#interval").val() || currentChartInterval || "15m");
    const cacheKey = buildPatternScanCacheKey(symbols, interval, activePatternId);

    if (
        !forceRefresh &&
        patternScanCacheKey === cacheKey &&
        patternScanLastUpdatedAt > 0 &&
        Date.now() - patternScanLastUpdatedAt < PATTERN_SCAN_CLIENT_CACHE_MS
    ) {
        updatePatternFilterState();
        updatePatternSnapshotMeta();
        updatePatternScanVisualState();
        return;
    }

    if (symbols.length === 0) {
        patternMatchedSymbols = new Set();
        patternScanCacheKey = cacheKey;
        patternScanLastUpdatedAt = Date.now();
        isLoadingPatternScan = false;
        updatePatternFilterState();
        updatePatternSnapshotMeta();
        updatePatternScanVisualState();
        return;
    }

    isLoadingPatternScan = true;
    updatePatternScanVisualState();
    updatePatternSnapshotMeta();
    setStatus(`Scanning pattern ${getPatternDisplayName(activePatternId)}…`);
    const token = ++patternScanToken;
    const currentPromise = (async () => {
        try {
            const res = await fetch("/api/pattern-scan", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    symbols,
                    interval,
                    patternId: activePatternId,
                    forceRefresh,
                }),
            });
            if (!res.ok) throw new Error(`Failed to scan pattern (${res.status})`);

            const result = await res.json();
            const matchedSymbols = Array.isArray(result?.matchedSymbols)
                ? result.matchedSymbols.map((symbol) => String(symbol || "").trim().toUpperCase()).filter(Boolean)
                : [];

            if (token !== patternScanToken) return;

            patternMatchedSymbols = new Set(matchedSymbols);
            patternScanCacheKey = cacheKey;
            patternScanLastUpdatedAt = Date.now();
            updatePatternFilterState();
            updatePatternSnapshotMeta();
        } catch (error) {
            if (token !== patternScanToken) return;
            console.error("Failed to scan pattern:", error);
            patternMatchedSymbols = new Set();
            patternScanCacheKey = "";
            patternScanLastUpdatedAt = 0;
            updatePatternFilterState();
            updatePatternSnapshotMeta();
            setStatus("Failed to scan pattern");
        } finally {
            if (token === patternScanToken) {
                isLoadingPatternScan = false;
                updatePatternSnapshotMeta();
                updatePatternScanVisualState();
            }
            if (patternScanPromise === currentPromise) {
                patternScanPromise = null;
            }
        }
    })();

    patternScanPromise = currentPromise;
    await currentPromise;
}

async function applyPatternFilterFromInput(nextPatternId = null) {
    const selectedPatternId =
        nextPatternId === null
            ? String($("#patternSelect").val() || "").trim()
            : String(nextPatternId || "").trim();

    if (patternCatalog.length === 0 && !isLoadingPatternCatalog) {
        await fetchPatternCatalog(false);
    }

    if (allCoins.length === 0 && !isLoading) {
        await fetchCoins();
    }

    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    if (selectedPatternId && !getPatternById(selectedPatternId)) {
        setStatus("Selected pattern is not available");
        return;
    }

    activePatternId = selectedPatternId;
    $("#patternSelect").val(activePatternId || "");
    if (!hasPatternFilter()) {
        patternMatchedSymbols = new Set();
        patternScanCacheKey = "";
        patternScanLastUpdatedAt = 0;
    } else {
        await scanActivePattern(true);
    }

    syncSelectionToActiveCoins({ allowEmpty: false });
    hideSuggestions();
    renderCoins(allCoins, $("#coinSearch").val() || "");
    renderPatternIconGrid();
    updatePatternSelectionHint();
    updatePatternFilterState();
    updatePatternSnapshotMeta();

    if (hasPatternFilter()) {
        const activeCount = getActiveCoins().length;
        if (activeCount === 0) {
            setStatus(`No symbols match pattern ${getPatternDisplayName(activePatternId)}`);
        } else {
            setStatus(
                `Pattern filter applied: ${getPatternDisplayName(activePatternId)} (${activeCount} symbols)`,
            );
        }
    } else {
        setStatus("Pattern filter disabled");
    }

    renderCharts();
}

function resetPatternFilter() {
    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    activePatternId = "";
    patternMatchedSymbols = new Set();
    patternScanCacheKey = "";
    patternScanLastUpdatedAt = 0;
    $("#patternSelect").val("");

    selectedCoins = new Set(getActiveCoins().map((coin) => coin.symbol));
    hideSuggestions();
    renderCoins(allCoins, $("#coinSearch").val() || "");
    renderPatternIconGrid();
    updatePatternSelectionHint();
    updatePatternFilterState();
    updatePatternSnapshotMeta();
    setStatus("Pattern filter reset");
    renderCharts();
}

function syncSelectionToActiveCoins({ allowEmpty = false } = {}) {
    const activeSet = getActiveCoinSymbolSet();
    if (activeSet.size === 0) {
        selectedCoins.clear();
        return;
    }

    const next = new Set(Array.from(selectedCoins).filter((symbol) => activeSet.has(symbol)));
    if (!allowEmpty && next.size === 0) {
        activeSet.forEach((symbol) => next.add(symbol));
    }

    selectedCoins = next;
}

async function applyVolumeFilterFromInput() {
    const parsed = getVolumeInputThreshold();
    if (parsed === null) {
        setStatus("Invalid volume threshold");
        updateVolumePreviewState();
        return;
    }

    if (allCoins.length === 0 && !isLoading) {
        await fetchCoins();
    }

    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    if (parsed > 0) {
        await fetchMarketSnapshot(false);
        if (marketSnapshotBySymbol.size === 0) {
            setStatus("Cannot apply volume filter without market snapshot");
            return;
        }
    }

    minVolume24hFilter = parsed;
    setVolumeInputDisplay(minVolume24hFilter);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    syncSelectionToActiveCoins({ allowEmpty: false });
    hideSuggestions();
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateVolumeFilterState();
    updateVolumePresetButtons();
    updateVolumePreviewState();

    const activeCount = getActiveCoins().length;
    if (minVolume24hFilter > 0) {
        if (activeCount === 0) {
            setStatus(
                `Volume filter applied, but no symbols match >= ${formatVolumeThresholdLabel(minVolume24hFilter)} USDT`,
            );
        } else {
            setStatus(
                `Volume filter applied: >= ${formatVolumeThresholdLabel(minVolume24hFilter)} USDT (${activeCount} symbols)`,
            );
        }
    } else {
        setStatus("Volume filter disabled");
    }

    renderCharts();
}

async function resetVolumeFilter() {
    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    minVolume24hFilter = 0;
    setVolumeInputDisplay(0);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    hideSuggestions();
    selectedCoins = new Set(getActiveCoins().map((c) => c.symbol));
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateVolumeFilterState();
    updateVolumePresetButtons();
    updateVolumePreviewState();
    setStatus("Volume filter reset");

    renderCharts();
}

async function applyFundingFilterFromInput() {
    const bounds = getFundingBoundsFromInput();
    if (!bounds.isValid) {
        setFundingInputsValidity(false);
        setStatus(bounds.reason || "Invalid funding filter");
        updateFundingPreviewState();
        return;
    }

    setFundingInputsValidity(true);

    if (allCoins.length === 0 && !isLoading) {
        await fetchCoins();
    }

    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    if (bounds.min !== null || bounds.max !== null) {
        await fetchFundingSnapshot(false);
        if (fundingSnapshotBySymbol.size === 0) {
            setStatus("Cannot apply funding filter without funding snapshot");
            return;
        }
    }

    minFundingRateFilter = bounds.min;
    maxFundingRateFilter = bounds.max;
    setFundingInputDisplay(minFundingRateFilter, maxFundingRateFilter);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    syncSelectionToActiveCoins({ allowEmpty: false });
    hideSuggestions();
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateFundingFilterState();
    updateFundingPreviewState();

    if (hasFundingFilter()) {
        const activeCount = getActiveCoins().length;
        setStatus(`Funding filter applied: ${formatFundingFilterLabel()} (${activeCount} symbols)`);
    } else {
        setStatus("Funding filter disabled");
    }

    renderCharts();
}

async function resetFundingFilter() {
    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    minFundingRateFilter = null;
    maxFundingRateFilter = null;
    setFundingInputDisplay(minFundingRateFilter, maxFundingRateFilter);
    setFundingInputsValidity(true);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    hideSuggestions();
    selectedCoins = new Set(getActiveCoins().map((c) => c.symbol));
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateFundingFilterState();
    updateFundingPreviewState();
    setStatus("Funding filter reset");

    renderCharts();
}

async function applyOiFilterFromInput() {
    const parsed = getOiInputThreshold();
    if (parsed === null) {
        setStatus("Invalid OI threshold");
        updateOiPreviewState();
        return;
    }

    if (allCoins.length === 0 && !isLoading) {
        await fetchCoins();
    }

    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    if (parsed > 0) {
        await fetchOiSnapshot(allCoins.map((coin) => coin.symbol), false);
        if (oiSnapshotBySymbol.size === 0) {
            setStatus("Cannot apply OI filter without OI snapshot");
            return;
        }
    }

    minOiNotionalFilter = parsed;
    setOiInputDisplay(minOiNotionalFilter);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    syncSelectionToActiveCoins({ allowEmpty: false });
    hideSuggestions();
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateOiFilterState();
    updateOiPreviewState();

    if (minOiNotionalFilter > 0) {
        const activeCount = getActiveCoins().length;
        setStatus(
            `OI filter applied: >= ${formatVolumeThresholdLabel(minOiNotionalFilter)} USDT (${activeCount} symbols)`,
        );
    } else {
        setStatus("OI filter disabled");
    }

    renderCharts();
}

async function resetOiFilter() {
    if (allCoins.length === 0) {
        setStatus("No symbols loaded. Click Get Coins first");
        return;
    }

    minOiNotionalFilter = 0;
    setOiInputDisplay(0);
    setOiInputValidity(true);
    if (hasPatternFilter()) {
        await scanActivePattern(true);
    }
    hideSuggestions();
    selectedCoins = new Set(getActiveCoins().map((c) => c.symbol));
    renderCoins(allCoins, $("#coinSearch").val() || "");
    updateOiFilterState();
    updateOiPreviewState();
    setStatus("OI filter reset");

    renderCharts();
}

function getStaleThresholdMs(interval) {
    const intervalMs = INTERVAL_MS_MAP[interval] || INTERVAL_MS_MAP["15m"];
    const byMultiplier = intervalMs * STALE_THRESHOLD_MULTIPLIER;
    return Math.min(Math.max(byMultiplier, STALE_THRESHOLD_MIN_MS), STALE_THRESHOLD_MAX_MS);
}

function getLatestRefreshLimit(interval) {
    const intervalMs = INTERVAL_MS_MAP[interval] || INTERVAL_MS_MAP["15m"];
    if (intervalMs <= INTERVAL_MS_MAP["5m"]) return 20;
    if (intervalMs <= INTERVAL_MS_MAP["1h"]) return 12;
    return 8;
}

function isLastCandleClosedByTime(data, interval) {
    if (!Array.isArray(data) || data.length === 0) return true;

    const lastCandle = data[data.length - 1];
    const candleStartMs = Number(lastCandle?.time) * 1000;
    const intervalMs = INTERVAL_MS_MAP[interval] || INTERVAL_MS_MAP["15m"];

    if (!Number.isFinite(candleStartMs) || !Number.isFinite(intervalMs) || intervalMs <= 0) {
        return true;
    }

    const closeAtMs = candleStartMs + intervalMs;
    return Date.now() >= closeAtMs;
}

function hasCustomCandleColors(candle) {
    return Boolean(
        candle &&
            (typeof candle.color === "string" ||
                typeof candle.borderColor === "string" ||
                typeof candle.wickColor === "string"),
    );
}

function stripCustomCandleColors(candle) {
    if (!candle || !hasCustomCandleColors(candle)) return candle;

    const { color, borderColor, wickColor, ...rest } = candle;
    void color;
    void borderColor;
    void wickColor;
    return rest;
}

function getOpenCandleStyle(candle) {
    const isUp = Number(candle?.close) >= Number(candle?.open);
    const color = isUp ? OPEN_CANDLE_UP_COLOR : OPEN_CANDLE_DOWN_COLOR;
    return {
        color,
        borderColor: color,
        wickColor: color,
    };
}

function normalizeOpenCandleColors(data, interval, isLastClosedOverride = null) {
    if (!Array.isArray(data) || data.length === 0) return data;

    const next = data.slice();
    const lastIndex = next.length - 1;
    const previousIndex = lastIndex - 1;

    if (previousIndex >= 0 && hasCustomCandleColors(next[previousIndex])) {
        next[previousIndex] = stripCustomCandleColors(next[previousIndex]);
    }

    const closed =
        typeof isLastClosedOverride === "boolean"
            ? isLastClosedOverride
            : isLastCandleClosedByTime(next, interval);
    const cleanLast = stripCustomCandleColors(next[lastIndex]);

    if (closed) {
        next[lastIndex] = cleanLast;
        return next;
    }

    next[lastIndex] = {
        ...cleanLast,
        ...getOpenCandleStyle(cleanLast),
    };
    return next;
}

function mergeCandles(existingCandles, latestCandles, maxPoints) {
    const mergedByTime = new Map();

    existingCandles.forEach((candle) => {
        mergedByTime.set(candle.time, candle);
    });

    latestCandles.forEach((candle) => {
        mergedByTime.set(candle.time, candle);
    });

    return Array.from(mergedByTime.values())
        .sort((a, b) => a.time - b.time)
        .slice(-maxPoints);
}

function mergeRealtimeCandle(existingCandles, candle, maxPoints) {
    if (!Array.isArray(existingCandles) || existingCandles.length === 0) {
        return [candle].slice(-maxPoints);
    }

    const lastCandle = existingCandles[existingCandles.length - 1];
    if (lastCandle.time === candle.time) {
        const next = existingCandles.slice();
        next[next.length - 1] = candle;
        return next;
    }

    if (lastCandle.time < candle.time) {
        return existingCandles.concat(candle).slice(-maxPoints);
    }

    return mergeCandles(existingCandles, [candle], maxPoints);
}

function getRealtimeStreamConfig() {
    const symbols = Array.from(
        new Set(
            getPageSymbols(currentChartPage)
                .map((symbol) => String(symbol || "").trim().toUpperCase())
                .filter(Boolean),
        ),
    )
        .sort((a, b) => a.localeCompare(b));

    if (symbols.length === 0) return null;

    const streams = symbols.map((symbol) => `${symbol.toLowerCase()}@kline_${currentChartInterval}`);

    return {
        key: `${currentChartInterval}:${symbols.join(",")}`,
        interval: currentChartInterval,
        symbols,
        url: `${REALTIME_WS_BASE_URL}${streams.join("/")}`,
    };
}

async function fetchCandlesAsChartData(symbol, interval, limit, retries = 2) {
    const url = `/api/klines?symbol=${encodeURIComponent(symbol)}&interval=${encodeURIComponent(interval)}&limit=${limit}`;

    try {
        const res = await fetch(url);
        let payload = null;
        try {
            payload = await res.clone().json();
        } catch (_) {
            payload = null;
        }

        if (res.status === 429 || res.status >= 500) {
            throw new Error(`Server busy: ${res.status}`);
        }

        if (!res.ok) {
            const message = payload?.error || `HTTP Error: ${res.status}`;
            if (res.status >= 400 && res.status < 500) {
                throw new Error(`Non-retriable: ${message}`);
            }
            throw new Error(message);
        }

        const rawCandles = payload ?? await res.json();
        if (!Array.isArray(rawCandles)) {
            throw new Error("Unexpected candle payload");
        }

        return rawCandles
            .map((d) => ({
                time: d[0] / 1000,
                open: Number(d[1]),
                high: Number(d[2]),
                low: Number(d[3]),
                close: Number(d[4]),
            }))
            .sort((a, b) => a.time - b.time);
    } catch (error) {
        const message = String(error?.message || "");
        const nonRetriable = message.startsWith("Non-retriable:");

        if (retries > 0 && !nonRetriable) {
            const delay = 1000 * (3 - retries + 1);
            await new Promise((resolve) => setTimeout(resolve, delay));
            return fetchCandlesAsChartData(symbol, interval, limit, retries - 1);
        }

        throw error;
    }
}

function hideStaleNotice() {
    $("#staleNotice").addClass("hidden");
}

function showStaleNotice(message) {
    $("#staleNoticeText").text(message);
    $("#staleNotice").removeClass("hidden");
}

function getTrackedCurrentPageSymbols() {
    return getPageSymbols(currentChartPage).filter((symbol) => {
        const snapshot = chartSnapshotBySymbol.get(symbol);
        return Boolean(snapshot && snapshot.interval === currentChartInterval);
    });
}

function updateStaleNotice() {
    if (refreshLatestInProgress) {
        hideStaleNotice();
        return;
    }

    const trackedSymbols = getTrackedCurrentPageSymbols();
    if (trackedSymbols.length === 0) {
        hideStaleNotice();
        return;
    }

    const now = Date.now();
    const threshold = getStaleThresholdMs(currentChartInterval);
    let staleCount = 0;
    let oldestAge = 0;

    trackedSymbols.forEach((symbol) => {
        const snapshot = chartSnapshotBySymbol.get(symbol);
        if (!snapshot?.lastFetchedAt) return;
        const age = now - snapshot.lastFetchedAt;
        oldestAge = Math.max(oldestAge, age);
        if (age >= threshold) {
            staleCount += 1;
        }
    });

    if (staleCount > 0) {
        const suffix = staleCount > 1 ? "charts" : "chart";
        showStaleNotice(
            `Data may be stale (${staleCount} ${suffix}). Last fetch ${formatElapsed(oldestAge)} ago. Load latest candles.`,
        );
    } else {
        hideStaleNotice();
    }
}

async function refreshLatestVisibleCharts() {
    if (refreshLatestInProgress) return;

    const symbols = getTrackedCurrentPageSymbols();
    if (symbols.length === 0) {
        setStatus("No rendered charts available for refresh");
        return;
    }

    refreshLatestInProgress = true;
    const $reloadBtn = $("#reloadLatestBtn");
    $reloadBtn.prop("disabled", true).text("Loading…");

    try {
        const latestLimit = getLatestRefreshLimit(currentChartInterval);
        const updates = await Promise.allSettled(
            symbols.map(async (symbol) => {
                const latestCandles = await fetchCandlesAsChartData(symbol, currentChartInterval, latestLimit, 2);
                const existingSnapshot = chartSnapshotBySymbol.get(symbol);
                const existingCandles = existingSnapshot?.data || [];
                const mergedCandles = normalizeOpenCandleColors(
                    mergeCandles(existingCandles, latestCandles, currentChartLimit),
                    currentChartInterval,
                );

                chartSnapshotBySymbol.set(symbol, {
                    data: mergedCandles,
                    lastFetchedAt: Date.now(),
                    interval: currentChartInterval,
                });

                const chartInstance = chartInstances[symbol];
                if (chartInstance) {
                    chartInstance.updateData(mergedCandles);
                }

                $(`#chart-${symbol}`)
                    .removeClass("border-red-500/50")
                    .addClass("border-white/10");
            }),
        );

        const successCount = updates.filter((result) => result.status === "fulfilled").length;
        const failCount = updates.length - successCount;

        if (successCount > 0) {
            setStatus(`Loaded latest candles for ${successCount} chart${successCount > 1 ? "s" : ""}`);
        }
        if (failCount > 0) {
            setStatus(`Loaded latest candles for ${successCount} charts, ${failCount} failed`);
        }
    } catch (error) {
        console.error("Failed to refresh latest candles:", error);
        setStatus("Failed to load latest candles");
    } finally {
        refreshLatestInProgress = false;
        $reloadBtn.prop("disabled", false).text("Load latest");
        updateStaleNotice();
        syncRealtimeStreams();
    }
}

function startStaleMonitor() {
    if (staleCheckTimer) {
        clearInterval(staleCheckTimer);
    }
    staleCheckTimer = setInterval(() => {
        updateStaleNotice();
        updateVolumeSnapshotMeta();
        updateFundingSnapshotMeta();
        updateOiSnapshotMeta();
    }, STALE_CHECK_INTERVAL_MS);
}

function scheduleStaleNoticeRefresh() {
    if (staleNoticeRefreshTimer) return;

    staleNoticeRefreshTimer = window.setTimeout(() => {
        staleNoticeRefreshTimer = null;
        updateStaleNotice();
    }, 300);
}

function clearRealtimeReconnectTimer() {
    if (!realtimeReconnectTimer) return;
    clearTimeout(realtimeReconnectTimer);
    realtimeReconnectTimer = null;
}

function disconnectRealtimeStreams(clearDesired = true) {
    clearRealtimeReconnectTimer();
    if (staleNoticeRefreshTimer) {
        clearTimeout(staleNoticeRefreshTimer);
        staleNoticeRefreshTimer = null;
    }

    if (clearDesired) {
        realtimeDesiredKey = "";
        realtimeDesiredConfig = null;
    }

    if (!realtimeSocket) return;

    const socket = realtimeSocket;
    realtimeSocket = null;

    socket.onopen = null;
    socket.onmessage = null;
    socket.onerror = null;
    socket.onclose = null;

    try {
        if (
            typeof WebSocket !== "undefined" &&
            (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)
        ) {
            socket.close(1000, "switch-stream");
        }
    } catch (error) {
        console.warn("Failed to close realtime socket:", error);
    }
}

function scheduleRealtimeReconnect() {
    if (!realtimeDesiredKey || !realtimeDesiredConfig) return;
    if (realtimeReconnectTimer) return;

    const delay = realtimeReconnectDelayMs;
    realtimeReconnectTimer = window.setTimeout(() => {
        realtimeReconnectTimer = null;
        openRealtimeSocket();
    }, delay);

    realtimeReconnectDelayMs = Math.min(
        Math.floor(realtimeReconnectDelayMs * 1.8),
        REALTIME_RECONNECT_MAX_MS,
    );

    setStatus(`Realtime disconnected. Reconnecting in ${Math.ceil(delay / 1000)}s`);
}

function applyRealtimeCandle(symbol, candle, interval, isClosed) {
    const maxPoints = Math.max(1, Number(currentChartLimit) || 1);
    const snapshot = chartSnapshotBySymbol.get(symbol);
    const shouldMerge = Boolean(snapshot && snapshot.interval === interval);
    const mergedData = shouldMerge
        ? mergeRealtimeCandle(snapshot.data || [], candle, maxPoints)
        : [candle];
    const resolvedClosed =
        typeof isClosed === "boolean" ? isClosed : isLastCandleClosedByTime(mergedData, interval);
    const nextData = normalizeOpenCandleColors(mergedData, interval, resolvedClosed);

    chartSnapshotBySymbol.set(symbol, {
        data: nextData,
        lastFetchedAt: Date.now(),
        interval,
    });

    const chartInstance = chartInstances[symbol];
    if (chartInstance) {
        const currentCandle = nextData[nextData.length - 1];
        if (shouldMerge && typeof chartInstance.updateCandle === "function") {
            chartInstance.updateCandle(currentCandle);
        } else {
            chartInstance.updateData(nextData);
        }
    }

    $(`#chart-${symbol}`)
        .removeClass("border-red-500/50")
        .addClass("border-white/10");

    scheduleStaleNoticeRefresh();
}

function handleRealtimeRawMessage(rawMessage, expectedInterval) {
    if (typeof rawMessage !== "string") return;

    let payload = null;
    try {
        payload = JSON.parse(rawMessage);
    } catch (_) {
        return;
    }

    // ACK payload when using stream subscribe APIs.
    if (payload && Object.prototype.hasOwnProperty.call(payload, "result")) {
        return;
    }

    const packet = payload?.data || payload;
    const kline = packet?.k;
    if (!kline) return;

    const interval = String(kline.i || "");
    if (interval && interval !== expectedInterval) return;

    const symbol = String(packet?.s || "").trim().toUpperCase();
    if (!symbol) return;

    const candle = {
        time: Math.floor(Number(kline.t) / 1000),
        open: Number(kline.o),
        high: Number(kline.h),
        low: Number(kline.l),
        close: Number(kline.c),
    };
    const isClosed = Boolean(kline.x);

    if (
        !Number.isFinite(candle.time) ||
        !Number.isFinite(candle.open) ||
        !Number.isFinite(candle.high) ||
        !Number.isFinite(candle.low) ||
        !Number.isFinite(candle.close)
    ) {
        return;
    }

    applyRealtimeCandle(symbol, candle, expectedInterval, isClosed);
}

function openRealtimeSocket() {
    if (!realtimeDesiredConfig || !realtimeDesiredKey) return;
    if (typeof WebSocket === "undefined") {
        setStatus("Realtime is not supported in this browser");
        return;
    }

    const config = realtimeDesiredConfig;
    const socket = new WebSocket(config.url);
    const socketKey = config.key;
    const socketInterval = config.interval;
    const streamCount = config.symbols.length;

    realtimeSocket = socket;

    socket.onopen = () => {
        if (socketKey !== realtimeDesiredKey) {
            socket.close(1000, "stale-stream");
            return;
        }

        realtimeReconnectDelayMs = REALTIME_RECONNECT_MIN_MS;
        setStatus(`Realtime active: ${streamCount} stream${streamCount > 1 ? "s" : ""} (${socketInterval})`);
    };

    socket.onmessage = (event) => {
        handleRealtimeRawMessage(event.data, socketInterval);
    };

    socket.onerror = (event) => {
        console.warn("Realtime socket error:", event);
    };

    socket.onclose = () => {
        if (realtimeSocket === socket) {
            realtimeSocket = null;
        }

        if (socketKey !== realtimeDesiredKey) return;
        scheduleRealtimeReconnect();
    };
}

function syncRealtimeStreams() {
    const config = getRealtimeStreamConfig();

    if (!config) {
        disconnectRealtimeStreams(true);
        return;
    }

    const sameKey = config.key === realtimeDesiredKey;
    const hasLiveSocket = Boolean(
        realtimeSocket &&
            typeof WebSocket !== "undefined" &&
            (realtimeSocket.readyState === WebSocket.OPEN ||
                realtimeSocket.readyState === WebSocket.CONNECTING),
    );

    realtimeDesiredKey = config.key;
    realtimeDesiredConfig = config;

    if (sameKey && (hasLiveSocket || realtimeReconnectTimer)) {
        return;
    }

    disconnectRealtimeStreams(false);
    openRealtimeSocket();
}

function transitionToPanel(panelId) {
    const $next = $(`#panel-${panelId}`);
    if ($next.length === 0) return;

    const $current = $(".tool-panel.is-active").first();
    const currentElement = $current[0];
    const nextElement = $next[0];

    if (currentElement && currentElement === nextElement) {
        $next
            .removeClass("hidden is-enter-left is-enter-right is-exit-left is-exit-right")
            .attr("aria-hidden", "false");
        return;
    }

    const fromId = currentElement ? String(currentElement.id).replace("panel-", "") : "";
    const fromIndex = PANEL_ORDER.indexOf(fromId);
    const toIndex = PANEL_ORDER.indexOf(panelId);
    const movingForward = fromIndex === -1 || toIndex >= fromIndex;
    const enterClass = movingForward ? "is-enter-right" : "is-enter-left";
    const exitClass = movingForward ? "is-exit-left" : "is-exit-right";

    if (currentElement) {
        const currentId = currentElement.id;

        $current
            .removeClass("is-active is-enter-left is-enter-right")
            .addClass(exitClass)
            .attr("aria-hidden", "true");

        window.setTimeout(() => {
            const $panel = $(`#${currentId}`);
            if (!$panel.hasClass("is-active")) {
                $panel.addClass("hidden").removeClass("is-exit-left is-exit-right");
            }
        }, PANEL_TRANSITION_MS);
    }

    $next
        .removeClass("hidden is-exit-left is-exit-right is-active")
        .addClass(enterClass)
        .attr("aria-hidden", "false");

    // Force layout so browser commits the enter state before moving to active.
    if (nextElement) {
        nextElement.getBoundingClientRect();
    }

    // Double rAF ensures the first visual frame is painted before transition.
    window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
            $next.addClass("is-active").removeClass("is-enter-left is-enter-right");
        });
    });
}

function setMarketCoinCount(text) {
    marketCoinCountRawText = String(text || "");
    marketCoinCountText = localizeMarketCoinCountText(marketCoinCountRawText);
    if (activeToolPanel === "market") {
        $("#coinCount").text(marketCoinCountText);
    }
}

function setChartsResizePaused(isPaused) {
    Object.values(chartInstances).forEach((instance) => {
        if (instance && typeof instance.setResizePaused === "function") {
            instance.setResizePaused(isPaused);
        }
    });
}

function forceResizeAllCharts() {
    Object.values(chartInstances).forEach((instance) => {
        if (instance && typeof instance.forceResize === "function") {
            instance.forceResize();
        }
    });
}

function clearSidebarResizeUnlockTimer() {
    if (!sidebarResizeUnlockTimer) return;
    clearTimeout(sidebarResizeUnlockTimer);
    sidebarResizeUnlockTimer = null;
}

function scheduleSidebarResizeUnlock() {
    clearSidebarResizeUnlockTimer();
    sidebarResizeUnlockTimer = setTimeout(() => {
        sidebarResizeUnlockTimer = null;
        setChartsResizePaused(false);
        forceResizeAllCharts();
    }, PANEL_TRANSITION_MS + 80);
}

function setSidebarOpen(isOpen) {
    const $sidebar = $("#sidebar");
    const $body = $("body");

    setChartsResizePaused(true);
    $sidebar.toggleClass("collapsed", !isOpen);
    $sidebar.attr("aria-hidden", isOpen ? "false" : "true");
    $body.toggleClass("sidebar-collapsed", !isOpen);
    $("#toolRail").attr("data-sidebar-open", isOpen ? "true" : "false");
    $(".tool-rail-item.active").attr("aria-expanded", isOpen ? "true" : "false");
    scheduleSidebarResizeUnlock();
}

function toggleSidebar() {
    const isCollapsed = $("#sidebar").hasClass("collapsed");
    setSidebarOpen(isCollapsed);
    setStatus(isCollapsed ? t("status_tool_panel_expanded") : t("status_tool_panel_collapsed"));
}

function setActiveToolPanel(panelId) {
    if (!PANEL_CONFIG[panelId]) return;

    activeToolPanel = panelId;

    $(".tool-rail-item")
        .removeClass("active")
        .attr("aria-pressed", "false")
        .attr("aria-expanded", "false");

    $(`.tool-rail-item[data-panel="${panelId}"]`)
        .addClass("active")
        .attr("aria-pressed", "true")
        .attr("aria-expanded", $("#sidebar").hasClass("collapsed") ? "false" : "true");

    transitionToPanel(panelId);

    $("#sidebarTitle").text(getPanelTitle(panelId));
    $("#coinCount").text(PANEL_CONFIG[panelId].subtitle());

    if (panelId === "tools") {
        updateToolsFilterEditorUI();
    }
}

function handleToolRailSelection(panelId) {
    const samePanel = panelId === activeToolPanel;
    const isOpen = !$("#sidebar").hasClass("collapsed");

    if (samePanel && isOpen) {
        setSidebarOpen(false);
        setStatus(t("status_tool_panel_collapsed"));
        return;
    }

    setActiveToolPanel(panelId);
    setSidebarOpen(true);

    if (panelId === "tools") {
        fetchPatternCatalog(false).catch((error) => {
            console.error("Failed to load pattern catalog:", error);
        });
    }

    if (panelId === "tools" && allCoins.length > 0) {

        fetchMarketSnapshot(false)
            .catch((error) => {
                console.error("Failed to prefetch market snapshot:", error);
            })
            .finally(() => {
                updateVolumePreviewState();
            });

        fetchFundingSnapshot(false)
            .catch((error) => {
                console.error("Failed to prefetch funding snapshot:", error);
            })
            .finally(() => {
                updateFundingPreviewState();
            });

        if (minOiNotionalFilter > 0) {
            fetchOiSnapshot(allCoins.map((coin) => coin.symbol), false)
                .catch((error) => {
                    console.error("Failed to prefetch OI snapshot:", error);
                })
                .finally(() => {
                    updateOiPreviewState();
                });
        }
    }

    setStatus(t("status_panel_opened", { panel: getPanelTitle(panelId) }));
}

function setCoinActive($el, isActive) {
    const symbol = $el.data("symbol");
    const $cb = $el.find('input[type="checkbox"]');

    if (isActive) {
        selectedCoins.add(symbol);
        $el.addClass("active").attr("aria-pressed", "true");
        $cb.prop("checked", true);
    } else {
        selectedCoins.delete(symbol);
        $el.removeClass("active").attr("aria-pressed", "false");
        $cb.prop("checked", false);
    }
}

function renderCoins(coins, filter = "") {
    const $list = $("#coinList");
    const activeFilteredCoins = getActiveCoinsByFilters(coins);

    const f = filter.trim().toUpperCase();
    const filtered = f
        ? activeFilteredCoins.filter(
              (c) =>
                  (c.symbol || "").toUpperCase().includes(f) ||
                  (c.baseAsset || "").toUpperCase().includes(f),
          )
        : activeFilteredCoins;

    if (filtered.length === 0) {
        const emptyMessage = hasPatternFilter()
            ? "No symbols match pattern"
            : "No coins found";
        $list.html(
            `<div class="flex items-center justify-center h-full text-slate-400 text-sm">${emptyMessage}</div>`,
        );
        setMarketCoinCount("Coins (0)");
        updateFundingFilterState();
        updateOiFilterState();
        updatePatternFilterState();
        updateFundingPreviewState();
        updateOiPreviewState();
        updateVolumePreviewState();
        updatePatternSnapshotMeta();
        updatePatternSelectionHint();
        return;
    }

    $list.html(
        filtered
            .map((coin) => {
                const symbol = coin.symbol;
                const base = coin.baseAsset || symbol;
                const quote = coin.quoteAsset || "";
                const checked = selectedCoins.has(symbol);

                return `
        <button type="button" data-symbol="${symbol}" aria-pressed="${checked ? "true" : "false"}"
          aria-label="Toggle ${symbol} chart"
          class="coin-item group mb-1.5 last:mb-0 w-full flex items-center justify-between gap-3 rounded-lg border border-white/10
                 bg-slate-800/35 px-3 py-2.5 cursor-pointer hover:bg-slate-700/55 hover:border-white/20 active:scale-[0.99]
                 transition-colors duration-200 ${checked ? "active" : ""}">
          <div class="flex items-baseline gap-2 min-w-0 flex-1 text-left">
            <span class="text-xs font-bold text-white/95">${base}</span>
            <span class="text-[11px] font-medium text-slate-400">/ ${quote}</span>
          </div>
          <input type="checkbox" style="pointer-events:none" class="h-4 w-4 accent-cyan-400 shrink-0" aria-hidden="true" tabindex="-1" ${checked ? "checked" : ""}>
        </button>
      `;
            })
            .join(""),
    );

    setMarketCoinCount(`Coins (${filtered.length})`);
    updateFundingFilterState();
    updateOiFilterState();
    updatePatternFilterState();
    updateFundingPreviewState();
    updateOiPreviewState();
    updateVolumePreviewState();
    updatePatternSnapshotMeta();
    updatePatternSelectionHint();
}

async function fetchCoins() {
    if (isLoading) return;
    isLoading = true;

    const $list = $("#coinList");

    $list.html(
        '<div class="flex items-center justify-center h-full text-slate-400"><div class="animate-pulse">Loading coins…</div></div>',
    );
    setMarketCoinCount("Loading…");
    setStatus("Loading coins…");

    try {
        const res = await fetch("/api/coins");
        if (!res.ok) throw new Error("Failed to fetch coins");
        allCoins = await res.json();

        const validSymbols = new Set(allCoins.map((c) => c.symbol));
        const preservedSelection = new Set(
            Array.from(selectedCoins).filter((symbol) => validSymbols.has(symbol)),
        );

        // First load UX: keep default behavior (all coins ticked).
        selectedCoins =
            preservedSelection.size > 0
                ? preservedSelection
                : new Set(allCoins.map((c) => c.symbol));

        if (minVolume24hFilter > 0 || hasFundingFilter() || minOiNotionalFilter > 0) {
            const snapshotTasks = [];
            if (minVolume24hFilter > 0) {
                snapshotTasks.push(fetchMarketSnapshot(false));
            }
            if (hasFundingFilter()) {
                snapshotTasks.push(fetchFundingSnapshot(false));
            }
            if (minOiNotionalFilter > 0) {
                snapshotTasks.push(fetchOiSnapshot(allCoins.map((coin) => coin.symbol), false));
            }
            await Promise.all(snapshotTasks);
        }

        if (hasPatternFilter()) {
            await fetchPatternCatalog(false);
            await scanActivePattern(true);
        }

        syncSelectionToActiveCoins({ allowEmpty: false });

        renderCoins(allCoins, $("#coinSearch").val() || "");
        updateVolumeFilterState();
        updateFundingFilterState();
        updateOiFilterState();
        updatePatternFilterState();
        updateVolumePresetButtons();
        updateVolumePreviewState();
        updateFundingPreviewState();
        updateOiPreviewState();
        updatePatternSelectionHint();
        updateVolumeSnapshotMeta();
        updateFundingSnapshotMeta();
        updateOiSnapshotMeta();
        updatePatternSnapshotMeta();

        setStatus(`Loaded ${allCoins.length} symbols`);
    } catch (error) {
        console.error(error);
        $list.html(
            '<div class="flex items-center justify-center h-full text-red-400">Failed to load coins. Please try again.</div>',
        );
        setMarketCoinCount("Error");
        setStatus("Failed to load coins");
    } finally {
        isLoading = false;
    }
}

function filterCoins() {
    const q = $("#coinSearch").val() || "";
    if (allCoins.length === 0) return;
    renderCoins(allCoins, q);
}

function getSuggestionScore(coin, q) {
    const symbol = (coin.symbol || "").toUpperCase();
    const base = (coin.baseAsset || "").toUpperCase();

    if (symbol === q || base === q) return 1000;
    if (symbol.startsWith(q)) return 800;
    if (base.startsWith(q)) return 700;
    if (symbol.includes(q)) return 500;
    if (base.includes(q)) return 400;
    return 0;
}

function getSearchSuggestions(query) {
    const q = query.trim().toUpperCase();
    const activeCoins = getActiveCoins();
    if (!q || activeCoins.length === 0) return [];

    return activeCoins
        .map((coin) => ({ coin, score: getSuggestionScore(coin, q) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score || a.coin.symbol.localeCompare(b.coin.symbol))
        .slice(0, SEARCH_SUGGESTION_LIMIT)
        .map((x) => x.coin);
}

function hideSuggestions() {
    const $dropdown = $("#coinSuggestDropdown");
    $dropdown.addClass("hidden").empty();
}

function renderSuggestions(query, suggestions) {
    const $dropdown = $("#coinSuggestDropdown");
    const q = query.trim().toUpperCase();

    if (!q) {
        hideSuggestions();
        return;
    }

    if (suggestions.length === 0) {
        $dropdown
            .html(`<div class="px-2 py-2 text-xs text-slate-400">${t("no_matching_symbols")}</div>`)
            .removeClass("hidden");
        return;
    }

    const html = suggestions
        .map((coin) => {
            const selected = selectedCoins.has(coin.symbol);
            return `
                <button type="button" class="suggest-item w-full rounded-lg border border-white/10 bg-slate-800/50 px-2.5 py-2 text-left transition-colors duration-150 hover:bg-slate-700/70 mb-1 last:mb-0 ${selected ? "ring-1 ring-cyan-300/40" : ""}" data-symbol="${coin.symbol}">
                    <div class="flex items-center justify-between gap-2">
                        <span class="text-xs font-semibold text-white/90">${coin.symbol}</span>
                        <span class="text-[10px] text-slate-400">${coin.baseAsset}/${coin.quoteAsset}</span>
                    </div>
                </button>
            `;
        })
        .join("");

    $dropdown.html(html).removeClass("hidden");
}

function autoRenderFromSuggestions(query, suggestions, token) {
    if (token !== latestSearchToken) return;
    if (!query.trim() || suggestions.length === 0) return;

    selectedCoins = new Set(suggestions.map((c) => c.symbol));
    renderCoins(allCoins, query);
    renderCharts();
    setStatus(`Auto-rendered ${suggestions.length} charts for "${query.trim()}"`);
}

async function handleSearchInput() {
    const query = String($("#coinSearch").val() || "");
    const token = ++latestSearchToken;

    if (allCoins.length === 0 && !isLoading) {
        await fetchCoins();
    }

    if (allCoins.length === 0) return;

    renderCoins(allCoins, query);
    const suggestions = getSearchSuggestions(query);
    renderSuggestions(query, suggestions);

    if (searchDebounceTimer) {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = null;
    }

    // Clearing search should restore full selection and full chart pagination.
    if (!query.trim()) {
        selectedCoins = new Set(getActiveCoins().map((c) => c.symbol));
        renderCoins(allCoins, "");
        pagedSymbols = Array.from(selectedCoins);
        currentChartPage = 1;
        renderChartPage();
        setStatus("Search cleared. Restored full market view");
        return;
    }

    if (suggestions.length === 0) return;

    searchDebounceTimer = setTimeout(() => {
        autoRenderFromSuggestions(query, suggestions, token);
    }, SEARCH_DEBOUNCE_MS);
}

function toggleSelectAll() {
    if (allCoins.length) {
        selectedCoins = new Set(getActiveCoins().map((c) => c.symbol));
        renderCoins(allCoins, $("#coinSearch").val() || "");
    } else {
        $(".coin-item").each(function () {
            setCoinActive($(this), true);
        });
    }

    setStatus(`Selected ${selectedCoins.size} symbols`);
}

function deselectAll() {
    selectedCoins.clear();
    if (allCoins.length) {
        renderCoins(allCoins, $("#coinSearch").val() || "");
    } else {
        $(".coin-item").each(function () {
            setCoinActive($(this), false);
        });
    }

    setStatus("Selection cleared");
}

function destroyCharts() {
    Object.values(chartInstances).forEach((instance) => {
        if (instance && typeof instance.destroy === "function") {
            instance.destroy();
        } else if (instance && instance.chart) {
            instance.chart.remove();
        }
    });

    Object.keys(chartInstances).forEach((key) => delete chartInstances[key]);

    if (lazyObserver) {
        lazyObserver.disconnect();
        lazyObserver = null;
    }

    requestQueue.length = 0;
}

function getTotalPages() {
    if (pagedSymbols.length === 0) return 1;
    return Math.ceil(pagedSymbols.length / chartsPerPage);
}

function getPageSymbols(page) {
    const start = (page - 1) * chartsPerPage;
    return pagedSymbols.slice(start, start + chartsPerPage);
}

function renderPagination($grid) {
    const totalPages = getTotalPages();
    const start = (currentChartPage - 1) * chartsPerPage + 1;
    const end = Math.min(currentChartPage * chartsPerPage, pagedSymbols.length);
    const disabledPrev = currentChartPage <= 1;
    const disabledNext = currentChartPage >= totalPages;
    const jumpInputId = `pagerInput-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const $pager = $(
        `<div class="w-full flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-slate-900/45 px-3 py-2">
            <div class="text-xs text-slate-300">
                Showing <strong>${start}</strong>-<strong>${end}</strong> of <strong>${pagedSymbols.length}</strong> charts
            </div>
            <div class="flex flex-wrap items-center gap-2">
                <button type="button" class="pager-prev rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${disabledPrev ? "border-white/10 bg-slate-800/30 text-slate-500 cursor-not-allowed" : "border-white/15 bg-slate-800/60 text-slate-100 hover:bg-slate-700/80"}" ${disabledPrev ? "disabled" : ""}>Prev</button>
                <div class="min-w-[90px] text-center text-xs text-slate-300">Page ${currentChartPage}/${totalPages}</div>
                <button type="button" class="pager-next rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors duration-200 ${disabledNext ? "border-white/10 bg-slate-800/30 text-slate-500 cursor-not-allowed" : "border-white/15 bg-slate-800/60 text-slate-100 hover:bg-slate-700/80"}" ${disabledNext ? "disabled" : ""}>Next</button>
                <form class="pager-jump flex items-center gap-1.5" autocomplete="off">
                    <label class="sr-only" for="${jumpInputId}">Jump to page</label>
                    <input
                        id="${jumpInputId}"
                        type="number"
                        min="1"
                        max="${totalPages}"
                        step="1"
                        value="${currentChartPage}"
                        class="pager-input w-[72px] rounded-lg border border-white/15 bg-slate-800/60 px-2.5 py-1.5 text-xs text-slate-100 outline-none focus:border-cyan-300/55 focus:ring-2 focus:ring-cyan-300/20"
                        aria-label="Page number"
                    />
                    <button type="submit" class="pager-go rounded-lg border border-cyan-300/30 bg-cyan-300/15 px-2.5 py-1.5 text-xs font-semibold text-cyan-100 hover:bg-cyan-300/25 hover:border-cyan-200/40 transition-colors duration-200">
                        Go
                    </button>
                </form>
            </div>
        </div>`,
    );

    $pager.find(".pager-prev").on("click", () => {
        if (currentChartPage <= 1) return;
        currentChartPage -= 1;
        renderChartPage();
    });

    $pager.find(".pager-next").on("click", () => {
        if (currentChartPage >= totalPages) return;
        currentChartPage += 1;
        renderChartPage();
    });

    $pager.find(".pager-jump").on("submit", function (event) {
        event.preventDefault();
        const rawValue = String($(this).find(".pager-input").val() || "").trim();
        const parsed = Number.parseInt(rawValue, 10);

        if (!Number.isFinite(parsed)) return;

        const targetPage = Math.min(Math.max(parsed, 1), totalPages);
        if (targetPage === currentChartPage) return;

        currentChartPage = targetPage;
        renderChartPage();
    });

    $grid.append($pager);
}

function renderChartPage() {
    const $grid = $("#chartGrid");
    const totalPages = getTotalPages();
    currentChartPage = Math.min(Math.max(currentChartPage, 1), totalPages);
    currentRenderCycle += 1;

    destroyCharts();
    $grid.empty();

    if (pagedSymbols.length === 0) {
        const emptyMessage = hasPatternFilter()
            ? t("empty_no_symbols_pattern")
            : t("empty_no_symbols_selected");
        $grid.html(
            `<div class="flex items-center justify-center rounded-2xl border border-white/10 bg-slate-950/35 text-slate-300 font-medium w-full py-12">${emptyMessage}</div>`,
        );
        setStatus(`Cannot render charts. ${emptyMessage}`);
        hideStaleNotice();
        disconnectRealtimeStreams(true);
        return;
    }

    renderPagination($grid);

    const symbols = getPageSymbols(currentChartPage);
    const cycle = currentRenderCycle;
    setStatus(`Rendering page ${currentChartPage}/${totalPages} with ${symbols.length} charts`);

    lazyObserver = new IntersectionObserver(
        (entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;

                const el = entry.target;
                const symbol = el.getAttribute("data-symbol");
                observer.unobserve(el);

                if (!chartInstances[symbol]) {
                    initChartForContainer(el, symbol, currentChartInterval, currentChartLimit, cycle);
                }
            });
        },
        { root: $grid[0], rootMargin: "120px", threshold: 0.1 },
    );

    symbols.forEach((symbol) => {
        const $container = $(
            `<div class="chart-container" data-symbol="${symbol}" id="chart-${symbol}"></div>`,
        );

        const $header = $(
            `<div class="chart-symbol">${symbol}</div>`,
        );

        $container.append($header);
        $grid.append($container);
        lazyObserver.observe($container[0]);
    });

    if (totalPages > 1) {
        renderPagination($grid);
    }

    updateStaleNotice();
    syncRealtimeStreams();
}

async function renderCharts() {
    currentChartInterval = $("#interval").val();
    currentChartLimit = Number($("#limit").val() || 100);
    const activeSymbols = getActiveCoinSymbolSet();

    if (selectedCoins.size === 0 && activeSymbols.size > 0) {
        selectedCoins = new Set(activeSymbols);
    }

    pagedSymbols = Array.from(selectedCoins).filter((symbol) => activeSymbols.has(symbol));
    if (pagedSymbols.length === 0 && activeSymbols.size > 0) {
        pagedSymbols = Array.from(activeSymbols);
        selectedCoins = new Set(pagedSymbols);
    }
    currentChartPage = 1;
    renderChartPage();
}

function initChartForContainer(el, symbol, interval, limit, renderCycle) {
    if (renderCycle !== currentRenderCycle) return;

    const chartComponent = new ChartComponent(el, symbol);
    chartInstances[symbol] = chartComponent;
    if (sidebarResizeUnlockTimer && typeof chartComponent.setResizePaused === "function") {
        chartComponent.setResizePaused(true);
    }
    fetchData(symbol, interval, limit, chartComponent, renderCycle);
}

function processQueue() {
    if (
        activeRequests.size >= MAX_CONCURRENT_REQUESTS ||
        requestQueue.length === 0
    ) {
        return;
    }

    const task = requestQueue.shift();
    const { symbol, interval, limit, chartComponent, retries, renderCycle } = task;

    const promise = fetchWithRetry(
        symbol,
        interval,
        limit,
        chartComponent,
        renderCycle,
        retries,
    );

    activeRequests.add(promise);

    promise.finally(() => {
        activeRequests.delete(promise);
        processQueue();
    });
}

async function fetchWithRetry(
    symbol,
    interval,
    limit,
    chartComponent,
    renderCycle,
    retries = 3,
) {
    if (renderCycle !== currentRenderCycle) return;

    try {
        const chartData = await fetchCandlesAsChartData(symbol, interval, limit, retries);
        if (renderCycle !== currentRenderCycle) return;
        const normalizedData = normalizeOpenCandleColors(chartData, interval);

        chartComponent.updateData(normalizedData);
        chartSnapshotBySymbol.set(symbol, {
            data: normalizedData,
            lastFetchedAt: Date.now(),
            interval,
        });

        $(`#chart-${symbol}`)
            .removeClass("border-red-500/50")
            .addClass("border-white/10");

        updateStaleNotice();
    } catch (error) {
        const message = String(error?.message || "");
        const nonRetriable = message.startsWith("Non-retriable:");

        console.error(`Failed to load ${symbol}${nonRetriable ? "" : " after retries"}:`, error);
        $(`#chart-${symbol}`)
            .removeClass("border-white/10")
            .addClass("border-red-500/50");
    }
}

function fetchData(symbol, interval, limit, chartComponent, renderCycle) {
    requestQueue.push({ symbol, interval, limit, chartComponent, renderCycle, retries: 3 });
    processQueue();
}

function initDropdown({ wrapId, buttonId, menuId, labelId, chevronId, selectId, itemClass, defaultIndex }) {
    const $wrap = $(wrapId);
    if ($wrap.length === 0) return;

    const $btn = $(buttonId);
    const $menu = $(menuId);
    const $label = $(labelId);
    const $chev = $(chevronId);
    const $select = $(selectId);
    const $items = $wrap.find(itemClass);

    function setActive(value, text) {
        $select.val(value);
        $label.text(text);
        $items.each(function () {
            $(this).attr(
                "data-active",
                $(this).data("value") === value ? "true" : "false",
            );
        });
        $select.trigger("change");
    }

    function openMenu() {
        $menu.addClass("menu-open").removeClass("hidden");
        $chev.css("transform", "rotate(180deg)");
        $btn.attr("aria-expanded", "true");
    }

    function closeMenu() {
        $menu.removeClass("menu-open").addClass("hidden");
        $chev.css("transform", "rotate(0deg)");
        $btn.attr("aria-expanded", "false");
    }

    const initValue = $select.val();
    const $initItem = $items
        .filter((_, el) => $(el).data("value") === initValue)
        .first();
    const $fallback = $items.eq(defaultIndex);
    const $use = $initItem.length ? $initItem : $fallback;
    setActive($use.data("value"), $use.data("label"));

    $btn.on("click", (event) => {
        event.preventDefault();
        if ($menu.hasClass("hidden")) openMenu();
        else closeMenu();
    });

    $items.on("click", function () {
        setActive($(this).data("value"), $(this).data("label"));
        closeMenu();
    });

    $(document).on("click", (event) => {
        if (!$wrap[0].contains(event.target)) closeMenu();
    });

    $(document).on("keydown", (event) => {
        if (event.key === "Escape") closeMenu();
    });
}

$(function () {
    loadUiSettings();
    applyUiSettings();

    $("body").removeClass("sidebar-collapsed");
    setActiveToolPanel("market");
    setSidebarOpen(true);

    $("#sidebar").on("transitionend", (event) => {
        const propertyName = event.originalEvent?.propertyName;
        if (propertyName !== "width" && propertyName !== "transform") return;

        clearSidebarResizeUnlockTimer();
        setChartsResizePaused(false);
        forceResizeAllCharts();
    });

    $("#sidebarCloseBtn").on("click", toggleSidebar);
    $("#toolRail").on("click", ".tool-rail-item", function () {
        const panelId = String($(this).data("panel") || "");
        if (!panelId) return;
        handleToolRailSelection(panelId);
    });
    $("#settingCompactCards").on("change", function () {
        uiSettings.compactCards = $(this).is(":checked");
        applyUiSettings({ rerender: true, statusMessage: t("status_settings_updated") });
    });
    $("#settingCalmBackground").on("change", function () {
        uiSettings.calmBackground = $(this).is(":checked");
        applyUiSettings({ rerender: false, statusMessage: t("status_settings_updated") });
    });
    $("#settingReduceMotion").on("change", function () {
        uiSettings.reduceMotion = $(this).is(":checked");
        applyUiSettings({ rerender: false, statusMessage: t("status_settings_updated") });
    });
    $("#settingLanguage").on("change", function () {
        uiSettings.language = VALID_LANGUAGES.includes(String($(this).val() || "").toLowerCase())
            ? String($(this).val() || "").toLowerCase()
            : DEFAULT_UI_SETTINGS.language;
        applyUiSettings({ rerender: false, statusMessage: t("status_settings_updated") });
    });
    $("#settingTheme").on("change", function () {
        uiSettings.theme = VALID_THEMES.includes(String($(this).val() || "").toLowerCase())
            ? String($(this).val() || "").toLowerCase()
            : DEFAULT_UI_SETTINGS.theme;
        applyUiSettings({ rerender: false, statusMessage: t("status_settings_updated") });
    });
    $("#settingChartsPerPage").on("change", function () {
        uiSettings.chartsPerPage = normalizeChartsPerPage($(this).val());
        applyUiSettings({
            rerender: true,
            statusMessage: t("status_charts_per_page_set", {
                count: normalizeChartsPerPage(uiSettings.chartsPerPage),
            }),
        });
    });
    $("#settingsResetBtn").on("click", () => {
        resetUiSettings();
    });

    $("#getCoinsBtn").on("click", fetchCoins);
    $("#coinSearch").on("input", handleSearchInput);
    $("#coinSearch").on("focus", () => {
        const query = String($("#coinSearch").val() || "");
        if (!query.trim()) return;
        const suggestions = getSearchSuggestions(query);
        renderSuggestions(query, suggestions);
    });

    $("#coinSuggestDropdown").on("click", ".suggest-item", function () {
        const symbol = String($(this).data("symbol") || "");
        if (!symbol) return;

        $("#coinSearch").val(symbol);
        selectedCoins = new Set([symbol]);
        hideSuggestions();
        renderCoins(allCoins, symbol);
        renderCharts();
        setStatus(`Rendered chart for ${symbol}`);
    });

    $(document).on("click", (event) => {
        const target = event.target;
        const insideSearch = $("#coinSearch").length && $("#coinSearch")[0].contains(target);
        const insideSuggest = $("#coinSuggestDropdown").length && $("#coinSuggestDropdown")[0].contains(target);
        if (!insideSearch && !insideSuggest) {
            hideSuggestions();
        }
    });

    $("#coinList").on("click", ".coin-item", function () {
        const $el = $(this);
        const symbol = $el.data("symbol");
        setCoinActive($el, !selectedCoins.has(symbol));
    });

    $("#coinList").on("keydown", ".coin-item", function (event) {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            $(this).trigger("click");
        }
    });

    $("#selectAllBtn").on("click", toggleSelectAll);
    $("#clearBtn").on("click", deselectAll);
    $("#filterQuickDock").on("click", ".filter-quick-btn", function () {
        const filterId = normalizeToolsFilterId($(this).attr("data-filter-toggle"));
        if (!filterId) return;
        setActiveToolsFilterEditor(filterId);
    });
    $("#filterQuickDock").on("click", ".filter-quick-clear", function (event) {
        event.preventDefault();
        event.stopPropagation();
        const filterId = normalizeToolsFilterId($(this).attr("data-filter-clear"));
        if (!filterId) return;
        void clearFilterById(filterId);
    });
    $("#applyVolumeFilterBtn").on("click", applyVolumeFilterFromInput);
    $("#resetVolumeFilterBtn").on("click", resetVolumeFilter);
    $("#refreshVolumeSnapshotBtn").on("click", async () => {
        if (allCoins.length === 0 && !isLoading) {
            await fetchCoins();
        }
        if (allCoins.length === 0) {
            setStatus("No symbols loaded. Click Get Coins first");
            updateVolumePreviewState();
            return;
        }

        await fetchMarketSnapshot(true);
        updateVolumePreviewState();
    });
    $("#volumePresetChips").on("click", ".volume-preset-chip", function () {
        const threshold = Number($(this).data("volumeThreshold") || 0);
        if (!Number.isFinite(threshold) || threshold < 0) return;

        setVolumeInputDisplay(threshold);
        updateVolumePresetButtons();
        updateVolumePreviewState();

        if (threshold > 0 && marketSnapshotBySymbol.size === 0 && allCoins.length > 0) {
            fetchMarketSnapshot(false).finally(() => {
                updateVolumePreviewState();
            });
        }
    });
    $("#minVolumeInput").on("focus", () => {
        if (allCoins.length > 0 && marketSnapshotBySymbol.size === 0 && !isLoadingMarketSnapshot) {
            fetchMarketSnapshot(false).finally(() => {
                updateVolumePreviewState();
            });
        }
    });
    $("#minVolumeInput").on("input", () => {
        updateVolumePresetButtons();
        updateVolumePreviewState();
    });
    $("#minVolumeInput").on("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyVolumeFilterFromInput();
        }
    });
    $("#minVolumeInput").on("blur", () => {
        const parsed = getVolumeInputThreshold();
        if (parsed !== null) {
            setVolumeInputDisplay(parsed);
        }
        updateVolumePresetButtons();
        updateVolumePreviewState();
    });

    $("#applyFundingFilterBtn").on("click", applyFundingFilterFromInput);
    $("#resetFundingFilterBtn").on("click", resetFundingFilter);
    $("#refreshFundingSnapshotBtn").on("click", async () => {
        if (allCoins.length === 0 && !isLoading) {
            await fetchCoins();
        }
        if (allCoins.length === 0) {
            setStatus("No symbols loaded. Click Get Coins first");
            updateFundingPreviewState();
            return;
        }

        await fetchFundingSnapshot(true);
        updateFundingPreviewState();
    });
    $("#fundingPresetChips").on("click", ".funding-preset-chip", function () {
        const minRate = parseFundingRateInput($(this).attr("data-funding-min") || "");
        const maxRate = parseFundingRateInput($(this).attr("data-funding-max") || "");

        if (minRate === undefined || maxRate === undefined) return;
        if (
            Number.isFinite(minRate) &&
            Number.isFinite(maxRate) &&
            Number(minRate) > Number(maxRate)
        ) {
            return;
        }

        setFundingInputDisplay(minRate, maxRate);
        updateFundingPreviewState();

        if (
            hasAnyFundingBound(minRate, maxRate) &&
            fundingSnapshotBySymbol.size === 0 &&
            allCoins.length > 0
        ) {
            fetchFundingSnapshot(false).finally(() => {
                updateFundingPreviewState();
            });
        }
    });
    $("#minFundingRateInput, #maxFundingRateInput").on("focus", () => {
        if (allCoins.length > 0 && fundingSnapshotBySymbol.size === 0 && !isLoadingFundingSnapshot) {
            fetchFundingSnapshot(false).finally(() => {
                updateFundingPreviewState();
            });
        }
    });
    $("#minFundingRateInput, #maxFundingRateInput").on("input", () => {
        updateFundingPreviewState();
    });
    $("#minFundingRateInput, #maxFundingRateInput").on("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyFundingFilterFromInput();
        }
    });
    $("#minFundingRateInput, #maxFundingRateInput").on("blur", () => {
        const bounds = getFundingBoundsFromInput();
        setFundingInputsValidity(bounds.isValid);
        if (bounds.isValid) {
            setFundingInputDisplay(bounds.min, bounds.max);
        }
        updateFundingPreviewState();
    });

    $("#applyOiFilterBtn").on("click", applyOiFilterFromInput);
    $("#resetOiFilterBtn").on("click", resetOiFilter);
    $("#refreshOiSnapshotBtn").on("click", async () => {
        if (allCoins.length === 0 && !isLoading) {
            await fetchCoins();
        }
        if (allCoins.length === 0) {
            setStatus("No symbols loaded. Click Get Coins first");
            updateOiPreviewState();
            return;
        }

        await fetchOiSnapshot(allCoins.map((coin) => coin.symbol), true);
        updateOiPreviewState();
    });
    $("#oiPresetChips").on("click", ".volume-preset-chip", function () {
        const threshold = Number($(this).data("oiThreshold") || 0);
        if (!Number.isFinite(threshold) || threshold < 0) return;

        setOiInputDisplay(threshold);
        updateOiPreviewState();

        if (threshold > 0 && oiSnapshotBySymbol.size === 0 && allCoins.length > 0) {
            fetchOiSnapshot(allCoins.map((coin) => coin.symbol), false).finally(() => {
                updateOiPreviewState();
            });
        }
    });
    $("#minOiInput").on("focus", () => {
        if (allCoins.length > 0 && oiSnapshotBySymbol.size === 0 && !isLoadingOiSnapshot) {
            fetchOiSnapshot(allCoins.map((coin) => coin.symbol), false).finally(() => {
                updateOiPreviewState();
            });
        }
    });
    $("#minOiInput").on("input", () => {
        updateOiPreviewState();
    });
    $("#minOiInput").on("keydown", (event) => {
        if (event.key === "Enter") {
            event.preventDefault();
            applyOiFilterFromInput();
        }
    });
    $("#minOiInput").on("blur", () => {
        const parsed = getOiInputThreshold();
        if (parsed !== null) {
            setOiInputDisplay(parsed);
        }
        updateOiPreviewState();
    });
    $("#applyPatternFilterBtn").on("click", () => {
        void applyPatternFilterFromInput();
    });
    $("#resetPatternFilterBtn").on("click", resetPatternFilter);
    $("#refreshPatternScanBtn").on("click", async () => {
        if (allCoins.length === 0 && !isLoading) {
            await fetchCoins();
        }
        if (allCoins.length === 0) {
            setStatus("No symbols loaded. Click Get Coins first");
            return;
        }
        if (!hasPatternFilter()) {
            setStatus("Pattern filter is off");
            return;
        }

        await scanActivePattern(true);
        syncSelectionToActiveCoins({ allowEmpty: false });
        hideSuggestions();
        renderCoins(allCoins, $("#coinSearch").val() || "");
        renderPatternIconGrid();
        renderCharts();
    });
    $("#patternCategoryChips").on("click", ".pattern-category-chip", function () {
        patternCategoryFilter = normalizePatternCategoryFilter($(this).attr("data-pattern-category"));
        updatePatternCategoryChips();
        renderPatternIconGrid();
    });
    $("#patternIconGrid").on("click", ".pattern-icon-card", function () {
        const patternId = String($(this).attr("data-pattern-id") || "").trim();
        if (!patternId) return;

        const nextPatternId = patternId === activePatternId ? "" : patternId;
        void applyPatternFilterFromInput(nextPatternId);
    });
    $("#patternSelect").on("change", () => {
        void applyPatternFilterFromInput();
    });
    $("#interval").on("change", async () => {
        if (!hasPatternFilter() || allCoins.length === 0) return;

        await scanActivePattern(true);
        syncSelectionToActiveCoins({ allowEmpty: false });
        hideSuggestions();
        renderCoins(allCoins, $("#coinSearch").val() || "");
        renderPatternIconGrid();
        renderCharts();
    });
    $("#renderBtn").on("click", renderCharts);
    $("#reloadLatestBtn").on("click", refreshLatestVisibleCharts);

    initDropdown({
        wrapId: "#intervalWrap",
        buttonId: "#intervalBtn",
        menuId: "#intervalMenu",
        labelId: "#intervalLabel",
        chevronId: "#intervalChevron",
        selectId: "#interval",
        itemClass: ".interval-item",
        defaultIndex: 2,
    });

    initDropdown({
        wrapId: "#limitWrap",
        buttonId: "#limitBtn",
        menuId: "#limitMenu",
        labelId: "#limitLabel",
        chevronId: "#limitChevron",
        selectId: "#limit",
        itemClass: ".limit-item",
        defaultIndex: 1,
    });

    $("#coinList .coin-item").each(function () {
        setCoinActive($(this), false);
    });

    $(window).on("beforeunload pagehide", () => {
        clearSidebarResizeUnlockTimer();
        setChartsResizePaused(false);
        disconnectRealtimeStreams(true);
    });

    updateVolumeFilterState();
    updateFundingFilterState();
    updateOiFilterState();
    setVolumeInputDisplay(minVolume24hFilter);
    updateVolumePresetButtons();
    updateVolumePreviewState();
    updateVolumeSnapshotMeta();
    setFundingInputDisplay(minFundingRateFilter, maxFundingRateFilter);
    updateFundingSnapshotMeta();
    setFundingInputsValidity(true);
    updateFundingPreviewState();
    setOiInputDisplay(minOiNotionalFilter);
    setOiInputValidity(true);
    updateOiSnapshotMeta();
    updateOiPreviewState();
    updatePatternCategoryChips();
    updatePatternSelectionHint();
    updatePatternFilterState();
    updatePatternSnapshotMeta();
    updatePatternScanVisualState();
    updateToolsFilterEditorUI();
    hideStaleNotice();
    startStaleMonitor();
    setStatus(t("status_ready"));
});
