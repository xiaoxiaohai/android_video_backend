# 搜索接口 Android 接入文档

本文档基于当前后端实现：
- `/Users/xiaohai/Desktop/Developer/android_video/backend/src/routes/content.js`
- `GET /api/content`

## 1. 接口信息

- 方法：`GET`
- 路径：`/api/content`
- 线上地址示例：`https://api.nexamedia.app/api/content`
- 鉴权：当前不需要

## 2. 查询参数

- `q`（可选，String）
  - 搜索关键词，按 `title` 模糊匹配（`ILIKE`）
- `type`（可选，Int）
  - `1` = movie
  - `2` = tv
  - 不传 = 全部类型
- `page`（可选，Int）
  - 默认 `1`
  - 必须 `>= 1`
- `size`（可选，Int）
  - 默认 `30`
  - 范围 `1..500`

## 3. 请求示例

```bash
curl -X GET "https://api.nexamedia.app/api/content?q=thrones&type=2&page=1&size=20"
```

## 4. 成功响应

HTTP `200 OK`

```json
{
  "items": [
    {
      "id": "5",
      "movie_id": "1399",
      "type": 2,
      "title": "Game of Thrones",
      "img": "https://...",
      "cover_img": "https://...",
      "channels": {
        "UpCloud": "https://..."
      },
      "release_year": 2011,
      "imdb_score": "8.5",
      "updated_at": "2026-02-18T16:30:07.523Z"
    }
  ],
  "page": 1,
  "size": 20,
  "total": 1,
  "has_more": false
}
```

字段说明：

- `items: ContentItem[]`：搜索结果列表
- `page: Int`：当前页
- `size: Int`：每页数量
- `total: Int`：总命中数
- `has_more: Boolean`：是否还有下一页

说明：
- 后端会自动过滤 `is_active = true` 的内容。
- 返回结果按 `updated_at DESC, id DESC` 排序。
- `raw` 字段不会返回（后端统一剥离）。

## 5. 错误响应

### 5.1 type 非法

HTTP `400`

```json
{ "error": "invalid type, use 1(movie) or 2(tv)" }
```

### 5.2 page 非法

HTTP `400`

```json
{ "error": "invalid page" }
```

### 5.3 size 非法

HTTP `400`

```json
{ "error": "invalid size, range 1..500" }
```

## 6. Android Kotlin 模型

```kotlin
data class SearchResponse(
    val items: List<ContentItem> = emptyList(),
    val page: Int,
    val size: Int,
    val total: Int,
    val has_more: Boolean
)

data class ContentItem(
    val id: String,
    val movie_id: String,
    val type: Int,
    val title: String,
    val img: String? = null,
    val cover_img: String? = null,
    val channels: Map<String, String> = emptyMap(),
    val release_year: Int? = null,
    val imdb_score: String? = null,
    val updated_at: String? = null
)
```

## 7. Retrofit 调用示例

```kotlin
interface ContentApi {
    @GET("api/content")
    suspend fun searchContent(
        @Query("q") q: String? = null,
        @Query("type") type: Int? = null, // 1 movie, 2 tv
        @Query("page") page: Int = 1,
        @Query("size") size: Int = 30
    ): SearchResponse
}
```

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.nexamedia.app/")
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

val api = retrofit.create(ContentApi::class.java)
val result = api.searchContent(q = "thrones", type = 2, page = 1, size = 20)
```

## 8. 前端对接建议

- 搜索框输入建议做防抖（300~500ms）。
- 分页加载时使用 `has_more` 控制是否继续请求下一页。
- 若结果为空，接口仍返回 `200`，此时 `items=[]`、`total=0`。
