import crypto from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import { extractMegacloudSources } from '../utils/megacloud-decrypt.js';

function toAbsolute(url, baseUrl) {
  try {
    return new URL(url, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeEscaped(value) {
  return String(value || '')
    .trim()
    .replace(/\\\//g, '/')
    .replace(/\\\\u002F/gi, '/');
}

function uniqueByUrl(list, keyField = 'url') {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = String(item?.[keyField] || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function decodeUriSafe(value) {
  if (typeof value !== 'string') return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function collectM3u8FromText(text, baseUrl, source, headers = {}) {
  const out = [];
  const patterns = [
    /"(https?:\/\/[^"\\\s]+\.m3u8[^"\\\s]*)"/gi,
    /'(https?:\/\/[^'\\\s]+\.m3u8[^'\\\s]*)'/gi,
    /(https?:\\\/\\\/[^"'\s]+\.m3u8[^"'\s]*)/gi,
    /"(.*?)"/gi
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      const raw = normalizeEscaped(m[1] || m[0]);
      if (!raw.includes('.m3u8')) continue;
      const abs = toAbsolute(raw, baseUrl);
      if (!abs) continue;
      out.push({ url: abs, source, headers });
    }
  }
  return uniqueByUrl(out);
}

function collectCaptionsFromText(text, baseUrl, source) {
  const out = [];
  const patterns = [
    /(https?:\/\/[^"'\s]+?\.(?:vtt|srt)(?:\?[^"'\s]*)?)/gi,
    /["']([^"']+?\.(?:vtt|srt)(?:\?[^"']*)?)["']/gi
  ];

  for (const regex of patterns) {
    let m;
    while ((m = regex.exec(text)) !== null) {
      const abs = toAbsolute(normalizeEscaped(m[1]), baseUrl);
      if (!abs) continue;
      out.push({ file: abs, kind: 'captions', label: '', language: '', source });
    }
  }
  return uniqueByUrl(out, 'file');
}

function deepCollect(obj, out = { m3u8: [], captions: [] }, baseUrl = '') {
  if (!obj || typeof obj !== 'object') return out;
  if (Array.isArray(obj)) {
    for (const v of obj) deepCollect(v, out, baseUrl);
    return out;
  }

  for (const [k, v] of Object.entries(obj)) {
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
      if (k.toLowerCase() === 'tracks') {
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

async function fetchText(url, headers) {
  const res = await fetch(url, { method: 'GET', headers });
  const text = await res.text();
  return { ok: res.ok, status: res.status, text };
}

function buildDefaultHeaders({ referer, origin, cookie, userAgent }) {
  const headers = {
    'user-agent':
      userAgent ||
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'accept-language': 'en-US,en;q=0.9'
  };
  if (referer) headers.referer = referer;
  if (origin) headers.origin = origin;
  if (cookie) headers.cookie = cookie;
  return headers;
}

function buildAutoRefererOrigin(watchUrl) {
  try {
    const u = new URL(watchUrl);
    const computedOrigin = `${u.protocol}//${u.host}`;
    return { referer: `${computedOrigin}/`, origin: computedOrigin };
  } catch {
    return { referer: undefined, origin: undefined };
  }
}

function extractEpisodeId(watchUrl, html) {
  const fromUrl = String(watchUrl).match(/\.(\d+)(?:[/?#]|$)/);
  if (fromUrl?.[1]) return fromUrl[1];

  const fromHtml = String(html).match(/\/ajax\/episode\/sources\/(\d+)/i);
  if (fromHtml?.[1]) return fromHtml[1];

  const fromAttr = String(html).match(/data-id=["'](\d{4,})["']/i);
  if (fromAttr?.[1]) return fromAttr[1];

  return null;
}

function extractScriptUrls(html, baseUrl) {
  const out = [];
  const regex = /<script[^>]+src=["']([^"']+)["']/gi;
  let m;
  while ((m = regex.exec(html)) !== null) {
    const abs = toAbsolute(normalizeEscaped(m[1]), baseUrl);
    if (!abs) continue;
    out.push(abs);
  }
  return Array.from(new Set(out));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

async function fetchWithRetry(url, headers, retries, debug, step, extra = {}) {
  let resp = null;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      resp = await fetchText(url, headers);
    } catch (err) {
      resp = { ok: false, status: -1, text: '', error: err?.message || String(err) };
    }
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
    if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, 200 * (attempt + 1)));
  }
  return resp;
}

function isMegacloudEmbed(url) {
  const s = String(url || '');
  return /\/embed-\d+\/v\d+\/e-\d+\//i.test(s);
}

function buildProviderReferer(providerUrl) {
  try {
    return `${new URL(providerUrl).origin}/`;
  } catch {
    return 'https://videostr.net/';
  }
}

function buildWatchCandidates(watchUrl) {
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

  if (/flixhq/.test(host)) {
    for (const h of ['flixhq.to', 'f2moviesz.uk', 'f2movies.la']) {
      const w = new URL(u.toString());
      w.host = h;
      push(w.toString());
    }
    return out;
  }

  if (/f2movies|f2moviesz/.test(host)) {
    for (const h of ['f2movies.la', 'f2moviesz.uk']) {
      const w = new URL(u.toString());
      w.host = h;
      push(w.toString());
    }
  }

  return out;
}

async function resolveViaVideostrProvider({ embedUrl, requestHeaders, parentReferer }) {
  const candidates = [];
  const captions = [];
  const debug = [];

  const embedHeaders = {
    ...requestHeaders,
    referer: parentReferer || requestHeaders.referer || 'https://f2movies.la/'
  };

  const embedRes = await fetchText(embedUrl, embedHeaders);
  debug.push({ step: 'videostr_embed_fetch', status: embedRes.status, ok: embedRes.ok });
  if (!embedRes.ok) return { candidates, captions, debug };

  candidates.push(...collectM3u8FromText(embedRes.text, embedUrl, 'videostr_embed_html'));
  captions.push(...collectCaptionsFromText(embedRes.text, embedUrl, 'videostr_embed_html'));

  // Try to extract using Megacloud decryption method (aniwatch approach)
  try {
    debug.push({ step: 'megacloud_extraction_start' });
    const megacloudResult = await extractMegacloudSources(embedUrl);

    debug.push({
      step: 'megacloud_extraction_success',
      sourcesCount: megacloudResult.sources?.length || 0,
      tracksCount: megacloudResult.tracks?.length || 0
    });

    // Extract m3u8 URLs from sources
    if (megacloudResult.sources && Array.isArray(megacloudResult.sources)) {
      for (const source of megacloudResult.sources) {
        const url = source.file || source.url;
        if (url) {
          const providerReferer = buildProviderReferer(embedUrl);
          candidates.push({
            url,
            source: 'megacloud_decrypt',
            headers: { Referer: providerReferer }
          });
        }
      }
    }

    // Extract captions/subtitles from tracks
    if (megacloudResult.tracks && Array.isArray(megacloudResult.tracks)) {
      for (const track of megacloudResult.tracks) {
        if (track.kind === 'captions' || track.kind === 'subtitles') {
          captions.push({
            file: track.file,
            kind: track.kind,
            label: track.label || '',
            language: track.srclang || '',
            source: 'megacloud_decrypt'
          });
        }
      }
    }
  } catch (megacloudError) {
    debug.push({
      step: 'megacloud_extraction_failed',
      error: megacloudError.message
    });
  }

  return {
    candidates: uniqueByUrl(candidates),
    captions: uniqueByUrl(captions, 'file'),
    debug
  };
}

async function resolveViaF2MoviesSite({ watchUrl, requestHeaders }) {
  const retries = Number.isFinite(Number(process.env.RESOLVER_MAX_RETRIES))
    ? Math.max(0, Number(process.env.RESOLVER_MAX_RETRIES))
    : 0;
  const parallelHosts = String(process.env.RESOLVER_PARALLEL_HOSTS || 'true').toLowerCase() !== 'false';
  const randomizeHosts = String(process.env.RESOLVER_RANDOMIZE_HOSTS || 'true').toLowerCase() !== 'false';

  const baseCandidates = buildWatchCandidates(watchUrl);
  const watchCandidates = randomizeHosts ? [baseCandidates[0], ...shuffle(baseCandidates.slice(1))] : baseCandidates;
  const directOnly = String(process.env.RESOLVER_DIRECT_ONLY || 'false').toLowerCase() === 'true';

  async function resolveOne(url) {
    const out = { candidates: [], captions: [], debug: [], hostReport: { watchUrl: url } };

    const tryEpisodeSourcesDirect = async (episodeId) => {
      if (!episodeId) return false;
      const u = new URL(url);
      const episodeSourceUrl = new URL(`/ajax/episode/sources/${episodeId}`, `${u.protocol}//${u.host}`).toString();
      const epHeaders = {
        ...requestHeaders,
        accept: '*/*',
        'x-requested-with': 'XMLHttpRequest',
        referer: url
      };
      const epRes = await fetchWithRetry(
        episodeSourceUrl,
        epHeaders,
        retries,
        out.debug,
        'episode_sources_fetch_direct',
        { episodeId }
      );
      if (!epRes.ok) return false;

      let epJson = null;
      try {
        epJson = JSON.parse(epRes.text);
      } catch {
        epJson = null;
      }
      const providerUrl = toAbsolute(epJson?.link, episodeSourceUrl);
      if (providerUrl && isMegacloudEmbed(providerUrl)) {
        out.debug.push({ step: 'videostr_provider_found', providerUrl, watchUrl: url, via: 'direct_episode' });
        const provider = await resolveViaVideostrProvider({
          embedUrl: providerUrl,
          requestHeaders,
          parentReferer: `${u.protocol}//${u.host}/`
        });
        out.candidates.push(...provider.candidates);
        out.captions.push(...provider.captions);
        out.debug.push(...provider.debug);
      }
      return out.candidates.length > 0;
    };

    // direct-first: when URL already contains episodeId, skip watch page first.
    const episodeIdFromUrl = extractEpisodeId(url, '');
    if (episodeIdFromUrl) {
      const directOk = await tryEpisodeSourcesDirect(episodeIdFromUrl);
      if (directOk) {
        out.candidates = uniqueByUrl(out.candidates);
        out.captions = uniqueByUrl(out.captions, 'file');
        out.hostReport = {
          watchUrl: url,
          ok: true,
          files: out.candidates.length,
          captions: out.captions.length,
          reason: 'ok_direct_episode',
          preview: ''
        };
        out.activeWatchUrl = url;
        return out;
      }
      if (directOnly) {
        out.hostReport = {
          watchUrl: url,
          ok: false,
          files: 0,
          captions: 0,
          reason: 'direct_episode_failed',
          preview: ''
        };
        return out;
      }
    }

    const watchRes = await fetchWithRetry(url, requestHeaders, retries, out.debug, 'watch_fetch_try');
    if (!watchRes.ok) {
      out.hostReport = {
        watchUrl: url,
        ok: false,
        files: 0,
        captions: 0,
        reason: watchRes.error || `http_${watchRes.status}`,
        preview: String(watchRes.text || '').slice(0, 300)
      };
      return out;
    }

    out.candidates.push(...collectM3u8FromText(watchRes.text, url, 'watch_html'));
    out.captions.push(...collectCaptionsFromText(watchRes.text, url, 'watch_html'));

    const episodeId = extractEpisodeId(url, watchRes.text);
    if (!episodeId) {
      out.debug.push({ step: 'episode_id_missing', watchUrl: url });
    } else {
      const u = new URL(url);
      const episodeSourceUrl = new URL(`/ajax/episode/sources/${episodeId}`, `${u.protocol}//${u.host}`).toString();
      const epHeaders = {
        ...requestHeaders,
        accept: '*/*',
        'x-requested-with': 'XMLHttpRequest',
        referer: url
      };
      const epRes = await fetchWithRetry(episodeSourceUrl, epHeaders, retries, out.debug, 'episode_sources_fetch', { episodeId });
      if (epRes.ok) {
        let epJson = null;
        try {
          epJson = JSON.parse(epRes.text);
        } catch {
          epJson = null;
        }

        const providerUrl = toAbsolute(epJson?.link, episodeSourceUrl);
        if (providerUrl && isMegacloudEmbed(providerUrl)) {
          out.debug.push({ step: 'videostr_provider_found', providerUrl, watchUrl: url });
          const provider = await resolveViaVideostrProvider({
            embedUrl: providerUrl,
            requestHeaders,
            parentReferer: `${u.protocol}//${u.host}/`
          });
          out.candidates.push(...provider.candidates);
          out.captions.push(...provider.captions);
          out.debug.push(...provider.debug);
        }
      } else {
        out.debug.push({
          step: 'episode_sources_failed_preview',
          watchUrl: url,
          preview: String(epRes.text || '').slice(0, 300)
        });
      }
    }

    // Slow fallback: only scan scripts if fast episode/provider path produced no media.
    if (out.candidates.length === 0) {
      const scriptUrls = extractScriptUrls(watchRes.text, url).slice(0, 12);
      const scriptFetches = await Promise.allSettled(
        scriptUrls.map((surl) => fetchText(surl, requestHeaders).then((r) => ({ url: surl, ...r })))
      );
      for (const item of scriptFetches) {
        if (item.status !== 'fulfilled' || !item.value.ok) continue;
        out.candidates.push(...collectM3u8FromText(item.value.text, item.value.url, 'watch_script'));
        out.captions.push(...collectCaptionsFromText(item.value.text, item.value.url, 'watch_script'));
      }
    }

    out.candidates = uniqueByUrl(out.candidates);
    out.captions = uniqueByUrl(out.captions, 'file');
    out.hostReport = {
      watchUrl: url,
      ok: out.candidates.length > 0,
      files: out.candidates.length,
      captions: out.captions.length,
      reason: out.candidates.length > 0 ? 'ok' : 'no_media_found',
      preview: String(watchRes.text || '').slice(0, 300)
    };
    out.activeWatchUrl = url;
    return out;
  }

  if (parallelHosts && watchCandidates.length > 1) {
    const racing = watchCandidates.map((u) =>
      resolveOne(u).then((result) => {
        if (result.candidates.length > 0) return result;
        throw result;
      })
    );

    try {
      const winner = await Promise.any(racing);
      return {
        candidates: winner.candidates,
        captions: winner.captions,
        debug: winner.debug,
        hostReports: [winner.hostReport],
        activeWatchUrl: winner.activeWatchUrl || watchUrl
      };
    } catch (err) {
      const failures = Array.isArray(err?.errors) ? err.errors : [];
      return {
        candidates: [],
        captions: [],
        debug: failures.flatMap((x) => x.debug || []),
        hostReports: failures.map((x) => x.hostReport).filter(Boolean),
        activeWatchUrl: watchUrl
      };
    }
  }

  const merged = { candidates: [], captions: [], debug: [], hostReports: [], activeWatchUrl: watchUrl };
  for (const u of watchCandidates) {
    const r = await resolveOne(u);
    merged.debug.push(...r.debug);
    merged.hostReports.push(r.hostReport);
    if (r.activeWatchUrl) merged.activeWatchUrl = r.activeWatchUrl;
    if (r.candidates?.length) merged.candidates.push(...r.candidates);
    if (r.captions?.length) merged.captions.push(...r.captions);
  }
  merged.candidates = uniqueByUrl(merged.candidates);
  merged.captions = uniqueByUrl(merged.captions, 'file');
  return merged;
}

async function resolveViaNovhop({ watchUrl, requestHeaders }) {
  const debug = [];
  const res = await fetchWithRetry(watchUrl, requestHeaders, 0, debug, 'novhop_fetch');
  if (!res.ok) {
    return {
      candidates: [],
      captions: [],
      debug,
      hostReports: [
        {
          watchUrl,
          ok: false,
          files: 0,
          captions: 0,
          reason: res.error || `http_${res.status}`,
          preview: String(res.text || '').slice(0, 300)
        }
      ],
      activeWatchUrl: watchUrl
    };
  }

  let json = null;
  try {
    json = JSON.parse(res.text);
  } catch {
    json = null;
  }

  const data = json?.data || {};
  const files = [];
  if (typeof data?.file === 'string' && data.file.trim()) {
    files.push({
      url: data.file.trim(),
      source: 'novhop_json',
      headers: typeof data.headers === 'object' && data.headers ? data.headers : {}
    });
  }

  const captions = [];
  const captionRaw = data?.caption || data?.captions;
  if (typeof captionRaw === 'string') {
    try {
      const parsed = JSON.parse(captionRaw);
      if (Array.isArray(parsed)) captions.push(...parsed);
    } catch {
      // ignore
    }
  } else if (Array.isArray(captionRaw)) {
    captions.push(...captionRaw);
  }

  return {
    candidates: uniqueByUrl(files),
    captions: uniqueByUrl(
      captions
        .map((x) => ({
          file: String(x?.file || '').trim(),
          kind: x?.kind || 'captions',
          label: x?.label || '',
          language: x?.language || x?.srclang || '',
          source: 'novhop_json'
        }))
        .filter((x) => x.file),
      'file'
    ),
    debug,
    hostReports: [
      {
        watchUrl,
        ok: files.length > 0,
        files: files.length,
        captions: captions.length,
        reason: files.length > 0 ? 'ok' : 'no_media_found',
        preview: String(res.text || '').slice(0, 300)
      }
    ],
    activeWatchUrl: watchUrl
  };
}

const resolverProviders = [
  {
    name: 'novhop',
    supports: (h, u) => /novhop/.test(h) || /movie-cache\.novhop\.com/i.test(String(u)),
    resolve: resolveViaNovhop
  },
  {
    name: 'f2family',
    supports: (h) => /f2movies|f2moviesz|flixhq/.test(h),
    resolve: resolveViaF2MoviesSite
  }
];

async function resolveBySite({ watchUrl, requestHeaders }) {
  const host = new URL(watchUrl).host.toLowerCase();

  for (const provider of resolverProviders) {
    if (!provider.supports(host, watchUrl)) continue;
    const data = await provider.resolve({ watchUrl, requestHeaders });
    return { ...data, matchedSite: provider.name, activeWatchUrl: data.activeWatchUrl || watchUrl };
  }

  // Fallback baseline parser for unknown sites.
  const watchRes = await fetchText(watchUrl, requestHeaders);
  if (!watchRes.ok) {
    return { candidates: [], captions: [], debug: [{ step: 'watch_fetch', status: watchRes.status, ok: false }], matchedSite: 'fallback' };
  }

  return {
    candidates: uniqueByUrl(collectM3u8FromText(watchRes.text, watchUrl, 'fallback_watch_html')),
    captions: uniqueByUrl(collectCaptionsFromText(watchRes.text, watchUrl, 'fallback_watch_html'), 'file'),
    debug: [{ step: 'fallback_watch_fetch', status: watchRes.status, ok: true }],
    matchedSite: 'fallback',
    activeWatchUrl: watchUrl
  };
}

export async function resolveM3u8Demo({ watchUrl, referer, origin, cookie, userAgent, compact = true }) {
  const auto = buildAutoRefererOrigin(watchUrl);
  const requestHeaders = buildDefaultHeaders({
    referer: referer || auto.referer,
    origin: origin || auto.origin,
    cookie,
    userAgent
  });
  const siteResult = await resolveBySite({ watchUrl, requestHeaders });

  const finalCandidates = siteResult.candidates.map((x) => {
    const u = new URL(x.url);
    return {
      ...x,
      host: u.host,
      path: u.pathname
    };
  });

  const files = uniqueByUrl(finalCandidates).map((x) => ({
    file: x.url,
    type: 'hls',
    headers: x.headers || {}
  }));

  const response = {
    ok: true,
    files,
    captions: uniqueByUrl(siteResult.captions, 'file')
  };
  if (!compact) {
    response.watchUrl = watchUrl;
    response.activeWatchUrl = siteResult.activeWatchUrl || watchUrl;
    if (Array.isArray(siteResult.hostReports) && siteResult.hostReports.length > 0) {
      response.hostReports = siteResult.hostReports;
    }
  }
  if (String(process.env.RESOLVER_INCLUDE_DEBUG || 'false').toLowerCase() === 'true') {
    response.debug = siteResult.debug;
  }
  return response;
}
