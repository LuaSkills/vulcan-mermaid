# 初始化与编辑

返回 [分类目录](help.md) · [路径规则](paths.md)。

## init

```json
{"action":"init","path":"D:/work/project/.omm"}
```

项目目录必须已存在；初始化创建 `.omm/config.yaml`，格式版本固定 0.1.0。已有受支持配置保持不变，不覆盖工作区文档。有 PWD 时可省略 path。write 也会自动初始化工作区。

## write：一次提交相关节点和字段

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture","fields":{"description":"应用架构","diagram":"graph LR\napi[API] --> store[存储]"}},{"path":"D:/work/project/.omm/architecture/store","fields":{"description":"持久化边界","constraint":"事务提交后再发布事件"}}]}
```

每批 1..100 项，每项必须有节点 path 和非空 fields。有 PWD 可改用 `architecture`、`architecture/store`。所有路径归属同一实际工作区，规范化后不得重复；混合绝对和相对形式也不能重复。预检失败不会写入字段；实际磁盘 I/O 失败可能导致部分写入。

| 字段 | 文件 | 用途 |
| --- | --- | --- |
| description | description.md | 概述 |
| diagram | diagram.mmd | 架构流程图源码 |
| constraint | constraint.md | 约束 |
| concern | concern.md | 风险与关注点 |
| context | context.md | 背景及源码依据 |
| todo | todo.md | 待办 |
| note | note.md | 补充说明 |

字段值必须为字符串；传空字符串清空内容，省略则保留。不能写入 meta、children、prev_diagram 等内部字段。写入自动创建祖先并维护父子元数据。

相同内容不修改计数、时间戳或历史；图源码变化保存准确旧图到 prev_diagram。仅保留一个上一版本，不是无限版本仓库。返回每项的 path、absolute_path 和 changed_fields；实际变更以返回值为准。

## delete：移到回收目录

```json
{"action":"delete","path":"D:/work/project/.omm/architecture/store"}
```

有后代时必须 `recursive:true`，否则 HAS_CHILDREN。不能删除 `.omm` 工作区根。成功返回原逻辑 path 和项目相对 trash_path，实际位置可由 workspace 的父目录拼接 trash_path 得到。

恢复时先确认原位置未被占用，再将返回的回收目录手动移回原节点目录，并通过 write 同步父节点 children；没有自动 restore action。不要凭时间戳猜测回收位置。

写入前检查完整批次和已有元数据；协作操作使用独占锁，单文件使用临时文件替换。批次不保证跨文件崩溃原子性；故障后先 read 核对再重试。详见 [错误与恢复](errors.md)。
