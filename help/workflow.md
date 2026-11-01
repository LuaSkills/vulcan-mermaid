# 从源码建立本地架构文档

返回 [分类目录](help.md) · [操作总览](workspace.md)。

1. 确认宿主具有项目上下文并暗传 PWD；否则使用完整 `.omm` 路径。不要用技能安装目录代替业务项目。
2. 查阅真实源码、类型与调用点，建立有依据的少量视角；已有文档先 tree/read。不要凭文件名推断模块关系。
3. 一次 write 批量提交相关节点及字段；diagram 描述结构，context 记录源码依据，constraint/concern 记录约束和风险。
4. 大图拆成嵌套节点。普通图 ID 对应直接子目录；跨视角引用使用 `@perspective/child`。
5. validate 处理语法和缺失引用；refs 检查入站与出站关系。更新后用历史 diff 核对实际变化；首次写入可用 before/after 明确比较。
6. export 生成离线 HTML。确认 result.validation，打开返回的 file 浏览。后续更新需重新导出。

下面是无需 PWD 的最小完整过程；`D:/work/project` 必须已存在：

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture","fields":{"description":"已验证的 API 与存储边界","diagram":"graph LR\napi[API] --> store[存储]"}},{"path":"D:/work/project/.omm/architecture/store","fields":{"description":"持久化实现","diagram":"graph TD\nrequest[请求] --> disk[(磁盘)]"}}]}
```

```json
{"action":"validate","path":"D:/work/project/.omm"}
```

```json
{"action":"export","path":"D:/work/project/.omm"}
```

源码开发仓库包含 `examples/upstream/.omm` 完整示例（62 个节点、6 张图）；复制到独立练习项目再试用。示例不进入安装包。`examples/workspace.args.json` 展示显式 PWD 调试调用，`examples/absolute.args.json` 展示完整路径调用。
