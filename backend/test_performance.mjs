/**
 * 性能测试 - 对比优化前后
 */

import { extractMegacloudSources } from './src/utils/megacloud-decrypt.js';

const embedUrl = 'https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=';

console.log('🚀 性能测试 - Megacloud 提取器\n');
console.log(`测试 URL: ${embedUrl}\n`);

async function test(iteration) {
  const start = Date.now();

  try {
    const result = await extractMegacloudSources(embedUrl);
    const elapsed = Date.now() - start;

    return {
      success: true,
      elapsed,
      sourcesCount: result.sources?.length || 0,
      tracksCount: result.tracks?.length || 0
    };
  } catch (error) {
    const elapsed = Date.now() - start;
    return {
      success: false,
      elapsed,
      error: error.message
    };
  }
}

// 运行多次测试
console.log('运行 3 次测试...\n');

const results = [];

for (let i = 1; i <= 3; i++) {
  console.log(`第 ${i} 次测试...`);
  const result = await test(i);
  results.push(result);

  if (result.success) {
    console.log(`✅ 成功: ${result.elapsed}ms (${result.sourcesCount} sources, ${result.tracksCount} tracks)`);
  } else {
    console.log(`❌ 失败: ${result.elapsed}ms - ${result.error}`);
  }

  // 等待一下
  await new Promise(resolve => setTimeout(resolve, 500));
}

console.log('\n=== 性能统计 ===');

const successResults = results.filter(r => r.success);
if (successResults.length > 0) {
  const times = successResults.map(r => r.elapsed);
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);

  console.log(`总测试次数: ${results.length}`);
  console.log(`成功次数: ${successResults.length}`);
  console.log(`平均耗时: ${avg.toFixed(0)}ms`);
  console.log(`最快: ${min}ms`);
  console.log(`最慢: ${max}ms`);

  console.log('\n=== 优化效果 ===');
  console.log(`第1次（冷启动）: ${times[0]}ms`);
  if (times.length > 1) {
    console.log(`第2次（有缓存）: ${times[1]}ms - 提速 ${((1 - times[1]/times[0]) * 100).toFixed(1)}%`);
  }
  if (times.length > 2) {
    console.log(`第3次（有缓存）: ${times[2]}ms - 提速 ${((1 - times[2]/times[0]) * 100).toFixed(1)}%`);
  }
} else {
  console.log('所有测试都失败了');
}
