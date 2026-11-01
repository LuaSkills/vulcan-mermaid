---
name: luaskills-development
description: Develop, inspect, invoke, validate, review, package, and release LuaSkills with the official LuaSkills debugger and managed Node.js runtime. Use when creating or modifying a skill, downloading luaskills-debug, debugging Lua or Node.js entries, running iterative code reviews, generating release packages, or publishing a GitHub Release.
---

# LuaSkills Development

## Fact Baseline

1. Read `.luaskills-version` from the repository root. It names the `LuaSkills/luaskills-debug` release tag and is the single version baseline for debugger assets, the release action, and documentation. luaskills-debug major and minor versions follow the LuaSkills runtime it embeds.
2. Before editing, read `skill.yaml`, `dependencies.yaml`, the target `runtime/*.lua` file, its help file, and every relevant caller. Never guess fields, entry names, or return structures.
3. Before upgrading, verify the latest stable `LuaSkills/luaskills-debug` Release and its exact asset names (`luaskills-debug-tool-{platform}.tar.gz`, `luaskills-debug-checksums.txt`), then update `.luaskills-version`, `uses: LuaSkills/luaskills-debug@<tag>` in `.github/workflows/release.yml`, examples, and documentation references together.
4. Never commit `.luaskills-debug/`, `dist/`, or runtime-generated directories.

## Development Loop

1. Run `scripts/setup_debug.ps1` or `scripts/setup_debug.sh` to download `luaskills-debug-tool-{platform}.tar.gz`, verify it against `luaskills-debug-checksums.txt`, and install Lua runtime packages, Node.js, and pnpm with the scripts shipped inside the archive. Keep every downloaded artifact under `.luaskills-debug/`.
2. Modify only formal skill content in `skill.yaml`, `dependencies.yaml`, `runtime/`, `node/`, `python/`, `help/`, `overflow_templates/`, `resources/`, and `licenses/`.
3. Write every generated code comment in bilingual pairs: English on the first line and Chinese on the second line. Cover every class, function, method, interface, parameter, return value, variable definition, and non-obvious design decision.
4. Inspect and invoke real entries through the official debugger. Read [AI Invocation Debugging Guide](references/ai-debugging.md) completely before first-time debugging or invocation troubleshooting.
5. Run `scripts/verify_skill.ps1` or `scripts/verify_skill.sh` to execute unit and Node tests, real engine loading, tool enumeration, every action call through `scripts/verify_runtime.py`, `luaskills-debug validate`, and `luaskills-debug package`.
6. Inspect `dist/<skill-id>-v<version>-skill.zip`. Confirm it contains only formal runtime files and that its single top-level directory matches the repository-derived `skill_id`.
7. Read and execute the [Five-Consecutive-Pass Review Protocol](references/review-loop.md) completely. If any issue appears, fix it, rerun the full flow, reset the consecutive-pass counter to zero, and continue until five consecutive reviews find no issues.
8. Before release, update `skill.yaml.version`, commit all intended changes, and run `scripts/tag_release.ps1` or `scripts/tag_release.sh` with the matching version. The release script rejects a dirty worktree, reruns verification, creates the exact `v<version>` tag, and pushes it for the Release Action.

## Debug Commands

Windows:

```powershell
.\scripts\debug_skill.ps1 -Command inspect
.\scripts\debug_skill.ps1 -Command list-tools
.\scripts\debug_skill.ps1 -Command call -Tool workspace -ArgsFile .\examples\workspace.args.json -Output json
.\scripts\debug_skill.ps1 -Command validate
.\scripts\debug_skill.ps1 -Command package
```

Linux/macOS:

```bash
bash ./scripts/debug_skill.sh inspect
bash ./scripts/debug_skill.sh list-tools
bash ./scripts/debug_skill.sh call --tool workspace --args-file ./examples/workspace.args.json --output json
bash ./scripts/debug_skill.sh validate
bash ./scripts/debug_skill.sh package
```

## Release Constraints

- Treat `skill.yaml.version` as the only release version source.
- Require the Git tag to equal `v<skill.yaml.version>` exactly.
- Package contents follow the LuaSkills packaging rules applied by `luaskills-debug package` (standard layout): `skill.yaml`, `dependencies.yaml`, README, LICENSE and `THIRD_PARTY_*` files, and the `runtime/`, `node/`, `python/`, `native/`, `help/`, `overflow_templates/`, `resources/`, `licenses/`, and `schemas/` directories when present. This skill needs no `--include`.
- `.agents/`, `.github/`, `scripts/`, `tests/`, `examples/`, `.luaskills-debug/`, `dist/`, `node_modules/`, `.pnpm-store/`, caches, and symbolic links never enter the formal skill zip.
- Never hide missing facts with candidate fields, speculative multi-path fallbacks, or fuzzy compatibility logic. Stop and report the verified path and missing evidence when the fact chain cannot be established.
