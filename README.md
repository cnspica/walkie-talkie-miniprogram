# Walkie-Talkie Miniprogram 声波对讲机小程序

基于 FSK（频移键控）调制解调技术实现的微信小程序对讲机，支持**无网络声波通信**和**网络实时语音**双模式。

## 核心特性

- **声学模式（无网络）** — 文本经 Reed-Solomon 编码 + FSK 调制为音频信号，通过扬声器播放，对方麦克风接收后过零检测解调 + RS 纠错还原文本
- **网络模式（有网络）** — WebSocket + WebRTC 实时语音对讲
- **频道系统** — 支持创建/加入频道，声学模式下不同频率对应不同频道
- **消息记录** — 所有收发消息本地存储，支持历史回顾

## 技术架构

| 模块 | 说明 |
|------|------|
| `utils/fsk.js` | FSK 调制器 + 解调器（过零检测法） |
| `utils/rscode.js` | Reed-Solomon CCSDS 前向纠错编解码器 |
| `pages/talk/` | 对讲主界面（PTT按钮、消息列表、波形显示） |
| `pages/channel/` | 频道管理 |
| `pages/messages/` | 消息记录 |
| `pages/settings/` | 参数配置（频率、波特率、纠错等级） |

### FSK 通信参数

- **Mark 频率（bit=1）**: 2100 Hz
- **Space 频率（bit=0）**: 1300 Hz
- **采样率**: 44100 Hz / 16-bit PCM
- **波特率**: 可配置（默认 1225 baud）
- **纠错**: Reed-Solomon (223, 255) — 每 223 字节有效数据 + 32 字节校验

### 帧结构

```
Prologue → Preamble → Header → Data+Parity → Epilogue
```

## 原理说明

本项目灵感来源于 [JavaScript FSK Modulator](http://gyu.que.jp/private/jsfsk/)（Satoshi Ueyama, 2010），并在其基础上：

1. **新增 FSK 解调器** — 原站仅有调制（编码发送），本项目新增了完整的过零检测解调算法，实现双向通信闭环
2. **新增 RS 解码器** — 原站仅有 RS 编码器，本项目新增解码器实现前向纠错的接收端
3. **适配微信小程序** — 使用 wx.createInnerAudioContext / RecorderManager 处理音频流
4. **频道系统** — 不同频率配置实现多频道隔离

## 快速开始

### 环境要求

- 微信开发者工具（最新稳定版）
- 微信小程序 AppID（在 `project.config.json` 中配置）

### 安装

1. 克隆仓库：
```bash
git clone https://github.com/cnspica/walkie-talkie-miniprogram.git
```

2. 用微信开发者工具打开项目目录

3. 在 `project.config.json` 中填入你的 AppID

4. 编译运行

## 使用方式

### 声学模式（面对面）

1. 两台手机各打开小程序
2. 选择相同频道
3. 发送方：按住 PTT 按钮输入文本，点击发送 → 播放声波
4. 接收方：点击接收按钮 → 麦克风采集声波 → 自动解调还原文本

### 网络模式（远程）

1. 双方加入同一频道
2. 按住 PTT 按钮即可实时语音对讲
3. 松开按钮释放频道

## 项目结构

```
walkie-talkie-miniprogram/
├── app.js              # 小程序入口
├── app.json            # 页面路由与全局配置
├── app.wxss            # 全局样式
├── project.config.json # 项目配置
├── sitemap.json        # 搜索配置
├── utils/
│   ├── fsk.js          # FSK 调制解调引擎
│   └── rscode.js       # Reed-Solomon 编解码器
└── pages/
    ├── talk/            # 对讲主界面
    ├── channel/         # 频道管理
    ├── messages/        # 消息记录
    └── settings/        # 参数设置
```

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License — 详见 [LICENSE](LICENSE)

## 致谢

- [JavaScript FSK Modulator](http://gyu.que.jp/private/jsfsk/) — 原始 FSK 调制器灵感来源
- [Reed-Solomon CCSDS](https://public.ccsds.org/) — 纠错编码标准
