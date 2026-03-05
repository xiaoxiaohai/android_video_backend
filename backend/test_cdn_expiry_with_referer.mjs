/**
 * 测试 CDN 链接有效期（带 Referer）
 */

import { extractMegacloudSources } from './src/utils/megacloud-decrypt.js';
import axios from 'axios';

const embedUrl = 'https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=';

console.log('🔍 测试 CDN 链接有效期（带正确的 Referer）...\n');

async function checkUrlValidity(url, label) {
  try {
    const response = await axios.head(url, {
      headers: {
        'Referer': 'https://videostr.net/',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36'
      },
      timeout: 5000,
      validateStatus: (status) => status < 500
    });

    const status = response.status;
    const valid = status >= 200 && status < 400;

    console.log(`${label}: ${valid ? '✅ 有效' : '❌ 失败'} (${status})`);

    // 检查 CDN 缓存信息
    const cacheControl = response.headers['cache-control'];
    const expires = response.headers['expires'];
    const age = response.headers['age'];
    const date = response.headers['date'];

    if (cacheControl) console.log(`  Cache-Control: ${cacheControl}`);
    if (expires) console.log(`  Expires: ${expires}`);
    if (age) console.log(`  Age: ${age}s`);
    if (date) console.log(`  Date: ${date}`);

    // 计算过期时间
    if (expires && expires !== 'Thu, 01 Jan 1970 00:00:01 GMT') {
      const expiryDate = new Date(expires);
      const now = new Date();
      const ttl = Math.floor((expiryDate - now) / 1000);
      if (ttl > 0) {
        console.log(`  ⏰ 剩余有效期: ${Math.floor(ttl / 60)} 分钟`);
      }
    }

    // 从 Cache-Control 中提取 max-age
    if (cacheControl && cacheControl.includes('max-age=')) {
      const match = cacheControl.match(/max-age=(\d+)/);
      if (match) {
        const maxAge = parseInt(match[1]);
        console.log(`  ⏰ max-age: ${Math.floor(maxAge / 60)} 分钟`);
      }
    }

    return valid;
  } catch (error) {
    console.log(`${label}: ❌ 错误 - ${error.message}`);
    return false;
  }
}

async function testLinkExpiry() {
  console.log('1️⃣ 提取视频链接...\n');

  const result = await extractMegacloudSources(embedUrl);
  const m3u8Url = result.sources[0]?.file;

  if (!m3u8Url) {
    console.log('❌ 未找到 m3u8 链接');
    return;
  }

  console.log(`M3U8 URL: ${m3u8Url.substring(0, 100)}...\n`);

  console.log('2️⃣ 立即检查有效性...\n');
  const valid1 = await checkUrlValidity(m3u8Url, '第1次检查');

  if (!valid1) {
    console.log('\n⚠️ 链接立即就失效了，可能是防盗链或需要特殊处理');
    return;
  }

  console.log('\n3️⃣ 等待 1 分钟后再次检查...\n');
  console.log('⏳ 等待中...');
  await new Promise(resolve => setTimeout(resolve, 60000));
  const valid2 = await checkUrlValidity(m3u8Url, '第2次检查（1分钟后）');

  console.log('\n' + '='.repeat(50));
  console.log('📊 测试结果');
  console.log('='.repeat(50));

  if (valid1 && valid2) {
    console.log('✅ 链接至少在 1 分钟内保持有效');
    console.log('📝 建议的缓存策略:');
    console.log('   - 保守: 5 分钟');
    console.log('   - 一般: 10-15 分钟');
    console.log('   - 激进: 30 分钟（需要错误处理）');
  } else if (valid1 && !valid2) {
    console.log('⚠️ 链接在 1 分钟内失效');
    console.log('📝 建议: 不要缓存结果，每次都重新提取');
  } else {
    console.log('❌ 链接立即失效');
    console.log('📝 建议: 检查防盗链配置或播放器实现');
  }
}

try {
  await testLinkExpiry();
} catch (error) {
  console.log('\n❌ 测试失败:', error.message);
  console.log(error.stack);
}
