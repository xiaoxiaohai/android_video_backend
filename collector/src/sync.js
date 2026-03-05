import crypto from 'node:crypto';
import dotenv from 'dotenv';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import { once } from 'node:events';
import path from 'node:path';

dotenv.config();

const cfg = {
  backendBaseUrl: process.env.BACKEND_BASE_URL || 'http://127.0.0.1:8080',
  upstreamBaseUrl: process.env.UPSTREAM_BASE_URL || 'https://cineframeplayer.com/module-movie/',
  upstreamRequestedWith: process.env.UPSTREAM_REQUESTED_WITH || 'com.cine.frame.hd.video.player',
  upstreamAppVersion: process.env.UPSTREAM_APP_VERSION || '1.1.1',
  upstreamLanguage: process.env.UPSTREAM_LANGUAGE || 'en',
  decryptKey: process.env.UPSTREAM_DECRYPT_KEY || '8fOsTegF23mV43Nr6xiOisP34ZPN41WC',
  decryptAlgorithm: process.env.UPSTREAM_DECRYPT_ALGORITHM || 'aes-256-cbc',
  // Backend upload tuning (YOUR backend server only)
  backendConcurrency: Number(process.env.SYNC_BACKEND_CONCURRENCY || 6),
  backendRequestIntervalMs: Number(process.env.SYNC_BACKEND_REQUEST_INTERVAL_MS || 0),
  backendRetry: Number(process.env.SYNC_BACKEND_RETRY || 2),
  backendRetryBackoffMs: Number(process.env.SYNC_BACKEND_RETRY_BACKOFF_MS || 400),
  pageSize: Number(process.env.SYNC_PAGE_SIZE || 30),
  // Start pages. Use SYNC_START_PAGE as global fallback.
  startPage: Number(process.env.SYNC_START_PAGE || 1),
  startMoviePage: Number(process.env.SYNC_START_MOVIE_PAGE || process.env.SYNC_MOVIE_START_PAGE || process.env.SYNC_START_PAGE || 1),
  startTvPage: Number(process.env.SYNC_START_TV_PAGE || process.env.SYNC_TV_START_PAGE || process.env.SYNC_START_PAGE || 1),
  maxMoviePages: Number(process.env.SYNC_MAX_MOVIE_PAGES || 0),
  maxTvPages: Number(process.env.SYNC_MAX_TV_PAGES || 0),
  maxProviderPages: Number(process.env.SYNC_MAX_PROVIDER_PAGES || 0),
  startProviderPage: Number(process.env.SYNC_START_PROVIDER_PAGE || process.env.SYNC_START_PAGE || 1),
  providerList: (process.env.SYNC_PROVIDER_LIST || '')
    .split(',')
    .map((x) => x.trim())
    .filter(Boolean),
  hydrateContentPageSize: Number(process.env.SYNC_HYDRATE_CONTENT_PAGE_SIZE || 200),
  hydrateMaxTvItems: Number(process.env.SYNC_HYDRATE_MAX_TV_ITEMS || 0),
  hydrateScanConcurrency: Number(process.env.SYNC_HYDRATE_SCAN_CONCURRENCY || 8),
  hydrateFetchConcurrency: Number(process.env.SYNC_HYDRATE_FETCH_CONCURRENCY || 3),
  detailConcurrency: Number(process.env.SYNC_DETAIL_CONCURRENCY || 3),
  requestIntervalMs: Number(process.env.SYNC_REQUEST_INTERVAL_MS || 250),
  hardPageLimit: Number(process.env.SYNC_HARD_PAGE_LIMIT || 5000),
  // Upstream decrypted JSON dump (can be huge). Reports are always saved.
  saveUpstreamJson: String(process.env.SYNC_SAVE_JSON || 'true').toLowerCase() === 'true',
  outputDir: process.env.SYNC_OUTPUT_DIR || './output',
  stopOnDuplicatePage: String(process.env.SYNC_STOP_ON_DUPLICATE_PAGE || 'true').toLowerCase() === 'true',
  verboseLog: String(process.env.SYNC_VERBOSE_LOG || 'true').toLowerCase() === 'true'
};

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runDir = path.resolve(cfg.outputDir, runId);
const upstreamDir = path.join(runDir, 'upstream');
const reportDir = path.join(runDir, 'report');

