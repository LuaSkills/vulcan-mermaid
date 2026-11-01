# 路径基础与 PWD 暗传

返回 [分类目录](help.md) · [工具总览](workspace.md)。

## 宿主暗传模式

清单在顶层 input_schema 中声明可选字符串 `PWD`。支持该约定的宿主有稳定项目上下文时，会从模型可见参数中隐藏 PWD，并在真正调用前注入项目绝对目录。技能接收的是注入后的普通参数；技能本身不会寻找项目，也不会读取环境变量 `PWD`、`WORKSPACE_ROOT`、技能目录或进程 cwd。

例如宿主项目为 `D:/work/project`，模型可以发送：

```json
{"action":"read","path":"architecture/api"}
```

独立调试器不会自动知道宿主项目；同一次调用可显式写为：

```json
{"PWD":"D:/work/project","action":"read","path":"architecture/api"}
```

PWD 必须指向已存在的项目目录，不能是 `.omm` 或位于 `.omm` 内，避免生成具有多个工作区边界的路径。省略或空字符串表示没有上下文；非空但不是完整路径、不是目录或不存在时明确失败。字段名大小写固定，`pwd` 会被拒绝。

## 无 PWD 的完整路径模式

所有显式 `path` 和 `writes[].path` 必须是当前系统完整绝对路径，且包含唯一的 `.omm` 目录分段。项目目录必须已存在，`.omm` 和待写节点可以尚未存在。不要将项目目录或 `diagram.mmd` 文件当成节点路径。

```json
{"action":"init","path":"D:/work/project/.omm"}
```

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture/api","fields":{"description":"API 边界"}}]}
```

```json
{"action":"read","path":"D:/work/project/.omm/architecture/api"}
```

Linux/macOS 示例为 `/home/user/project/.omm/architecture/api`。有 PWD 时也接受完整路径；显式绝对路径选择实际工作区，PWD 仅为相对路径上下文。单次写入批次必须落在同一个实际项目，禁止跨项目混写。

## 根与节点的区别

| 输入位置 | 有 PWD | 无 PWD |
| --- | --- | --- |
| 工作区根 | 省略 path（允许时），或 `.omm` / `.omm/` | 完整 `/project/.omm` 或 `D:/project/.omm` |
| 节点 | `architecture/api` 或 `.omm/architecture/api` | 完整路径，包含 `.omm/architecture/api` |
| export 的 output | 单个 `report.html`，或完整输出路径 | 若显式传入，必须完整路径；可省略 |

`init` 只接受工作区根；`read`、`write`、`delete`、历史 diff 只接受节点。tree、validate、refs、export 可选择根或子树。output 只能位于选定项目 `.omm-export` 目录的下一层，扩展名为 `.html`；省略时固定生成 `.omm-export/architecture.html`。

## Windows 与可移植性

Windows 接受 `D:/work/project/.omm/api` 和 `D:\\work\\project\\.omm\\api` 的 JSON 字符串；建议 `/` 避免转义。接受完整 UNC 共享路径，以及可无歧义还原的 `\\?\D:\...`、`\\?\UNC\server\share\...` 长路径形式。UNC 需要实际可访问的共享；不会自动连接或猜测共享名。

Windows 相对节点路径可用反斜杠；Linux/macOS 使用 `/`。`D:project`、`\project` 是驱动器相对或根相对路径，不算完整路径。设备/管道命名空间、`.` / `..` 分段、隐藏节点、Windows 保留名称、ADS、大小写别名和节点尾部点/空格被拒绝。`.omm` 本身是专用根标记，不是可写节点。

绝对路径中的 `.omm` 标记必须精确小写且只出现一次。相对节点最多 512 字符、16 层，每段最多 80 字符；完整路径输入最多 4096 字符，仍受操作系统实际路径限制约束。项目下的目录联接、符号链接和字段硬链接会被拒绝。

tree/read/write 返回的 `absolute_path` 可原样用于后续调用。引用标签和 `.omm` 元数据继续使用逻辑节点路径；离线 HTML 不嵌入本机绝对项目路径。
