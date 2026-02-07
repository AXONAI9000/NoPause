# NoPause

**浏览器扩展：防止视频自动暂停 + 屏蔽广告 iframe**

---

## 解决什么问题？

### 🎬 防止视频自动暂停

很多视频网站会在你切换到其他标签页时自动暂停视频。这在以下场景很烦人：

- 边看视频边查资料
- 听视频当背景音乐
- 多任务处理时想继续播放

### 🛡️ 屏蔽侧边栏广告 iframe

一些视频网站的侧边栏会嵌入小尺寸的广告 iframe（伪装成视频预览），点击后跳转到广告页面。NoPause 可以自动检测并移除这些广告 iframe。

## 功能特性

| 功能 | 说明 |
|------|------|
| 防暂停保护 | 拦截 `visibilitychange` 等事件，让网页以为标签页始终在前台 |
| 自动恢复播放 | 视频被意外暂停时自动恢复 |
| 广告弹窗拦截 | 阻止点击视频区域时触发的 `window.open` 弹窗 |
| 广告链接拦截 | 阻止视频区域内指向外部域名的链接跳转 |
| 广告 iframe 拦截 | 检测并移除侧边栏中的小尺寸广告 iframe（标准广告尺寸、追踪链接等） |

## 支持的网站

理论上支持所有使用 Page Visibility API 的视频网站。

## 安装

1. 下载本项目
2. 打开 Chrome 或 Edge，访问 `chrome://extensions/` 或 `edge://extensions/`
3. 开启右上角「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择本项目文件夹

## 使用

1. 访问视频网站
2. 点击浏览器工具栏的 NoPause 图标
3. **防暂停保护**：打开主开关，为当前网站启用（按网站记忆，下次自动生效）
4. **广告 iframe 拦截**：打开「迷你视频拦截」开关（全局设置，对所有白名单网站生效）
5. 刷新页面使设置生效

## 原理

### 防暂停

- 重写 `document.hidden` / `document.visibilityState` 始终返回可见状态
- 拦截 `visibilitychange`、`blur`、`pagehide` 等事件
- 重写 `HTMLVideoElement.prototype.pause()` 区分用户操作和自动暂停
- MutationObserver 监控动态添加的视频元素

### 广告 iframe 拦截

通过多维度特征检测小尺寸广告 iframe：

- 标准广告尺寸匹配（300×250、728×90 等 16 种）
- `javascript:` 协议 + `data-link` 追踪链接
- URL 中的广告/追踪域名关键词
- `scrolling="no"` + `frameborder="0"` 组合特征
- 侧边栏容器定位（`aside`、`[class*="sidebar"]` 等）

## 许可

MIT
