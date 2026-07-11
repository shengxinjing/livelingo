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

> `npm run dev` 会同时启动 Vite 和 Electron 开发窗口。

### 3. 构建

```bash
npm run build
```

## 设置说明

在应用 `Settings` 页面可配置：

- `Speech`
  - Aliyun DashScope API Key
  - 该 Key 同时用于 Paraformer 实时语音识别、通义翻译和 Text Assist
- `Translation`
  - 目标语言
  - 翻译开关
- `Text Assist`
  - 全局快捷键
  - 选中文本或输入框全文翻译替换
  - macOS 辅助功能权限状态与测试

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

## 当前状态

详见 `todo.md`：

- 阿里 Paraformer 实时语音识别
- 通义 Qwen 增量翻译
- 粘贴文本并按行翻译
- Text Assist 快捷键翻译替换
- 支持 `Cmd/Ctrl+Z` 撤销 Text Assist 替换

## 许可证

当前仓库未显式声明 License，请按仓库维护者策略使用。
