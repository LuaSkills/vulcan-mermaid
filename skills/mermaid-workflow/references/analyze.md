# Validate diagrams, compare changes, and inspect references

[Skill index](../SKILL.md) | [Path rules](paths.md)

## Validate with `validate`

```json
{"action":"validate","path":"D:/work/project/.omm"}
```

`result.valid` is true when validation finds no errors. `result.nodes` reports `valid` and `issues` for each node. Syntax issues retain source line numbers. A missing diagram and a self-reference are warnings. A missing reference is an error. Reference checks use the full workspace even when validation is scoped to a subtree.

## Compare history or explicit source with `diff`

```json
{"action":"diff","path":"D:/work/project/.omm/architecture"}
```

History mode compares `prev_diagram` with the current `diagram`. The tool returns `NO_HISTORY` for a first write or when the diagram or its history is missing.

```json
{"action":"diff","before":"graph LR\napi[Old label] --> store","after":"graph LR\napi[New label] --> store"}
```

Text mode requires both `before` and `after` and allows empty strings. Omit `path`. This form runs without filesystem access, even if the host injects PWD.

The diff covers node labels, shapes, and classes, plus edge labels, types, and multiplicity, diagram direction, styles, and source changes. `has_changes` compares the full source, so whitespace or comment changes can make it true. `complete:false` means at least one side did not parse completely. An empty semantic diff is inconclusive in that case.

## Inspect references with `refs`

```json
{"action":"refs","path":"D:/work/project/.omm/architecture/store"}
```

The `references` array contains `{source,target,exists}` records. `source` and `target` are full logical node keys. A scoped query includes incoming and outgoing links for the scope and its descendants. Existence is resolved against the entire workspace.

The label `"@architecture/store"` links to that exact document. A plain node ID links only to a direct child with that name in the current document. Children with the same name in other views stay distinct. Use logical keys for references.

## Supported flowchart syntax

Use `graph` or `flowchart` with `LR`, `RL`, `TD`, `TB`, or `BT`. Node IDs accept ASCII letters, digits, underscores, and internal hyphens. Supported shapes include rectangles, rounded rectangles, circles, stadiums, diamonds, subroutines, and cylinders. The parser supports chained edges, `-->`, `---`, `--o`, `--x`, `-.->`, `==>`, `~~~`, pipe-delimited edge labels, `-- text -->`, and `class`, `classDef`, and `:::class`.

Quote labels containing punctuation and use `\n` for line breaks. The viewer renders hexadecimal `fill`, `stroke`, and `color` values. Other styles still participate in the diff. Unsupported syntax such as `subgraph`, `click`, initialization directives, and other diagram types such as `sequenceDiagram` produces diagnostics. The viewer retains the source and skips rendering a partial graph. Use nested documents to express hierarchy.
