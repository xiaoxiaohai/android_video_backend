import { spawn } from 'node:child_process';

export function toAbsolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

export function normalizeEscaped(value) {
  return String(value || '')
    .trim()
    .replace(/\\\//g, '/')
    .replace(/\\\\u002F/gi, '/');
}

export function uniqueByUrl(list, keyField = 'url') {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const key = String(item?.[keyField] || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function collectM3u8FromText(text, baseUrl, source, headers = {}) {
  const out = [];
  const patterns = [
    /"(https?:\/\/[^"\\\s]+\.m3u8[^"\\\s]*)"/gi,
    /'(https?:\/\/[^'\\\s]+\.m3u8[^'\\\s]*)'/gi,
    /(https?:\\\/\\\/[^"'\s]+\.m3u8[^"'\s]*)/gi
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(String(text || ''))) !== null) {
      const raw = normalizeEscaped(m[1] || m[0]);
      const abs = toAbsolute(raw, baseUrl);
      if (!abs || !abs.includes('.m3u8')) continue;
      out.push({ url: abs, source, headers });
    }
  }
  return uniqueByUrl(out);
}

export function collectCaptionsFromText(text, baseUrl, source) {
  const out = [];
  const patterns = [
    /(https?:\/\/[^"'\s]+?\.(?:vtt|srt)(?:\?[^"'\s]*)?)/gi,
    /["']([^"']+?\.(?:vtt|srt)(?:\?[^"']*)?)["']/gi
  ];
  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(String(text || ''))) !== null) {
      const abs = toAbsolute(normalizeEscaped(m[1]), baseUrl);
      if (!abs) continue;
      out.push({ file: abs, kind: 'captions', label: '', language: '', source });
    }
  }
  return uniqueByUrl(out, 'file');
}

export function deepCollect(obj, out = { m3u8: [], captions: [] }, baseUrl = '') {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) deepCollect(v, out, baseUrl);
    return out;
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      const raw = normalizeEscaped(v);
      if (raw.includes('.m3u8')) {
        const abs = toAbsolute(raw, baseUrl) || raw;
        out.m3u8.push(abs);
      }
      if (/\.(vtt|srt)(\?|$)/i.test(raw)) {
        const abs = toAbsolute(raw, baseUrl) || raw;
        out.captions.push(abs);
      }
      if (raw.startsWith('{') || raw.startsWith('[')) {
        try {
          deepCollect(JSON.parse(raw), out, baseUrl);
        } catch {
          // ignore
        }
      }
    } else if (v && typeof v === 'object') {
      deepCollect(v, out, baseUrl);
    }
  }
  return out;
}

export function extractScriptUrls(html, baseUrl) {
  const out = [];
  const regex = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = regex.exec(String(html || ''))) !== null) {
    const abs = toAbsolute(normalizeEscaped(m[1]), baseUrl);
    if (!abs) continue;
    out.push(abs);
  }
  return Array.from(new Set(out));
}

export function looksLikeChallengePage(html) {
  const t = String(html || '');
  return /FingerprintJS\.load/i.test(t) || /tr_uuid=/i.test(t) || /We're Sorry!/i.test(t);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function curlFetchText(url, headers) {
  const hostResolveMap = (() => {
    const raw = String(process.env.RESOLVER_HOST_RESOLVE || '').trim();
    if (!raw) return {};
    const map = {};
    for (const seg of raw.split(/[,\n;]/)) {
      const s = seg.trim();
      if (!s) continue;
      const [k, v] = s.split('=');
      const host = String(k || '').trim().toLowerCase().replace(/\.$/, '');
      const ip = String(v || '').trim();
      if (!host || !ip) continue;
      map[host] = ip;
    }
    return map;
  })();

  const args = ['-L', '--compressed', '-sS', '--connect-timeout', '10', '--max-time', '25', '-w', '\n__CURL_STATUS__:%{http_code}'];
  if (String(process.env.RESOLVER_CURL_INSECURE || '').toLowerCase() === 'true') args.push('-k');
  try {
    const h = new URL(url).host.toLowerCase().replace(/\.$/, '');
    const ip = hostResolveMap[h];
    if (ip) args.push('--resolve', `${h}:443:${ip}`);
  } catch {
    // ignore
  }
  for (const [k, v] of Object.entries(headers || {})) {
    if (v == null || v === '') continue;
    args.push('-H', `${k}: ${v}`);
  }
  args.push(url);

  return await new Promise((resolve) => {
    const child = spawn('curl', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d) => {
      stdout += String(d);
    });
    child.stderr.on('data', (d) => {
      stderr += String(d);
    });
    child.on('close', (code) => {
      if (code !== 0) {
        resolve({
          ok: false,
          status: -1,
          text: '',
          url,
          error: stderr.trim() || `curl_exit_${code}`
        });
        return;
      }
      const marker = '\n__CURL_STATUS__:';
      const idx = stdout.lastIndexOf(marker);
      const body = idx >= 0 ? stdout.slice(0, idx) : stdout;
      const statusRaw = idx >= 0 ? stdout.slice(idx + marker.length).trim() : '';
      const status = Number(statusRaw) || 0;
      resolve({
        ok: status >= 200 && status < 300,
        status,
        text: body,
        textPreview: body.slice(0, 300),
        url
      });
    });
  });
}

export async function fetchText(url, headers) {
  try {
    const res = await fetch(url, { headers });
    const text = await res.text();
    return {
      ok: res.ok,
      status: res.status,
      text,
      textPreview: text.slice(0, 300),
      url
    };
  } catch (err) {
    const shouldUseCurlFallback = String(process.env.RESOLVER_USE_CURL_FALLBACK || 'true').toLowerCase() !== 'false';
    if (shouldUseCurlFallback) {
      const curlRes = await curlFetchText(url, headers);
      if (curlRes.ok || curlRes.status > 0) {
        return {
          ...curlRes,
          error: curlRes.error || (err?.message || String(err)),
          transport: 'curl_fallback'
        };
      }
      return {
        ok: false,
        status: -1,
        text: '',
        url,
        error: `${err?.message || String(err)}; ${curlRes.error || 'curl_failed'}`
      };
    }
    return { ok: false, status: -1, text: '', url, error: err?.message || String(err) };
  }
}

export async function fetchWithRetry(url, headers, retries, debug, step, extra = {}) {
  let resp = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    resp = await fetchText(url, headers);
    debug.push({
      step,
      url,
      attempt: attempt + 1,
      maxAttempts: retries + 1,
      status: resp.status,
      ok: resp.ok,
      error: resp.error || null,
      ...extra
    });
    if (resp.ok) break;
    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, 250 * (attempt + 1)));
    }
  }
  return resp;
}
