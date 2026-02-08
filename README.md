# LiveLingo

LiveLingo 是一个基于 Electron + React + TypeScript 的桌面实时转写与翻译工具（当前优先支持 macOS）。

## 主要功能

- 实时语音识别（STT）
- 实时翻译
- 选中文本翻译

## 技术栈

- Electron 30
- React 18
- TypeScript 5
- Vite 5
- electron-store（本地配置存储）

## 本地开发

### 1. 安装依赖

```bash
npm install
```

如果你遇到 npm 缓存权限问题（`EACCES`），可执行：

```bash
sudo chown -R $(id -u):$(id -g) ~/.npm
```

### 2. 启动开发

```bash
npm run dev
```

> 说明：项目目前的 `dev` 脚本是 Vite 前端开发模式。Electron 主进程由项目现有联调方式启动（按你当前本地流程运行）。

### 3. 构建

```bash
npm run build
```

## 设置说明

在应用 `Settings` 页面可配置：

- `Speech`
  - STT Provider（Aliyun / OpenAI）
  - Aliyun API Key
  - OpenAI API Key
- `Translation`
  - Qwen API Key
  - 目标语言
  - 翻译开关

## 项目结构

```text
livelingo/
├── electron/                # Electron 主进程与 preload
├── src/
│   ├── components/          # Home / Settings 等页面
│   ├── services/            # 翻译与语音服务封装
│   └── shared/              # 共享类型与配置
├── public/                  # 静态资源（包含 logo）
├── todo.md                  # 系统级文本助手功能清单
└── electron-builder.json5   # 打包配置
```

## Roadmap（已规划）

详见 `todo.md`：

- 任意应用选中文本 -> logo 浮标 -> 打开主窗口展示翻译
- 任意输入框三击空格（或快捷键）触发翻译替换
- 支持 `Cmd/Ctrl+Z` 撤销
- Text Assist 设置页与权限管理

## 许可证

当前仓库未显式声明 License，请按仓库维护者策略使用。
