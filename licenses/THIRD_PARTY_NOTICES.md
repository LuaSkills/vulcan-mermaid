# Third-party notices and provenance

- Development scaffold: local `demo-skill`, version 0.2.1, LuaSkills v0.5.5 baseline. Its LICENSE and setup/debug/verify/release scripts are retained and now follow demo-skill's luaskills-debug v0.8.0 tooling, where `luaskills-debug validate` and `package` replace the former Python validate/package scripts. Demo-specific tools and configuration are replaced by one workspace entry.
- Architecture document format, field mapping, metadata conventions, parser concepts and example data: `oh-my-mermaid` 0.2.0, commit `38ccdb69298adec949177c92c88d6e3ddfb5bab7`, imported from the user's checkout. See `oh-my-mermaid-MIT.txt`. Storage, comparison and offline viewing are adapted implementations; the original source checkout is unchanged.
- Dagre 0.8.5: pinned upstream browser bundle copied without modification from its npm distribution into `resources/dagre.min.js`; see `dagre-MIT.txt`. The browser bundle includes graphlib and Lodash; their licenses are retained as `graphlib-MIT.txt` and `lodash-MIT.txt`.
- YAML 2.8.3: pinned runtime dependency; see `yaml-ISC.txt`.

`node/pnpm-lock.yaml` records package integrity and exact transitive versions for the managed runtime. `scripts/build_viewer.mjs` uses Node filesystem APIs to reproduce the offline asset on Windows, Linux and macOS.
