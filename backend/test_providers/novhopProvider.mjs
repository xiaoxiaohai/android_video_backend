import {
  collectCaptionsFromText,
  collectM3u8FromText,
  deepCollect,
  fetchWithRetry,
  uniqueByUrl
} from './common.mjs';

function supports(watchUrl) {
  try {
    const host = new URL(watchUrl).host.toLowerCase();
    return host.includes('novhop.com');
  } catch {
    return false;
  }
}

function toFiles(list) {
  return uniqueByUrl(list).map((x) => ({
    file: x.url,
    type: 'hls',
    headers: x.headers || {}
  }));
}

async function resolve(input) {
  const { watchUrl, headers, args } = input;
  const debug = [];
  const candidates = [];
  const captions = [];
  const hostReports = [];

  const res = await fetchWithRetry(watchUrl, headers, args.retries, debug, 'novhop_fetch');
  const report = {
    watchUrl,
    ok: false,
    files: 0,
    captions: 0,
    reason: '',
    preview: res.textPreview || ''
  };

  if (!res.ok) {
    report.reason = res.error || `http_${res.status}`;
    hostReports.push(report);
    return {
      ok: true,
      provider: 'novhop',
      watchUrl,
      activeWatchUrl: watchUrl,
      files: [],
      captions: [],
      primary: null,
      debug,
      hostReports
    };
  }

  candidates.push(
    ...collectM3u8FromText(res.text, watchUrl, 'novhop_text', { Referer: 'https://movie-cache.novhop.com/' })
  );
  captions.push(...collectCaptionsFromText(res.text, watchUrl, 'novhop_text'));

  try {
    const json = JSON.parse(res.text);
    const deep = deepCollect(json, { m3u8: [], captions: [] }, watchUrl);
    for (const m of deep.m3u8 || []) {
      candidates.push({
        url: m,
        source: 'novhop_json',
        headers: { Referer: 'https://movie-cache.novhop.com/' }
      });
    }
    for (const c of deep.captions || []) {
      captions.push({
        file: c,
        kind: 'captions',
        label: '',
        language: '',
        source: 'novhop_json'
      });
    }
    debug.push({
      step: 'novhop_json_parse_ok',
      m3u8Count: (deep.m3u8 || []).length,
      captionCount: (deep.captions || []).length
    });
  } catch {
    debug.push({ step: 'novhop_json_parse_failed' });
  }

  const files = toFiles(candidates);
  const captionList = uniqueByUrl(captions, 'file');
  report.ok = files.length > 0;
  report.files = files.length;
  report.captions = captionList.length;
  report.reason = report.ok ? 'ok' : 'no_media_found';
  hostReports.push(report);

  return {
    ok: true,
    provider: 'novhop',
    watchUrl,
    activeWatchUrl: watchUrl,
    files,
    captions: captionList,
    primary: files[0] || null,
    debug,
    hostReports
  };
}

export const novhopProvider = { name: 'novhop', supports, resolve };
