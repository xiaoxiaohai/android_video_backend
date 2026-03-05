/**
 * 演示 GitHub 密钥的作用
 * 模拟 Megacloud 的加密/解密过程
 */

import crypto from 'crypto';

console.log('🔐 演示：GitHub 密钥如何解密视频地址\n');
console.log('='.repeat(60));

// ============ 第 1 部分：Megacloud 服务器的加密过程 ============
console.log('\n📤 第 1 步：Megacloud 服务器加密视频地址');
console.log('-'.repeat(60));

const realVideoUrl = 'https://nightbreeze17.site/file2/xxx/playlist.m3u8';
const masterKey = 'nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj'; // GitHub 密钥

console.log('原始视频地址（真实的 m3u8）:');
console.log(`  ${realVideoUrl}\n`);

// 模拟 Megacloud 的加密过程
function encryptLikeMegacloud(text, keyStr) {
  const salt = crypto.randomBytes(8);
  const password = Buffer.concat([Buffer.from(keyStr, 'binary'), salt]);

  const md5Hashes = [];
  let digest = password;
  for (let i = 0; i < 3; i++) {
    md5Hashes[i] = crypto.createHash('md5').update(digest).digest();
    digest = Buffer.concat([md5Hashes[i], password]);
  }

  const key = Buffer.concat([md5Hashes[0], md5Hashes[1]]);
  const iv = md5Hashes[2];

  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  const encrypted = Buffer.concat([
    Buffer.from('Salted__'),
    salt,
    cipher.update(Buffer.from(text)),
    cipher.final()
  ]);

  return encrypted.toString('base64');
}

const encryptedData = encryptLikeMegacloud(
  JSON.stringify([{ file: realVideoUrl, type: 'hls' }]),
  masterKey
);

console.log('Megacloud 加密后的数据（这是 getSources API 返回的）:');
console.log(`  ${encryptedData.substring(0, 80)}...`);
console.log(`  (共 ${encryptedData.length} 字符)\n`);

console.log('❌ 这串乱码无法直接播放视频！');
console.log('❌ 必须先解密才能得到真实的视频地址！\n');

// ============ 第 2 部分：我们的解密过程 ============
console.log('='.repeat(60));
console.log('\n📥 第 2 步：我们使用 GitHub 密钥解密');
console.log('-'.repeat(60));

console.log('从 GitHub 获取解密密钥:');
console.log('  URL: https://github.com/yogesh-hacker/MegacloudKeys');
console.log(`  密钥: ${masterKey}\n`);

// 解密函数（和我们实际使用的一样）
function decrypt(encrypted, keyStr) {
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
}

console.log('解密中...');
const decryptedJson = decrypt(encryptedData, masterKey);
const decryptedData = JSON.parse(decryptedJson);

console.log('✅ 解密成功！\n');
console.log('解密后的数据:');
console.log(JSON.stringify(decryptedData, null, 2));

console.log('\n✅ 现在我们得到了真实的视频地址，可以播放了！\n');

// ============ 第 3 部分：总结 ============
console.log('='.repeat(60));
console.log('\n📚 总结：GitHub 密钥的作用');
console.log('-'.repeat(60));

console.log(`
1️⃣ Megacloud 返回加密数据（保护视频地址）
   "${encryptedData.substring(0, 50)}..."

2️⃣ 我们从 GitHub 获取解密密钥
   "${masterKey}"

3️⃣ 使用密钥 + AES-256-CBC 算法解密
   decrypt(加密数据, GitHub密钥)

4️⃣ 得到真实的视频地址
   "${realVideoUrl}"

🔑 GitHub 密钥 = 解锁视频地址的钥匙
📦 不是视频本身，而是获取视频地址的工具
♻️ 可以重复使用（短期内有效）
🎯 这就是为什么我们缓存它！
`);

console.log('='.repeat(60));
console.log('\n💡 现在理解了吗？\n');
console.log('GitHub 密钥就像是一把钥匙，帮我们打开加密的保险箱，');
console.log('从而拿到里面的宝物（视频地址）！\n');
