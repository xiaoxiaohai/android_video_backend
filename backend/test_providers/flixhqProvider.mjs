import { extractMegacloudSources } from '../src/utils/megacloud-decrypt.js';
import {
  collectCaptionsFromText,
  collectM3u8FromText,
  deepCollect,
  extractScriptUrls,
  fetchText,
  fetchWithRetry,
  looksLikeChallengePage,
  shuffle,
  toAbsolute,
  uniqueByUrl
} from './common.mjs';

function extractEpisodeId(watchUrl, html) {
  const fromUrl = String(watchUrl).match(/\.(\d+)(?:[/?#]|$)/);
  if (fromUrl?.[1]) return fromUrl[1];
  const fromHtml = String(html).match(/\/ajax\/episode\/sources\/(\d+)/i);
  if (fromHtml?.[1]) return fromHtml[1];
  return null;
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
  const host = u.host.toLowerCase();
  if (/^www\d+\./i.test(host)) {
    const w = new URL(u.toString());
    w.host = host.replace(/^www\d+\./i, '');
    push(w.toString());
  }

  // Keep only high-signal hosts from current observations.
  for (const h of ['flixhq.to', 'f2moviesz.uk', 'f2movies.la']) {
    const w = new URL(u.toString());
    w.host = h;
    push(w.toString());
  }
  return out;
}

function supports(watchUrl) {
  try {
    const host = new URL(watchUrl).host.toLowerCase();
    return /flixhq/.test(host);
  } catch {
    return false;
  }
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

async function resolve(input) {
  const { watchUrl, headers, args } = input;
  const parallelHosts = String(process.env.RESOLVER_PARALLEL_HOSTS || 'true').toLowerCase() !== 'false';

  const baseWatchCandidates = buildWatchCandidates(watchUrl);
  const watchCandidates = args.randomizeHosts
    ? [baseWatchCandidates[0], ...shuffle(baseWatchCandidates.slice(1))]
    : baseWatchCandidates;

  async function resolveOneHost(url) {
    const debug = [];
    const candidates = [];
    const captions = [];
    const hostReport = { watchUrl: url, ok: false, files: 0, captions: 0, reason: '', preview: '' };
    const r = await fetchWithRetry(url, headers, args.retries, debug, 'watch_fetch_try');
    if (!r.ok) {
      hostReport.reason = r.error || `http_${r.status}`;
      hostReport.preview = r.textPreview || '';
      return { ok: false, activeWatchUrl: url, candidates, captions, hostReport, debug };
    }
    if (looksLikeChallengePage(r.text)) {
      debug.push({ step: 'watch_challenge_detected', url });
      hostReport.reason = 'challenge_page';
      hostReport.preview = r.textPreview || '';
      return { ok: false, activeWatchUrl: url, candidates, captions, hostReport, debug };
    }

    const activeWatchUrl = url;
    candidates.push(...collectM3u8FromText(r.text, activeWatchUrl, 'watch_html'));
    captions.push(...collectCaptionsFromText(r.text, activeWatchUrl, 'watch_html'));

    const scriptUrls = extractScriptUrls(r.text, activeWatchUrl).slice(0, 12);
    for (const scriptUrl of scriptUrls) {
      const s = await fetchText(scriptUrl, headers);
      if (!s.ok) continue;
      candidates.push(...collectM3u8FromText(s.text, scriptUrl, 'watch_script'));
      captions.push(...collectCaptionsFromText(s.text, scriptUrl, 'watch_script'));
    }

    const episodeId = extractEpisodeId(activeWatchUrl, r.text);
    if (!episodeId) {
      debug.push({ step: 'episode_id_missing', watchUrl: activeWatchUrl });
      hostReport.reason = 'episode_id_missing';
      hostReport.preview = r.textPreview || '';
      return { ok: false, activeWatchUrl, candidates, captions, hostReport, debug };
    }

    const u = new URL(activeWatchUrl);
    const epUrl = new URL(`/ajax/episode/sources/${episodeId}`, `${u.protocol}//${u.host}`).toString();
    const epHeaders = { ...headers, accept: '*/*', 'x-requested-with': 'XMLHttpRequest', referer: activeWatchUrl };
    const ep = await fetchWithRetry(epUrl, epHeaders, args.retries, debug, 'episode_sources_fetch');

    if (!ep.ok) {
      debug.push({
        step: 'episode_sources_failed_preview',
        url: epUrl,
        watchUrl: activeWatchUrl,
        preview: ep.textPreview || ''
      });
      hostReport.reason = ep.error || `http_${ep.status}`;
      hostReport.preview = ep.textPreview || '';
      return { ok: false, activeWatchUrl, candidates, captions, hostReport, debug };
    }

    if (looksLikeChallengePage(ep.text)) {
      debug.push({ step: 'episode_sources_challenge_detected', url: epUrl, watchUrl: activeWatchUrl });
      hostReport.reason = 'episode_sources_challenge';
      hostReport.preview = ep.textPreview || '';
      return { ok: false, activeWatchUrl, candidates, captions, hostReport, debug };
    }

    try {
      const epJson = JSON.parse(ep.text);
      const providerUrl = toAbsolute(epJson?.link, epUrl);
      if (providerUrl && isMegacloudEmbed(providerUrl)) {
        debug.push({ step: 'videostr_provider_found', providerUrl, watchUrl: activeWatchUrl });
        try {
          const mg = await extractMegacloudSources(providerUrl, {
            preferEmbedOrigin: true,
            parentReferer: activeWatchUrl
          });
          const providerReferer = buildProviderReferer(providerUrl);
          for (const source of mg.sources || []) {
            const sourceUrl = source?.file || source?.url;
            if (!sourceUrl) continue;
            candidates.push({
              url: sourceUrl,
              source: 'megacloud_decrypt',
              headers: { Referer: providerReferer }
            });
          }
          for (const t of mg.tracks || []) {
            if (t.kind !== 'captions' && t.kind !== 'subtitles') continue;
            captions.push({
              file: t.file,
              kind: t.kind,
              label: t.label || '',
              language: t.srclang || '',
              source: 'megacloud_decrypt'
            });
          }
          debug.push({
            step: 'megacloud_extraction_success',
            watchUrl: activeWatchUrl,
            sourcesCount: (mg.sources || []).length,
            tracksCount: (mg.tracks || []).length
          });

          const embedRes = await fetchText(providerUrl, { ...headers, referer: activeWatchUrl });
          if (embedRes.ok) {
            captions.push(...collectCaptionsFromText(embedRes.text, providerUrl, 'embed_html_scan'));
            const embedScripts = extractScriptUrls(embedRes.text, providerUrl).slice(0, 12);
            for (const es of embedScripts) {
              const esRes = await fetchText(es, headers);
              if (!esRes.ok) continue;
              captions.push(...collectCaptionsFromText(esRes.text, es, 'embed_script_scan'));
            }
          }
          const deep = deepCollect(mg, { m3u8: [], captions: [] }, providerUrl);
          for (const c of deep.captions || []) {
            captions.push({
              file: c,
              kind: 'captions',
              label: '',
              language: '',
              source: 'megacloud_deep_scan'
            });
          }
        } catch (err) {
          debug.push({
            step: 'megacloud_extraction_failed',
            watchUrl: activeWatchUrl,
            error: err?.message || String(err)
          });
        }
      }
    } catch {
      debug.push({ step: 'episode_sources_not_json', watchUrl: activeWatchUrl });
    }

    const uniqueCandidates = uniqueByUrl(candidates);
    const uniqueCaptions = uniqueByUrl(captions, 'file');
    hostReport.ok = uniqueCandidates.length > 0;
    hostReport.files = uniqueCandidates.length;
    hostReport.captions = uniqueCaptions.length;
    hostReport.reason = hostReport.ok ? 'ok' : 'no_media_found';
    hostReport.preview = r.textPreview || '';
    return {
      ok: hostReport.ok,
      activeWatchUrl,
      candidates: uniqueCandidates,
      captions: uniqueCaptions,
      hostReport,
      debug
    };
  }

  if (parallelHosts && watchCandidates.length > 1) {
    const racing = watchCandidates.map((url) =>
      resolveOneHost(url).then((result) => {
        if (result.ok) return result;
        throw result;
      })
    );

    try {
      const winner = await Promise.any(racing);
      const files = winner.candidates.map((x) => ({
        file: x.url,
        type: 'hls',
        headers: x.headers || {}
      }));
      files.sort((a, b) => {
        const ah = a?.headers && Object.keys(a.headers).length > 0 ? 1 : 0;
        const bh = b?.headers && Object.keys(b.headers).length > 0 ? 1 : 0;
        return bh - ah;
      });
      return {
        ok: true,
        provider: 'flixhq',
        watchUrl,
        activeWatchUrl: winner.activeWatchUrl,
        files,
        captions: winner.captions,
        primary: files[0] || null,
        debug: winner.debug,
        hostReports: [winner.hostReport]
      };
    } catch (err) {
      const failures = Array.isArray(err?.errors) ? err.errors : [];
      const hostReports = failures.map((x) => x.hostReport).filter(Boolean);
      const debug = failures.flatMap((x) => x.debug || []);
      return {
        ok: true,
        provider: 'flixhq',
        watchUrl,
        activeWatchUrl: watchUrl,
        files: [],
        captions: [],
        primary: null,
        debug,
        hostReports
      };
    }
  }

  const debug = [];
  const candidates = [];
  const captions = [];
  const hostReports = [];
  let activeWatchUrl = watchUrl;
  for (const url of watchCandidates) {
    const result = await resolveOneHost(url);
    hostReports.push(result.hostReport);
    debug.push(...result.debug);
    if (result.activeWatchUrl) activeWatchUrl = result.activeWatchUrl;
    if (result.candidates?.length) candidates.push(...result.candidates);
    if (result.captions?.length) captions.push(...result.captions);
  }

  const files = uniqueByUrl(candidates).map((x) => ({
    file: x.url,
    type: 'hls',
    headers: x.headers || {}
  }));
  files.sort((a, b) => {
    const ah = a?.headers && Object.keys(a.headers).length > 0 ? 1 : 0;
    const bh = b?.headers && Object.keys(b.headers).length > 0 ? 1 : 0;
    return bh - ah;
  });

  return {
    ok: true,
    provider: 'flixhq',
    watchUrl,
    activeWatchUrl,
    files,
    captions: uniqueByUrl(captions, 'file'),
    primary: files[0] || null,
    debug,
    hostReports
  };
}

export const flixhqProvider = { name: 'flixhq', supports, resolve };
