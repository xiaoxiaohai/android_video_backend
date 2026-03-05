import crypto from 'node:crypto';

// 你也可以直接改这里的默认链接
const DEFAULT_WATCH_URL =
  'https://www6.f2movies.to/watch-movie/bhaijaan-elo-re-1.5373679';

const cfg = {
  apiBase: process.env.UPSTREAM_API_BASE || 'https://cineframeplayer.com/module-movie/',
  requestedWith: process.env.UPSTREAM_REQUESTED_WITH || 'com.cine.frame.hd.video.player',
  appVersion: process.env.UPSTREAM_APP_VERSION || '1.1.1',
  language: process.env.UPSTREAM_LANGUAGE || 'en',
  decryptKey: process.env.UPSTREAM_DECRYPT_KEY || '8fOsTegF23mV43Nr6xiOisP34ZPN41WC',
  decryptAlgorithm: process.env.UPSTREAM_DECRYPT_ALGORITHM || 'aes-256-cbc'
};

function parseArgs(argv) {
  const args = { watchUrl: '', force: 'false', raw: false };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--url' || cur === '-u') {
      args.watchUrl = String(argv[i + 1] || '').trim();
      i += 1;
      continue;
    }
    if (cur === '--force') {
      args.force = String(argv[i + 1] || 'false').trim();
      i += 1;
      continue;
    }
    if (cur === '--raw') {
      args.raw = true;
    }
  }
  if (!args.watchUrl) args.watchUrl = DEFAULT_WATCH_URL;
  return args;
}

function decodeWrappedPayload(rawText) {
  const outer = Buffer.from(rawText.trim(), 'base64').toString('utf8');
  const wrapped = JSON.parse(outer);
  if (!wrapped || typeof wrapped !== 'object' || !wrapped.value || !wrapped.iv) {
    throw new Error('wrapped payload format invalid');
  }
  const iv = Buffer.from(String(wrapped.iv), 'utf8');
  const encrypted = Buffer.from(String(wrapped.value), 'base64');
  const key = Buffer.from(cfg.decryptKey, 'utf8');
  const decipher = crypto.createDecipheriv(cfg.decryptAlgorithm, key, iv);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function extractResult(payload) {
  const data = payload?.data || {};
  let files = [];
  let captions = [];
  try {
    files = typeof data.files === 'string' ? JSON.parse(data.files) : (data.files || []);
  } catch {
    files = [];
  }
  try {
    captions =
      typeof data.caption === 'string' ? JSON.parse(data.caption) : (data.caption || []);
  } catch {
    captions = [];
  }
  return {
    status: payload?.status,
    dataId: data?.id || null,
    lineUrl: data?.url || null,
    fileCount: Array.isArray(files) ? files.length : 0,
    captionCount: Array.isArray(captions) ? captions.length : 0,
    files: Array.isArray(files) ? files : [],
    captions: Array.isArray(captions) ? captions : []
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const endpoint = new URL('pl/ad', cfg.apiBase);
  endpoint.searchParams.set('url', args.watchUrl);
  endpoint.searchParams.set('force', args.force);

  const headers = {
    'x-requested-with': cfg.requestedWith,
    'x-app-version': cfg.appVersion,
    language: cfg.language
  };

  const res = await fetch(endpoint, { headers });
  const rawText = await res.text();

  let payload = null;
  let decodeMode = 'plain_json';
  try {
    payload = decodeWrappedPayload(rawText);
    decodeMode = 'wrapped_base64_aes';
  } catch {
    payload = JSON.parse(rawText);
  }

  const out = {
    ok: true,
    httpStatus: res.status,
    decodeMode,
    requestUrl: endpoint.toString(),
    watchUrl: args.watchUrl,
    parsed: extractResult(payload)
  };

  if (args.raw) out.rawPayload = payload;
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

