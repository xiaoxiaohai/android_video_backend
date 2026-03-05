# GitHub 密钥作用说明

## 🎯 简单来说

**GitHub 密钥 = 解密视频地址的钥匙**

就像一个保险箱：
- 🔒 Megacloud 把视频地址**加密**后锁起来
- 🔑 GitHub 密钥是**开锁的钥匙**
- 📦 解密后才能得到真正的 m3u8 视频链接

---

## 📊 完整流程图解

### 没有加密时（理想情况）

```
调用 getSources API
    ↓
返回: {
  "sources": [
    { "file": "https://cdn.com/video.m3u8" }  ← 直接可用
  ]
}
    ↓
直接播放 ✅
```

### 实际情况（Megacloud 加密）

```
调用 getSources API
    ↓
返回: {
  "sources": "U2FsdGVkX1+abc123加密的乱码..."  ← 加密字符串 🔒
  "tracks": [...]
}
    ↓
❌ 无法直接使用！需要解密
    ↓
获取 GitHub 密钥 🔑
    ↓
使用 AES-256-CBC 解密
    ↓
解密成功 ✅
    ↓
得到: [
  { "file": "https://cdn.com/video.m3u8" }
]
    ↓
现在可以播放了 🎉
```

---

## 🔍 实际例子

### 第 1 步：调用 getSources API

**请求**:
```
GET https://videostr.net/embed-1/v3/e-1/getSources?id=xxx&_k=yyy
```

**返回（加密的）**:
```json
{
  "sources": "U2FsdGVkX1+KvZ8t5M2xYz7nH3pL...(很长的加密字符串)",
  "tracks": [
    { "file": "https://cc.2cdns.com/...eng.vtt", "kind": "captions" }
  ]
}
```

**问题**: `sources` 是一串**加密的乱码**，不是视频地址！

---

### 第 2 步：获取 GitHub 密钥

**从哪里获取？**
```
https://github.com/yogesh-hacker/MegacloudKeys
```

**密钥内容**:
```json
{
  "rabbit": "3AlttPAF1Zwn2l63meMeGMIvlWOXgm9ZXNk3glEzLTGOr1F113",
  "mega": "nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj",
  "vidstr": "nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj"
}
```

我们用的是 `vidstr` 或 `mega` 密钥（它们是相同的）。

---

### 第 3 步：使用密钥解密

**加密字符串**:
```
U2FsdGVkX1+KvZ8t5M2xYz7nH3pL9qR...
```

**使用 AES-256-CBC 解密算法**:
```javascript
const masterKey = "nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj";
const decrypted = decrypt(encryptedSources, masterKey);
```

**解密后得到**:
```json
[
  {
    "file": "https://nightbreeze17.site/file2/.../playlist.m3u8",
    "type": "hls"
  }
]
```

**现在这是真正的视频地址！** ✅

---

## 🤔 为什么 Megacloud 要加密？

### Megacloud 的防护策略

```
目的: 防止盗链和爬虫

1. 不直接返回视频地址
   ❌ 防止简单的 API 调用就能获取视频

2. 加密视频地址
   🔒 即使调用了 API，也得到加密数据

3. 密钥定期更换
   🔄 破解者需要不断更新密钥

4. 需要正确的 Referer
   🛡️ 只允许从特定网站访问
```

---

## 🔐 加密技术细节

### AES-256-CBC (OpenSSL 格式)

```
加密算法: AES-256-CBC
密钥长度: 256 bits
加密模式: CBC (Cipher Block Chaining)
兼容性: OpenSSL
```

### 解密步骤

```javascript
1. Base64 解码
   "U2FsdGVkX1+..." → Binary data

2. 解析 OpenSSL 格式
   ├─ Bytes 0-7:   "Salted__" (固定头)
   ├─ Bytes 8-15:  Salt (随机盐值)
   └─ Bytes 16+:   加密的实际数据

3. 密钥派生 (EVP_BytesToKey)
   password = masterKey + salt
   ├─ MD5 round 1: hash[0] = MD5(password)
   ├─ MD5 round 2: hash[1] = MD5(hash[0] + password)
   └─ MD5 round 3: hash[2] = MD5(hash[1] + password)

   key = hash[0] + hash[1]  // 32 bytes (256 bits)
   iv  = hash[2]            // 16 bytes

4. AES-256-CBC 解密
   plaintext = AES_Decrypt(encrypted_data, key, iv)

5. 得到 JSON 字符串
   [{"file": "https://...", "type": "hls"}]
```

---

## 🎯 GitHub 密钥的特点

### 1. 公开但必需

```
✅ 密钥是公开的（在 GitHub 上）
✅ 任何人都能访问
⚠️ 但是不知道密钥就无法解密
```

这就像：
- 🔒 锁是公开的设计
- 🔑 但没有钥匙还是打不开

### 2. 定期更新

```
密钥会不定期更新（几天或几周一次）

旧密钥: "abc123..."
   ↓ 项目维护者更新
新密钥: "xyz789..."

如果使用旧密钥:
   ↓
解密失败 ❌
   ↓
需要获取新密钥
```

**这就是为什么我们缓存密钥，但不会永久缓存！**

### 3. 多个密钥

```json
{
  "rabbit": "3Altt...",  // RabbitStream 用
  "mega": "nTAyg...",    // Megacloud 用
  "vidstr": "nTAyg..."   // Vidstreaming 用
}
```

