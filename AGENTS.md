- Use `vp` directly for tooling and package management; it handles the package manager. Prefer built-in commands such as `vp check`, `vp check --fix`, `vp lint`, and `vp fmt`. Do not add redundant package scripts for these defaults.
- Run `vp check` and `vp run typecheck` before finishing changes; run relevant tests when behavior changes.
- Configure Oxlint, Oxfmt, and Vitest in `vite.config.ts`. Expo / Metro handles app serving and builds.
- Pin development tooling versions. When upgrading Vite+, align the Vite alias and Vitest version in `pnpm-workspace.yaml` with `vp toolchain`.
- Put plain TypeScript tests beside their source as `src/**/*.test.ts`; import test APIs from `vite-plus/test`. Native component tests need a separate setup.

## Expo rules

- Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:
- Before changing Expo or React Native APIs, check the installed Expo major in `package.json` and read its docs at `https://docs.expo.dev/versions/v<major>.0.0/`. Use `https://docs.expo.dev/llms.txt` for guides.
- Configure native behavior through `app.json` and config plugins. Never hand-edit generated `android/` or `ios/` directories.
- Rebuild the development app after changing native dependencies or configuration.

NB! Prefer retrieval over pre-training
