# Initialize and edit a workspace

[Skill index](../SKILL.md) | [Path rules](paths.md)

## Initialize with `init`

```json
{"action":"init","path":"D:/work/project/.omm"}
```

The project directory must exist. Initialization creates `.omm/config.yaml` with format version 0.1.0 and preserves existing supported configuration and documents. Omit `path` when PWD is available. The `write` action also initializes a missing workspace.

## Update related nodes in one `write` call

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture","fields":{"description":"Application architecture","diagram":"graph LR\napi[API] --> store[Storage]"}},{"path":"D:/work/project/.omm/architecture/store","fields":{"description":"Persistence boundary","constraint":"Publish events after the transaction commits."}}]}
```

Each batch accepts 1 to 100 items with a node `path` and nonempty `fields`. With PWD, use relative paths such as `architecture` and `architecture/store`. All paths must resolve to the same workspace and be unique after normalization, including when a batch mixes relative and absolute paths. A preflight error leaves fields unchanged. A disk I/O failure may leave partial writes.

| Field | File | Purpose |
| --- | --- | --- |
| `description` | `description.md` | Overview |
| `diagram` | `diagram.mmd` | Architecture flowchart source |
| `constraint` | `constraint.md` | Design constraints |
| `concern` | `concern.md` | Risks and concerns |
| `context` | `context.md` | Background and source evidence |
| `todo` | `todo.md` | Pending work |
| `note` | `note.md` | Additional notes |

All field values must be strings. Pass an empty string to clear a field, or omit it to preserve it. The tool manages internal fields such as `meta`, `children`, and `prev_diagram`. It creates missing ancestors and maintains parent-child relationships.

Identical content leaves counters, timestamps, and history unchanged. A diagram edit saves the previous source verbatim as `prev_diagram` and retains one prior revision. Each item returns `path`, `absolute_path`, and `changed_fields`.

## Move a node to trash with `delete`

```json
{"action":"delete","path":"D:/work/project/.omm/architecture/store"}
```

Deleting a node with descendants requires `recursive:true`. Otherwise the tool returns `HAS_CHILDREN`. The workspace root cannot be deleted. Success returns the original logical `path` and a project-relative `trash_path`. Resolve `trash_path` from the parent directory of the returned `workspace`.

To restore a node, confirm the original location is unoccupied and move the directory from the exact returned trash location. Use `write` to synchronize the parent's `children` metadata. Restoration is manual.

The tool checks the entire batch and existing metadata before writing. Cooperative operations use an exclusive lock, and individual files are replaced from temporary files. A crash may leave changes across only some files. After a failure, check the affected nodes with `read` before retrying. See [Errors and recovery](errors.md).
