# App 升级配置接口文档

## 接口概览

| 字段 | 值 |
|------|----|
| 方法 | `GET` |
| 路径 | `/api/app/config` |
| 认证 | 无 |
| 缓存 | 建议客户端每次启动请求，无需服务端缓存 |

---

## 响应格式

```json
{
  "android": {
    "latestVersionCode": 10200000,
    "latestVersionName": "1.2.0",
    "minRequiredVersionCode": 10100000,
    "updateUrl": "https://play.google.com/store/apps/details?id=com.nexaplayer.app",
    "forceUpdateMessage": "This version is no longer supported. Please update to continue.",
    "optionalUpdateMessage": "A new version is available with improvements.",
    "releaseNotes": [
      "Improved video playback performance",
      "Bug fixes and stability improvements"
    ]
  }
}
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `android.latestVersionCode` | `number` | 是 | 当前最新版本号（整数）。为 `0` 时客户端忽略升级检测 |
| `android.latestVersionName` | `string` | 是 | 最新版本名，仅用于展示（如 `"1.2.0"`） |
| `android.minRequiredVersionCode` | `number` | 是 | 最低可用版本号。低于此值触发**强制升级**，为 `0` 时禁用强制升级 |
| `android.updateUrl` | `string` | 是 | 升级跳转链接，应填 Google Play 应用页面地址 |
| `android.forceUpdateMessage` | `string \| null` | 否 | 强制升级弹窗正文文案，为 `null` 时用客户端默认文案 |
| `android.optionalUpdateMessage` | `string \| null` | 否 | 可选升级弹窗正文文案，为 `null` 时用客户端默认文案 |
| `android.releaseNotes` | `string[]` | 否 | 更新日志列表，空数组或 `null` 时不展示 |

---

## 升级判断逻辑

```
当前版本号 < minRequiredVersionCode  →  强制升级（弹窗无法关闭）
当前版本号 < latestVersionCode       →  可选升级（弹窗可选"稍后"）
其余情况                             →  无需升级（不弹窗）
```

> **注意**：`minRequiredVersionCode` 优先级高于 `latestVersionCode`。
> 强制升级弹窗点击返回键、点击背景均无效，用户只能点击"Update Now"。

---

## 服务端配置方式（环境变量）

在服务器 `.env` 或 `pm2` 环境变量中配置以下字段：

```env
# 最新版本
ANDROID_LATEST_VERSION_CODE=10200000
ANDROID_LATEST_VERSION_NAME=1.2.0

# 最低可用版本（低于此值强制升级）
# 设为 0 或不填则禁用强制升级
ANDROID_MIN_REQUIRED_VERSION_CODE=10100000

# Google Play 页面链接
ANDROID_UPDATE_URL=https://play.google.com/store/apps/details?id=com.nexaplayer.app

# 弹窗文案（可选，不填则使用客户端默认文案）
ANDROID_FORCE_UPDATE_MESSAGE=This version is no longer supported. Please update to continue.
ANDROID_OPTIONAL_UPDATE_MESSAGE=A new version is available with improvements.

# 更新日志（多条用竖线 | 分隔，可选）
ANDROID_RELEASE_NOTES=Improved video playback performance|Bug fixes and stability improvements
```

### 常见操作场景

**发布新版本，通知用户升级（可选）：**
```env
ANDROID_LATEST_VERSION_CODE=10300000
ANDROID_LATEST_VERSION_NAME=1.3.0
ANDROID_MIN_REQUIRED_VERSION_CODE=0   # 不强制
```

**废弃旧版本，强制所有 1.1.x 升级：**
```env
ANDROID_LATEST_VERSION_CODE=10300000
ANDROID_LATEST_VERSION_NAME=1.3.0
ANDROID_MIN_REQUIRED_VERSION_CODE=10200000  # < 1.2.0 的版本强制升级
```

**关闭升级提示（不弹窗）：**
```env
ANDROID_LATEST_VERSION_CODE=0
```

---

## 版本号规则（Android versionCode）

项目 `build.gradle.kts` 中版本号计算规则：

```
versionCode = major × 10,000,000 + minor × 100,000 + patch × 1,000 + build
```

| 版本名 | versionCode |
|--------|-------------|
| 1.0.0  | 10000000    |
| 1.1.0  | 10100000    |
| 1.2.0  | 10200000    |
| 1.3.0  | 10300000    |
| 1.2.3 build 45 | 10203045 |

---

## 客户端行为说明

- 升级检测在 **Splash 动画期间并行发起**，不阻塞启动流程
- 网络失败或接口异常时**静默忽略**，不影响正常使用
- 升级弹窗在开屏广告结束、主界面出现后弹出
- 点击"Update Now"优先打开 **Google Play 客户端**，若未安装则退回浏览器
- 强制升级弹窗无法通过返回键或点击背景关闭

---

## 测试示例

```bash
curl https://api.nexamedia.app/api/app/config
```

预期响应（未配置环境变量时）：
```json
{
  "android": {
    "latestVersionCode": 0,
    "latestVersionName": "",
    "minRequiredVersionCode": 0,
    "updateUrl": "",
    "forceUpdateMessage": null,
    "optionalUpdateMessage": null,
    "releaseNotes": []
  }
}
```
