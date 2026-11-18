# Browse and read workspace nodes

[Skill index](../SKILL.md) | [Path rules](paths.md)

The examples without absolute paths require host-injected PWD. In a standalone call, supply PWD explicitly or use an absolute `.omm` path.

## Discover nodes with `tree`

```json
{"action":"tree"}
```

```json
{"action":"tree","path":"D:/work/project/.omm/architecture"}
```

`result` contains `exists` and `nodes`. Each node includes its logical `path`, `absolute_path`, available `fields`, and the logical paths of its direct `children`. A subtree query includes all descendants. Internal locks and trash entries are omitted.

A missing workspace returns `exists:false` and an empty `nodes` array. Browsing does not create `.omm`. An explicitly requested missing node returns `NOT_FOUND`.

## Read a node with `read`

```json
{"action":"read","path":"D:/work/project/.omm/architecture/api"}
```

The result includes `path`, `absolute_path`, `fields`, and `meta`. `fields` contains whichever of the seven defined fields exist. Empty strings are preserved and absent fields are omitted. An upstream node without `meta.yaml` returns `meta:null`. Malformed metadata produces an error.

Use `absolute_path` from `tree` to identify the exact node, especially when multiple views have nodes with the same name. Pass the node directory, and leave out field filenames such as `diagram.mmd` or `description.md`.

For a partial update, read the current values first and include only the fields you want to change in `write`. Omitted fields are preserved. See [Edit](edit.md).
