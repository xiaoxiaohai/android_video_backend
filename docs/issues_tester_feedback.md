# 测试反馈 Issue 列表

> 更新时间：2026-02-28

---

## 播放器

| # | 模块 | 问题描述 | 预期行为 | 备注 |
|---|------|----------|----------|------|
| 1 | 竖屏播放 | 页面底部播放条多余 | 适用于二次进入时展示最后一次播放的内容 | ✅ 已移除 `MiniPlayerBar`（`VideoDetailScreen.kt:881`） |
| 2 | 竖屏播放 | 播放失败时无错误提示；二次获取成功 | 显示"获取信息失败，请重试"；自动重试一次 | 复现：For Her Sins（电视剧） |
| 3 | 竖屏播放 | 播放中会锁屏，但声音继续 | 播放中不锁屏 | ✅ ExoPlayer 加 `setWakeMode(WAKE_MODE_SCREEN)`，AndroidManifest 加 `WAKE_LOCK` 权限 |
| 4 | 全屏播放 | 无下一集按钮 | 播放器内增加下一集按钮 | ✅ `FullscreenPlayer` 底部控制栏加 `SkipNext` 按钮；仅 TV 类型且有下一集时显示（支持跨季）；点击调用 `VideoDetailViewModel.selectNextEpisode()` |
| 5 | 播放时长文案 | 显示 `127min` | 复数形式 `127mins` | ✅ `MediaItem.durationText` 中加 `normalizeDuration()`：`Nmin`（N>1）→ `Nmins` |
| 13 | 播放时长文案 | 部分内容显示 `N/Amin` 等异常格式 | 显示正确时长或不显示 | ⚠️ 数据问题，前端无法修复 — 时长字段来自上游片源，存在脏数据（`N/A`、`0min` 等），上游数据结构固定难以干预。**建议方案：后端入库时过滤/清洗该字段，无效值存为 null，前端已有空值处理（显示 `-`）** |

---

## 首页 / 导航

| # | 模块 | 问题描述 | 预期行为 | 备注 |
|---|------|----------|----------|------|
| 6 | 首页标签导航 | 从顶部分类标签进入播放后返回，回到 All 标签 | 返回到进入前的标签 | ✅ `TrendingViewModel.loadInitialPage()` 加 `pageCache.isNotEmpty()` 短路：ViewModel 缓存有数据时跳过 reset，保留当前 `selectedFilterId` |
| 7 | 首页右上角 | 有通知、头像 icon | 暂时去掉 | ✅ 移除 `TopBar` 中的 Notification bell 和 Avatar 组件 |

---

## 筛选 / 搜索

| # | 模块 | 问题描述 | 预期行为 | 备注 |
|---|------|----------|----------|------|
| 8 | 国家筛选 | 国家过多，按字母升序，美国排最后 | `All \| United States \| United Kingdom \| Canada \| Japan \| South Korea \| More` | ✅ 后端新增 `toCountryFacetList()`：US/UK/Canada/Japan/South Korea 固定前5，剩余按片源数量降序 |
| 9 | 搜索结果排序 | 排序规则不符合预期 | 按时间降序，时间相同按评分降序 | ✅ 后端 `content.js` SQL 改为 `ORDER BY updated_at DESC, imdb_score::numeric DESC NULLS LAST, id DESC` |
| 10 | Search History | 搜索历史高度不限制 | 最高展示 3 行，超出显示 More | ✅ `FlowRow` 加 `maxLines=3` + `FlowRowOverflow.expandOrCollapseIndicator`，超出部分显示 `More (N)` chip，点击展开全部（最多 20 条） |
| 11 | Trending Searches | 当前展示样式不佳 | 参考竞品 list 样式重做 | ✅ 后端加 `GET /api/trending-searches` 返回 `hotWords` + `popularWords`；Android 改为竖向列表：左侧排名数字（1红2橙3黄其余灰），中间关键词；HOT SEARCHES 和 POPULAR NOW 两列横向并排（各占屏宽2/3，可横向滚动） |

---

## Online 模块

| # | 模块 | 问题描述 | 预期行为 | 备注 |
|---|------|----------|----------|------|
| 12 | 播放记录 | 电影无播放记录 | 电影应有播放记录 | ✅ 新建 `OnlineHistoryRepository`，播放开始时记录；History Online tab 展示海报列表，点击跳回详情页 |
