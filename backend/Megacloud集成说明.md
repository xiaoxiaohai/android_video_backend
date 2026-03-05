# Megacloud 视频提取集成说明

## ✅ 已完成

成功将 Megacloud 解密提取器集成到 `demoResolver.js` 中，可以成功提取 m3u8 视频链接和字幕。

---

## 📁 相关文件

### 核心文件

1. **`src/utils/megacloud-decrypt.js`**
   - Megacloud 解密核心工具
   - 改编自：https://github.com/ghoshRitesh12/aniwatch
   - 主要功能：
     - 从 GitHub 获取解密密钥
     - 从 embed 页面提取客户端密钥（48字符）
     - 调用 getSources API
     - AES-256-CBC 解密加密的视频源

2. **`src/services/demoResolver.js`**
   - 主解析器（已集成 Megacloud）
   - `resolveViaVideostrProvider` 函数使用 Megacloud 提取器
   - 成功时返回 m3u8 + 字幕，失败时回退到 Playwright

### 测试文件

1. **`test_megacloud_custom.mjs`** - 测试独立 Megacloud 提取器
2. **`test_direct_videostr.mjs`** - 测试直接 videostr 提取（推荐）
3. **`test_integrated_resolver.mjs`** - 测试完整的 resolver 集成

---

## 🧪 测试方法

### 方法 1: 测试独立 Megacloud 提取器（最快）

```bash
node test_megacloud_custom.mjs
```

**预期结果：**
- ✅ 成功提取 1 个 m3u8 URL
- ✅ 成功提取 36 个字幕轨道

### 方法 2: 测试直接 videostr 提取

```bash
node test_direct_videostr.mjs
```

**预期结果：**
- ✅ 成功提取 1 个 m3u8 URL
- ✅ 成功提取 36 个字幕轨道

### 方法 3: 通过 API 测试（完整流程）

```bash
# 启动服务器
npm run dev

# 在另一个终端测试
curl -X POST http://localhost:8080/api/demo/resolve \
  -H "Content-Type: application/json" \
  -d '{
    "watchUrl": "https://f2movies.la/watch-tv/watch-one-piece-39508.XXXXX",
    "referer": "https://f2movies.la/"
  }'
```

**注意：** 需要一个有效的 f2movies.la 观看页面 URL。

---

## 🔧 工作原理

### Megacloud 提取流程

```
1. 接收 videostr.net embed URL
   例如: https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=

2. 从 embed URL 提取 source ID
   提取: uVcR6PnxmZYg

3. 从 GitHub 获取 master 解密密钥
   来源: https://github.com/yogesh-hacker/MegacloudKeys

4. 获取 embed 页面 HTML
   提取 48 字符的客户端密钥

5. 调用 getSources API
   https://videostr.net/embed-1/v3/e-1/getSources?id=xxx&_k=yyy

6. 解密返回的加密 sources
   使用 AES-256-CBC + master key

7. 返回 m3u8 URL 和字幕
```

---

## 📊 成功案例

### 测试 URL
```
https://videostr.net/embed-1/v3/e-1/uVcR6PnxmZYg?z=
```

### 提取结果

**M3U8 视频源：**
```
https://nightbreeze17.site/file2/lcn1Rb3Hmn~uUHGon07DBz4Z4BOuwXhZJDpaDzQeJuu9rQ9F5HU1VK7ROONoosZy8wprZyMhsWp6icCnfcn1yprO9CwkFMMiRW3oHW4qZ4GAJcJq81t5h~i~kWpe2ytE14IoLgGuK1H5xK7VEaZtRhwfcsxJ69cOmIZFWji91NA=/cGxheWxpc3QubTN1OA==.m3u8
```

**字幕语言：** 36 种
- Arabic, Chinese (Simplified/Traditional), Croatian, Czech, Danish, Dutch
- English, English (dub), English (forced)
- Finnish, French, German, Greek, Hebrew, Hindi, Hungarian
- Indonesian, Italian, Japanese, Korean, Malay, Norwegian
- Polish, Portuguese, Romanian, Russian, Spanish, Swedish
- Thai, Turkish, Ukrainian, Vietnamese

