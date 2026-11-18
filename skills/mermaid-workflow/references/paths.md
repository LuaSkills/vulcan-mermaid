# Workspace paths and host-injected PWD

[Skill index](../SKILL.md) | [Workspace actions](workspace.md)

## With host-injected PWD

The top-level input schema declares an optional string `PWD`. A host that supports this convention hides the argument from the model and injects the absolute project directory before execution when the project context is known. The tool receives `PWD` as an ordinary argument and uses only the supplied path context.

For a host project at `D:/work/project`, send:

```json
{"action":"read","path":"architecture/api"}
```

In the standalone debugger, supply the project directory explicitly:

```json
{"PWD":"D:/work/project","action":"read","path":"architecture/api"}
```

`PWD` must be the absolute path of an existing project directory outside `.omm`. Omit it or pass an empty string to use absolute-path mode. An invalid, relative, or missing directory causes an error when supplied as a nonempty `PWD`. The field name is case-sensitive and `pwd` is rejected. Environment variables such as `PWD` and `WORKSPACE_ROOT`, the skill directory, and the process working directory never supply this argument.

## Absolute paths without PWD

Pass an absolute path for every explicit `path` and `writes[].path`. Each must contain exactly one directory segment named `.omm`. The project directory must exist. The `.omm` directory and nodes to be written may be created during a write. Pass a node directory for a node operation.

```json
{"action":"init","path":"D:/work/project/.omm"}
```

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture/api","fields":{"description":"API boundary"}}]}
```

```json
{"action":"read","path":"D:/work/project/.omm/architecture/api"}
```

On Linux or macOS, use a path such as `/home/user/project/.omm/architecture/api`. Absolute paths also work when PWD is set. Each absolute path selects its own workspace. PWD resolves relative paths. All entries in a write batch must resolve to the same project.

## Workspace roots and nodes

| Input | With PWD | Without PWD |
| --- | --- | --- |
| Workspace root | Omit `path` where allowed, or pass `.omm` or `.omm/`. | Pass an absolute root such as `/project/.omm` or `D:/project/.omm`. |
| Node | Pass `architecture/api` or `.omm/architecture/api`. | Pass an absolute path ending in `.omm/architecture/api`. |
| Export `output` | Pass a filename such as `report.html` or an absolute output path. | Pass an absolute output path when specifying `output`. |

`init` accepts only the workspace root. `read`, `write`, `delete`, and history `diff` require a node. `tree`, `validate`, `refs`, and `export` accept the root or a subtree. Export writes an `.html` file directly under the selected project's `.omm-export`. The default is `.omm-export/architecture.html`.

## Windows and portability

Windows accepts JSON paths such as `D:/work/project/.omm/api` and `D:\\work\\project\\.omm\\api`. Forward slashes avoid escaping. Windows also accepts accessible absolute UNC shares and unambiguous extended paths such as `\\?\D:\...` or `\\?\UNC\server\share\...`. Provide the actual share path.

Windows also allows backslashes in relative node paths. Linux and macOS use `/`. Drive-relative `D:project` and root-relative `\project` are invalid. The tool rejects device and pipe namespaces, `.` and `..` segments, hidden nodes, reserved Windows names, alternate data streams, case aliases, and node names ending in a dot or space. `.omm` is the workspace root and cannot be written as a node.

The `.omm` segment in an absolute path must be lowercase and appear exactly once. Logical node paths have a limit of 512 characters and 16 levels, with up to 80 characters per segment. Absolute inputs have a limit of 4096 characters and also follow platform path limits. Directory junctions and symbolic links below the project root and hard-linked field files are rejected.

Reuse `absolute_path` from `tree`, `read`, or `write` in subsequent calls. Document references and `.omm` metadata use logical keys. Offline HTML omits local absolute project paths.
