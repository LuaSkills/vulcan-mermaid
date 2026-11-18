---
name: mermaid-workflow
description: "Use for .omm workspaces, Mermaid validation and diffs, or offline HTML export."
---

# Vulcan Mermaid

Read this guide with `skill` before using `tool_call`. Set its action to `vulcan_mermaid_workspace` and select the workspace operation inside `arguments.action`. Confirm the workspace path before choosing a path-based operation.

```json
{"skill":"luaskills-vulcan-mermaid:mermaid-workflow","action":"vulcan_mermaid_workspace","arguments":{"action":"tree"}}
```

| Reference | When to read it |
| --- | --- |
| [Workspace](references/workspace.md) | Choose an action and read the response structure. |
| [Paths](references/paths.md) | Use host-injected PWD or pass an absolute path. |
| [Browse](references/browse.md) | List nodes, read fields, and reuse returned paths. |
| [Edit](references/edit.md) | Initialize a workspace, update nodes in batches, or recover a deleted node. |
| [Analyze](references/analyze.md) | Validate diagrams, compare revisions, or inspect document references. |
| [Export](references/export.md) | Export, browse, and refresh an offline HTML snapshot. |
| [Workflow](references/workflow.md) | Build and verify architecture documentation from source. |
| [Errors](references/errors.md) | Interpret error codes and decide how to recover. |

When the host supplies the project directory as `PWD`, send `{"action":"tree"}`. In a standalone call without PWD, send `{"action":"tree","path":"D:/work/project/.omm"}`. The field name is uppercase `PWD`. See [path rules](references/paths.md) for details.

A text diff runs without a path or PWD. For example, send `{"action":"diff","before":"graph LR\nA[Old]","after":"graph LR\nA[New]"}`.
