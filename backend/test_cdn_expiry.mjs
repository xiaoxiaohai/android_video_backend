/**
 * 测试 CDN 链接有效期
 */

import { extractMegacloudSources } from './src/utils/megacloud-decrypt.js';
import axios from 'axios';

const embedUrl = 'https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=';

console.log('🔍 测试 CDN 链接有效期...\n');

async function checkUrlValidity(url, label) {
  try {
    const response = await axios.head(url, {
      timeout: 5000,
      validateStatus: (status) => status < 500
    });

    const status = response.status;
    const valid = status >= 200 && status < 400;

    console.log(`${label}: ${valid ? '✅' : '❌'} ${status}`);

    // 检查是否有过期时间相关的 header
    const cacheControl = response.headers['cache-control'];
    const expires = response.headers['expires'];
    const age = response.headers['age'];

    if (cacheControl || expires || age) {
      console.log(`  Cache-Control: ${cacheControl || 'none'}`);
      console.log(`  Expires: ${expires || 'none'}`);
      console.log(`  Age: ${age || 'none'}`);
    }

    return valid;
  } catch (error) {
    console.log(`${label}: ❌ Error - ${error.message}`);
    return false;
  }
}

async function testLinkExpiry() {
  console.log('1. 提取视频链接...\n');

  const result = await extractMegacloudSources(embedUrl);
  const m3u8Url = result.sources[0]?.file;

  if (!m3u8Url) {
    console.log('❌ 未找到 m3u8 链接');
    return;
  }

  console.log(`M3U8: ${m3u8Url.substring(0, 80)}...\n`);

  console.log('2. 检查链接有效性...\n');
  await checkUrlValidity(m3u8Url, '立即检查');

  console.log('\n3. 等待 30 秒后再次检查...\n');
  await new Promise(resolve => setTimeout(resolve, 30000));
  await checkUrlValidity(m3u8Url, '30秒后');

  console.log('\n=== 结论 ===');
  console.log('如果两次检查都成功，说明链接至少在 30 秒内有效');
  console.log('实际有效期通常是 1-6 小时，具体取决于 CDN 配置');
  console.log('\n建议缓存时间: 5-15 分钟（保守）');
}

try {
  await testLinkExpiry();
} catch (error) {
  console.log('❌ 测试失败:', error.message);
}
