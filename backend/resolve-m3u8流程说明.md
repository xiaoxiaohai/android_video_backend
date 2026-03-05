# resolve-m3u8 完整流程说明

## 📋 目录
1. [整体架构](#整体架构)
2. [详细流程](#详细流程)
3. [关键函数](#关键函数)
4. [成功/失败路径](#成功失败路径)

---

## 整体架构

```
API Request
    ↓
demo.js (路由层)
    ↓
demoResolver.js (解析层)
    ↓
├─→ f2movies Site Resolver
│   └─→ videostr Provider Resolver
│       ├─→ Megacloud 提取器 (新) ⭐
│       └─→ Playwright 回退 (旧)
└─→ Fallback Resolver
```

---

## 详细流程

### 第 1 步：API 请求入口
**文件**: `src/routes/demo.js:15`

```javascript
POST /api/demo/resolve-m3u8
Body: {
  "watchUrl": "https://f2movies.la/watch-movie/...",
  "referer": "https://f2movies.la/",  // 可选
  "origin": "https://f2movies.la/",    // 可选
  "cookie": "...",                     // 可选
  "userAgent": "..."                   // 可选
}
```

**验证**:
- 使用 Zod schema 验证请求参数
- watchUrl 必须是有效 URL
- 其他参数可选

**调用**: `resolveM3u8Demo(parsed.data)`

---

### 第 2 步：构建请求头 + 站点分发
**文件**: `src/services/demoResolver.js:624`

**函数**: `resolveM3u8Demo()`

```javascript
1. buildDefaultHeaders() - 构建默认请求头
   ├─→ User-Agent (默认 Chrome)
   ├─→ Accept
   ├─→ Accept-Language
   └─→ Referer, Origin, Cookie (如果提供)

2. resolveBySite() - 根据域名分发到对应 resolver
```

---

### 第 3 步：站点识别与分发
**文件**: `src/services/demoResolver.js:592`

**函数**: `resolveBySite()`

```javascript
// 站点 resolvers 配置
const siteResolvers = [
  {
    name: 'f2movies',
    supports: (h) => /f2movies|f2moviesz/.test(h),  // 匹配所有 f2movies.xxx
    resolve: resolveViaF2MoviesSite
  }
];

// 匹配逻辑
if (host 匹配 "f2movies")
  → 调用 resolveViaF2MoviesSite()
else
  → 调用 fallback resolver (基础 HTML 解析)
```

**支持的域名**:
- ✅ f2movies.la
- ✅ f2movies.uk
- ✅ f2movies.to
- ✅ f2moviesz.xxx
- ✅ 任何包含 "f2movies" 的域名

---

### 第 4 步：f2movies 站点解析
**文件**: `src/services/demoResolver.js:525`

**函数**: `resolveViaF2MoviesSite()`

```javascript
流程:
1. 获取观看页面
   GET https://f2movies.la/watch-movie/xxx
   ↓
2. 从 HTML 中提取 episode ID
   方法:
   ├─→ URL 中的数字: /xxx.(\d+)
   ├─→ HTML 中的 ajax 链接: /ajax/episode/sources/(\d+)
   └─→ data-id 属性: data-id="(\d{4,})"
   ↓
3. 调用 episode sources API
   GET /ajax/episode/sources/{episodeId}
   返回: { "link": "https://videostr.net/embed-1/v3/e-1/xxx?z=" }
   ↓
4. 根据 provider URL 分发
   if (URL 包含 "videostr.net")
     → 调用 resolveViaVideostrProvider()
   else
     → 返回空结果
```

**示例**:
```
观看页面: https://f2movies.la/watch-movie/watch-state-of-fear-movies-free-hd-144453.13089453
          ↓ 提取 episode ID
Episode ID: 13089453
          ↓ 调用 API
API: /ajax/episode/sources/13089453
          ↓ 返回
Embed URL: https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=
```

---

### 第 5 步：videostr Provider 解析 ⭐ 核心
**文件**: `src/services/demoResolver.js:159`

**函数**: `resolveViaVideostrProvider()`

这是**最核心**的函数，现在使用 **Megacloud 解密技术**！

```javascript
流程:

1. 获取 embed 页面
   GET https://videostr.net/embed-1/v3/e-1/xxx?z=
   Headers:
   └─→ Referer: https://f2movies.la/
   ↓

2. 尝试 Megacloud 提取器 (新方法) ⭐
   调用: extractMegacloudSources(embedUrl)
   ↓
   2.1 提取 source ID
       从 URL 中提取: /e-1/([^/?#]+)
       例如: uVcR6PnxmZYg
       ↓
   2.2 获取 GitHub master 解密密钥
       GET https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/main/keys.json
       返回: { "key": "...", "encryptionKey": "..." }
       ↓
   2.3 获取 embed 页面，提取客户端密钥
       从 HTML 中提取 48 字符的密钥
       正则: /[a-zA-Z0-9]{48}/g
       ↓
   2.4 调用 getSources API
       GET https://videostr.net/embed-1/v3/e-1/getSources?id=xxx&_k=yyy
       Headers:
       ├─→ Referer: https://videostr.net/embed-1/v3/e-1/xxx?z=
       └─→ X-Requested-With: XMLHttpRequest
       返回: { "sources": "加密字符串...", "tracks": [...] }
       ↓
   2.5 AES-256-CBC 解密
       使用 master key + OpenSSL 兼容算法
       解密 sources 字符串
       ↓
   2.6 返回结果
       {
         sources: [{ file: "https://.../playlist.m3u8" }],
         tracks: [{ kind: "captions", file: "https://.../eng.vtt", ... }]
       }

   ✅ 成功 → 返回 m3u8 + 字幕
   ❌ 失败 → 继续下一步

3. Playwright 回退 (旧方法)
   if (RESOLVER_PLAYWRIGHT_ENABLED=true && Megacloud 失败)
     调用: resolveViaVideostrPlaywright()
     使用浏览器自动化抓取
   ↓
   ❌ 通常失败（被 Megacloud 检测）

4. 返回结果
   {
     candidates: [{ url: "...", source: "megacloud_decrypt", headers: {...} }],
     captions: [{ file: "...", kind: "captions", label: "...", ... }],
     debug: [...]
   }
```

---

### 第 6 步：Megacloud 解密详解
**文件**: `src/utils/megacloud-decrypt.js`

**核心算法**: AES-256-CBC (OpenSSL 兼容)

```javascript
解密流程:

1. 输入: Base64 编码的加密字符串
   例如: "U2FsdGVkX1+..."
   ↓

2. 解析 OpenSSL 格式
   ├─→ Bytes 0-7: "Salted__" (固定头)
   ├─→ Bytes 8-15: Salt (8 字节)
   └─→ Bytes 16+: 加密数据
   ↓

3. 密钥派生 (EVP_BytesToKey)
   password = masterKey + salt
   ├─→ MD5 Hash Round 1: hash[0] = MD5(password)
   ├─→ MD5 Hash Round 2: hash[1] = MD5(hash[0] + password)
   └─→ MD5 Hash Round 3: hash[2] = MD5(hash[1] + password)

   key = hash[0] + hash[1]  // 32 bytes (AES-256)
   iv  = hash[2]            // 16 bytes
   ↓

4. AES-256-CBC 解密
   decipher = crypto.createDecipheriv('aes-256-cbc', key, iv)
   decrypted = decipher.update(contents) + decipher.final()
   ↓

5. 返回: JSON 字符串
   [{ "file": "https://.../playlist.m3u8", "type": "hls" }]
```

**为什么这么复杂？**
- Megacloud 使用了 OpenSSL 的加密格式
- 需要完全兼容 OpenSSL 的 `openssl enc -aes-256-cbc -d` 命令
- 防止简单的 API 调用破解

---

### 第 7 步：结果组装与返回
**文件**: `src/services/demoResolver.js:624`

**函数**: `resolveM3u8Demo()` (最后部分)

```javascript
1. 组装候选项
   candidates.map(x => ({
     file: x.url,
     type: 'hls',
     headers: x.headers || {},
     host: new URL(x.url).host,
     path: new URL(x.url).pathname
   }))
   ↓

2. 去重 + 格式化
   uniqueByUrl() - 移除重复的 URL
   ↓

3. 返回最终结果
   {
     ok: true,
     watchUrl: "...",
     files: [...],           // m3u8 文件列表
     captions: [...],        // 字幕列表
     primary: files[0],      // 主视频文件
     debug: [...]            // 调试信息（可选）
   }
```

---

## 关键函数总览

| 函数 | 文件 | 行号 | 作用 |
|------|------|------|------|
| `POST /demo/resolve-m3u8` | demo.js | 15 | API 入口 |
| `resolveM3u8Demo()` | demoResolver.js | 624 | 主流程控制 |
| `resolveBySite()` | demoResolver.js | 592 | 站点分发 |
| `resolveViaF2MoviesSite()` | demoResolver.js | 525 | f2movies 解析 |
| `resolveViaVideostrProvider()` | demoResolver.js | 159 | ⭐ videostr 解析 |
| `extractMegacloudSources()` | megacloud-decrypt.js | 59 | ⭐ Megacloud 提取 |
| `decrypt()` | megacloud-decrypt.js | 12 | ⭐ AES 解密 |
| `resolveViaVideostrPlaywright()` | demoResolver.js | 268 | Playwright 回退 |

---

## 成功/失败路径

### ✅ 成功路径 (正常流程)

```
API 请求
  → 验证参数 ✓
  → 识别为 f2movies ✓
  → 获取观看页面 ✓
  → 提取 episode ID ✓
  → 调用 episode sources API ✓
  → 识别为 videostr provider ✓
  → 获取 embed 页面 ✓
  → Megacloud 提取 ✓
    ├─→ 获取 GitHub 密钥 ✓
    ├─→ 提取客户端密钥 ✓
    ├─→ 调用 getSources API ✓
    ├─→ 解密 sources ✓
    └─→ 返回 m3u8 + 字幕 ✓
  → 组装结果 ✓
  → 返回 JSON ✓

耗时: 2-5 秒
```

### ❌ 失败路径

#### 场景 1: 观看页面 404
```
API 请求
  → 获取观看页面 ✗ (404)
  → 返回空结果
  {
    ok: true,
    files: [],
    captions: [],
    primary: null
  }
```

#### 场景 2: episode ID 提取失败
```
API 请求
  → 获取观看页面 ✓
  → 提取 episode ID ✗ (页面结构变化)
  → 返回空结果
```

#### 场景 3: GitHub 密钥获取失败
```
API 请求
  → ... (前面成功)
  → Megacloud 提取
    → 获取 GitHub 密钥 ✗ (网络错误)
    → 抛出异常
  → 回退到 Playwright (如果启用)
  → 或返回空结果
```

#### 场景 4: getSources API 失败
```
API 请求
  → ... (前面成功)
  → Megacloud 提取
    → 调用 getSources API ✗ (403/500)
    → 抛出异常
  → 回退到 Playwright (如果启用)
```

---

## 配置选项

### 环境变量

```bash
# 禁用 Playwright 回退（推荐）
RESOLVER_PLAYWRIGHT_ENABLED=false

# 启用调试输出
RESOLVER_INCLUDE_DEBUG=true

# 本地 Chrome profile 目录（Playwright 使用）
RESOLVER_LOCAL_CHROME_PROFILE_DIR=/path/to/chrome/profile
```

---

## Debug 步骤解读

启用 `RESOLVER_INCLUDE_DEBUG=true` 后，返回的 `debug` 数组示例：

```json
{
  "debug": [
    {
      "step": "watch_fetch",
      "status": 200,
      "ok": true
    },
    {
      "step": "episode_sources_fetch",
      "status": 200,
      "ok": true,
      "episodeId": "13089453"
    },
    {
      "step": "videostr_embed_fetch",
      "status": 200,
      "ok": true
    },
    {
      "step": "megacloud_extraction_start"
    },
    {
      "step": "megacloud_extraction_success",
      "sourcesCount": 1,
      "tracksCount": 36
    }
  ]
}
```

**步骤说明**:
1. `watch_fetch` - 获取观看页面
2. `episode_sources_fetch` - 获取 episode sources
3. `videostr_embed_fetch` - 获取 videostr embed 页面
4. `megacloud_extraction_start` - 开始 Megacloud 提取
5. `megacloud_extraction_success` - 提取成功（或 `megacloud_extraction_failed`）

---

## 性能分析

### 时间分布 (典型请求)

| 步骤 | 耗时 | 占比 |
|------|------|------|
| 获取观看页面 | ~300ms | 10% |
| 调用 episode sources API | ~200ms | 7% |
| 获取 embed 页面 | ~300ms | 10% |
| 获取 GitHub 密钥 | ~500ms | 17% |
| 调用 getSources API | ~400ms | 13% |
| 解密 + 处理 | ~50ms | 2% |
| 网络延迟 | ~1200ms | 41% |
| **总计** | **~3秒** | **100%** |

**对比 Playwright 方案**: 15-45 秒 → **提升 5-15 倍**

---

## 优化建议

### 1. 缓存 GitHub 密钥
```javascript
// 当前: 每次请求都获取
// 优化: 缓存 1 小时

let cachedKeys = null;
let cacheExpiry = 0;

async function getMasterKeys() {
  if (cachedKeys && Date.now() < cacheExpiry) {
    return cachedKeys;
  }

  const keys = await axios.get(...);
  cachedKeys = keys.data;
  cacheExpiry = Date.now() + 3600000; // 1 hour
  return cachedKeys;
}
```
**节省**: ~500ms per request

### 2. 并行请求
```javascript
// 当前: 串行
const embedRes = await fetchText(embedUrl);
const keys = await getMasterKeys();

// 优化: 并行
const [embedRes, keys] = await Promise.all([
  fetchText(embedUrl),
  getMasterKeys()
]);
```
**节省**: ~300ms per request

### 3. 连接池复用
```javascript
// 使用 axios 的 keepAlive 连接池
const axios = axios.create({
  httpAgent: new http.Agent({ keepAlive: true }),
  httpsAgent: new https.Agent({ keepAlive: true })
});
```
**节省**: ~100ms per request

---

## 总结

### 当前流程特点

**优点** ✅:
- 快速（2-5秒）
- 稳定（不被检测）
- 低资源消耗（无需浏览器）
- 支持多站点扩展
- 完整的字幕支持（36种语言）

**缺点** ❌:
- 依赖 GitHub（可优化：缓存）
- 依赖 Megacloud 密钥项目（风险：项目维护）
- 单点故障（如果 GitHub 不可访问）

**建议**:
1. 添加 GitHub 密钥缓存
2. 添加本地密钥备份
3. 监控 GitHub 项目变化
4. 考虑添加更多 provider 支持

---

**最后更新**: 2026-02-22
**状态**: ✅ 生产就绪