不同的视频服务可能用不同的密钥。

---

## 💡 为什么缓存密钥是安全的？

### 密钥 vs 视频链接对比

| 特性 | GitHub 密钥 | m3u8 视频链接 |
|------|------------|--------------|
| **作用** | 解密工具 | 实际视频地址 |
| **内容** | "nTAygRRNLS..." | "https://cdn.com/..." |
| **会过期吗？** | ❌ 几乎不会 | ✅ 1-6 小时后失效 |
| **更新频率** | 几天/几周 | 每次请求都变 |
| **缓存安全性** | ✅ 非常安全 | ⚠️ 容易过期 |
| **缓存时间** | 1-24 小时 | 不建议缓存 |

---

## 🔄 完整提取流程

```
用户请求视频
    ↓
1️⃣ 获取观看页面
    GET f2movies.la/watch-movie/xxx
    ↓
2️⃣ 提取 episode ID
    从 HTML 中找到: 13089453
    ↓
3️⃣ 调用 episode sources API
    GET /ajax/episode/sources/13089453
    返回: videostr.net embed URL
    ↓
4️⃣ 获取 embed 页面
    GET videostr.net/embed-1/v3/e-1/xxx?z=
    提取: 48 字符的客户端密钥
    ↓
5️⃣ 获取 GitHub 密钥 🔑 ← 这一步！
    GET github.com/.../keys.json
    返回: { "vidstr": "nTAyg..." }
    ↓
6️⃣ 调用 getSources API
    GET getSources?id=xxx&_k=yyy
    返回: { "sources": "U2FsdGVkX1+..." }  ← 加密的
    ↓
7️⃣ 使用 GitHub 密钥解密 🔓 ← 这一步！
    decrypt("U2FsdGVkX1+...", "nTAyg...")
    ↓
8️⃣ 得到视频地址 ✅
    [{ "file": "https://cdn.com/video.m3u8" }]
    ↓
9️⃣ 返回给用户
    { "files": [...], "captions": [...] }
```

**GitHub 密钥在第 5 步获取，第 7 步使用**

---

## 🎓 类比理解

### 现实世界的例子

```
场景: 你要打开一个保险箱

1. 保险箱 = Megacloud 的加密数据
   "U2FsdGVkX1+..."

2. 钥匙 = GitHub 密钥
   "nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj"

3. 开锁的方法 = AES-256-CBC 算法
   decrypt(保险箱, 钥匙)

4. 保险箱里的宝物 = m3u8 视频地址
   "https://cdn.com/video.m3u8"
```

### 为什么钥匙可以缓存？

```
钥匙（GitHub 密钥）:
✅ 可以重复使用
✅ 不会过期（短期内）
✅ 缓存 1 小时很安全

宝物（视频地址）:
⚠️ 每次都不同
⚠️ 会过期（几小时后）
⚠️ 不建议缓存
```

---

## 🧪 验证解密过程

### 测试脚本

```javascript
// 模拟加密的 sources
const encrypted = "U2FsdGVkX1+abc123...";

// GitHub 密钥
const masterKey = "nTAygRRNLS3wo82OtMyfPrWgD9K2UIvcwlj";

// 解密
const decrypted = decrypt(encrypted, masterKey);

console.log(decrypted);
// 输出: [{"file": "https://cdn.com/video.m3u8", "type": "hls"}]
```

---

## ❓ 常见问题

### Q1: GitHub 密钥会失效吗？
**A**: 会，但很少（几天或几周才更新一次）。所以缓存 1 小时是安全的。

### Q2: 如果 GitHub 密钥过期了怎么办？
**A**:
1. 解密会失败
2. 我们的代码会返回错误
3. 下次请求时会获取新密钥
4. 如果 GitHub 不可访问，使用本地备份（如果实现）

### Q3: 为什么不把密钥硬编码在代码里？
**A**:
- 密钥会定期更新
- 硬编码后每次更新都要改代码
- 从 GitHub 获取更灵活

### Q4: 没有 GitHub 密钥能提取视频吗？
**A**: ❌ 不能！
- getSources 返回的是加密数据
- 没有密钥无法解密
- 就像没有钥匙打不开保险箱

### Q5: 能不能破解加密，不用密钥？
**A**:
- 理论上可以，但需要暴力破解 AES-256
- 需要天文数字级别的计算能力
- 不如直接从 GitHub 获取密钥快 😄

---

## 🎯 总结

### GitHub 密钥的作用

| # | 作用 | 说明 |
|---|------|------|
| 1 | 🔑 解密工具 | 用于解密 getSources 返回的加密数据 |
| 2 | 🔓 破解防护 | 绕过 Megacloud 的加密防护 |
| 3 | 🎯 获取真实地址 | 解密后得到真正的 m3u8 视频 URL |
| 4 | ♻️ 可重复使用 | 短期内（几天）都有效 |
| 5 | 📦 公开获取 | 任何人都能从 GitHub 获取 |

### 关键要点

```
✅ GitHub 密钥 = 解密钥匙（工具）
✅ m3u8 链接 = 解密结果（视频地址）

✅ 密钥可以缓存（不会过期）
❌ 链接不能缓存（会过期）

✅ 密钥从 GitHub 获取
✅ 链接从 getSources 解密得到
```

---

**现在明白了吗？** 😊

GitHub 密钥就像是开锁的钥匙，帮我们解开 Megacloud 加密的视频地址！
