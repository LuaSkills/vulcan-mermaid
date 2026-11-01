# 浏览与读取

返回 [分类目录](help.md) · [路径规则](paths.md)。以下短路径示例要求宿主已暗传 PWD；独立调用请显式提供 PWD，或替换为完整 `.omm` 路径。

## tree：发现节点

```json
{"action":"tree"}
```

```json
{"action":"tree","path":"D:/work/project/.omm/architecture"}
```

返回 `result.exists` 及 `result.nodes`。每个节点包含逻辑 `path`、完整 `absolute_path`、已有字段名 `fields` 和直接子节点的逻辑路径 `children`。指定节点时包括其全部后代。回收目录和内部锁不会作为文档列出。

缺失的工作区返回 exists:false 和空 nodes，读取不会创建 `.omm`。显式指定不存在的子节点会返回 NOT_FOUND。

## read：读取具体文档

```json
{"action":"read","path":"D:/work/project/.omm/architecture/api"}
```

返回节点的 path、absolute_path、fields、meta。fields 是七种已定义字段的子集；空字符串保留，缺失字段省略。上游已有节点可能没有 meta.yaml，此时 meta 为 null；已有元数据畸形则明确报错。

先用 tree 的 absolute_path 精确定位节点，再 read；不要从相同尾部名称推断节点归属。不要直接把 diagram.mmd、description.md 等物理文件传给 path。

只需修改部分字段时，read 确认原值后通过 write 发送这几个字段；未提供字段保持不变。详见 [编辑](edit.md)。
