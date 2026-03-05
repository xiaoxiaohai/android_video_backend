# Home 接口 Android 接入文档

本文档基于当前后端实现（`backend/src/routes/home.js`）整理，供 Android 前端直接对接。

## 1. 接口地址

- 方法: `GET`
- 路径: `/api/home`
- 线上域名: `https://api.nexamedia.app/api/home`
- 请求头: 无强制要求（普通 `application/json` 场景即可）
- 鉴权: 当前不需要

示例：

```bash
curl -X GET "https://api.nexamedia.app/api/home"
```

## 2. 返回结构总览

成功返回 `200 OK`，JSON 顶层结构：

```json
{
  "banner": [
    {
      "sort_order": 1,
      "id": 1001,
      "movie_id": "66732",
      "type": 2,
      "title": "Stranger Things",
      "img": "https://...",
      "cover_img": "https://...",
      "tag": "Popular",
      "channels": {
        "UpCloud": "https://..."
      },
      "imdb_score": "8.7",
      "desc": "...",
      "release": "2016",
      "release_year": 2016,
      "genre": "Drama,Sci-Fi",
      "genre_lang": "Drama, Sci-Fi",
      "cast": "...",
      "duration": "50m",
      "country": "US",
      "production": "Netflix",
      "play_type": "vod",
      "url": "https://...",
      "tmdb_id": 12345,
      "md_id": 888,
      "last_season": 4,
      "last_episode": 9,
      "created_at": "2026-02-20T10:00:00.000Z",
      "updated_at": "2026-02-21T10:00:00.000Z",
      "is_active": true
    }
  ],
  "channels": [
    {
      "name": "UpCloud",
      "img": "https://..."
    }
  ],
  "sections": [
    {
      "name": "Trending",
      "has_all": true,
      "tags": ["hot", "new"],
      "ui_type": 1,
      "items": [
        {
          "id": 1001,
          "movie_id": "66732",
          "type": 2,
          "title": "Stranger Things",
          "img": "https://...",
          "cover_img": "https://...",
          "tag": "Popular",
          "channels": {
            "UpCloud": "https://..."
          },
          "imdb_score": "8.7",
          "desc": "...",
          "release": "2016",
          "release_year": 2016,
          "genre": "Drama,Sci-Fi",
          "genre_lang": "Drama, Sci-Fi",
          "cast": "...",
          "duration": "50m",
          "country": "US",
          "production": "Netflix",
          "play_type": "vod",
          "url": "https://...",
          "tmdb_id": 12345,
          "md_id": 888,
          "last_season": 4,
          "last_episode": 9,
          "created_at": "2026-02-20T10:00:00.000Z",
          "updated_at": "2026-02-21T10:00:00.000Z",
          "is_active": true
        }
      ]
    }
  ]
}
```

## 3. 字段说明

### 3.1 顶层字段

- `banner`: 首页 Banner 列表（按 `home_banner_item.sort_order` 升序）
- `channels`: 首页频道列表（按 `provider_channel.sort_order` 升序）
- `sections`: 首页分组列表（按 `home_category_section.sort_order` 升序）

### 3.2 `channels[]` 字段

- `name: String` 频道名
- `img: String` 频道图标 URL

### 3.3 `sections[]` 字段

- `name: String` 分组名
- `has_all: Boolean` 是否显示“查看全部”
- `tags: List<String>` 分组标签（后端保证至少是数组）
- `ui_type: Int` 前端 UI 类型
- `items: List<ContentItem>` 分组内内容列表

### 3.4 `banner[]` 与 `sections[].items[]` 的内容对象（`ContentItem`）

内容对象来自 `content_item` 表，常用字段如下：

- `id: Long` 内容 ID
- `movie_id: String` 业务侧影片 ID
- `type: Int` 1=movie, 2=tv
- `title: String`
- `img: String?`
- `cover_img: String?`
- `tag: String?`
- `channels: Map<String, String>` 播放源映射
- `imdb_score: String?`
- `desc: String?`
- `release: String?`
- `release_year: Int?`
- `genre: String?`
- `genre_lang: String?`
- `cast: String?`
- `duration: String?`
- `country: String?`
- `production: String?`
- `play_type: String?`
- `url: String?`
- `tmdb_id: Long?`
- `md_id: Long?`
- `last_season: Int?`
- `last_episode: Int?`
- `is_active: Boolean`
- `created_at: String(ISO8601)`
- `updated_at: String(ISO8601)`

Banner 额外字段：

- `sort_order: Int` Banner 排序值

## 4. Android Kotlin 数据模型示例

```kotlin
data class HomeResponse(
    val banner: List<HomeBannerItem> = emptyList(),
    val channels: List<ProviderChannel> = emptyList(),
    val sections: List<HomeSection> = emptyList()
)

data class ProviderChannel(
    val name: String,
    val img: String
)

data class HomeSection(
    val name: String,
    val has_all: Boolean,
    val tags: List<String> = emptyList(),
    val ui_type: Int,
    val items: List<ContentItem> = emptyList()
)

data class HomeBannerItem(
    val sort_order: Int? = null,
    val id: Long,
    val movie_id: String,
    val type: Int,
    val title: String,
    val img: String? = null,
    val cover_img: String? = null,
    val tag: String? = null,
    val channels: Map<String, String> = emptyMap(),
    val imdb_score: String? = null,
    val desc: String? = null,
    val release: String? = null,
    val release_year: Int? = null,
    val genre: String? = null,
    val genre_lang: String? = null,
    val cast: String? = null,
    val duration: String? = null,
    val country: String? = null,
    val production: String? = null,
    val play_type: String? = null,
    val url: String? = null,
    val tmdb_id: Long? = null,
    val md_id: Long? = null,
    val last_season: Int? = null,
    val last_episode: Int? = null,
    val is_active: Boolean = true,
    val created_at: String? = null,
    val updated_at: String? = null
)

typealias ContentItem = HomeBannerItem
```

## 5. Retrofit 调用示例

```kotlin
interface HomeApi {
    @GET("api/home")
    suspend fun getHome(): HomeResponse
}
```

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.nexamedia.app/")
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

val api = retrofit.create(HomeApi::class.java)
val home = api.getHome()
```

## 6. 前端对接注意事项

- 当前接口没有分页，`banner/items` 数量由后台配置决定。
- 所有排序都已在服务端处理，前端按返回顺序直接展示即可。
- 字段 `raw` 已被后端统一移除，不会在任何层级返回。
- 推荐将 `ContentItem` 中大部分字段设为可空，增强兼容性。
- 如果某个 section 下没有内容，`items` 返回空数组，不是 `null`。
