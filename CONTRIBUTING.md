# Contributing

Thanks for helping improve `fetchzen`.

## Development setup

Use Bun and Node.js 24 for repository development and builds. The published
library supports Node.js 20+; CI builds on Node 24, then separately tests packed
consumers on Node 20, 22, and 24 without rebuilding on those consumer runtimes:

```sh
bun install
bun run check
bun run typecheck
bun run test
bun run build
bun run package:smoke
bun run docs:build
```

Run the docs locally from the repository root with `bun dev`. The library watch build is
available as `bun run dev:library`.

The published package remains compatible with npm and pnpm consumers. Bun is only the
repository's development and CI package manager.

## Documentation

English (US) pages live in `docs/src/content/docs/`. Spanish (Mexico) pages live in
`docs/src/content/docs/es-mx/`, using the same filenames and `sidebar.order` values.
Keep both versions in sync when changing a guide or recipe. Use relative links between
content pages so readers stay in their selected language.

Homepage translations and localized links are in `docs/src/i18n/home.ts`. Starlight
provides the translated navigation and search UI; locale configuration is in
`docs/astro.config.mjs`. The shared content width is `--http-content-width` in
`docs/src/styles/custom.css`.

Prefer a short working snippet, the relevant defaults, and important limitations over
an exhaustive API listing. Check snippets against the source and tests. Run
`bun run docs:build` and review both locales, language switching, and mobile navigation.
Live examples are at `/examples/live/` and `/es-mx/examples/live/` and use
same-origin Astro endpoints in the local Workers runtime. Keep the legacy browser
example as a draft. See [`docs/README.md`](./docs/README.md) for deployment, API limits,
and optional Cloudflare integrations.

## Pull requests

1. Open an issue first for substantial behavior or API changes.
2. Keep changes focused and avoid adding runtime dependencies.
3. Add or update tests for behavior changes.
4. Update the Starlight docs when changing the public API.
5. Run the checks listed in the pull-request template.

Pull requests must pass `Verify library`, `Build docs`, and all three
`Packed consumer (Node 20/22/24)` checks before merge. Package smoke fixtures and
browser bundles are retained under ignored `.temp/` for inspection; no registry
installation or package lifecycle scripts run.

## Releases

Releases are published from GitHub Releases. The release tag must match the package version,
for example `package.json` version `0.2.0` must use the tag `v0.2.0`. The publish workflow
uses npm Trusted Publishing with OIDC; no npm token is stored in the repository.

The unprivileged build job validates the release, runs the checks, and packs once.
It smoke-tests that exact tarball and uploads it as an immutable workflow artifact.
The separate publishing job waits for the protected `npm` environment, downloads
that artifact by ID, verifies its SHA-256 against the build job's output, and
publishes with provenance and `--ignore-scripts`. It does not check out source,
install dependencies, rebuild, or execute repository scripts.

Before approving, inspect the build job's release summary for the commit, npm
dist-tag, and tarball SHA-256, and review the uploaded artifact. The artifact is
retained for seven days; if it expires before approval, rerun the workflow rather
than substituting a locally rebuilt package. Required reviewers and allowed
release tags must be configured on the `npm` environment in GitHub; the workflow
cannot enforce those account settings itself.

For `0.2.0-beta.1`, use `v0.2.0-beta.1`, mark the GitHub Release as a prerelease,
and target `main`. Prereleases are explicitly published to npm's `beta` dist-tag,
never `latest`. Publishing a GitHub Release triggers the release workflow; review
the exact commit and tested artifact before approving the `npm` environment.
