# Public releases

PathBranching publishes desktop installers from GitHub Actions when a `vX.Y.Z` tag is pushed.

Before tagging, keep the version identical in `package.json`, `src-tauri/tauri.conf.json`, and `src-tauri/Cargo.toml`.

```bash
git checkout main
git pull --ff-only
git tag vX.Y.Z
git push origin vX.Y.Z
```

The workflow builds Windows, Apple Silicon macOS, and Linux artifacts, then publishes a GitHub Release with generated notes.
