import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_WATCH_URL = 'https://www6.f2movies.to/watch-movie/bhaijaan-elo-re-1.5373679';

function parseArgs(argv) {
  const args = {
    watchUrl: DEFAULT_WATCH_URL,
    force: 'false',
    retries: 0,
    noRandomHosts: true,
    outDir: path.resolve(process.cwd(), 'output', 'resolver-compare')
  };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--url' || cur === '-u') {
      args.watchUrl = String(argv[i + 1] || '').trim() || args.watchUrl;
      i += 1;
      continue;
    }
    if (cur === '--force') {
      args.force = String(argv[i + 1] || 'false').trim();
      i += 1;
      continue;
    }
    if (cur === '--retries') {
      const n = Number(argv[i + 1] || 0);
      args.retries = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      i += 1;
      continue;
    }
    if (cur === '--random-hosts') {
      args.noRandomHosts = false;
      continue;
    }
    if (cur === '--out-dir') {
      args.outDir = path.resolve(String(argv[i + 1] || '').trim() || args.outDir);
      i += 1;
    }
  }
  return args;
}

function hostOf(url) {
  try {
    return new URL(String(url || '')).host;
  } catch {
    return '';
  }
}

function parseJson(text) {
  try {
    return JSON.parse(String(text || ''));
  } catch {
    return null;
  }
}

function runNodeScript(file, scriptArgs, env = {}) {
  const cp = spawnSync('node', [file, ...scriptArgs], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { ...process.env, ...env }
  });
  const out = parseJson(cp.stdout);
  const errOut = parseJson(cp.stderr);
  return {
    status: cp.status,
    ok: cp.status === 0 && !!out?.ok,
    stdout: cp.stdout || '',
    stderr: cp.stderr || '',
    json: out || errOut || null
  };
}

function summarizeUpstream(json) {
  const parsed = json?.parsed || {};
  const files = Array.isArray(parsed.files) ? parsed.files : [];
  const captions = Array.isArray(parsed.captions) ? parsed.captions : [];
  const first = files[0] || null;
  const headers = first?.headers && typeof first.headers === 'object' ? first.headers : {};
  return {
    status: parsed.status ?? null,
    dataId: parsed.dataId ?? null,
    lineUrl: parsed.lineUrl || null,
    fileCount: files.length,
    captionCount: captions.length,
    firstFile: first?.file || null,
    firstFileHost: hostOf(first?.file || ''),
    referer: headers.Referer || headers.referer || null,
    refererHost: hostOf(headers.Referer || headers.referer || ''),
    captionLangs: Array.from(new Set(captions.map((x) => String(x?.language || '').trim()).filter(Boolean))).sort()
  };
}

function summarizeLocal(json) {
  const files = Array.isArray(json?.files) ? json.files : [];
  const captions = Array.isArray(json?.captions) ? json.captions : [];
  const first = files[0] || null;
  const headers = first?.headers && typeof first.headers === 'object' ? first.headers : {};
  const providerUrl = json?.debug?.find?.((x) => x?.step === 'videostr_provider_found')?.providerUrl || null;
  return {
    provider: json?.provider || null,
    activeWatchUrl: json?.activeWatchUrl || null,
    providerUrl,
    providerHost: hostOf(providerUrl || ''),
    fileCount: files.length,
    captionCount: captions.length,
    firstFile: first?.file || null,
    firstFileHost: hostOf(first?.file || ''),
    referer: headers.Referer || headers.referer || null,
    refererHost: hostOf(headers.Referer || headers.referer || ''),
    captionLangs: Array.from(new Set(captions.map((x) => String(x?.language || '').trim()).filter(Boolean))).sort()
  };
}

function compareSummary(upstream, local) {
  const diffs = [];
  const pushIfDiff = (name, a, b) => {
    if (a !== b) diffs.push({ field: name, upstream: a, local: b });
  };
  pushIfDiff('fileCount', upstream.fileCount, local.fileCount);
  pushIfDiff('captionCount', upstream.captionCount, local.captionCount);
  pushIfDiff('firstFileHost', upstream.firstFileHost, local.firstFileHost);
  pushIfDiff('refererHost', upstream.refererHost, local.refererHost);
  pushIfDiff('providerHost(local-only)', upstream.refererHost, local.providerHost);

  const upLang = upstream.captionLangs.join(',');
  const lcLang = local.captionLangs.join(',');
  pushIfDiff('captionLangs', upLang, lcLang);

  return {
    samePrimaryHost: upstream.firstFileHost && upstream.firstFileHost === local.firstFileHost,
    sameRefererHost: upstream.refererHost && upstream.refererHost === local.refererHost,
    upstreamLooksStreameeeeee:
      /streameeeeee\.site/i.test(upstream.refererHost) || /streameeeeee\.site/i.test(upstream.firstFileHost),
    localLooksStreameeeeee:
      /streameeeeee\.site/i.test(local.refererHost) ||
      /streameeeeee\.site/i.test(local.firstFileHost) ||
      /streameeeeee\.site/i.test(local.providerHost),
    diffs
  };
}

function printHuman(summary) {
  console.log('\n=== Upstream ===');
  console.log(
    `fileCount=${summary.upstream.fileCount} captionCount=${summary.upstream.captionCount} fileHost=${summary.upstream.firstFileHost || 'n/a'} refererHost=${summary.upstream.refererHost || 'n/a'}`
  );
  console.log('\n=== Local ===');
  console.log(
    `provider=${summary.local.provider || 'n/a'} fileCount=${summary.local.fileCount} captionCount=${summary.local.captionCount} fileHost=${summary.local.firstFileHost || 'n/a'} refererHost=${summary.local.refererHost || 'n/a'} providerHost=${summary.local.providerHost || 'n/a'}`
  );
  console.log('\n=== Compare ===');
  console.log(
    `samePrimaryHost=${summary.compare.samePrimaryHost} sameRefererHost=${summary.compare.sameRefererHost} upstreamStreameeeeee=${summary.compare.upstreamLooksStreameeeeee} localStreameeeeee=${summary.compare.localLooksStreameeeeee}`
  );
  if (!summary.compare.diffs.length) {
    console.log('diffs: none');
  } else {
    for (const d of summary.compare.diffs) {
      console.log(`diff ${d.field}: upstream=${d.upstream || 'n/a'} | local=${d.local || 'n/a'}`);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv);

  const upstream = runNodeScript('test_upstream_resolve.mjs', ['--url', args.watchUrl, '--force', args.force]);
  const localArgs = ['--url', args.watchUrl, '--retries', String(args.retries)];
  if (args.noRandomHosts) localArgs.push('--no-random-hosts');
  const local = runNodeScript('test_local_resolver.mjs', localArgs, { RESOLVER_USE_CURL_FALLBACK: 'true' });

  const summary = {
    input: args,
    runtime: new Date().toISOString(),
    status: {
      upstreamOk: upstream.ok,
      localOk: local.ok
    },
    upstreamRaw: upstream.json,
    localRaw: local.json,
    upstream: summarizeUpstream(upstream.json || {}),
    local: summarizeLocal(local.json || {})
  };
  summary.compare = compareSummary(summary.upstream, summary.local);

  fs.mkdirSync(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outFile = path.join(args.outDir, `compare-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify(summary, null, 2), 'utf8');

  printHuman(summary);
  console.log(`\nSaved: ${outFile}`);
}

main().catch((err) => {
  console.error(`error: ${err?.message || String(err)}`);
  process.exit(1);
});
