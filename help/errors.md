# 错误、限制与恢复

返回 [分类目录](help.md) · [路径规则](paths.md)。先检查响应 ok，再使用 result。以下是稳定领域错误，message 提供具体原因；底层文件错误会保留操作系统错误码。

| code | 含义与处理 |
| --- | --- |
| ABSOLUTE_PATH_REQUIRED | 没有 PWD 却使用相对路径或省略范围；改为完整 `.omm` 路径，或由宿主/调用方提供有效 PWD |
| INVALID_PWD | PWD 类型、完整路径或目录条件不正确；PWD 是已存在项目目录 |
| INVALID_WORKSPACE_PATH | 完整路径没有唯一小写 `.omm` 标记；改为真实工作区根或节点 |
| WORKSPACE_PATH_REQUIRED | init 指向节点；改用完整 `.omm` 根，或有 PWD 时省略 path |
| NODE_PATH_REQUIRED | read/write/delete/历史 diff 指向 `.omm` 根；先 tree 选择具体节点 |
| INVALID_PATH | 穿越、设备名称、分隔符、尾部点/空格或长度/深度违规；修正路径，勿尝试绕过 |
| INVALID_OUTPUT_PATH | 输出位置或扩展名错误；使用选定项目 `.omm-export/report.html` |
| CROSS_WORKSPACE | 同一写入批次包含不同项目；拆成各项目自己的调用 |
| CASE_COLLISION | 路径大小写存在不同拼写；采用 tree 返回的精确名字 |
| INVALID_ARGUMENT | 操作名、字段、参数组合、重复节点或类型不正确；参照对应分类 |
| NOT_FOUND | 显式目标节点不存在；先 tree 或使用 write 创建 |
| INVALID_TYPE | 路径对应文件/目录类型不符；不要把 diagram.mmd 当成节点 |
| UNSAFE_LINK | 项目内路径包含链接、目录联接或硬链接文件；改用普通独立文件目录 |
| NO_HISTORY | 没有上一版图；使用 before/after 明确比较，或在后续图更新后比较历史 |
| HAS_CHILDREN | 删除目标有后代；确认目标范围后传 recursive:true |
| INVALID_OMM | 已有 YAML/元数据不符合格式；检查文件，保留原始内容后修复 |
| UNSUPPORTED_FORMAT | config.yaml 的 version 非 0.1.0；本版本不自动转换未知格式 |
| WORKSPACE_BUSY | 协作锁存在；等待当前操作结束。崩溃后确认没有活跃调用，再手动清理锁 |
| LIMIT_EXCEEDED | 字段、批次或工作区超限；拆分文档或减小输入 |
| ENOENT / EACCES / EPERM 等 | 底层目录不存在、权限不足或系统 I/O 失败；按 message 定位实际路径 |

## 限额

每批最多 100 项，每字段及元数据文件最多 1 MiB，扫描工作区/批次最多 16 MiB，1000 个文档节点，逻辑路径 512 字符/16 层/每段 80 字符，绝对路径输入 4096 字符，每图 200 个节点和 400 条边。操作系统可能有更严格的路径限制。

## 重试与恢复

纯文本 diff 不使用文件系统。其他操作只使用明确的 PWD 或绝对 `.omm` 位置，不回退到 cwd。参数和路径预检失败应修正输入后重试。

单文件采用临时文件替换，批次不具有跨文件崩溃原子性；磁盘 I/O 失败后先 read 核对受影响节点。删除移动到 `.omm/.trash` 并返回项目相对 trash_path，不永久清除；人工恢复方式见 [编辑](edit.md)。

本实现使用路径检查和协作锁，不是抵御另一个恶意进程并发替换目录的操作系统沙箱。Linux/macOS 脚本与 CI 已配置，实际本机验收平台见开发仓库的验证记录。
