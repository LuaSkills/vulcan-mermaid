# AI Invocation Debugging Guide

## Contents

- [Goal](#goal)
- [First-Time Setup](#first-time-setup)
- [Standard Debug Sequence](#standard-debug-sequence)
- [Invocation Arguments](#invocation-arguments)
- [Output Modes](#output-modes)
- [Troubleshooting](#troubleshooting)
- [Pre-Release Closure](#pre-release-closure)

## Goal

Validate the repository through the same `load_from_roots -> call_skill` path used by the formal host. The repository wrapper passes the repository root to `.luaskills-debug/bin/luaskills-debug` as `--skill-path`. luaskills-debug copies it to `.luaskills-debug/runtime/skills/<skill-id>` and loads it from the isolated runtime root. The copy skips `.git`, `node_modules`, `__pycache__`, `.luaskills-debug`, `target`, and `.svn` at any depth, and `dist`, `out`, `temp`, `state`, `databases`, `dependencies`, `lua_packages`, and `libs` at the repository root. Never replace formal invocation with direct Lua file execution.

## First-Time Setup

Windows:

```powershell
.\scripts\setup_debug.ps1
```

Linux/macOS:

```bash
bash ./scripts/setup_debug.sh
```

Require the setup script to:

1. Read the pinned luaskills-debug release tag from `.luaskills-version`.
2. Select the exact `luaskills-debug-tool-{platform}.tar.gz` asset of `https://github.com/LuaSkills/luaskills-debug/releases/download/<tag>/` for the current operating system and CPU architecture.
3. Download the archive and the release's `luaskills-debug-checksums.txt`.
4. Verify the archive's SHA-256 against its line in the checksums file before extraction.
5. Store the complete debugger workspace under the Git-ignored `.luaskills-debug/` directory, which must not be a symbolic link or junction.
6. Run the archive's `setup_runtime` flow to download matching Lua runtime packages.
7. Install Node.js `24.18.0` with pnpm `11.11.0` through the archive's `scripts/deps/fetch_managed_runtimes.*`; the archive checksum already covers the fetcher.

Use `-Force` or `--force` to rebuild the workspace. When only the debugger binary is needed, pass both `-SkipRuntimeSetup -SkipManagedNodeSetup` or `--skip-runtime-setup --skip-managed-node-setup`.

## Standard Debug Sequence

After changing an entry or manifest, follow this fixed sequence:

1. `inspect`: validate the manifest, physical directory binding, entry files, and formal engine loading.
2. `list-tools`: confirm public and canonical tool names.
3. `call`: invoke the target tool with real arguments. If `node_runtime` is declared, invoke the managed Node.js entry in practice.
4. `validate`: apply the LuaSkills packaging rules to the repository.
5. `verify_skill`: run unit and Node tests, loading, enumeration, every action call, `validate`, and `package`.

Every debug command runs setup, synchronization, and invocation while holding a repository-level lock, which serializes concurrent commands from multiple agents or terminals.

Windows:

```powershell
.\scripts\debug_skill.ps1 -Command inspect
.\scripts\debug_skill.ps1 -Command list-tools
.\scripts\debug_skill.ps1 -Command call -Tool workspace -ArgsFile .\examples\workspace.args.json -Output json
.\scripts\debug_skill.ps1 -Command validate
.\scripts\verify_skill.ps1
```

Linux/macOS:

```bash
bash ./scripts/debug_skill.sh inspect
bash ./scripts/debug_skill.sh list-tools
bash ./scripts/debug_skill.sh call --tool workspace --args-file ./examples/workspace.args.json --output json
bash ./scripts/debug_skill.sh validate
bash ./scripts/verify_skill.sh
```

## Invocation Arguments

- Use `ArgsJson` or `--args-json` for small payloads.
- Store large or heavily escaped payloads in JSON files and use `ArgsFile` or `--args-file`.
- Use only tool names confirmed by `list-tools`; never guess an entry name.
- Enable `EnableHostResult` or `--enable-host-result` only when explicitly testing the `host_result` bridge.

Example argument file:

```json
{
  "PWD": "D:/work/my-project",
  "action": "tree"
}
```

## Output Modes

- `pretty`: default human-readable diagnostics for interactive troubleshooting.
- `json`: complete structured output for exact field assertions and automation.
- `content`: tool content only, for validating final user-visible output.

Use `json` whenever evaluating return fields, error kinds, or context ownership. Never infer an internal structure from `pretty` output.

## Troubleshooting

### Download or Checksum Failure

Confirm that the luaskills-debug Release pinned by `.luaskills-version` contains the exact current-platform archive and that `luaskills-debug-checksums.txt` lists it. Never skip checksum verification. Remove `.luaskills-debug/` and use a forced rebuild when a fresh download is required.

### `inspect` Failure

Read the exact `skill.yaml`, entry file, and synchronization paths reported by the error before changing the manifest. Do not add speculative optional-field fallbacks to bypass the failure.

### Missing `list-tools` Entry

Check `skill.yaml.entries[].name`, `lua_entry`, and the physical file, then rerun `inspect`. Confirm the canonical tool name from debugger output.

### Invalid `call` Arguments

Read `skill.yaml.entries[].input_schema` and the target Lua entry. Confirm required fields, types, and return contracts. The debugger does not inject project context: edit the example PWD to an existing project directory, or use `examples/absolute.args.json` with complete `.omm` locations and omit PWD. Verify both modes through `scripts/verify_runtime.py`; it also checks the synchronized help index and topics. Move complex payloads to JSON files so shell escaping cannot alter them.

### Unavailable Dependency

Distinguish Lua runtime packages, skill-owned `dependencies.yaml`, and host-managed capabilities. Repair only the layer identified by the debugger's real error, and never hard-code dependency paths into source code.

## Pre-Release Closure

After `verify_skill` succeeds, inspect `dist/` and require:

- `<skill-id>-v<version>-skill.zip` as the package name.
- `<skill-id>-v<version>-checksums.txt` as the checksum filename.
- Exactly one `<skill-id>/` top-level directory in the zip.
- No AI prompts, downloaded debugger files, Actions, scripts, or caches in the zip.
- `.luaskills-debug/` reported as ignored by `git status --short --ignored`.

Finally, commit every intended change and invoke the release script with the version declared by `skill.yaml`. The script reruns the same validation and packaging flow before pushing the exact tag. The Release Action (`LuaSkills/luaskills-debug@<tag>`) validates and packages again, rejects a tag that differs from `skill.yaml.version`, and the workflow publishes the assets with `gh release create`.
