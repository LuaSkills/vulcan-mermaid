# Export and browse offline HTML

[Skill index](../SKILL.md) | [Path rules](paths.md)

## Export

```json
{"action":"export","path":"D:/work/project/.omm"}
```

The default output is `D:/work/project/.omm-export/architecture.html`. To specify an output without PWD, pass an absolute path:

```json
{"action":"export","path":"D:/work/project/.omm/architecture","output":"D:/work/project/.omm-export/architecture-review.html"}
```

With PWD, `output` may be a filename such as `architecture-review.html`. The file must have an `.html` extension and sit directly under the selected project's `.omm-export` directory. Omit `output` to use the default. Export replaces an existing snapshot with the same name.

The result includes `file` (the absolute output path), `nodes`, `bytes`, `offline:true`, and `validation`. Export includes diagnostics even when a diagram fails validation. Run `validate` first when a valid diagram is required.

## Viewer

Open the returned HTML in a browser. The overview follows oh-my-mermaid. It lays out top-level views in a balanced grid and embeds child diagrams and `@` reference targets as scaled subgraphs up to six levels deep. Each document is embedded at most once. A fan-out of more than three leaves uses a compact three-column grid. Wide graphs switch to vertical layout. Curved edges retain arrow types and labels.

Drag or scroll to pan. Use Ctrl/Command with the wheel or pinch to zoom. Click a group or node to focus it and open its details drawer. Press Esc or click the canvas background to close the drawer. Detail visibility changes with zoom. The viewer supports search, hierarchical navigation, light and dark themes, field/source/history tabs, and reference navigation. Re-export after updating the workspace to refresh the read-only snapshot.

The HTML embeds the documents, parser, Dagre layout pipeline, and viewer code. It uses system fonts and works without a server or a network connection. It renders fields with a safe Markdown subset and displays raw HTML and external links as literal text. Initial runtime and dependency setup may require network access.

When `path` selects a subtree, the file embeds only that subtree's documents. Its root appears as an overview group even if it is nested or has no graph. A root without a graph displays descendants that have graphs. Reference resolution uses the entire workspace, so the relationship table can list logical keys outside the selected scope. Those targets cannot be opened in the snapshot. An unembedded `@` reference opens its target if the target is included. Local absolute project paths are omitted. Before sharing, check the embedded documents and relationship table.
