[English](README.md) | [简体中文](README.zh-CN.md)

# Vulcan Mermaid

An independent LuaSkill for local architecture documents, adapted from [oh-my-mermaid](https://github.com/oh-my-mermaid/oh-my-mermaid), built on the LuaSkills demo-skill development scaffold. One public tool, `vulcan-mermaid-workspace`, uses an `action` parameter instead of a growing list of tools.

## Quick start

`PWD` is optional project context. A supporting host hides it from model-facing arguments and injects the absolute project directory before invocation. With that context, use relative node paths; for standalone calls either provide PWD explicitly or use complete absolute `.omm` paths. The skill never infers context from environment variables, its installation directory, or the managed Node process cwd.

```json
{
  "PWD": "D:/work/my-project",
  "action": "write",
  "writes": [
    {"path":"architecture","fields":{"description":"Local application architecture","diagram":"graph LR\napi[API] -->|queries| store[Store]"}},
    {"path":"architecture/store","fields":{"description":"Persistence boundary","constraint":"Keep writes transactional."}}
  ]
}
```

Then call `{"PWD":"D:/work/my-project","action":"export"}` and open `.omm-export/architecture.html` directly in a browser. The single HTML file contains data, layout code, fonts from the operating system, and all viewer code. It works without a server or internet connection. Export again after changing the workspace. **The exported file contains the selected documentation; share it only with its intended readers.**

Without PWD, use `{"action":"read","path":"D:/work/my-project/.omm/architecture"}` or `{"action":"export","path":"D:/work/my-project/.omm"}`. On Linux/macOS use `/home/user/project/.omm/...`. The project directory must already exist; init/write can create the workspace and new nodes. `{"action":"diff","before":"graph LR\nA[Old]","after":"graph LR\nA[New]"}` needs no project context or filesystem access.

## One tool, nine actions

| action | Parameters beyond PWD/action | Result |
| --- | --- | --- |
| `init` | `.omm` root `path`; optional with PWD | Create `.omm/config.yaml` when absent |
| `tree` | optional `path` | Paths, existing fields, direct children |
| `read` | `path` | All fields and optional metadata |
| `write` | `writes: [{path, fields}]` | Changed fields for each node; creates ancestors |
| `delete` | `path`, optional `recursive` | Move node to `.omm/.trash`; children require `recursive:true` |
| `validate` | optional `path` | Syntax and reference diagnostics with line numbers |
| `diff` | `path` **or** `before` + `after` | Previous/current or explicit source comparison |
| `refs` | optional `path` | Incoming/outgoing references, including nested nodes |
| `export` | optional `path`, `output` | Self-contained HTML under `.omm-export/` |

With PWD, `path` and `writes[].path` accept node keys such as `architecture/api/auth` or `.omm/architecture/api/auth`. Without PWD they must be absolute locations including `.omm`; actions marked with optional path above require an absolute root/subtree path in this mode. Absolute paths also work with PWD and select their own workspace; a write batch must resolve to one project. Root selectors are valid for init/tree/validate/refs/export, but read/write/delete/history diff require nodes.

`output` defaults to `.omm-export/architecture.html` within the selected project. With PWD, a single `.html` filename is allowed; without PWD an explicitly supplied output must be absolute. Absolute outputs must be direct `.html` files inside that project's `.omm-export`. Scope includes descendants. References resolve against the complete workspace; scoped exports disable excluded targets but retain global reference names. Incorrect or irrelevant parameters fail explicitly.

Filesystem success returns `{ok:true,action,workspace,result}`, where workspace is the absolute `.omm` directory. tree/read/write also return reusable `absolute_path` values beside logical node paths. Text-only diff omits workspace. Errors use `{ok:false,error:{code,message}}`; a failed managed runtime invocation is a host tool error.

## Categorized help

The manifest exposes one help index and eight topics: [workspace](help/workspace.md), [paths](help/paths.md), [browse](help/browse.md), [edit](help/edit.md), [analyze](help/analyze.md), [export](help/export.md), [workflow](help/workflow.md), and [errors](help/errors.md). Start with the [help index](help/help.md) for navigation and examples. Help uses the host's existing help system; no extra workspace tool is added.

## On-disk compatibility

The existing `.omm` format remains version **0.1.0**, independently of the skill package version. Perspective directories nest directly. Fields are `description`, `diagram`, `constraint`, `concern`, `context`, `todo`, and `note`; `diagram` maps to `diagram.mmd`, all others to `<field>.md`. Metadata remains YAML, preserving upstream optional and unknown properties. The skill updates timestamps, counters, parent children, and `prev_diagram`. It preserves existing Git metadata but does not collect new Git information.

An identical write is a no-op. A changed diagram saves its exact previous source even when the old node lacked metadata. Diff tracks labels, shapes, classes, direction, edge labels/types/multiplicity, styles, and **all source changes**. `has_changes` includes whitespace/comments; `complete:false` means semantic parsing could not account for all syntax. Missing history returns `NO_HISTORY`, never an invented empty baseline.

## Supported diagrams and viewer

This release preserves the upstream architecture viewer's **flowchart** focus, not the complete Mermaid language. It supports `graph`/`flowchart` with LR/RL/TD/TB/BT, node IDs containing ASCII letters/digits/underscores and internal hyphens, square/round/circle/stadium/diamond/subroutine/cylinder labels, chains, `-->`, `---`, `--o`, `--x`, `-.->`, `==>`, `~~~`, pipe labels, `-- text -->`, `class`, `classDef`, and inline `:::class`. Use quoted labels for punctuation and `\n` for line breaks. Node labels render as plain text. Class colors support literal hexadecimal `fill`, `stroke`, and `color` only; other style properties are retained in diff but not rendered.

Unsupported syntax (including subgraph, click directives, other diagram families, and initialization directives) produces explicit diagnostics. The viewer shows source and diagnostics instead of rendering a misleading partial graph. Use nested `.omm` nodes for hierarchy. `@perspective` references retain upstream semantics; `@perspective/child` supports exact nested targets. A graph node links only to its current document's child with the same ID, or to an explicit reference label. Equal child names in different perspectives do not collide.

The viewer offers search, hierarchy navigation, pan/zoom/fit, light/dark themes, field/source/history tabs, and reference navigation. Fields use a safe Markdown subset (headings, paragraphs, bullet lines, fenced code); raw HTML and links remain literal text. No remote scripts, fonts, fetch requests, live reload, login, cloud sync, or background server are included.

## Filesystem and limits

Paths reject traversal, Windows reserved devices, ADS, unsafe separators, trailing dots/spaces, and links/junctions below the selected project root. Hard-linked field files are rejected. PWD may resolve to a real project directory; it is context rather than an authorization boundary. Windows supports drive/UNC absolute paths, unambiguous drive/UNC verbatim prefixes, and native backslashes in relative node paths. Drive-relative/root-relative paths and device namespaces are rejected. Empty PWD behaves as omitted; a malformed nonempty PWD never falls back to cwd. The workspace is **not an OS sandbox** against another process maliciously changing filesystem entries during a call.

Batch inputs and existing target metadata are checked before field writes. Cooperating calls serialize with `.omm/.vulcan-mermaid.lock`; a crashed owner's lock must be inspected and removed manually. Individual files use temporary-file replacement; a batch is **not a crash-atomic multi-file transaction**. An I/O failure can leave a partial batch, so check the error and read affected nodes before retrying. Deletion is recoverable by manually moving the returned trash directory back to its original path and rebuilding parent metadata with a write.

Limits: 100 writes per batch, 1 MiB per field/metadata file, 16 MiB scanned workspace/batch, 1,000 nodes, 16 path segments, 200 graph nodes/400 edges per diagram. Read operations do not initialize a missing workspace. Unknown persisted format versions fail explicitly.

## Development and packaging

Baseline: `.luaskills-version` pins the [luaskills-debug](https://github.com/LuaSkills/luaskills-debug) release **v0.8.1** (its major and minor version follow the embedded LuaSkills runtime); `dependencies.yaml` pins managed Node **24.18.0** and pnpm **11.11.0**. First-time development setup requires network access to verified official runtime downloads and locked npm packages; exported viewers are fully offline. Python 3.11+ and PyYAML are needed for development scripts.

`scripts/setup_debug.ps1` / `scripts/setup_debug.sh` download `luaskills-debug-tool-{platform}.tar.gz` and `luaskills-debug-checksums.txt` from the luaskills-debug release, verify the archive's SHA-256 against its checksums line, and extract it into the Git-ignored `.luaskills-debug/` (which must not be a symbolic link or junction). Lua runtime packages, Node.js and pnpm are then installed by the `setup_runtime` and `scripts/deps/fetch_managed_runtimes.*` scripts that ship inside the verified archive.

`scripts/debug_skill.ps1 -Command <command>` / `bash scripts/debug_skill.sh <command>` call `.luaskills-debug/bin/luaskills-debug` directly under a repository lock, passing the repository root as `--skill-path`. `sync`, `inspect`, `list-tools` and `call` copy the skill into `.luaskills-debug/runtime/`; the copy skips `.git`, `node_modules`, `__pycache__`, `.luaskills-debug`, `target` and `.svn` everywhere, and `dist`, `temp`, `state`, `databases`, `dependencies`, `lua_packages`, `libs` and `out` at the root. `validate` applies the LuaSkills packaging rules; `package` writes the standard-layout release assets to `dist/`.

```powershell
python -m pip install pyyaml
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify_skill.ps1
```

```sh
python3 -m pip install pyyaml
bash scripts/verify_skill.sh
```

Verification runs the release-version tests, managed Node tests, Windows-neutral asset building (`scripts/build_viewer.mjs`), and the luaskills-debug `sync -> inspect -> list-tools -> call` flow for all nine actions in explicit-PWD and no-PWD absolute modes, then `validate` and `package`, which write `vulcan-mermaid-v<version>-skill.zip` and `vulcan-mermaid-v<version>-checksums.txt` to `dist/`. The runtime tool count is asserted to be exactly one. The ZIP has one `vulcan-mermaid/` top-level directory holding `skill.yaml`, `dependencies.yaml`, the READMEs, `LICENSE`, `runtime/`, `node/`, `help/`, `overflow_templates/`, `resources/` and `licenses/`; dependencies, examples, tests, scripts and `.agents` never enter it. The built viewer assets (`resources/dagre.min.js` and the copied licenses) are committed, so packaging needs no build step.

On a `v*` tag, the release workflow runs the `LuaSkills/luaskills-debug@v0.8.1` action (`layout: standard`, `expect-tag` set to the tag, which must equal `v<skill.yaml version>`) and publishes its assets with `gh release create`. The validate workflow runs the verification flow on Linux, Windows and macOS and uploads `dist/*`. This repository does not automatically publish or configure a remote.

`examples/upstream/.omm` contains the complete imported upstream sample (62 nodes, 6 diagrams); copy it to a disposable project to explore it. `examples/workspace.args.json` and `examples/absolute.args.json` show the two path modes. See [help/workspace.md](help/workspace.md) for the tool contract and [licenses/THIRD_PARTY_NOTICES.md](licenses/THIRD_PARTY_NOTICES.md) for provenance.
