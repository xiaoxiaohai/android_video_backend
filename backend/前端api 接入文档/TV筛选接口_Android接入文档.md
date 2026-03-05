# TV 筛选接口 Android 接入文档

本文档基于当前后端实现（`backend/src/routes/content.js` 的 `GET /tv/filters`）整理。

## 1. 接口信息

- 方法: `GET`
- 路径: `/api/tv/filters`
- 线上地址: `https://api.nexamedia.app/api/tv/filters`
- 鉴权: 当前不需要

示例：

```bash
curl -X GET "https://api.nexamedia.app/api/tv/filters"
```

## 2. 返回结构

成功返回 `200 OK`：

```json
{
  "genres": [{ "id": "drama", "label": "Drama" }],
  "countries": [{ "id": "us", "label": "US" }],
  "years": [2026, 2025, 2024],
  "ratings": [
    { "id": "gte_9_0", "label": "9.0+", "minScore": 9.0 },
    { "id": "gte_8_0", "label": "8.0+", "minScore": 8.0 },
    { "id": "gte_7_0", "label": "7.0+", "minScore": 7.0 },
    { "id": "gte_6_0", "label": "6.0+", "minScore": 6.0 }
  ],
  "languages": [{ "id": "english", "label": "English" }]
}
```

## 3. 字段说明

### 3.1 顶层字段

- `genres: FacetItem[]` 题材
- `countries: FacetItem[]` 国家/地区
- `years: Int[]` 年份（降序）
- `ratings: RatingFacetItem[]` 评分分档
- `languages: FacetItem[]` 语言

### 3.2 `FacetItem`

- `id: String` 稳定标识（由 label 归一化生成，前端建议用于筛选值）
- `label: String` 展示文案

### 3.3 `RatingFacetItem`

- `id: String` 分档标识
- `label: String` 展示文案
- `minScore: Double` 最低分阈值（例如 `8.0`）

## 4. 数据来源与规则

- 只统计 TV 数据：`content_item` 表中 `type = 2 AND is_active = true`
- `genres`: 来自 `content_item.genre`
- `countries`: 来自 `content_item.country`
- `years`: 来自 `content_item.release_year`
- `languages`: 优先 `content_item.genre_lang`，并兜底读取 `raw` 中字段：
  - `language`
  - `lang`
  - `original_language`
  - `audio_language`
  - `audio_languages`
  - `language_name`
  - `languages`
- 字符串分割符支持：`, | ; /`
- 返回前会做去重和排序（`years` 降序，`FacetItem` 按 `label` 升序）

## 5. 缓存行为

该接口带服务端内存缓存：

- 默认缓存时长: `5 分钟`
- 环境变量: `TV_FILTERS_CACHE_TTL_MS`
- 说明: 缓存仅在当前 Node 进程内生效，进程重启会清空

## 6. Android Kotlin 数据模型

```kotlin
data class TvFiltersResponse(
    val genres: List<FacetItem> = emptyList(),
    val countries: List<FacetItem> = emptyList(),
    val years: List<Int> = emptyList(),
    val ratings: List<RatingFacetItem> = emptyList(),
    val languages: List<FacetItem> = emptyList()
)

data class FacetItem(
    val id: String,
    val label: String
)

data class RatingFacetItem(
    val id: String,
    val label: String,
    val minScore: Double
)
```

## 7. Retrofit 调用示例

```kotlin
interface TvApi {
    @GET("api/tv/filters")
    suspend fun getFilters(): TvFiltersResponse
}
```

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.nexamedia.app/")
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

val api = retrofit.create(TvApi::class.java)
val filters = api.getFilters()
```

## 8. 前端使用建议

- 前端缓存一份（例如内存 + 本地磁盘），减少重复请求。
- 筛选提交时优先传 `id`，显示层用 `label`。
- `ratings.minScore` 可直接映射到筛选参数（例如 `imdb_score >= minScore`）。
