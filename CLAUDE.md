# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 项目概述

NoPause 是一个 Chrome/Edge 浏览器扩展（Manifest V3），用于防止视频网站在切换标签页或失去焦点时自动暂停视频播放。

## 开发与测试

这是一个纯前端浏览器扩展项目，无需构建步骤。

**加载扩展进行测试：**
1. 打开 `chrome://extensions/` 或 `edge://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」，选择项目根目录

**调试：**
- 后台脚本：在扩展管理页面点击 "Service Worker" 链接打开 DevTools
- 内容脚本/注入脚本：在目标网页的 DevTools Console 中查看 `[NoPause]` 前缀的日志

## 架构

### 脚本执行环境

扩展使用三层脚本架构，每层运行在不同的 JavaScript 环境中：

```
background.js (Service Worker)
     ↓ chrome.scripting.executeScript (MAIN world)
content.js (Isolated World) → inject.js (Page Context / MAIN world)
```

1. **background.js** - Service Worker，扩展的控制中心
   - 管理白名单存储（chrome.storage.sync）
   - 处理来自 content.js 和 popup.js 的消息
   - 使用 `chrome.scripting.executeScript` 在 MAIN world 注入代码（绕过 CSP）
   - 包含完整的 `injectionFunction()`，这是实际注入到页面的核心逻辑

2. **content.js** - 内容脚本，运行在隔离环境
   - 在 `document_start` 时运行（包括所有 iframe）
   - 检查当前域名是否在白名单中
   - 向 background 请求注入脚本
   - 处理来自 popup 的即时启用请求

3. **inject.js** - 备用注入脚本，运行在页面上下文
   - 作为 web_accessible_resources 声明
   - 功能与 background.js 中的 `injectionFunction()` 类似但较简化

### 核心防暂停技术

注入脚本通过以下方式阻止视频自动暂停：

- 重写 `document.hidden` / `document.visibilityState` 始终返回可见状态
- 拦截 `addEventListener` 阻止 `visibilitychange` 等事件的注册
- 在捕获阶段拦截并阻止相关事件传播
- 重写 `HTMLVideoElement.prototype.pause()` 区分用户操作和自动暂停
- 使用 MutationObserver 监控动态添加的视频元素

### 广告跳转拦截

- 重写 `window.open()` 阻止点击触发的弹窗
- 在视频播放器区域拦截指向外部域名的链接点击

## 关键实现细节

- **CSP 绕过**：使用 Manifest V3 的 `chrome.scripting.executeScript` 配合 `world: 'MAIN'` 参数，可以在页面上下文中执行代码，绕过页面的内容安全策略
- **iframe 支持**：iframe 中的 content.js 会向 background 查询主标签页 URL 是否在白名单中
- **用户操作检测**：通过 click/keydown 事件设置 200ms 时间窗口，区分用户主动暂停和自动暂停
