[English](README.md) | [简体中文](README.zh-CN.md)

# Vulcan Mermaid

基于 oh-my-mermaid 本地架构文档能力、使用 LuaSkills demo-skill 开发基础创建的独立 LuaSkill。只暴露 **一个工具 `vulcan-mermaid-workspace`**，通过 `action` 参数扩展功能。

## 快速开始

`PWD` 是可选项目上下文。支持该约定的宿主会隐藏模型可见参数中的 PWD，并在调用前暗传项目绝对目录。此时可使用相对节点路径；独立调用则显式传入 PWD，或使用包含 `.omm` 的完整绝对路径。不从环境变量、技能目录或受管 Node 的进程 cwd 推测项目。

```json
{
  "PWD": "D:/work/my-project",
  "action": "write",
  "writes": [
    {"path":"architecture","fields":{"description":"应用架构","diagram":"graph LR\napi[API] -->|queries| store[Store]"}},
    {"path":"architecture/store","fields":{"description":"持久化边界","constraint":"业务写入必须保证事务性。"}}
  ]
}
```

再调用 `{"PWD":"D:/work/my-project","action":"export"}`，直接用浏览器打开 `.omm-export/architecture.html`。一个 HTML 包含全部图数据、布局库和查看器代码；字体使用系统字体，无需服务端或网络。修改数据后重新导出。导出文件包含文档内容，分享范围应与文档一致。

**没有 PWD 时**，读取示例为 `{"action":"read","path":"D:/work/my-project/.omm/architecture"}`，导出示例为 `{"action":"export","path":"D:/work/my-project/.omm"}`。Linux/macOS 使用 `/home/user/project/.omm/...`。项目目录须已存在，init/write 可以创建工作区及节点。纯文本比较 `{"action":"diff","before":"graph LR\nA[旧]","after":"graph LR\nA[新]"}` 不需要项目上下文，也不访问文件系统。

## 单工具操作表

| action | 除 PWD/action 外的参数 | 行为 |
| --- | --- | --- |
| init | `.omm` 根 path；有 PWD 时可省略 | 初始化 `.omm/config.yaml` |
| tree | 可选 path | 返回节点路径、已有字段和直接子节点 |
| read | path | 读取全部字段与可选元数据 |
| write | writes 数组，每项包含 path、fields | 一次更新多个节点和字段，自动建立祖先 |
| delete | path，可选 recursive | 移入 `.omm/.trash`；包含子节点时必须 recursive:true |
| validate | 可选 path | 返回语法和引用诊断，包含源码行号 |
| diff | path 或 before+after | 比较历史版本或两段明确源码 |
| refs | 可选 path | 返回传入、传出引用，支持嵌套节点 |
| export | 可选 path、output | 导出自包含离线 HTML |

有 PWD 时，path 和 writes[].path 接受 `architecture/api/auth`、`.omm/architecture/api/auth` 等相对节点路径；无 PWD 时必须完整且包含 `.omm`，表中可选 path 的文件操作也必须指定完整根或子树。显式绝对路径可与 PWD 同时使用并选定实际工作区；同批写入必须属于一个实际项目。init 只接受根，read/write/delete/历史 diff 必须指向具体节点。

output 默认生成所选项目 `.omm-export/architecture.html`。有 PWD 可传单个 `.html` 文件名；无 PWD 时显式 output 必须完整。绝对输出也限制在该项目 `.omm-export` 的下一层。选定范围包括后代；引用根据完整工作区解析，导出中保留全局引用名称，范围外节点不能跳转。错误或不适用参数明确拒绝。

文件操作成功返回 `{ok:true,action,workspace,result}`，workspace 是实际 `.omm` 绝对目录；tree/read/write 同时返回可直接复用的 absolute_path。纯文本 diff 不含 workspace。领域错误为 `{ok:false,error:{code,message}}`；受管运行时失败由宿主报告工具错误。

## 分类帮助

[帮助目录](help/help.md) 下分为八个主题：[总览](help/workspace.md)、[路径基础](help/paths.md)、[浏览读取](help/browse.md)、[初始化与编辑](help/edit.md)、[校验与分析](help/analyze.md)、[离线导出](help/export.md)、[实践流程](help/workflow.md)、[错误与限制](help/errors.md)。每类包含对应参数、返回值和示例。通过清单已有 help 机制注册，不增加工作区工具数量。

## 保留的 .omm 格式与修复

磁盘格式继续使用 **0.1.0**，视角和子节点直接嵌套。字段固定为 description、diagram、constraint、concern、context、todo、note；diagram 保存为 `diagram.mmd`，其余保存为对应 Markdown 文件。元数据仍是 YAML，保留上游可选字段和未知属性；维护时间戳、更新次数、父节点 children 和 prev_diagram。已有 Git 元数据会保留，本版不主动采集 Git 信息。

相同内容重复写入不改变计数或历史。原节点没有 meta.yaml 时，更新图仍能保存真实旧图。差异比较覆盖节点标签、形状、类、边标签、箭头类型、重复边数量、方向、样式和全部源码变化；仅空白或注释变化也会令 has_changes 为 true。无法完整解析的语法明确返回 complete:false，缺失历史返回 NO_HISTORY。

路径禁止 `.` / `..` 分段、Windows 设备名、ADS、危险分隔符、尾部点/空白；拒绝所选项目根下的符号链接、目录联接和字段硬链接。PWD 可解析到真实项目目录，它是路径上下文。Windows 支持盘符/UNC 完整路径、无歧义的盘符/UNC 长路径前缀及相对节点反斜杠；拒绝驱动器相对/根相对路径和设备命名空间。空 PWD 按省略处理，错误的非空 PWD 明确失败，不回退到 cwd。本实现不声称能防御另一个进程在调用期间恶意替换目录的操作系统级竞争。

