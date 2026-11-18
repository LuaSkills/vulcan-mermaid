# Workspace actions and results

[Skill index](../SKILL.md)

Call `vulcan_mermaid_workspace`. The local debugger entry is `workspace`. Every call requires `action`. Each action may require additional arguments and rejects unknown or inapplicable arguments.

| Action | Purpose | Arguments | Reference |
| --- | --- | --- | --- |
| `init` | Initialize `.omm/config.yaml`. | With PWD, `path` may be omitted. Otherwise pass the absolute `.omm` root. | [Edit](edit.md) |
| `tree` | List nodes, field names, and direct children. | `path` selects the root or a subtree and may be omitted with PWD. | [Browse](browse.md) |
| `read` | Read fields and metadata. | `path` must identify a node. | [Browse](browse.md) |
| `write` | Update fields in a batch and create missing ancestors. | `writes` contains 1 to 100 items, each with `path` and `fields`. | [Edit](edit.md) |
| `delete` | Move a node to the trash directory. | Pass a node `path`. Nodes with children require `recursive:true`. | [Edit](edit.md) |
| `validate` | Check flowcharts and document references. | `path` selects the root or a subtree and may be omitted with PWD. | [Analyze](analyze.md) |
| `diff` | Compare diagram history or two text inputs. | Use a node `path` or the pair `before` and `after`. | [Analyze](analyze.md) |
| `refs` | List document references. | `path` selects the root or a subtree and may be omitted with PWD. | [Analyze](analyze.md) |
| `export` | Generate a standalone offline viewer. | `path` selects the root or a subtree. `output` is optional. | [Export](export.md) |

Optional host-injected `PWD` enables logical paths within `.omm`. Without PWD, explicit paths must be absolute. See [path rules](paths.md).

Successful filesystem operations return `{ok:true,action,workspace,result}`. The `workspace` field is the absolute path to the workspace. A `read` result, each item in a `tree` result's `nodes`, and each item in a `write` result's `writes` also include `absolute_path` for subsequent calls without PWD. Their `path` is the logical node key within `.omm`.

A text diff returns `{ok:true,action:"diff",result}` without `workspace` and runs without filesystem access.

Domain failures return `{ok:false,error:{code,message}}`. Check `ok` before reading the result. The host reports Lua and managed Node startup failures as tool errors. See [error handling](errors.md).

To update existing documentation, use `tree`, then `read`, `write`, `validate`, `diff` or `refs`, and finally `export`. Base updates on verified source facts. See the [workflow](workflow.md).