const report = {
  runId,
  startedAt: new Date().toISOString(),
  mode: '',
  stats: {
    upstreamFetchCount: 0,
    backendCallCount: 0,
    backendSuccessCount: 0,
    backendFailCount: 0,
    duplicateStopCount: 0
  },
  importOk: 0,
  importFail: 0,
  errorCount: 0
};

class JsonArrayWriter {
  constructor(filePath) {
    this.filePath = filePath;
    this.stream = fs.createWriteStream(filePath, { encoding: 'utf8' });
    this.started = false;
    this.first = true;
    this.closed = false;
  }

  async start() {
    if (this.started) return;
    this.started = true;
    this.stream.write('[');
  }

  write(obj) {
    if (!this.started || this.closed) return;
    const prefix = this.first ? '\n' : ',\n';
    this.first = false;
    this.stream.write(prefix + JSON.stringify(obj));
  }

  async close() {
    if (this.closed) return;
    this.closed = true;
    if (!this.started) await this.start();
    this.stream.write('\n]\n');
    this.stream.end();
    await once(this.stream, 'finish');
  }
}

let importWriter = null;
let errorWriter = null;

function log(...args) {
  console.log('[collector]', ...args);
}

function logVerbose(...args) {
  if (cfg.verboseLog) {
    console.log('[collector:verbose]', ...args);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function createSemaphore(max) {
  const limit = Number.isFinite(max) && max > 0 ? Math.floor(max) : 1;
  let inFlight = 0;
  const waiters = [];
  return {
    async acquire() {
      if (inFlight < limit) {
        inFlight += 1;
        return;
      }
      await new Promise((resolve) => waiters.push(resolve));
      inFlight += 1;
    },
    release() {
      inFlight = Math.max(0, inFlight - 1);
      const next = waiters.shift();
      if (next) next();
    }
  };
}

const backendSem = createSemaphore(cfg.backendConcurrency);

function sanitizeName(name) {
  return String(name).replace(/[^a-zA-Z0-9._-]/g, '_');
}

async function ensureOutputDirs() {
  await fsp.mkdir(reportDir, { recursive: true });
  if (cfg.saveUpstreamJson) {
    await fsp.mkdir(upstreamDir, { recursive: true });
  }
}

async function saveJson(baseDir, name, data) {
  const file = path.join(baseDir, `${sanitizeName(name)}.json`);
  await fsp.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
  return file;
}

function recordImport(entry) {
  if (entry?.ok) report.importOk += 1;
  else report.importFail += 1;
  if (importWriter) importWriter.write(entry);
}

function recordError(entry) {
  report.errorCount += 1;
  if (errorWriter) errorWriter.write(entry);
}

function decodeWrappedPayload(rawText) {
  const wrapped = JSON.parse(Buffer.from(rawText.trim(), 'base64').toString('utf8'));
  const iv = Buffer.from(String(wrapped.iv), 'utf8');
  const encrypted = Buffer.from(String(wrapped.value), 'base64');
  const key = Buffer.from(cfg.decryptKey, 'utf8');
  const decipher = crypto.createDecipheriv(cfg.decryptAlgorithm, key, iv);
  const plain = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

async function upstreamRequest(pathname, query = {}, extraHeaders = {}, traceName = '') {
  const url = new URL(pathname, cfg.upstreamBaseUrl);
  Object.entries(query).forEach(([k, v]) => {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  });

  const headers = {
    'x-requested-with': cfg.upstreamRequestedWith,
    'x-app-version': cfg.upstreamAppVersion,
    language: cfg.upstreamLanguage,
    ...extraHeaders
  };
  logVerbose('upstream request', pathname, query);

  const res = await fetch(url, { headers });
  const text = await res.text();
  report.stats.upstreamFetchCount += 1;

  if (!res.ok) {
    const err = `upstream ${res.status} ${url.pathname}: ${text.slice(0, 200)}`;
    recordError({ type: 'upstream', traceName, url: url.toString(), message: err, at: new Date().toISOString() });
    throw new Error(err);
  }

  let payload;
  try {
    payload = decodeWrappedPayload(text);
  } catch {
    payload = JSON.parse(text);
  }

  logVerbose('upstream success', pathname, { traceName, status: payload?.status, dataType: typeof payload?.data });
  if (cfg.saveUpstreamJson) {
    await saveJson(upstreamDir, `${traceName || pathname}_${Date.now()}`, payload);
  }
  return payload;
}

async function backendPost(pathname, body, label, meta = {}, throwOnError = true) {
  const url = new URL(pathname, cfg.backendBaseUrl);
  report.stats.backendCallCount += 1;
  logVerbose('backend request', pathname, { label, meta });

  const maxAttempts = Math.max(1, Math.floor(cfg.backendRetry) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await backendSem.acquire();
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      const text = await res.text();

      if (cfg.backendRequestIntervalMs > 0) {
        await sleep(cfg.backendRequestIntervalMs);
      }

      if (!res.ok) {
        const msg = `backend ${res.status} ${url.pathname}: ${text.slice(0, 500)}`;
        if (attempt < maxAttempts) {
          logVerbose('backend retry', pathname, { attempt, maxAttempts, label, meta, message: msg });
          await sleep(cfg.backendRetryBackoffMs * attempt);
          continue;
        }
        report.stats.backendFailCount += 1;
        recordImport({ ok: false, label, api: pathname, meta, message: msg, at: new Date().toISOString() });
        if (throwOnError) throw new Error(msg);
        return null;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      report.stats.backendSuccessCount += 1;
      recordImport({ ok: true, label, api: pathname, meta, response: data, at: new Date().toISOString() });
      logVerbose('backend success', pathname, { label, meta });
      return data;
    } catch (err) {
      const msg = err?.message || String(err);
      if (attempt < maxAttempts) {
        logVerbose('backend retry', pathname, { attempt, maxAttempts, label, meta, message: msg });
        await sleep(cfg.backendRetryBackoffMs * attempt);
        continue;
      }
      report.stats.backendFailCount += 1;
      recordImport({ ok: false, label, api: pathname, meta, message: msg, at: new Date().toISOString() });
      logVerbose('backend fail', pathname, { label, meta, message: msg });
      if (throwOnError) throw err;
      return null;
    } finally {
      backendSem.release();
    }
  }

  return null;
}

async function backendGet(pathname, label, meta = {}, throwOnError = true) {
  const url = new URL(pathname, cfg.backendBaseUrl);
  report.stats.backendCallCount += 1;
  logVerbose('backend request', pathname, { label, meta, method: 'GET' });

  const maxAttempts = Math.max(1, Math.floor(cfg.backendRetry) + 1);

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    await backendSem.acquire();
    try {
      const res = await fetch(url, { method: 'GET' });
      const text = await res.text();

      if (cfg.backendRequestIntervalMs > 0) {
        await sleep(cfg.backendRequestIntervalMs);
      }

      if (!res.ok) {
        const msg = `backend ${res.status} ${url.pathname}: ${text.slice(0, 500)}`;
        if (attempt < maxAttempts) {
          logVerbose('backend retry', pathname, { attempt, maxAttempts, label, meta, message: msg });
          await sleep(cfg.backendRetryBackoffMs * attempt);
          continue;
        }
        report.stats.backendFailCount += 1;
        recordImport({ ok: false, label, api: pathname, meta, message: msg, at: new Date().toISOString() });
        if (throwOnError) throw new Error(msg);
        return null;
      }

      let data;
      try {
        data = JSON.parse(text);
      } catch {
        data = { raw: text };
      }

      report.stats.backendSuccessCount += 1;
      recordImport({ ok: true, label, api: pathname, meta, response: data, at: new Date().toISOString() });
      logVerbose('backend success', pathname, { label, meta, method: 'GET' });
      return data;
    } catch (err) {
      const msg = err?.message || String(err);
      if (attempt < maxAttempts) {
        logVerbose('backend retry', pathname, { attempt, maxAttempts, label, meta, message: msg });
        await sleep(cfg.backendRetryBackoffMs * attempt);
        continue;
      }
      report.stats.backendFailCount += 1;
      recordImport({ ok: false, label, api: pathname, meta, message: msg, at: new Date().toISOString() });
      logVerbose('backend fail', pathname, { label, meta, message: msg, method: 'GET' });
      if (throwOnError) throw err;
      return null;
    } finally {
      backendSem.release();
    }
  }

  return null;
}

function pickItems(payload) {
  if (!payload) return [];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.data?.items)) return payload.data.items;
  return [];
}

