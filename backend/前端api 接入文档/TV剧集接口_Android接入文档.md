# TV 剧集接口 Android 接入文档

本文档基于当前后端实现：
- `/Users/xiaohai/Desktop/Developer/android_video/backend/src/routes/content.js`
- `GET /api/tv/:movieId/episodes`

## 1. 接口信息

- 方法：`GET`
- 路径：`/api/tv/:movieId/episodes`
- 线上地址示例：`https://api.nexamedia.app/api/tv/66732/episodes`
- 鉴权：当前不需要

## 2. 路径参数

- `movieId`（必填，String）
  - 这是内容的业务 ID（对应 `content_item.movie_id` / `tv_episode_item.movie_id`）
  - 示例：`66732`、`t990001`

## 3. 返回结构

成功返回 `200 OK`。

返回值是一个“对象（Map）”，key 是季名，value 是该季的剧集数组：

```json
{
  "Season 1": [
    {
      "id": 991001,
      "movie_id": "66732",
      "season": "Season 1",
      "episode": "Episode 1",
      "channels": {
        "UpCloud": "https://...m3u8"
      },
      "position": 1,
      "season_num": 1,
      "episode_num": 1,
      "is_active": true,
      "created_at": "2026-02-20T10:00:00.000Z",
      "updated_at": "2026-02-21T10:00:00.000Z"
    }
  ],
  "Season 2": [
    {
      "id": 992001,
      "movie_id": "66732",
      "season": "Season 2",
      "episode": "Episode 1",
      "channels": {
        "UpCloud": "https://...m3u8"
      },
      "position": 1,
      "season_num": 2,
      "episode_num": 1,
      "is_active": true,
      "created_at": "2026-02-22T10:00:00.000Z",
      "updated_at": "2026-02-22T10:00:00.000Z"
    }
  ]
}
```

## 4. 排序与分组规则

后端 SQL 排序：

- `season_num NULLS LAST`
- `episode_num NULLS LAST`
- `position NULLS LAST`

分组 key 规则：

- 优先用 `season` 字段（如 `"Season 1"`）
- 如果 `season` 为空：使用 `Season ${season_num}`

## 5. 字段说明（Episode Item）

- `id: Long` 剧集 ID
- `movie_id: String` 所属剧的 movieId
- `season: String` 季名称
- `episode: String` 集名称
- `channels: Map<String, String>` 播放源映射
- `position: Int?` 位置排序值
- `season_num: Int?` 季号
- `episode_num: Int?` 集号
- `is_active: Boolean`
- `created_at: String(ISO8601)`
- `updated_at: String(ISO8601)`

说明：
- `raw` 字段不会返回（后端统一移除）。

## 6. 空数据与错误行为

- 当 `movieId` 没有任何剧集数据时：返回空对象 `{}`（不是 404）
- 接口本身不校验 `movieId` 格式，只按字符串查询

## 7. cURL 示例

```bash
curl -X GET "https://api.nexamedia.app/api/tv/66732/episodes"
```

## 8. Android Kotlin 模型示例

```kotlin
data class TvEpisodeItem(
    val id: Long,
    val movie_id: String,
    val season: String,
    val episode: String,
    val channels: Map<String, String> = emptyMap(),
    val position: Int? = null,
    val season_num: Int? = null,
    val episode_num: Int? = null,
    val is_active: Boolean = true,
    val created_at: String? = null,
    val updated_at: String? = null
)

// 返回顶层是动态 key 的对象：{ "Season 1": [...], "Season 2": [...] }
typealias TvEpisodesResponse = Map<String, List<TvEpisodeItem>>
```

## 9. Retrofit 调用示例

```kotlin
interface TvApi {
    @GET("api/tv/{movieId}/episodes")
    suspend fun getEpisodes(
        @Path("movieId") movieId: String
    ): TvEpisodesResponse
}
```

```kotlin
val retrofit = Retrofit.Builder()
    .baseUrl("https://api.nexamedia.app/")
    .addConverterFactory(MoshiConverterFactory.create())
    .build()

val api = retrofit.create(TvApi::class.java)
val groupedEpisodes = api.getEpisodes("66732")
```

## 10. 对接建议

- UI 直接按返回对象遍历分组展示即可。
- 每组内已是后端排序结果，前端无需再次排序（除非有自定义规则）。
- 播放时优先读取 `channels` 中你约定的主线路键（例如 `UpCloud`）。
