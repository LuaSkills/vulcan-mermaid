# Vulcan Mermaid 帮助目录

只有一个工具：`vulcan-mermaid-workspace`，通过 `action` 选择操作。先确认路径上下文，再读取对应类别。

| 主题名 | 分类 | 适合解决的问题 |
| --- | --- | --- |
| [workspace](workspace.md) | 总览 | 有哪些操作？参数及返回值如何组织？ |
| [paths](paths.md) | 路径基础 | 宿主如何暗传 PWD？没有 PWD 时怎样传完整路径？ |
| [browse](browse.md) | 浏览与读取 | 怎样列出节点、读取字段并复用结果路径？ |
| [edit](edit.md) | 初始化与编辑 | 怎样批量修改、保存历史及恢复删除？ |
| [analyze](analyze.md) | 校验与分析 | 支持哪些语法？怎样比较差异及检查引用？ |
| [export](export.md) | 离线导出 | HTML 保存在哪里？怎样浏览与更新快照？ |
| [workflow](workflow.md) | 实践流程 | 怎样从真实源码建立可验证的架构文档？ |
| [errors](errors.md) | 错误与限制 | 错误码是什么意思？哪些操作需要重试或修正？ |

有宿主项目上下文时，宿主在调用前暗传 `PWD`，模型侧可只发送 `{"action":"tree"}`。独立调用且没有 PWD 时，发送 `{"action":"tree","path":"D:/work/project/.omm"}`。字段名必须为大写 `PWD`；不会读取环境变量或进程 cwd。详见 [路径基础](paths.md)。

文本差异无需任何路径：`{"action":"diff","before":"graph LR\nA[旧]","after":"graph LR\nA[新]"}`。
