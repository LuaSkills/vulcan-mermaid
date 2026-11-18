# Errors, limits, and recovery

[Skill index](../SKILL.md) | [Path rules](paths.md)

Check `ok` before reading `result`. An error contains a code and a message with details. Underlying filesystem errors retain their operating system codes.

| Code | Meaning and recovery |
| --- | --- |
| `ABSOLUTE_PATH_REQUIRED` | A relative path or an omitted scope requires PWD. Supply a valid PWD or pass an absolute `.omm` path. |
| `INVALID_PWD` | Supply the absolute path of an existing project directory. |
| `INVALID_WORKSPACE_PATH` | Supply an absolute root or node path with exactly one lowercase `.omm` segment. |
| `WORKSPACE_PATH_REQUIRED` | `init` requires an absolute `.omm` root, or an omitted `path` when PWD is available. |
| `NODE_PATH_REQUIRED` | `read`, `write`, `delete`, and history `diff` require a node. Use `tree` to find one. |
| `INVALID_PATH` | Fix the path segment, separator, reserved name, trailing dot or space, length, or depth reported in the message. |
| `INVALID_OUTPUT_PATH` | Export to a direct `.html` file under the selected project's `.omm-export` directory. |
| `CROSS_WORKSPACE` | Split a batch spanning multiple projects into one call per project. |
| `CASE_COLLISION` | Use the exact spelling returned by `tree`. |
| `INVALID_ARGUMENT` | Check the action's supported fields, argument combinations, and types. Remove duplicate nodes from write batches. |
| `NOT_FOUND` | The requested node is missing. Use `tree` to locate it or `write` to create it. |
| `INVALID_TYPE` | Use a node directory for a node path. A field file such as `diagram.mmd` is invalid. |
| `UNSAFE_LINK` | Use ordinary directories and files in place of links, junctions, or hard-linked field files. |
| `NO_HISTORY` | The node has no prior diagram. Compare explicit `before` and `after` inputs or update the diagram before comparing history. |
| `HAS_CHILDREN` | Confirm the deletion scope and set `recursive:true` to include descendants. |
| `INVALID_OMM` | Inspect invalid YAML or metadata and preserve the original before repairing it. |
| `UNSUPPORTED_FORMAT` | `config.yaml` must declare version 0.1.0. Unknown formats require explicit migration. |
| `WORKSPACE_BUSY` | Wait for the current operation. After a crash, confirm no call is active before removing a stale lock. |
| `LIMIT_EXCEEDED` | Split a batch or reduce the request or workspace size as indicated. |
| `ENOENT`, `EACCES`, `EPERM`, or another OS code | Use the error message to locate the missing path, permission issue, or other I/O failure. |

## Limits

A write batch accepts up to 100 entries. Each field or metadata file is limited to 1 MiB, and a workspace scan or batch to 16 MiB. A workspace supports up to 1,000 document nodes. A logical path allows 512 characters, 16 levels, and 80 characters per segment. Absolute inputs allow 4,096 characters. A graph allows up to 200 nodes and 400 edges. The operating system can impose shorter path limits.

## Retry and recovery

Text diff runs without filesystem access. Other actions require explicit PWD or an absolute `.omm` location. Fix argument or path validation errors before retrying.

Writes replace individual files from temporary files in the same directory. A crash or I/O failure can leave a batch partially written. Use `read` to check affected nodes before retrying. Deletion moves a node into `.omm/.trash` and returns a project-relative `trash_path`. See [Edit](edit.md) for manual recovery.

Path checks and cooperative locks assume other processes are not replacing directories during an operation. See the source repository's verification records for tested platforms.
