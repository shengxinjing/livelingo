# `todo.md` Draft: LiveLingo 系统级文本助手

## 目标
- [ ] 在任意应用中支持“选中文本 -> 鼠标旁显示 logo -> 点击打开 LiveLingo 并显示原文+翻译”。
- [ ] 在任意输入框中支持“三击空格（可切换为自定义快捷键）-> 取当前行行首到光标 -> 翻译并替换”，并保证 `Cmd/Ctrl+Z` 可撤销。

## 范围
- [ ] 平台仅 macOS（首期）。
- [ ] 现有翻译链路继续使用通义（Qwen）。
- [ ] Settings 新增 Text Assist 配置入口。
- [ ] 不做 Windows/Linux（后续里程碑）。

## 配置与持久化
- [ ] 新增 store: `textAssist.enabled`（默认 `true`）。
- [ ] 新增 store: `textAssist.trigger.mode`（`triple-space` / `hotkey`，默认 `triple-space`）。
- [ ] 新增 store: `textAssist.trigger.hotkey`（默认 `CommandOrControl+Shift+L`）。
- [ ] 新增 store: `textAssist.trigger.tripleSpaceWindowMs`（默认 `700`）。
- [ ] 新增 store: `textAssist.selection.enableClipboardFallback`（默认 `true`）。
- [ ] 新增 store: `textAssist.bubble.enabled`（默认 `true`）。

## 主进程能力（Electron）
- [ ] 新增 `TextAssistOrchestrator`（启动、停止、状态、重启）。
- [ ] 新增 `selection` 捕获模块：AX 优先，失败回退剪贴板。
- [ ] 新增 `trigger` 模块：三空格序列检测 + 全局热键注册/重绑。
- [ ] 新增 `input-writer` 模块：按“可撤销”方式执行替换写回。
- [ ] 新增 `bubble-window` 模块：logo 浮窗显示、点击回调、超时销毁。
- [ ] 新增主进程 IPC：状态查询、触发配置、手动捕获测试。

## 渲染层能力（React）
- [ ] `Settings` 新增 `Text Assist` Tab：
- [ ] 总开关、触发模式切换、热键输入、三空格窗口时间设置
- [ ] 权限状态展示（granted/denied/unknown）
- [ ] “打开系统设置”按钮
- [ ] “测试捕获选中文本”按钮
- [ ] `Home` 支持接收外部 payload 并插入“原文 + 翻译”展示。

## 交互流程 A：外部选区 -> logo -> 主窗口
- [ ] 捕获外部选区文本成功后，在鼠标旁显示 logo 浮窗。
- [ ] 点击 logo：激活主窗口、插入原文、显示翻译结果。
- [ ] 无选区或捕获失败：给出提示，不弹浮窗。

## 交互流程 B：输入框触发替换
- [ ] 触发（默认三空格，或热键）后提取“当前行行首到光标”文本。
- [ ] 调用翻译服务获得目标文本。
- [ ] 在目标输入框执行替换（通过可撤销输入路径）。
- [ ] 失败时不改写原文本并反馈错误。

## 撤销与安全
- [ ] 替换动作必须进入目标应用 Undo 栈（`Cmd/Ctrl+Z` 可恢复）。
- [ ] 替换前后做剪贴板保护（备份 -> 写入 -> 粘贴 -> 恢复）。
- [ ] 加互斥锁防重入，避免连续触发造成重复替换。

## 验收标准
- [ ] Notes/Safari/Slack/VSCode 输入区域均可触发替换。
- [ ] 三空格与热键模式可切换并立即生效。
- [ ] 外部选区 logo 流程可用（含 fallback）。
- [ ] 替换后 `Cmd/Ctrl+Z` 可稳定撤销。
- [ ] 连续 50 次触发无崩溃、无死锁、无残留浮窗。

## 里程碑
- [ ] M1：配置 + IPC + 状态页（Text Assist Tab）。
- [ ] M2：外部选区捕获 + logo 浮窗 + 打开主窗口展示。
- [ ] M3：三空格/热键触发 + 输入替换 + Undo 保证。
- [ ] M4：回归测试 + 异常处理 + 性能与稳定性收尾。

## 风险与回退
- [ ] AX 兼容差异：AX 失败自动回退 clipboard。
- [ ] 三空格误触发：支持切换热键模式。
- [ ] Undo 不一致：统一替换路径，不直接 setValue 覆盖。

## 参考文档
- [ ] https://deepwiki.com/nextai-translator/nextai-translator/4.5-writing-assistant
- [ ] https://github.com/nextai-translator/nextai-translator
