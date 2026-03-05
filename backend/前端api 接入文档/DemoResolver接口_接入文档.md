# Demo Resolver 接口接入文档（v2.0）

接口对应代码：`/Users/xiaohai/Desktop/Developer/android_video/backend/src/routes/demo.js` + `/Users/xiaohai/Desktop/Developer/android_video/backend/src/services/demoResolver.js`

## 1. 接口信息

- 方法：`POST`
- 路径：`/api/demo/resolve-m3u8`
- 线上地址：`https://api.nexamedia.app/api/demo/resolve-m3u8`
- Content-Type：`application/json`
- 鉴权：当前不需要

## 2. 请求参数

```json
{
  "watchUrl": "https://f2moviesz.uk/watch-movie/watch-on-a-string-movies-free-hd-142161.12991693",
  "referer": "https://f2moviesz.uk/",
  "origin": "https://f2moviesz.uk",
  "cookie": "cf_clearance=...; session=...",
  "userAgent": "Mozilla/5.0 ...",
  "timeoutMs": 15000,
  "compact": true
}
```

字段说明：

- `watchUrl`：`string`，必填，必须是合法 URL。
- `referer`：`string`，可选，请求上游站点时附带 Referer。
- `origin`：`string`，可选，请求上游站点时附带 Origin。
- `cookie`：`string`，可选，请求上游站点时附带 Cookie（部分站点反爬需要）。
- `userAgent`：`string`，可选，自定义 UA。
- `timeoutMs`：`number`，可选，范围 `5000 ~ 60000`。当前仅做参数校验，服务逻辑暂未实际使用该值。
- `compact`：`boolean`，可选，默认 `true`。

`compact` 规则：

- `compact=true`（默认）：返回最小可播数据，适合前端直接播放。
- `compact=false`：返回诊断字段（`watchUrl` / `activeWatchUrl` / `hostReports`），适合排障。

## 3. 成功响应

### 3.1 默认精简响应（`compact=true`）

HTTP `200`

```json
{
  "ok": true,
  "files": [
    {
      "file": "https://xxx/playlist.m3u8",
      "type": "hls",
      "headers": {
        "Referer": "https://videostr.net/"
      }
    }
  ],
  "captions": [
    {
      "file": "https://xxx/sub.vtt",
      "kind": "captions",
      "label": "English",
      "language": "en",
      "source": "megacloud_decrypt"
    }
  ]
}
```

### 3.2 详细响应（`compact=false`）

HTTP `200`

```json
{
  "ok": true,
  "watchUrl": "https://www6.f2movies.to/watch-movie/bhaijaan-elo-re-1.5373679",
  "activeWatchUrl": "https://f2movies.la/watch-movie/bhaijaan-elo-re-1.5373679",
  "files": [
    {
      "file": "https://xxx/playlist.m3u8",
      "type": "hls",
      "headers": {
        "Referer": "https://videostr.net/"
      }
    }
  ],
  "captions": [],
  "hostReports": [
    {
      "watchUrl": "https://f2movies.la/watch-movie/bhaijaan-elo-re-1.5373679",
      "ok": true,
      "files": 1,
      "captions": 0,
      "reason": "ok",
      "preview": "<!DOCTYPE html>..."
    }
  ]
}
```

响应字段说明：

- `ok: boolean`：成功标记。
- `files: Array<{file,type,headers}>`：可播放文件列表（已去重）。
- `captions: Array<{file,kind,label,language,source}>`：字幕/轨道列表（已去重）。
- `watchUrl: string`：请求入参 URL（仅 `compact=false` 返回）。
- `activeWatchUrl: string`：最终命中的站点 URL（仅 `compact=false` 返回）。
- `hostReports: Array<object>`：候选 host 探测结果（仅 `compact=false` 返回）。

> v2.0 已移除 `primary` 字段。默认播放源请使用 `files[0]`。

## 4. Debug 输出（可选）

默认不返回 `debug`。若后端环境变量设置：

- `RESOLVER_INCLUDE_DEBUG=true`

则响应会附带：

- `debug: Array<object>`，包含各解析步骤状态（抓取页面、请求 episode sources、provider 解密结果等）。

## 5. 失败响应

### 5.1 参数错误

HTTP `400`

```json
{
  "error": {
    "formErrors": [],
    "fieldErrors": {
      "watchUrl": ["Invalid url"]
    }
  }
}
```

### 5.2 上游解析失败/异常

HTTP `502`

```json
{
  "ok": false,
  "error": "<具体错误信息>"
}
```

## 6. cURL 调用示例

### 6.1 默认精简模式

```bash
curl -X POST "https://api.nexamedia.app/api/demo/resolve-m3u8" \
  -H "Content-Type: application/json" \
  -d '{
    "watchUrl": "https://f2moviesz.uk/watch-movie/watch-on-a-string-movies-free-hd-142161.12991693"
  }'
```

### 6.2 详细模式（排障）

```bash
curl -X POST "https://api.nexamedia.app/api/demo/resolve-m3u8" \
  -H "Content-Type: application/json" \
  -d '{
    "watchUrl": "https://www6.f2movies.to/watch-movie/bhaijaan-elo-re-1.5373679",
    "compact": false
  }'
```

### 6.3 带 Cookie/UA 的示例

```bash
curl -X POST "https://api.nexamedia.app/api/demo/resolve-m3u8" \
  -H "Content-Type: application/json" \
  -d '{
    "watchUrl": "https://flixhq.to/watch-movie/watch-re-election-144233.13074638",
    "referer": "https://flixhq.to/",
    "origin": "https://flixhq.to",
    "cookie": "cf_clearance=...",
    "userAgent": "Mozilla/5.0 ...",
    "compact": false
  }'
```

## 7. 运行策略（v2.0）

- 支持站点：`f2movies/f2moviesz/flixhq`（同一解析链路）。
- 多 host 策略：支持候选 host 解析，命中可播源后返回。
- 详细诊断：通过 `compact=false` + `RESOLVER_INCLUDE_DEBUG=true` 获取完整排障信息。

相关环境变量（可选）：

- `RESOLVER_INCLUDE_DEBUG`：是否返回 `debug`。
- `RESOLVER_PARALLEL_HOSTS`：是否启用多 host 并发。
- `RESOLVER_RANDOMIZE_HOSTS`：是否打散候选 host 顺序。
- `RESOLVER_MAX_RETRIES`：每个 host 的重试次数。

## 8. 前端接入建议

- 生产播放流程优先使用默认精简响应（`compact=true`）。
- 播放器请求 m3u8/ts 时必须透传每个 `file` 对应的 `headers`。
- 默认播放源使用 `files[0]`；播放失败再用 `files[1..n]` 依次回退。
- 仅在排障页面/日志上报中使用 `compact=false`，避免传输冗余数据。
