# 频道页接口接入文档（Android）

## 1. 接口信息

- Method: `GET`
- URL: `/api/channel/:name/items`
- Base URL: `https://api.nexamedia.app`
- 用途: 按频道名分页获取频道片源列表（电影/剧集通用）

---

## 2. 请求参数

### 2.1 Path 参数

1. `name` `string` 必填  
   频道名，例如：`netflix`、`hbo`、`prime`、`disney`、`hulu`、`peacock`、`paramount`、`amc`

### 2.2 Query 参数

1. `page` `number` 可选，默认 `1`
2. `size` `number` 可选，默认 `30`，范围 `1..500`

---

## 3. 请求示例

```bash
curl "https://api.nexamedia.app/api/channel/netflix/items?page=1&size=30"
```

---

## 4. 成功响应（200）

```json
{
  "channel": {
    "name": "netflix",
    "img": "https://xxx/channel/netflix.png"
  },
  "items": [
    {
      "id": "13860",
      "movie_id": "107830",
      "type": 2,
      "title": "Frieren: Beyond Journey's End",
      "img": "https://f.woowoowoowoo.net/resize/300x450/...",
      "cover_img": "https://image.tmdb.org/t/p/w780/...",
      "imdb_score": "8.7",
      "release_year": 2023,
      "genre": "Animation,Action & Adventure,Drama,Sci-Fi & Fantasy",
      "country": "Japan",
      "channels": {
        "UpCloud": "https://..."
      },
      "updated_at": "2026-02-18T15:46:26.132Z"
    }
  ],
  "page": 1,
  "size": 30,
  "total": 3065,
  "has_more": true
}
```

---

## 5. 字段说明

1. `channel.name`：频道名
2. `channel.img`：频道图标
3. `items`：内容列表（电影和剧集混合）
4. `items[].type`：`1=movie`，`2=tv`
5. `items[].movie_id`：上游内容 ID（用于剧集接口等）
6. `page/size/total/has_more`：分页元数据

---

## 6. 错误响应

### 6.1 参数错误（400）

```json
{ "error": "invalid page" }
```

或

```json
{ "error": "invalid size, range 1..500" }
```

### 6.2 频道不存在（404）

```json
{ "error": "channel not found" }
```

---

## 7. 前端接入建议

1. 频道名统一小写并做 URL 编码（`encodeURIComponent(name)`）
2. 仅当 `has_more=true` 时继续翻页
3. 列表可按 `type` 区分电影/剧集展示样式
4. 图片 `img` 已统一为 `300x450`

---

## 8. 频道数据导入接口（后端/管理使用）

> 该部分给后端管理/采集程序使用，前端 App 不需要调用。

- Method: `POST`
- URL: `/api/import/channel/:name/items`

请求体示例：

```json
{
  "mode": "append",
  "img": "https://cdn.example.com/netflix.png",
  "items": [
    { "id": 1001, "movie_id": "1001", "type": 1, "title": "Demo Movie" }
  ]
}
```

说明：

1. `mode=append`：增量追加/更新该频道内容关系
2. `mode=replace`：先清空该频道现有关系，再导入本次 `items`
3. 当 `items` 中的内容在 `content_item` 不存在时，后端会先入库内容，再写频道关系

返回示例：

```json
{
  "ok": true,
  "channel": { "id": 1, "name": "netflix", "img": "https://..." },
  "imported": 1,
  "mode": "append"
}
```