async function mapLimit(list, limit, fn) {
  const queue = [...list];
  const workers = Array.from({ length: Math.max(1, limit) }, async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (!item) continue;
      await fn(item);
    }
  });
  await Promise.all(workers);
}

function computeEndPage(startPage, maxPages) {
  const s = Number.isFinite(startPage) && startPage > 0 ? startPage : 1;
  const m = Number.isFinite(maxPages) ? maxPages : 0;
  if (m > 0) return s + m - 1; // maxPages means "how many pages", not "page number"
  return cfg.hardPageLimit;
}

function pageSignature(items) {
  const ids = items.map((x) => String(x?.id ?? '')).filter(Boolean);
  return `${ids.length}:${ids.join('|')}`;
}

async function syncHome() {
  log('sync home start');
  const [bannerRes, categoryRes, channelRes] = await Promise.all([
    upstreamRequest('v2/in/ba', {}, {}, 'home_banner'),
    upstreamRequest('v3/in/ca', {}, {}, 'home_category'),
    upstreamRequest('pr/al/pr', {}, {}, 'home_channel')
  ]);

  const payload = {
    mode: 'replace',
    banner: pickItems(bannerRes),
    sections: Array.isArray(categoryRes?.data) ? categoryRes.data : [],
    channels: Array.isArray(channelRes) ? channelRes : []
  };

  const result = await backendPost('/api/import/home', payload, 'import_home', {
    banner: payload.banner.length,
    sections: payload.sections.length,
    channels: payload.channels.length
  });
  log('sync home done', result);
}

