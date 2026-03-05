import { collectCaptionsFromText, collectM3u8FromText, fetchWithRetry, uniqueByUrl } from './test_providers/common.mjs';
import { f2moviesProvider } from './test_providers/f2moviesProvider.mjs';
import { flixhqProvider } from './test_providers/flixhqProvider.mjs';
import { novhopProvider } from './test_providers/novhopProvider.mjs';

const DEFAULT_WATCH_URL = 'https://www6.f2movies.to/watch-movie/bhaijaan-elo-re-1.5373679';

function parseArgs(argv) {
  const args = {
    watchUrl: '',
    referer: '',
    origin: '',
    cookie: '',
    userAgent: '',
    includeDebug: true,
    retries: 2,
    randomizeHosts: true
  };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--url' || cur === '-u') {
      args.watchUrl = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--referer') {
      args.referer = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--origin') {
      args.origin = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--cookie') {
      args.cookie = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--ua') {
      args.userAgent = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--no-debug') {
      args.includeDebug = false;
      continue;
    }
    if (cur === '--retries') {
      const n = Number(argv[i + 1] || 2);
      args.retries = Number.isFinite(n) && n >= 0 ? Math.floor(n) : 2;
      i += 1;
      continue;
    }
    if (cur === '--no-random-hosts') {
      args.randomizeHosts = false;
    }
  }
  if (!args.watchUrl) args.watchUrl = DEFAULT_WATCH_URL;
  return args;
}

function buildHeaders(args) {
  const headers = {
    'user-agent':
      args.userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9'
  };
  if (args.referer) headers.referer = args.referer;
  if (args.origin) headers.origin = args.origin;
  if (args.cookie) headers.cookie = args.cookie;
  return headers;
}

async function resolveFallback({ watchUrl, headers, args }) {
  const debug = [];
  const hostReports = [];
  const res = await fetchWithRetry(watchUrl, headers, args.retries, debug, 'fallback_fetch');
  const files = [];
  const captions = [];
  if (res.ok) {
    files.push(...collectM3u8FromText(res.text, watchUrl, 'fallback_html'));
    captions.push(...collectCaptionsFromText(res.text, watchUrl, 'fallback_html'));
  }
  const outFiles = uniqueByUrl(files).map((x) => ({ file: x.url, type: 'hls', headers: x.headers || {} }));
  const outCaptions = uniqueByUrl(captions, 'file');
  hostReports.push({
    watchUrl,
    ok: outFiles.length > 0,
    files: outFiles.length,
    captions: outCaptions.length,
    reason: res.ok ? (outFiles.length > 0 ? 'ok' : 'no_media_found') : (res.error || `http_${res.status}`),
    preview: res.textPreview || ''
  });
  return {
    ok: true,
    provider: 'fallback',
    watchUrl,
    activeWatchUrl: watchUrl,
    files: outFiles,
    captions: outCaptions,
    primary: outFiles[0] || null,
    debug,
    hostReports
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const headers = buildHeaders(args);
  const providers = [novhopProvider, flixhqProvider, f2moviesProvider];
  const provider = providers.find((p) => p.supports(args.watchUrl));

  const result = provider
    ? await provider.resolve({ watchUrl: args.watchUrl, headers, args })
    : await resolveFallback({ watchUrl: args.watchUrl, headers, args });

  const out = {
    ok: true,
    watchUrl: result.watchUrl,
    provider: result.provider,
    activeWatchUrl: result.activeWatchUrl,
    files: result.files,
    captions: result.captions,
    primary: result.primary,
    hostReports: result.hostReports
  };
  if (args.includeDebug) out.debug = result.debug;
  console.log(JSON.stringify(out, null, 2));
}

main().catch((err) => {
  console.error(
    JSON.stringify(
      {
        ok: false,
        error: err?.message || String(err)
      },
      null,
      2
    )
  );
  process.exit(1);
});
