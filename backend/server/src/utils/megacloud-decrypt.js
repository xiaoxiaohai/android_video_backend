/**
 * Megacloud 解密工具
 * 改编自: https://github.com/ghoshRitesh12/aniwatch/blob/main/src/extractors/megacloud.ts
 */

import crypto from 'crypto';
import axios from 'axios';
import http from 'http';
import https from 'https';

/**
 * 创建带连接池的 axios 实例（优化：复用连接）
 */
const httpClient = axios.create({
  httpAgent: new http.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
  }),
  httpsAgent: new https.Agent({
    keepAlive: true,
    maxSockets: 50,
    maxFreeSockets: 10,
    timeout: 60000
  }),
  timeout: 15000
});

/**
 * AES-256-CBC OpenSSL 兼容解密
 */
function decrypt(encrypted, keyStr) {
  try {
    const cypher = Buffer.from(encrypted, 'base64');
    const salt = cypher.subarray(8, 16);
    const password = Buffer.concat([Buffer.from(keyStr, 'binary'), salt]);

    const md5Hashes = [];
    let digest = password;
    for (let i = 0; i < 3; i++) {
      md5Hashes[i] = crypto.createHash('md5').update(digest).digest();
      digest = Buffer.concat([md5Hashes[i], password]);
    }

    const key = Buffer.concat([md5Hashes[0], md5Hashes[1]]);
    const iv = md5Hashes[2];
    const contents = cypher.subarray(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    const decrypted = Buffer.concat([decipher.update(contents), decipher.final()]);

    return decrypted.toString('utf8');
  } catch (error) {
    throw new Error(`Decryption failed: ${error.message}`);
  }
}

/**
 * 从 GitHub 获取 master keys
 * 优化: 内存缓存 1 小时
 */
let keysCache = { data: null, expiry: 0 };

async function getMasterKeys() {
  // 检查缓存
  if (keysCache.data && Date.now() < keysCache.expiry) {
    return keysCache.data;
  }

  // 从 GitHub 获取
  try {
    const response = await httpClient.get(
      'https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json',
      { timeout: 10000 }
    );

    // 缓存 1 小时
    keysCache = {
      data: response.data,
      expiry: Date.now() + 3600000 // 1 hour
    };

    return response.data;
  } catch (error) {
    console.warn('Failed to fetch master keys from GitHub:', error.message);

    // 如果有旧缓存，返回旧缓存（即使过期）
    if (keysCache.data) {
      console.warn('Using expired cache as fallback');
      return keysCache.data;
    }

    return null;
  }
}

function buildMegacloudHosts(embedUrl, opts = {}) {
  const out = [];
  const seen = new Set();
  const push = (host) => {
    const h = String(host || '').trim().toLowerCase();
    if (!h || seen.has(h)) return;
    seen.add(h);
    out.push(h);
  };
  try {
    const embedHost = new URL(embedUrl).host;
    if (opts.preferEmbedOrigin) push(embedHost);
  } catch {
    // ignore
  }
  push('videostr.net');
  return out;
}

/**
 * 提取 Megacloud sources
 * @param {string} embedUrl - provider embed URL (例如: https://videostr.net/embed-1/v3/e-1/xxx?z=)
 * @param {{preferEmbedOrigin?: boolean, parentReferer?: string}} opts
 * @returns {Promise<{sources: Array, tracks: Array}>}
 */
export async function extractMegacloudSources(embedUrl, opts = {}) {
  try {
    // 1. 提取 source ID
    const match = embedUrl.match(/\/e-1\/([^/?#]+)/);
    if (!match) {
      throw new Error('Invalid embed URL format');
    }
    const sourceId = match[1];

    // 2 & 3. 并行获取 master keys 和 embed 页面（优化：减少等待时间）
    const [keys, embedResponse] = await Promise.all([
      getMasterKeys(),
      httpClient.get(embedUrl, {
        headers: {
          Referer: opts.parentReferer || 'https://f2movies.la/',
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
        },
        timeout: 15000
      })
    ]);

    if (!keys) {
      throw new Error('Failed to fetch decryption keys');
    }

    // 尝试从 HTML 中提取 48 字符的 key
    const keyMatches = embedResponse.data.match(/[a-zA-Z0-9]{48}/g);
    if (!keyMatches || keyMatches.length === 0) {
      throw new Error('Client key not found in embed page');
    }

    // 通常第一个 48 字符的字符串就是 key
    const clientKey = keyMatches[0];

    // 4. 调用 getSources API（优先 provider origin，失败再回退 videostr）
    const hosts = buildMegacloudHosts(embedUrl, opts);
    let data = null;
    let lastErr = null;
    for (const host of hosts) {
      const sourcesUrl = `https://${host}/embed-1/v3/e-1/getSources?id=${sourceId}&_k=${clientKey}`;
      try {
        const sourcesResponse = await httpClient.get(sourcesUrl, {
          headers: {
            Referer: `https://${host}/embed-1/v3/e-1/${sourceId}?z=`,
            'X-Requested-With': 'XMLHttpRequest',
            'User-Agent':
              'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36'
          },
          timeout: 15000
        });
        data = sourcesResponse.data;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (!data) {
      throw lastErr || new Error('getSources failed');
    }

    // 5. 如果 sources 是加密的，解密
    let sources = [];
    let tracks = data.tracks || [];

    if (typeof data.sources === 'string') {
      // 加密的 sources，需要解密
      const decryptionKey = keys.key || keys.encryptionKey;
      if (!decryptionKey) {
        throw new Error('Decryption key not available');
      }

      const decrypted = decrypt(data.sources, decryptionKey);
      sources = JSON.parse(decrypted);
    } else if (Array.isArray(data.sources)) {
      // 未加密的 sources
      sources = data.sources;
    } else {
      throw new Error('Invalid sources format');
    }

    return {
      sources,
      tracks,
      intro: data.intro,
      outro: data.outro
    };
  } catch (error) {
    throw new Error(`Megacloud extraction failed: ${error.message}`);
  }
}

/**
 * 简化版本：只提取 m3u8 URL
 */
export async function extractMegacloudM3u8(embedUrl) {
  const result = await extractMegacloudSources(embedUrl);
  return {
    m3u8: result.sources.map((s) => s.file || s.url).filter(Boolean),
    subtitles: result.tracks
      .filter((t) => t.kind === 'captions' || t.kind === 'subtitles')
      .map((t) => ({ file: t.file, label: t.label, language: t.srclang }))
  };
}