async function syncTvHydrate() {
  log('sync tv hydrate start');
  const maxItems = Number.isFinite(cfg.hydrateMaxTvItems) && cfg.hydrateMaxTvItems > 0
    ? Math.floor(cfg.hydrateMaxTvItems)
    : 0;
  const missing = await backendGet('/api/tv/without-episodes/ids?active=true', 'hydrate_tv_without_episodes_ids', { active: true });
  const missingItems = Array.isArray(missing?.items) ? missing.items : [];
  const totalFromBackend = Number(missing?.total || missingItems.length || 0);
  const candidates = [];
  for (const item of missingItems) {
    const movieId = String(item?.movie_id || '').trim();
    if (!movieId) continue;
    candidates.push({
      id: item?.id,
      movieId
    });
  }
  const limitedCandidates = maxItems > 0 ? candidates.slice(0, maxItems) : candidates;
  const scanned = limitedCandidates.length;
  log('hydrate candidates loaded', { totalFromBackend, candidates: candidates.length, limited: limitedCandidates.length });

  let hydrated = 0;
  let failed = 0;
  await mapLimit(limitedCandidates, cfg.hydrateFetchConcurrency, async (item) => {
    try {
      const eps = await upstreamRequest('tv/ep/li', { movie_id: item.movieId }, {}, `tv_hydrate_episodes_movie_${item.movieId}`);
      await sleep(cfg.requestIntervalMs);
      const res = await backendPost(
        `/api/import/episodes/${encodeURIComponent(item.movieId)}`,
        { data: eps?.data || {} },
        'hydrate_tv_episodes',
        { movieId: item.movieId, contentId: item.id }
      );
      const imported = Number(res?.imported || 0);
      hydrated += imported > 0 ? 1 : 0;
      log(`hydrate import movie_id=${item.movieId} imported=${imported}`);
    } catch (err) {
      failed += 1;
      const msg = err?.message || String(err);
      recordError({ type: 'hydrate_tv_episode', movieId: item.movieId, id: item.id, message: msg, at: new Date().toISOString() });
      log('hydrate tv episode fail', item.movieId, msg);
    }
  });

  log('sync tv hydrate done', {
    totalFromBackend,
    scanned,
    candidates: limitedCandidates.length,
    hydrated,
    failed
  });
}

