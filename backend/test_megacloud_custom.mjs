import { extractMegacloudM3u8, extractMegacloudSources } from './src/utils/megacloud-decrypt.js';

console.log('🧪 Testing custom Megacloud extractor...\n');

const embedUrl = 'https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=';

console.log(`Testing URL: ${embedUrl}\n`);
console.log('This uses the aniwatch extraction logic adapted for direct use\n');

try {
  console.log('Attempting extraction...\n');

  const result = await extractMegacloudM3u8(embedUrl);

  console.log('✅ SUCCESS!\n');
  console.log('=== M3U8 URLs ===');
  if (result.m3u8 && result.m3u8.length > 0) {
    result.m3u8.forEach((url, i) => {
      console.log(`${i + 1}. ${url}`);
    });
  } else {
    console.log('No m3u8 URLs found');
  }

  console.log('\n=== SUBTITLES ===');
  if (result.subtitles && result.subtitles.length > 0) {
    result.subtitles.forEach((sub, i) => {
      console.log(`${i + 1}. [${sub.language}] ${sub.label}: ${sub.file}`);
    });
  } else {
    console.log('No subtitles found');
  }

  console.log('\n=== FULL SOURCES (detailed) ===');
  const fullResult = await extractMegacloudSources(embedUrl);
  console.log(JSON.stringify(fullResult, null, 2));

  console.log('\n🎉 Extraction successful!');
  console.log('This method can be integrated into demoResolver.js');

} catch (error) {
  console.log('❌ FAILED\n');
  console.log('Error:', error.message);
  console.log('\nStack:', error.stack);

  if (error.response) {
    console.log('\nAPI Response:', error.response.status);
    console.log('Data:', error.response.data);
  }
}
