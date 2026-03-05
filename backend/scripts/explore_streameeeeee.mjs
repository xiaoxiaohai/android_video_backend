import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

function parseArgs(argv) {
  const args = {
    watchUrl: '',
    retries: 0,
    noRandomHosts: true,
    proxies: [],
    outDir: path.resolve(process.cwd(), 'output', 'streameeeeee-explore'),
    hosts: []
  };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--url' || cur === '-u') {
      args.watchUrl = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--retries') {
      const n = Number(argv[i + 1] || 0);
      args.retries = Number.isFinite(n) ? Math.max(0, Math.floor(n)) : 0;
      i += 1;
      continue;
    }
    if (cur === '--hosts') {
      args.hosts = String(argv[i + 1] || '')
        .split(',')
        .map((x) => x.trim())
        .filter(Boolean);
      i += 1;
      continue;
    }
    if (cur === '--proxies') {
      args.proxies = parseProxySpec(String(argv[i + 1] || ''));
      i += 1;
      continue;
    }
    if (cur === '--out-dir') {
      args.outDir = path.resolve(String(argv[i + 1] || '').trim() || args.outDir);
      i += 1;
      continue;
    }
    if (cur === '--random-hosts') {
      args.noRandomHosts = false;
      continue;
    }
  }
  return args;
}

function parseProxySpec(spec) {
  if (!spec) return [];
  return spec
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((item, idx) => {
      const eq = item.indexOf('=');
      if (eq < 0) return { name: `proxy${idx + 1}`, url: item };
      const name = item.slice(0, eq).trim() || `proxy${idx + 1}`;
      const url = item.slice(eq + 1).trim();
      return { name, url };
    })
    .filter((x) => x.url);
}