async function syncMovie() {
  log('sync movie start');
  const startPage = Number.isFinite(cfg.startMoviePage) && cfg.startMoviePage > 0 ? cfg.startMoviePage : 1;
  const endPage = computeEndPage(startPage, cfg.maxMoviePages);
  let page = startPage;
  let totalList = 0;
  let totalDetail = 0;
  const seenPageSignatures = new Set();
  const seenIds = new Set();
  let pagesDone = 0;

  while (page <= endPage) {
    const listRes = await upstreamRequest('mo/li', { page, size: cfg.pageSize }, {}, `movie_list_page_${page}`);
    await sleep(cfg.requestIntervalMs);

    const items = pickItems(listRes);
    if (items.length === 0) break;

    if (cfg.stopOnDuplicatePage) {
      const sig = pageSignature(items);
      if (seenPageSignatures.has(sig)) {
        report.stats.duplicateStopCount += 1;
        recordError({
          type: 'stop_duplicate_page',
          category: 'movie',
          page,
          message: 'duplicate page signature detected, stop sync',
          at: new Date().toISOString()
        });
        log(`movie stop: duplicate page detected at page=${page}`);
        break;
      }
      seenPageSignatures.add(sig);

      const ids = items.map((x) => String(x?.id ?? '')).filter(Boolean);
      const allSeen = ids.length > 0 && ids.every((id) => seenIds.has(id));
      if (allSeen) {
        report.stats.duplicateStopCount += 1;
        recordError({
          type: 'stop_duplicate_items',
          category: 'movie',
          page,
          message: 'all ids in page already seen, stop sync',
          at: new Date().toISOString()
        });
        log(`movie stop: all items already seen at page=${page}`);
        break;
      }
      ids.forEach((id) => seenIds.add(id));
    }

    await backendPost('/api/import/content', { items }, 'import_movie_list_page', { page, count: items.length });
    totalList += items.length;
    log(`movie page=${page} list=${items.length}`);

    await mapLimit(items, cfg.detailConcurrency, async (item) => {
      try {
        const detail = await upstreamRequest('mo/in', { id: item.id }, {}, `movie_detail_id_${item.id}`);
        await sleep(cfg.requestIntervalMs);
        if (detail?.data?.id != null) {
          await backendPost('/api/import/content', { items: [detail.data] }, 'import_movie_detail', { id: item.id });
          totalDetail += 1;
        }
      } catch (err) {
        const msg = err?.message || String(err);
        recordError({ type: 'movie_detail', id: item.id, message: msg, at: new Date().toISOString() });
        log('movie detail fail', item.id, msg);
      }
    });

    pagesDone += 1;
    page += 1;
  }

  log('sync movie done', { totalList, totalDetail, pages: pagesDone, startPage, endPage });
}

