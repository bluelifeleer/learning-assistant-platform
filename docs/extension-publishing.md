# 浏览器扩展发布说明

## 构建与打包

```bash
pnpm build:extension
pnpm package:extension
```

产物：`apps/extension/dist/learning-assistant-extension-<version>.zip`。zip 只包含 `manifest.json`、`options.html`、`dist/*.js` 和 `assets/`，不包含源码、sourcemap 或本地测试文件。

本地调试时仍然在 Chrome/Edge 的扩展管理页加载 `apps/extension` 目录。

## 当前权限与用途

| 权限 | 用途 |
| --- | --- |
| `storage` | 保存 API 地址、插件 Token、自定义站点、离线失败队列 |
| `activeTab` | 在用户正在学习/阅读的标签页挂载浮层 |
| `scripting` | 扩展更新后重新注入内容脚本，恢复浮层 |
| `alarms` | 心跳、到期复习提醒、离线队列补传 |
| `notifications` | 到期复习卡浏览器提醒（可在系统里关闭） |
| `<all_urls>` | 站点适配器与通用文章页需要在学习网站上运行 |

扩展不会自动播放视频、不会自动保存平台学习进度、不会伪造学习记录，也不会绕过平台的播放/检测逻辑。

## 隐私与数据处理

- 采集的课程、字幕、笔记、截图默认只发往用户自己配置的 API 地址
- 截图在扩展内先裁剪/马赛克，再上传处理后的图片
- 用户可在选项页暂停指定域名，或开启隐私模式禁用截图
- 网络失败时笔记/截图进入 `chrome.storage.local` 的离线队列，恢复后自动补传；单条超过 3MB 的截图不入队
- 插件 Token 只保存在 `chrome.storage.local`

## Chrome Web Store / Edge Add-ons 检查清单

1. 更新 `apps/extension/manifest.json` 的 `version`
2. 构建并运行 `pnpm package:extension`
3. 上传 zip，填写商店描述、截图（至少 1 张浮层截图）
4. 在“隐私权做法”中声明：学习数据仅发送到用户配置的本地/自建 API；不使用远程分析或广告 SDK
5. 为 `<all_urls>`、`notifications` 填写用途说明（见上表）
6. 提交审核前用全新浏览器配置测试：未绑定 Token、Token 失效、暂停站点、隐私模式、离线补传

## 明确不支持 / 暂缓的范围

- Chrome 原生 PDF 查看器：无法注入 content script，PDF 文字层暂不支持；可用截图存证或复制到文章页
- Firefox / Safari：未移植，当前只发布 Chrome / Edge 的 Manifest V3 包
- 可选 host 权限收窄：自动挂载依赖 `<all_urls>`，暂未改为“按站点动态申请”；用暂停站点和隐私模式缓解
- PDF.js 独立查看器：未实现；提醒时间、双语字幕并排视图、截图文字标注已实现
- 真实 LLM 供应商联调：扩展链路已用 mock LLM 验证，上架前需用目标供应商 Key 再测一次

## 多浏览器

- Chrome / Edge：Manifest V3 + `background.service_worker`，当前实现可直接使用
- Firefox：MV3 的后台模型与 Chrome 不同（Firefox 使用 `background.scripts`，且部分 API 命名空间为 `browser.*`），需要单独的 manifest/适配层，当前未支持
- Safari：需要 Xcode 转换与单独的 App Extension 工程，当前未支持
