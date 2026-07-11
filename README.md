# LiveLingo

Macos上，为了和老外开会vibe的实时语音识别和翻译工具。
语音识别 + 输入框翻译两个功能


## 主要功能

- 实时语音识别+翻译（开会用）
- 输入框输入中文，按快捷键翻译成英文（写邮件和聊天用）

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

## 自动发布

在干净且已与 `origin/main` 同步的 `main` 分支运行：

```bash
npm run release
```

该命令会自动运行代码检查、递增补丁版本、创建发布提交和 `vX.Y.Z` Tag，并将两者原子推送到 GitHub。Tag 推送后，GitHub Actions 会构建 macOS DMG、创建正式 GitHub Release 并上传安装包。

GitHub Actions 使用仓库自动提供的 `GITHUB_TOKEN`，无需手动配置 GitHub Token。当前发布包尚未配置 Apple 签名和公证。

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