---

## 🛠️ 配置选项

### 环境变量

```bash
# 禁用 Playwright 回退（更快，仅使用 Megacloud）
RESOLVER_PLAYWRIGHT_ENABLED=false

# 启用调试输出
RESOLVER_INCLUDE_DEBUG=true
```

---

## ⚠️ 注意事项

### 依赖项

确保已安装：
```bash
npm install axios  # Megacloud 提取器需要
```

### GitHub 密钥依赖

- Megacloud 提取器依赖 GitHub 上的解密密钥
- 来源：https://github.com/yogesh-hacker/MegacloudKeys
- 如果 GitHub 不可访问，提取会失败
- 考虑未来添加密钥缓存机制

### Playwright 回退

- 如果 Megacloud 提取失败，会回退到 Playwright
- Playwright 通常会被 Megacloud 检测到（已知问题）
- 建议禁用 Playwright 以避免不必要的延迟

---

## 🚀 使用建议

### 开发环境

```bash
# 禁用 Playwright，只使用 Megacloud（更快）
RESOLVER_PLAYWRIGHT_ENABLED=false npm run dev
```

### 生产环境

```bash
# 启用调试日志
RESOLVER_INCLUDE_DEBUG=true pm2 start src/index.js --name nexa-backend
```

---

## 📝 API 响应格式

```json
{
  "ok": true,
  "watchUrl": "https://f2movies.la/watch-tv/...",
  "files": [
    {
      "file": "https://nightbreeze17.site/.../playlist.m3u8",
      "type": "hls",
      "headers": {
        "Referer": "https://videostr.net/"
      }
    }
  ],
  "captions": [
    {
      "file": "https://cc.2cdns.com/...English.vtt",
      "kind": "captions",
      "label": "English - English",
      "language": "",
      "source": "megacloud_decrypt"
    }
  ],
  "primary": {
    "file": "https://nightbreeze17.site/.../playlist.m3u8",
    "type": "hls",
    "headers": {
      "Referer": "https://videostr.net/"
    }
  },
  "debug": [
    {
      "step": "megacloud_extraction_success",
      "sourcesCount": 1,
      "tracksCount": 36
    }
  ]
}
```

---

## 🔍 调试指南

### 如果提取失败

1. **检查 GitHub 密钥是否可访问**
   ```bash
   curl https://raw.githubusercontent.com/yogesh-hacker/MegacloudKeys/refs/heads/main/keys.json
   ```

2. **检查 embed URL 格式**
   - 必须是：`https://videostr.net/embed-1/v3/e-1/xxxxx?z=`
   - xxxxx 是 source ID

3. **查看调试日志**
   ```bash
   RESOLVER_INCLUDE_DEBUG=true node test_direct_videostr.mjs
   ```

4. **测试独立提取器**
   ```bash
   node test_megacloud_custom.mjs
   ```

---

## ✨ 优势

相比之前的方案：

| 特性 | 旧方案（Playwright） | 新方案（Megacloud） |
|------|---------------------|-------------------|
| **速度** | 慢（15-45秒） | 快（2-5秒） |
| **成功率** | 低（被检测） | 高（API调用） |
| **资源消耗** | 高（浏览器） | 低（HTTP请求） |
| **稳定性** | 差（反自动化） | 好（直接解密） |
| **维护性** | 复杂 | 简单 |

---

## 📚 参考资料

- **aniwatch 项目**: https://github.com/ghoshRitesh12/aniwatch
- **解密密钥仓库**: https://github.com/yogesh-hacker/MegacloudKeys
- **技术博客**: OpenSSL 兼容的 AES-256-CBC 解密

---

**最后更新**: 2026-02-22
**状态**: ✅ 已集成并测试通过
