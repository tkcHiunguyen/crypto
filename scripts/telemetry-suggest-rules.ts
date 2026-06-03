import fs from 'fs';
import path from 'path';

type PatternRule = {
    pattern: string;
    category: 'Bullish' | 'Bearish' | 'Neutral';
    candles: number;
    rules: string[];
    notes?: string;
};

type RuleFile = {
    meta?: Record<string, unknown>;
    params: Record<string, number>;
    patterns: PatternRule[];
};

type ReportMetric = {
    patternId: string;
    category: 'Bullish' | 'Bearish' | 'Neutral';
    events: number;
    resolvedEvents: number;
    winRate1c: number | null;
    recommendation: 'keep' | 'needs_review' | 'insufficient_data';
    reasons: string[];
};

type PerformanceReport = {
    schemaVersion: string;
    generatedAt: number;
    metrics: ReportMetric[];
};

type RuleSuggestion = {
    patternId: string;
    category: 'Bullish' | 'Bearish' | 'Neutral';
    action: 'added_trend_rule' | 'tightened_single_candle_body' | 'manual_review_only';
    beforeRules: string[];
    afterRules: string[];
    reason: string;
};

function normalizeRule(rule: string): string {
    return String(rule || '').replace(/\s+/g, '').toLowerCase();
}

function hasRule(rules: string[], target: string): boolean {
    const normalizedTarget = normalizeRule(target);
    return rules.some((rule) => normalizeRule(rule) === normalizedTarget);
}

function ensureTrendRule(pattern: PatternRule): string | null {
    if (pattern.category === 'Bullish') return 'downtrend(0)';
    if (pattern.category === 'Bearish') return 'uptrend(0)';
    return null;
}

function toMarkdown(suggestions: RuleSuggestion[]): string {
    if (suggestions.length === 0) {
        return '# Rule Suggestions\n\nNo automatic suggestions generated.\n';
    }

    const lines = suggestions.map((s) => {
        return `| ${s.patternId} | ${s.category} | ${s.action} | ${s.reason} |`;
    });

    return [
        '# Rule Suggestions',
        '',
        '| Pattern | Category | Action | Reason |',
        '| --- | --- | --- | --- |',
        ...lines,
        '',
    ].join('\n');
}

function main() {
    const newReportPath = path.resolve(process.cwd(), 'artifacts', 'pattern-performance-report.json');
    const legacyReportPath = path.resolve(process.cwd(), 'artifacts', 'weekly-pattern-report.json');
    const ruleFilePath = path.resolve(
        process.cwd(),
        'data',
        'patterns',
        'infinityalgo_candlestick_patterns_rules_vi.json',
    );
    const reportPath = fs.existsSync(newReportPath) ? newReportPath : legacyReportPath;
    if (!fs.existsSync(reportPath)) {
        throw new Error(`Pattern report not found: ${newReportPath}`);
    }
    if (!fs.existsSync(ruleFilePath)) {
        throw new Error(`Rule file not found: ${ruleFilePath}`);
    }

    const report = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as PerformanceReport;
    const ruleFile = JSON.parse(fs.readFileSync(ruleFilePath, 'utf8')) as RuleFile;

    const metricByPattern = new Map<string, ReportMetric>(
        (report.metrics || []).map((metric) => [metric.patternId, metric]),
    );

    const suggestions: RuleSuggestion[] = [];
    const nextPatterns = (ruleFile.patterns || []).map((pattern) => {
        const metric = metricByPattern.get(pattern.pattern);
        if (!metric || metric.recommendation !== 'needs_review') {
            return {
                ...pattern,
                rules: pattern.rules.slice(),
            };
        }

        const beforeRules = pattern.rules.slice();
        const nextRules = pattern.rules.slice();
        const trendRule = ensureTrendRule(pattern);
        let action: RuleSuggestion['action'] = 'manual_review_only';
        let reason = metric.reasons.join(', ') || 'needs_review';

        if (trendRule && !hasRule(nextRules, trendRule)) {
            nextRules.unshift(trendRule);
            action = 'added_trend_rule';
            reason = `missing trend context + ${reason}`;
        } else if (
            pattern.candles === 1 &&
            metric.resolvedEvents >= 100 &&
            metric.winRate1c !== null &&
            metric.winRate1c < 0.45 &&
            hasRule(nextRules, 'small_body(0)') &&
            !hasRule(nextRules, 'B[0] <= 0.8*alpha*R[0]')
        ) {
            nextRules.push('B[0] <= 0.8*alpha*R[0]');
            action = 'tightened_single_candle_body';
            reason = `low win rate with high sample size + ${reason}`;
        }

        suggestions.push({
            patternId: pattern.pattern,
            category: pattern.category,
            action,
            beforeRules,
            afterRules: nextRules,
            reason,
        });

        return {
            ...pattern,
            rules: nextRules,
        };
    });

    const nextRuleFile: RuleFile = {
        ...ruleFile,
        meta: {
            ...(ruleFile.meta || {}),
            suggested_by: 'telemetry-suggest-rules',
            suggested_at: new Date().toISOString(),
        },
        patterns: nextPatterns,
    };

    const outDir = path.resolve(process.cwd(), 'artifacts', 'proposed_rules');
    fs.mkdirSync(outDir, { recursive: true });
    const candidateRulePath = path.join(
        outDir,
        'infinityalgo_candlestick_patterns_rules_vi.candidate.json',
    );
    const suggestionJsonPath = path.join(outDir, 'rule_adjustment_suggestions.json');
    const suggestionMdPath = path.join(outDir, 'rule_adjustment_suggestions.md');

    fs.writeFileSync(candidateRulePath, `${JSON.stringify(nextRuleFile, null, 2)}\n`);
    fs.writeFileSync(suggestionJsonPath, `${JSON.stringify({ suggestions }, null, 2)}\n`);
    fs.writeFileSync(suggestionMdPath, `${toMarkdown(suggestions)}\n`);

    console.log(`telemetry_suggest_rules: candidate=${candidateRulePath}`);
    console.log(`telemetry_suggest_rules: suggestions_json=${suggestionJsonPath}`);
    console.log(`telemetry_suggest_rules: suggestions_md=${suggestionMdPath}`);
    console.log(`telemetry_suggest_rules: suggestion_count=${suggestions.length}`);
}

try {
    main();
} catch (error) {
    console.error('telemetry_suggest_rules_failed');
    console.error(error);
    process.exit(1);
}
