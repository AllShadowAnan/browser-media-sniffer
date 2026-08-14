# MediaSniffer - 网页全媒体智能嗅探与抓取利器 (Chrome / Edge Extension)

<p align="center">
  <img src="icons/icon128.png" width="100" height="100" alt="MediaSniffer Logo" />
</p>

<p align="center">
  <strong>🎨 优雅极简 • 🚀 深度嗅探 • 📡 直播测活 • 📦 一键打包下载</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Manifest-V3-6366f1.svg" alt="Manifest V3" />
  <img src="https://img.shields.io/badge/Platform-Chrome%20%7C%20Edge%20%7C%20Brave-blue.svg" alt="Platform" />
  <img src="https://img.shields.io/badge/License-MIT-green.svg" alt="License" />
  <img src="https://img.shields.io/badge/Version-v1.2.0-orange.svg" alt="Version" />
</p>

---

## 🌟 简介 (About)

**MediaSniffer** 是一款极具现代设计美感、全功能覆盖的浏览器媒体抓取与管理扩展（基于最新的 **Chrome Extension Manifest V3** 规范构建）。

不管是网页中的 **高清图片**、**流媒体视频**、**背景音乐/音频**，还是 **M3U8 / FLV 直播流**，MediaSniffer 都能通过多层网络拦截与 DOM 深度扫描将其一网打尽。内置 **无头视频解码测活引擎**，自动过滤无画面或已失效的媒体，让抓取体验变得前所未有的优雅与纯粹。

---

## ✨ 核心特性 (Features)

### 1. 🎯 智能鼠标交互选区抓取 (Inspector Picker)
- 鼠标悬停实时高亮任意网页容器，浮动显示元素标签、像素尺寸及内部包含的媒体数量。
- **键盘快捷控制**：按 `↑` 键扩展至父级容器，按 `↓` 键聚焦子级节点，按 `ESC` 随时退出。
- 点击目标区域，一键提取该区块内的所有媒体文件。

### 2. 📡 直播流嗅探与真实画面测活 (Live Stream & Video Validator)
- **多协议直播捕获**：自动捕获网络传输的 `HLS (.m3u8)`、`HTTP-FLV (.flv)`、`DASH (.mpd)` 等直播源。
- **真实画面解码探测**：内置无头视频解码探针，自动测试媒体流是否具有可播放的视频帧，**智能剔除黑屏、纯音频占位或 404/403 失效流**。
- **内置 HLS.js 播放器**：直接在灯箱中实时播放直播流，无需跳转。
- **一键外部播放 / 导出**：支持 `potplayer://` 协议一键唤起本地 PotPlayer / VLC，支持导出标准 `.m3u` 播放列表。

### 3. 🎵 全格式音频抓取 (Audio Extraction)
- 自动捕获网页中的背景音乐、音频播客、音效文件（支持 `.mp3`, `.m4a`, `.aac`, `.flac`, `.wav`, `.ogg` 等）。
- 拦截 DOM 元素、`new Audio()` 构造器及常见 Web 播放器实例。
- 控制台专属 **翡翠绿动态音波卡片** 与全功能音频试听播放器。

### 4. 🖼️ 高清图片与深度媒体探测
- 自动解析 `<img>`、`<picture>`、`<source>`、SVG、CSS `background-image`。
- 自动提取 `srcset` 最高分辨率原图，深度适配电商与社交平台的懒加载原图属性（`data-src`, `data-original` 等）。

### 5. 🎛️ 现代化全功能控制台 (MediaSniffer Hub)
- **多维度筛选过滤**：按分类（图片 / 音频 / 视频 / 直播）、分辨率（>300px 过滤图标、>800px 高清、>1080P 超清）、宽高比（横屏 / 竖屏 / 方形）、格式标签多选。
- **四种视图无缝切换**：密集网格、标准网格、大图展示、**📋 列表表格视图 (Table View)**。
- **沉浸式灯箱预览**：支持大图查看、音视频全功能播放及键盘快捷键切换。

### 6. 📦 批量下载与多样化清单导出
- **ZIP 归档打包**：内置 JSZip 离线压缩库，一键将勾选的所有媒体打包为 `.zip` 下载。
- **批量流式下载**：调用浏览器原生下载管理器极速保存。
- **多格式数据导出**：支持导出为 TXT 链接、JSON 结构化数据、CSV 表格、M3U 播放列表、Markdown 图文列表。

---

## 🚀 安装指南 (Installation)

### 方式：加载已解压的扩展程序（适用于 Chrome / Edge / Brave 等所有 Chromium 内核浏览器）

1. **克隆或下载本项目**：
   ```bash
   git clone https://github.com/your-username/MediaSniffer.git
   ```
2. 打开浏览器扩展管理页面：
   - **Google Chrome**: 访问 `chrome://extensions/`
   - **Microsoft Edge**: 访问 `edge://extensions/`
3. 开启右上角的 **「开发者模式」 (Developer mode)**。
4. 点击左上角的 **「加载已解压的扩展程序」 (Load unpacked)**。
5. 选择本项目所在文件夹（包含 `manifest.json` 的目录）。
6. 安装完成！点击浏览器右上角的拼图图标，将 **MediaSniffer** 固定在工具栏即可开始使用。

---

## 📖 使用技巧 (Usage)

| 功能 | 操作方式 |
| :--- | :--- |
| **全页深度扫描** | 点击插件图标 -> 点击 **「⚡ 全页深度扫描 + 直播嗅探」** |
| **鼠标点选区域** | 点击插件图标 -> 点击 **「🎯 鼠标选区抓取」**（或网页右键菜单直接启动） |
| **打包为 ZIP** | 在控制台中勾选所需资源 -> 点击底部浮动栏中的 **「打包 ZIP 下载」** |
| **筛选有效画面** | 控制台左侧开启 **「仅显示有画面的视频与直播」**，自动过滤失效流 |
| **外部播放器观看** | 在灯箱预览或卡片中点击 **「📺 外部播放」**，一键调用本地 PotPlayer |

---

## 📁 目录结构 (Project Structure)

```text
MediaSniffer/
├── manifest.json            # 扩展配置文件 (Manifest V3)
├── background.js            # 后台 Service Worker（网络流/音频监听与下载调度）
├── content/
│   ├── content.js           # DOM 扫描、音频拦截与鼠标选区控制器
│   ├── injected.js          # 页面深层网络与播放器 Hook 脚本
│   └── selector.css         # 选区高亮与浮动交互样式
├── popup/
│   ├── popup.html           # 弹出层快捷界面
│   ├── popup.css            # 弹出层毛玻璃暗黑样式
│   └── popup.js             # 弹出层交互逻辑
├── dashboard/
│   ├── dashboard.html       # 全功能媒体控制台与画廊
│   ├── dashboard.css        # 控制台深色现代化样式与表格视图
│   └── dashboard.js         # 筛选、测活引擎、HLS播放、导出与ZIP下载
├── lib/
│   ├── jszip.min.js         # 批量 ZIP 压缩库
│   └── hls.min.js           # HLS.js 离线流媒体播放引擎
└── icons/                   # 扩展应用高清图标
```

---

## 🛡️ 开源协议 (License)

本项目基于 [MIT License](LICENSE) 开源。欢迎提交 PR 和 Issue！

---

<p align="center">
  如果这个项目对你有帮助，欢迎点一个 ⭐️ <strong>Star</strong> 支持一下！
</p>
