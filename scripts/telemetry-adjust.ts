import { execFileSync } from 'child_process';
import path from 'path';

type AdjustArgs = {
    inputDir: string | null;
    from: string | null;
    to: string | null;
    windowDays: number | null;
    skipIngest: boolean;
};

function parseArgs(argv: string[]): AdjustArgs {
    const args: AdjustArgs = {
        inputDir: null,
        from: null,
        to: null,
        windowDays: null,
        skipIngest: false,
    };

    for (const token of argv) {
        if (!token.startsWith('--')) continue;
        const [rawKey, ...rest] = token.slice(2).split('=');
        const key = rawKey.trim();
        const value = rest.length > 0 ? rest.join('=').trim() : '';
        if (key === 'input-dir' && value) args.inputDir = value;
        if (key === 'from' && value) args.from = value;
        if (key === 'to' && value) args.to = value;
        if (key === 'windowDays' && value) {
            const n = Number(value);
            if (Number.isFinite(n) && n > 0) args.windowDays = Math.floor(n);
        }
        if (key === 'skip-ingest') args.skipIngest = true;
    }

    return args;
}

function runScript(scriptName: string, extraArgs: string[] = []): void {
    const scriptPath = path.resolve(process.cwd(), 'scripts', scriptName);
    execFileSync(
        process.execPath,
        ['--loader', 'ts-node/esm', scriptPath, ...extraArgs],
        { stdio: 'inherit' },
    );
}

function main() {
    const args = parseArgs(process.argv.slice(2));

    if (!args.skipIngest) {
        const ingestArgs: string[] = [];
        if (args.inputDir) ingestArgs.push(`--input-dir=${args.inputDir}`);
        runScript('telemetry-ingest.ts', ingestArgs);
    }

    const reportArgs: string[] = [];
    if (args.from) reportArgs.push(`--from=${args.from}`);
    if (args.to) reportArgs.push(`--to=${args.to}`);
    if (args.windowDays !== null) reportArgs.push(`--windowDays=${args.windowDays}`);
    runScript('telemetry-weekly-report.ts', reportArgs);

    runScript('telemetry-suggest-rules.ts');

    console.log('telemetry_adjust: complete');
    console.log('telemetry_adjust: report_json=artifacts/pattern-performance-report.json');
    console.log('telemetry_adjust: report_md=artifacts/pattern-performance-report.md');
    console.log(
        'telemetry_adjust: candidate_rules=artifacts/proposed_rules/infinityalgo_candlestick_patterns_rules_vi.candidate.json',
    );
}

try {
    main();
} catch (error) {
    console.error('telemetry_adjust_failed');
    console.error(error);
    process.exit(1);
}
