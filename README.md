# AI Usage Tracker

AI Usage Tracker 是一个 VS Code 扩展，用于在一个面板中查看本机 AI 编程工具的使用情况，包括当前模型、上下文窗口占用、Token 用量、缓存用量、会话历史和最近活动。

插件只读取本机 VS Code 和 AI 工具的本地历史文件，不会上传提示词、回复内容、Token 指标或会话元数据。

## 功能特性

- 自动检测常见 AI 编程扩展。
- 在状态栏显示当前活跃 AI 工具、模型和汇总 Token 数据。
- 在侧边栏 Dashboard 中展示每个工具的模型、上下文窗口、输入 Token、输出 Token、缓存读写和会话活动。
- 手动刷新会触发 provider 重新扫描，而不是只重绘界面。
- 7 日趋势基于快照增量累计，不再被最后一条快照覆盖。
- 支持读取 Codex 本地历史：`~/.codex/sessions/**/*.jsonl`。
- 支持 Claude Code 和 Kilo Code 的本地会话追踪。
- 支持 GitHub Copilot 的基础会话信息和可读取的模型上下文上限。
- 支持多工作区（multi-root workspace）下的会话筛选。
- 对 Cody、Tabnine、Codeium、Cursor、Amazon Q、Gemini 等工具提供基础活跃状态检测。
- 不可读取的数据会明确显示为“未读取”，不会伪造指标。
- 内置 `lint + compile + test` 检查和 GitHub Actions CI。

## 支持的工具

| 工具 | 模型 | Token | 上下文窗口 | 会话 | 数据来源 |
| --- | --- | --- | --- | --- | --- |
| Codex | 支持 | 支持 | 支持 | 支持 | `~/.codex/sessions` JSONL 历史 |
| Claude Code | 支持 | 支持 | 支持 | 支持 | `~/.claude/projects` JSONL 历史 |
| Kilo Code | 支持 | 支持 | 部分支持 | 支持 | 本地 Kilo SQLite 数据库 |
| GitHub Copilot | 部分支持 | 不支持 | 部分支持 | 支持 | VS Code Chat 会话元数据 |
| Cody、Tabnine、Codeium、Cursor、Amazon Q、Gemini | 基础支持 | 不支持 | 不支持 | 不支持 | 扩展安装和活跃状态 |
| 其他未知 AI 扩展 | 基础支持 | 不支持 | 不支持 | 不支持 | 扩展安装和活跃状态 |

## 安装方式

### 方式一：从 VSIX 安装

适合把插件发给其他人试用。

1. 获取项目打包生成的文件，例如：

   ```text
   ai-usage-tracker-0.5.0.vsix
   ```

2. 打开 VS Code。
3. 进入左侧扩展面板。
4. 点击右上角 `...`。
5. 选择 `Install from VSIX...`。
6. 选择 `.vsix` 文件并安装。
7. 安装完成后重新加载 VS Code。

也可以用命令行安装：

```bash
code --install-extension ai-usage-tracker-0.5.0.vsix
```

### 方式二：从源码运行

适合开发、调试或二次修改。

```bash
git clone https://github.com/yzy1129/AI-Usage-Tracker.git
cd AI-Usage-Tracker
npm install
npm run compile
npm run test
```

然后用 VS Code 打开项目目录，按 `F5` 启动 Extension Development Host。

### 方式三：发布到 VS Code Marketplace 后安装

如果插件已经发布到 VS Code Marketplace，用户可以直接在 VS Code 扩展市场搜索：

```text
AI Usage Tracker
```

然后点击安装即可。

发布者可以使用以下命令打包和发布：

```bash
npm install
npm run check
npm run package
npx @vscode/vsce publish
```

发布前需要先配置 VS Code Marketplace 的 publisher 和 Personal Access Token。

## 使用方法

安装或重新加载 VS Code 后：

1. 查看 VS Code 底部状态栏，插件会显示当前检测到的 AI 工具和模型信息。
2. 点击左侧 Activity Bar 中的 `AI Usage` 图标，打开完整 Dashboard。
3. 在每个工具卡片中查看模型、Token、上下文窗口、缓存和会话信息。
4. 如果工具支持多会话，可以通过会话下拉框切换历史会话。
5. 如果新会话没有立即出现，可以在命令面板运行：

   ```text
   AI Tracker: Refresh Metrics
   ```

Codex 的数据会从 `~/.codex/sessions` 读取，并在会话文件更新时自动刷新。若历史文件中包含 `cwd` 工作目录信息，插件会优先筛选当前工作区相关会话；在 multi-root workspace 下会匹配任一工作区路径。

## 命令

| 命令 | 作用 |
| --- | --- |
| `AI Tracker: Open Dashboard` | 打开 AI 使用情况面板 |
| `AI Tracker: Refresh Metrics` | 手动刷新指标 |
| `AI Tracker: Switch Session` | 切换指定工具的会话 |

## 项目结构

```text
.
├── .github/
│   ├── ISSUE_TEMPLATE/
│   ├── workflows/
│   └── PULL_REQUEST_TEMPLATE.md
├── docs/
│   ├── ARCHITECTURE.md
│   └── PROVIDERS.md
├── src/
│   ├── extension.ts
│   ├── constants.ts
│   ├── types.ts
│   ├── providers/
│   │   ├── base.ts
│   │   ├── claude-code.ts
│   │   ├── codex.ts
│   │   ├── generic.ts
│   │   ├── github-copilot.ts
│   │   └── kilo-code.ts
│   ├── services/
│   │   ├── aggregator.ts
│   │   ├── detection.ts
│   │   └── persistence.ts
│   └── ui/
│       ├── status-bar.ts
│       └── webview-panel.ts
│   ├── test/
│   │   ├── history.test.ts
│   │   └── provider-metrics.test.ts
│   └── utils/
│       ├── history.ts
│       ├── provider-metrics.ts
│       └── workspace.ts
├── CHANGELOG.md
├── CONTRIBUTING.md
├── LICENSE
├── SECURITY.md
├── package.json
└── tsconfig.json
```

## 开发命令

```bash
npm install
npm run compile
npm run watch
```

常用检查和打包命令：

```bash
npm run lint
npm run check
npm run package
```

在 Windows PowerShell 中，如果遇到 `npm.ps1 cannot be loaded because running scripts is disabled`，可以改用：

```bash
npm.cmd run check
npx.cmd @vscode/vsce package
```

## 隐私说明

AI Usage Tracker 只读取本机文件和 VS Code 扩展元数据，用于计算使用情况指标。插件不会把收集到的数据发送到网络服务。

不同工具的数据来源详见 [docs/PROVIDERS.md](docs/PROVIDERS.md)。

## 贡献

欢迎提交 Issue 和 Pull Request。贡献前请阅读 [CONTRIBUTING.md](CONTRIBUTING.md)。

## 许可证

本项目使用 [MIT License](LICENSE)。
