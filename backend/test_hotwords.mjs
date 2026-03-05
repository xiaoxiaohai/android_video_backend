import crypto from 'node:crypto';

const cfg = {
  apiBase: process.env.UPSTREAM_API_BASE || 'https://cineframeplayer.com/module-movie/',
  requestedWith: process.env.UPSTREAM_REQUESTED_WITH || 'com.cine.frame.hd.video.player',
  appVersion: process.env.UPSTREAM_APP_VERSION || '1.1.1',
  language: process.env.UPSTREAM_LANGUAGE || 'en',
  decryptKey: process.env.UPSTREAM_DECRYPT_KEY || '8fOsTegF23mV43Nr6xiOisP34ZPN41WC',
  decryptAlgorithm: process.env.UPSTREAM_DECRYPT_ALGORITHM || 'aes-256-cbc'
};

function parseArgs(argv) {
  const args = {
    endpoint: 'in/re/wo',
    raw: false
  };
  for (let i = 2; i < argv.length; i += 1) {
    const cur = argv[i];
    if (cur === '--endpoint' || cur === '-e') {
      args.endpoint = String(argv[i + 1] || 'in/re/wo').trim();
      i += 1;
      continue;
    }
    if (cur === '--raw') args.raw = true;
  }
  return args;
}

function decryptWithIvAndCipher(iv, encrypted) {
  const key = Buffer.from(cfg.decryptKey, 'utf8');
  const decipher = crypto.createDecipheriv(cfg.decryptAlgorithm, key, iv);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function decodeWrappedPayload(rawText) {
  const trimmed = rawText.trim();

  // Format A (collector style):
  // rawText = base64('{"iv":"...","value":"..."}')
  try {
    const outerA = JSON.parse(Buffer.from(trimmed, 'base64').toString('utf8'));
    if (outerA && typeof outerA === 'object' && outerA.iv && outerA.value) {
      const iv = Buffer.from(String(outerA.iv), 'utf8');
      const encrypted = Buffer.from(String(outerA.value), 'base64');
      return decryptWithIvAndCipher(iv, encrypted);
    }
  } catch {
    // ignore
  }

  // Format B (some pl/ad returns):
  // rawText = '{"value":"<base64(iv+cipher)>"}'
  try {
    const outerB = JSON.parse(trimmed);
    if (outerB && typeof outerB === 'object' && typeof outerB.value === 'string') {
      const packed = Buffer.from(outerB.value, 'base64');
      if (packed.length > 16) {
        const iv = packed.subarray(0, 16);
        const encrypted = packed.subarray(16);
        return decryptWithIvAndCipher(iv, encrypted);
      }
    }
  } catch {
    // ignore
  }

  throw new Error('wrapped payload format invalid');
}

function normalize(payload) {
  const data = payload?.data ?? payload ?? {};
  const hotWords = Array.isArray(data?.hotWords) ? data.hotWords : [];
  const popularWords = Array.isArray(data?.popularWords) ? data.popularWords : [];
  return {
    status: payload?.status ?? null,
    hotWords,
    popularWords
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const endpoint = new URL(args.endpoint, cfg.apiBase);
  const headers = {
    'x-requested-with': cfg.requestedWith,
    'x-app-version': cfg.appVersion,
    language: cfg.language
  };

  const res = await fetch(endpoint, { headers });
  const rawText = await res.text();

  let payload;
  let decodeMode = 'plain_json';
  try {
    payload = decodeWrappedPayload(rawText);
    decodeMode = 'wrapped_payload';
  } catch {
    payload = JSON.parse(rawText);
  }

  const out = {
    ok: true,
    httpStatus: res.status,
    decodeMode,
    requestUrl: endpoint.toString(),
    parsed: normalize(payload)
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
