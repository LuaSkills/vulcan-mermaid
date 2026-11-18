# Build architecture documentation from source

[Skill index](../SKILL.md) | [Workspace actions](workspace.md)

1. Use the host's project context if it injects PWD. Otherwise use an absolute `.omm` path. Keep the workspace inside the project you are documenting.
2. Inspect the source, types, and call sites to identify a small set of architectural views. Use `tree` and `read` to inspect any existing documentation. Confirm relationships in the source before documenting them.
3. Batch related nodes and fields in one `write` call. Use `diagram` for structure, `context` for source evidence, and `constraint` and `concern` for design constraints and risks.
4. Split large graphs into nested nodes. A plain graph node ID points to a direct child. Use `@perspective/child` for references across architectural views.
5. Run `validate` for syntax and missing references. Run `refs` to inspect inbound and outbound relationships. After an update, use a history `diff` to check the changes. For the first write, use explicit `before` and `after` values when you have a baseline.
6. Run `export` to generate offline HTML. Check `result.validation`, then open the returned `file`. Re-export after updates.

This example runs without PWD. The project directory `D:/work/project` must already exist.

```json
{"action":"write","writes":[{"path":"D:/work/project/.omm/architecture","fields":{"description":"Verified API and storage boundaries","diagram":"graph LR\napi[API] --> store[Storage]"}},{"path":"D:/work/project/.omm/architecture/store","fields":{"description":"Persistence implementation","diagram":"graph TD\nrequest[Request] --> disk[(Disk)]"}}]}
```

```json
{"action":"validate","path":"D:/work/project/.omm"}
```

```json
{"action":"export","path":"D:/work/project/.omm"}
```

The source repository includes a full example in `examples/upstream/.omm` (62 nodes and 6 diagrams). Copy it to a separate practice project first. The example is absent from the installed package. In the source repository, `examples/workspace.args.json` shows a debugger call with explicit PWD, and `examples/absolute.args.json` shows a call with absolute paths.