批次先验证输入和现有目标元数据，再写字段。协作调用使用 `.omm/.vulcan-mermaid.lock`；崩溃遗留锁需确认原进程已退出后手动移除。单文件通过临时文件替换，**批次不是跨文件崩溃原子事务**；I/O 失败后需读取受影响节点再重试。删除返回可恢复回收路径，可手动移回原位置，再用写入更新父节点元数据。

## 离线查看器与语法范围

提供搜索、层级跳转、拖动、缩放、适应、明暗主题、字段/源码/差异标签页及引用导航。同名子节点按完整路径区分，不再跨视角覆盖。

本版支持上游架构查看器侧重的 **graph/flowchart 流程图子集**，不是完整 Mermaid 引擎：LR/RL/TD/TB/BT、方形/圆角/椭圆/体育场/菱形/子程序/圆柱节点、链式连线、常用箭头、边文字、class/classDef/:::class。标签中的标点建议放入双引号，换行写 `\n`。查看器仅应用十六进制 fill、stroke、color 样式，其余样式仍保留在差异结果中。

subgraph、click、初始化指令及 sequenceDiagram 等其他图类型会给出明确诊断；页面保留源码，不呈现可能误导的局部图。层级通过嵌套 `.omm` 节点表达。`@perspective` 保持上游引用语义，并支持 `@perspective/child` 精确引用；普通图节点只跳转到当前文档的同名直接子节点。

Markdown 字段安全展示标题、段落、项目符号和围栏代码块；HTML 和链接按字面文本呈现。没有 CDN、远程字体、联网请求、实时刷新、登录、云同步或后台服务。

限制：每批 100 项，每字段/元数据文件 1 MiB，工作区/批次 16 MiB，1000 个文档节点，16 层路径，每张图 200 个节点/400 条边。读取不会初始化不存在的工作区；未知磁盘版本明确拒绝。

## 开发、验证与打包

`.luaskills-version` 锁定 [luaskills-debug](https://github.com/LuaSkills/luaskills-debug) 发布版本 **v0.8.0**（其主次版本号跟随内嵌的 LuaSkills 运行时），`dependencies.yaml` 锁定受管 Node **24.18.0** 与 pnpm **11.11.0**。首次开发准备需要联网下载官方运行时及锁定依赖；导出的 HTML 无网络依赖。

`scripts/setup_debug.ps1` / `scripts/setup_debug.sh` 从 luaskills-debug 发布页下载 `luaskills-debug-tool-{platform}.tar.gz` 与 `luaskills-debug-checksums.txt`，按校验和文件中对应行验证压缩包 SHA-256，再解压到被 Git 忽略的 `.luaskills-debug/`（该目录不得是符号链接或目录联接）。Lua 运行时包、Node.js 与 pnpm 由压缩包内附带的 `setup_runtime` 和 `scripts/deps/fetch_managed_runtimes.*` 安装。

`scripts/debug_skill.ps1 -Command <命令>` / `bash scripts/debug_skill.sh <命令>` 在仓库锁内直接调用 `.luaskills-debug/bin/luaskills-debug`，以仓库根目录作为 `--skill-path`。`sync`、`inspect`、`list-tools`、`call` 把技能复制到 `.luaskills-debug/runtime/`：任意层级跳过 `.git`、`node_modules`、`__pycache__`、`.luaskills-debug`、`target`、`.svn`，根目录下跳过 `dist`、`temp`、`state`、`databases`、`dependencies`、`lua_packages`、`libs`、`out`。`validate` 按 LuaSkills 打包规则校验；`package` 把 standard 布局的发布资产写入 `dist/`。

```powershell
python -m pip install pyyaml
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify_skill.ps1
```

Linux/macOS 使用 `bash scripts/verify_skill.sh`，需 Python 3.11+ 和 PyYAML。验证包括发布版本测试、受管 Node 回归、跨平台资源复制（`scripts/build_viewer.mjs`）、luaskills-debug sync/inspect/list-tools/call 全链路，在显式 PWD 和无 PWD 完整路径两种模式下调用全部 9 个 action，并断言只注册一个工具；随后执行 `validate` 与 `package`，在 `dist/` 生成 `vulcan-mermaid-v<版本>-skill.zip` 和 `vulcan-mermaid-v<版本>-checksums.txt`。ZIP 只有一个 `vulcan-mermaid/` 顶层目录，包含 `skill.yaml`、`dependencies.yaml`、两份 README、`LICENSE`、`runtime/`、`node/`、`help/`、`overflow_templates/`、`resources/`、`licenses/`。已构建的查看器资源（`resources/dagre.min.js` 与复制的许可证）随源码提交，打包无需构建步骤。

推送 `v*` 标签时，发布工作流运行 `LuaSkills/luaskills-debug@v0.8.0` Action（`layout: standard`，`expect-tag` 为该标签，必须等于 `v<skill.yaml 版本>`），再用 `gh release create` 发布其产物；验证工作流在 Linux、Windows、macOS 上运行验证流程并上传 `dist/*`。仓库不自动创建远端或发布。

`examples/upstream/.omm` 保留上游完整示例：62 个文档节点、6 张流程图。`examples/workspace.args.json` 和 `examples/absolute.args.json` 展示两种路径模式，可改为自己的项目路径。开发缓存、测试、示例、.agents 不进入安装包；许可和来源见 [第三方说明](licenses/THIRD_PARTY_NOTICES.md)。