function deriveEpisodeId(watchUrl) {
  const m = String(watchUrl || '').match(/\.(\d+)(?:[/?#]|$)/);
  return m?.[1] || null;
}

function buildWatchCandidates(watchUrl, explicitHosts = []) {
  const out = [];
  const seen = new Set();
  const push = (u) => {
    const s = String(u || '').trim();
    if (!s || seen.has(s)) return;
    seen.add(s);
    out.push(s);
  };
  let u;
  try {
    u = new URL(watchUrl);
  } catch {
    return [watchUrl];
  }
  push(u.toString());

  const host = u.host.toLowerCase().replace(/\.$/, '');
  if (/^www\d+\./i.test(host)) {
    const w = new URL(u.toString());
    w.host = host.replace(/^www\d+\./i, '');
    push(w.toString());
  }

  const fallbackHosts = explicitHosts.length
    ? explicitHosts
    : /flixhq/.test(host)
      ? ['flixhq.to', 'www.flixhq.to', 'f2movies.la', 'f2moviesz.uk']
      : ['f2movies.la', 'f2moviesz.uk'];

  for (const h of fallbackHosts) {
    try {
      const w = new URL(u.toString());
      w.host = h;
      push(w.toString());
    } catch {
      // ignore
    }
  }
  return out;
}

function runCurlJson({ url, referer, proxy }) {
  const args = ['-sS', '-L', '--connect-timeout', '10', '--max-time', '25', '--get', url];
  if (proxy) args.push('--proxy', proxy);
  args.push('-H', 'x-requested-with: XMLHttpRequest');
  if (referer) args.push('-H', `referer: ${referer}`);
  const cp = spawnSync('curl', args, { encoding: 'utf8' });
  return {
    ok: cp.status === 0,
    statusCode: cp.status,
    stdout: cp.stdout || '',
    stderr: cp.stderr || ''
  };
}

function parseJsonSafe(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function runResolver({ watchUrl, retries, noRandomHosts, proxyUrl }) {
  const env = { ...process.env };
  if (proxyUrl) {
    env.HTTP_PROXY = proxyUrl;
    env.HTTPS_PROXY = proxyUrl;
    env.ALL_PROXY = proxyUrl;
  }
  env.RESOLVER_USE_CURL_FALLBACK = 'true';

  const args = ['backend/test_local_resolver.mjs', '--url', watchUrl, '--retries', String(retries)];
  if (noRandomHosts) args.push('--no-random-hosts');

  const cp = spawnSync('node', args, { encoding: 'utf8', env, cwd: path.resolve(process.cwd(), '..') });
  const json = parseJsonSafe(cp.stdout || '');
  return {
    ok: cp.status === 0 && !!json,
    statusCode: cp.status,
    json,
    stderr: cp.stderr || '',
    stdout: cp.stdout || ''
  };
}

function printSummary(summary) {
  console.log('\n=== Summary ===');
  for (const row of summary) {
    console.log(
      [
        `proxy=${row.proxy}`,
        `watchHost=${row.watchHost}`,
        `episodeProvider=${row.episodeProviderHost || 'n/a'}`,
        `resolverProvider=${row.resolverProviderHost || 'n/a'}`,
        `referer=${row.refererHost || 'n/a'}`,
        `streameeeeee=${row.hitStreameeeeee ? 'YES' : 'NO'}`
      ].join(' | ')
    );
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (!args.watchUrl) {
    throw new Error('missing --url');
  }
  const episodeId = deriveEpisodeId(args.watchUrl);
  if (!episodeId) {
    throw new Error(`cannot parse episode id from url: ${args.watchUrl}`);
  }

  const proxies = args.proxies.length ? args.proxies : [{ name: 'direct', url: '' }];
  const watchCandidates = buildWatchCandidates(args.watchUrl, args.hosts);
  const all = [];

  for (const p of proxies) {
    for (const watchUrl of watchCandidates) {
      let watchHost = '';
      try {
        watchHost = new URL(watchUrl).host;
      } catch {
        watchHost = '';
      }

      const episodeUrl = `https://${watchHost}/ajax/episode/sources/${episodeId}`;
      const epResp = runCurlJson({ url: episodeUrl, referer: watchUrl, proxy: p.url });
      const epJson = epResp.ok ? parseJsonSafe(epResp.stdout) : null;
      const providerUrl = epJson?.link ? String(epJson.link) : '';
      let episodeProviderHost = '';
      try {
        episodeProviderHost = providerUrl ? new URL(providerUrl).host : '';
      } catch {
        episodeProviderHost = '';
      }

      const resolverResp = runResolver({
        watchUrl,
        retries: args.retries,
        noRandomHosts: args.noRandomHosts,
        proxyUrl: p.url
      });
      const result = resolverResp.json || {};
      let resolverProviderHost = '';
      let refererHost = '';
      try {
        const provider = result?.debug?.find?.((x) => x?.step === 'videostr_provider_found')?.providerUrl || '';
        resolverProviderHost = provider ? new URL(provider).host : '';
      } catch {
        resolverProviderHost = '';
      }
      try {
        const ref = result?.files?.[0]?.headers?.Referer || '';
        refererHost = ref ? new URL(ref).host : '';
      } catch {
        refererHost = '';
      }

      const hitStreameeeeee =
        /streameeeeee\.site/i.test(episodeProviderHost) ||
        /streameeeeee\.site/i.test(resolverProviderHost) ||
        /streameeeeee\.site/i.test(refererHost);

      all.push({
        time: new Date().toISOString(),
        proxy: p.name,
        proxyUrl: p.url || '',
        watchUrl,
        watchHost,
        episodeSource: {
          ok: epResp.ok,
          url: episodeUrl,
          stderr: epResp.stderr.trim(),
          rawBody: epResp.stdout || '',
          rawBodyPreview: String(epResp.stdout || '').slice(0, 1000),
          providerUrl,
          providerHost: episodeProviderHost
        },
        resolver: {
          ok: resolverResp.ok,
          stderr: resolverResp.stderr.trim(),
          providerHost: resolverProviderHost,
          refererHost,
          files: Array.isArray(result?.files) ? result.files.length : 0,
          captions: Array.isArray(result?.captions) ? result.captions.length : 0
        },
        hitStreameeeeee
      });
    }
  }

  fs.mkdirSync(args.outDir, { recursive: true });
  const stamp = new Date().toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const outFile = path.join(args.outDir, `explore-${stamp}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ input: args, episodeId, results: all }, null, 2), 'utf8');

  const summary = all.map((x) => ({
    proxy: x.proxy,
    watchHost: x.watchHost,
    episodeProviderHost: x.episodeSource.providerHost,
    resolverProviderHost: x.resolver.providerHost,
    refererHost: x.resolver.refererHost,
    hitStreameeeeee: x.hitStreameeeeee
  }));
  printSummary(summary);
  console.log(`\nSaved: ${outFile}`);
}

main().catch((err) => {
  console.error(`error: ${err?.message || String(err)}`);
  process.exit(1);
});