async function syncTv() {
  log('sync tv start');
  const startPage = Number.isFinite(cfg.startTvPage) && cfg.startTvPage > 0 ? cfg.startTvPage : 1;
  const endPage = computeEndPage(startPage, cfg.maxTvPages);
  let page = startPage;
  let totalList = 0;
  let totalDetail = 0;
  let totalEpisode = 0;
  const seenPageSignatures = new Set();
  const seenIds = new Set();
  let pagesDone = 0;

  while (page <= endPage) {
    const listRes = await upstreamRequest('v3/tv/li', { page, size: cfg.pageSize }, {}, `tv_list_page_${page}`);
    await sleep(cfg.requestIntervalMs);

    const items = pickItems(listRes);
    if (items.length === 0) break;

    if (cfg.stopOnDuplicatePage) {
      const sig = pageSignature(items);
      if (seenPageSignatures.has(sig)) {
        report.stats.duplicateStopCount += 1;
        recordError({
          type: 'stop_duplicate_page',
          category: 'tv',
          page,
          message: 'duplicate page signature detected, stop sync',
          at: new Date().toISOString()
        });
        log(`tv stop: duplicate page detected at page=${page}`);
        break;
      }
      seenPageSignatures.add(sig);

      const ids = items.map((x) => String(x?.id ?? '')).filter(Boolean);
      const allSeen = ids.length > 0 && ids.every((id) => seenIds.has(id));
      if (allSeen) {
        report.stats.duplicateStopCount += 1;
        recordError({
          type: 'stop_duplicate_items',
          category: 'tv',
          page,
          message: 'all ids in page already seen, stop sync',
          at: new Date().toISOString()
        });
        log(`tv stop: all items already seen at page=${page}`);
        break;
      }
      ids.forEach((id) => seenIds.add(id));
    }

    await backendPost('/api/import/content', { items }, 'import_tv_list_page', { page, count: items.length });
    totalList += items.length;
    log(`tv page=${page} list=${items.length}`);

    await mapLimit(items, cfg.detailConcurrency, async (item) => {
      try {
        const detail = await upstreamRequest('tv/in', { id: item.id }, {}, `tv_detail_id_${item.id}`);
        await sleep(cfg.requestIntervalMs);
        let detailData = null;
        if (detail?.data?.id != null) {
          detailData = detail.data;
          await backendPost('/api/import/content', { items: [detailData] }, 'import_tv_detail', { id: item.id });
          totalDetail += 1;
        }

        const movieId = String(detailData?.movie_id || item.movie_id || '').trim();
        if (movieId) {
          const eps = await upstreamRequest('tv/ep/li', { movie_id: movieId }, {}, `tv_episodes_movie_${movieId}`);
          await sleep(cfg.requestIntervalMs);
          const res = await backendPost(`/api/import/episodes/${encodeURIComponent(movieId)}`, { data: eps?.data || {} }, 'import_tv_episodes', { movieId });
          totalEpisode += Number(res?.imported || 0);
        }
      } catch (err) {
        const msg = err?.message || String(err);
        recordError({ type: 'tv_detail_episode', id: item.id, message: msg, at: new Date().toISOString() });
        log('tv detail/episode fail', item.id, msg);
      }
    });

    pagesDone += 1;
    page += 1;
  }

  log('sync tv done', { totalList, totalDetail, totalEpisode, pages: pagesDone, startPage, endPage });
}

function normalizeProviderName(value) {
  return String(value || '').trim();
}

