# 工具总览

返回 [分类目录](help.md)。工具名为 `vulcan-mermaid-workspace`；官方本地调试器的入口名为 `workspace`。仅 `action` 是所有调用共同的必填参数，各操作另有条件要求。未知或不适用于当前操作的参数会被拒绝。

| action | 用途 | 路径及专用参数 | 分类 |
| --- | --- | --- | --- |
| init | 初始化 `.omm/config.yaml` | 有 PWD 可省略 path；否则 path 必须为完整 `.omm` 根路径 | [编辑](edit.md) |
| tree | 列出节点、字段名称与直接子节点 | path 选择根或子树；有 PWD 可省略 | [浏览](browse.md) |
| read | 读取节点字段及元数据 | path 必须为节点 | [浏览](browse.md) |
| write | 批量修改字段并创建祖先 | writes 数组 1..100 项，每项包含 path、fields | [编辑](edit.md) |
| delete | 移动节点到回收目录 | 节点 path；有子节点时 recursive 必须为 true | [编辑](edit.md) |
| validate | 检查流程图和文档引用 | path 选择根或子树；有 PWD 可省略 | [分析](analyze.md) |
| diff | 比较上次图源码或两段文本 | 节点 path，或者 before 与 after，两种形式互斥 | [分析](analyze.md) |
| refs | 查询文档间引用 | path 选择根或子树；有 PWD 可省略 | [分析](analyze.md) |
| export | 生成单文件离线查看器 | path 选择根或子树，可选 output | [导出](export.md) |

`PWD` 是可选的宿主暗传上下文；有 PWD 可用 `.omm` 内相对节点路径，无 PWD 则所有显式路径必须完整。详见 [路径基础](paths.md)。

文件操作成功返回 `{ok:true,action,workspace,result}`。`workspace` 始终是实际工作区的绝对位置。`read`、`tree.nodes[]`、`write.writes[]` 还提供 `absolute_path`，可直接用于没有 PWD 的后续调用。它们保留的 `path` 是 `.omm` 内的逻辑节点键。

纯文本 diff 返回 `{ok:true,action:"diff",result}`，不含 workspace，也不访问文件系统。

领域错误返回 `{ok:false,error:{code,message}}`。必须先检查 `ok`。Lua/受管 Node 启动失败由宿主报告工具错误。参见 [错误处理](errors.md)。

使用顺序建议：tree → read → write → validate → diff/refs → export。写入内容应来自已查证的源码事实，参见 [实践流程](workflow.md)。
