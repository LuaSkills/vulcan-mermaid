# 校验、差异与引用

返回 [分类目录](help.md) · [路径规则](paths.md)。

## validate

```json
{"action":"validate","path":"D:/work/project/.omm"}
```

result.valid 表示是否没有错误；result.nodes 提供每节点 valid 和 issues。语法问题保留源码行号；没有图是 warning，不直接令整体失败。子树检查仍用完整工作区解析引用，缺失引用是 error，自引用是 warning。

## diff：历史或显式源码

```json
{"action":"diff","path":"D:/work/project/.omm/architecture"}
```

读取 prev_diagram 与当前 diagram 比较；首次写入、没有图或没有历史返回 NO_HISTORY。

```json
{"action":"diff","before":"graph LR\napi[旧标签] --> store","after":"graph LR\napi[新标签] --> store"}
```

第二种形式完全不访问文件系统，也不需要 PWD；两个字符串均必填，允许空字符串。不能同时传 path。即使宿主注入 PWD，显式文本比较也不会读取该目录。

差异覆盖节点标签、形状、类、边的文字/类型/重复数、图方向、样式和源码变化。`has_changes` 根据完整源码判断，空白与注释变化也可为 true。`complete:false` 表示至少一侧语义解析不完整，不能将空的语义差异列表当成没有变化。

## refs

```json
{"action":"refs","path":"D:/work/project/.omm/architecture/store"}
```

返回 references 数组，元素为 `{source,target,exists}`；source 和 target 是完整逻辑节点键。范围查询同时包含传入、传出引用及后代引用，目标存在性依据整个工作区。

图标签 `"@architecture/store"` 指向该精确文档。普通节点 ID 只链接到当前文档的同名直接子节点；不同视角中的同名子节点不会互相覆盖。引用始终使用逻辑键，不填写本机绝对路径。

## 支持的流程图语法

支持 `graph` / `flowchart` 的 LR、RL、TD、TB、BT；节点 ID 使用 ASCII 字母、数字、下划线和内部连字符。支持方形、圆角、圆形、体育场、菱形、子程序和圆柱，链式连线、`-->`、`---`、`--o`、`--x`、`-.->`、`==>`、`~~~`、管道边文字和 `-- text -->`，以及 class/classDef/:::class。

标签有标点时使用双引号，换行写 `\n`。十六进制 fill、stroke、color 会显示在查看器；其他样式仍参与差异。subgraph、click、初始化指令和其他图族（如 sequenceDiagram）给出显式诊断；查看器保留源码，不绘制误导的局部图。用嵌套文档表达层级。