async function syncProvider() {
  log('sync provider start');

  const channelRes = await upstreamRequest('pr/al/pr', {}, {}, 'provider_channel_list');
  const upstreamChannels = Array.isArray(channelRes) ? channelRes : [];

  const providerSource = cfg.providerList.length > 0
    ? cfg.providerList.map((name) => ({ name, img: '' }))
    : upstreamChannels;

  const providers = providerSource
    .map((x, idx) => ({
      name: normalizeProviderName(x?.name),
      img: String(x?.img || ''),
      sortOrder: idx
    }))
    .filter((x) => x.name.length > 0);

  const seenProvider = new Set();
  const finalProviders = providers.filter((p) => {
    const key = p.name.toLowerCase();
    if (seenProvider.has(key)) return false;
    seenProvider.add(key);
    return true;
  });

  const startPage = Number.isFinite(cfg.startProviderPage) && cfg.startProviderPage > 0 ? cfg.startProviderPage : 1;
  const endPage = computeEndPage(startPage, cfg.maxProviderPages);
  const providerStats = [];

  for (const provider of finalProviders) {
    const providerName = provider.name;
    log(`provider sync start name=${providerName}`);

    let page = startPage;
    let importedItems = 0;
    let importedPages = 0;
    let mode = 'replace';
    const seenPageSignatures = new Set();
    const seenIds = new Set();

    while (page <= endPage) {
      const traceName = `provider_${sanitizeName(providerName)}_page_${page}`;
      const listRes = await upstreamRequest(
        'pr/tv/li',
        { provider: providerName, page, limit: cfg.pageSize },
        {},
        traceName
      );
      await sleep(cfg.requestIntervalMs);

      const items = pickItems(listRes);
      if (items.length === 0) break;

      if (cfg.stopOnDuplicatePage) {
        const sig = pageSignature(items);
        if (seenPageSignatures.has(sig)) {
          report.stats.duplicateStopCount += 1;
          recordError({
            type: 'stop_duplicate_page',
            category: 'provider',
            provider: providerName,
            page,
            message: 'duplicate page signature detected, stop sync',
            at: new Date().toISOString()
          });
          log(`provider stop duplicate page provider=${providerName} page=${page}`);
          break;
        }
        seenPageSignatures.add(sig);

        const ids = items.map((x) => String(x?.id ?? '')).filter(Boolean);
        const allSeen = ids.length > 0 && ids.every((id) => seenIds.has(id));
        if (allSeen) {
          report.stats.duplicateStopCount += 1;
          recordError({
            type: 'stop_duplicate_items',
            category: 'provider',
            provider: providerName,
            page,
            message: 'all ids in page already seen, stop sync',
            at: new Date().toISOString()
          });
          log(`provider stop all-seen provider=${providerName} page=${page}`);
          break;
        }
        ids.forEach((id) => seenIds.add(id));
      }

      const payload = {
        mode,
        img: provider.img,
        sort_order: provider.sortOrder,
        is_active: true,
        items
      };

      await backendPost(
        `/api/import/channel/${encodeURIComponent(providerName)}/items`,
        payload,
        'import_provider_items_page',
        { provider: providerName, page, mode, count: items.length }
      );

      importedItems += items.length;
      importedPages += 1;
      mode = 'append';
      log(`provider page ok provider=${providerName} page=${page} count=${items.length}`);
      page += 1;
    }

    providerStats.push({
      provider: providerName,
      pages: importedPages,
      items: importedItems
    });
    log(`provider sync done name=${providerName} pages=${importedPages} items=${importedItems}`);
  }

  log('sync provider done', {
    providers: finalProviders.length,
    stats: providerStats
  });
}

async function writeReport(mode) {
  report.mode = mode;
  report.finishedAt = new Date().toISOString();

  const summary = {
    runId: report.runId,
    mode: report.mode,
    startedAt: report.startedAt,
    finishedAt: report.finishedAt,
    stats: report.stats,
    importOk: report.importOk,
    importFail: report.importFail,
    errorCount: report.errorCount
  };

  await saveJson(reportDir, 'summary', summary);
  if (importWriter) await importWriter.close();
  if (errorWriter) await errorWriter.close();

  log('report summary', summary);
  log('report files saved under', runDir);
}

async function main() {
  const mode = (process.argv[2] || 'full').toLowerCase();
  if (!cfg.backendBaseUrl) throw new Error('BACKEND_BASE_URL is required');

  await ensureOutputDirs();
  importWriter = new JsonArrayWriter(path.join(reportDir, 'imports.json'));
  errorWriter = new JsonArrayWriter(path.join(reportDir, 'errors.json'));
  await importWriter.start();
  await errorWriter.start();

  if (mode === 'home' || mode === 'full') await syncHome();
  if (mode === 'movie' || mode === 'full') await syncMovie();
  if (mode === 'tv' || mode === 'full') await syncTv();
  if (mode === 'provider') await syncProvider();
  if (mode === 'tv-hydrate' || mode === 'hydrate') await syncTvHydrate();

  await writeReport(mode);
}

main().catch(async (err) => {
  const msg = err?.message || String(err);
  await ensureOutputDirs();
  if (!importWriter) {
    importWriter = new JsonArrayWriter(path.join(reportDir, 'imports.json'));
    await importWriter.start();
  }
  if (!errorWriter) {
    errorWriter = new JsonArrayWriter(path.join(reportDir, 'errors.json'));
    await errorWriter.start();
  }
  recordError({ type: 'fatal', message: msg, at: new Date().toISOString() });
  await writeReport((process.argv[2] || 'full').toLowerCase());
  console.error(err);
  process.exit(1);
});
