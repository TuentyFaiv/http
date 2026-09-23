# Contributing

Thanks for helping improve `@tuentyfaiv/http`.

## Development setup

Use Bun for repository development and Node.js 22.12+ (24 recommended) for the docs tooling:

```sh
bun install
bun run check
bun run typecheck
bun run test
bun run build
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
Live examples are at `/http/examples/live/` and `/http/es-mx/examples/live/` and use
same-origin Astro endpoints in the local Workers runtime. Keep the legacy browser
example as a draft. See [`docs/README.md`](./docs/README.md) for deployment, API limits,
and optional Cloudflare integrations.

## Pull requests

1. Open an issue first for substantial behavior or API changes.
2. Keep changes focused and avoid adding runtime dependencies.
3. Add or update tests for behavior changes.
4. Update the Starlight docs when changing the public API.
5. Run the checks listed in the pull-request template.

Pull requests must pass the `Verify library` and `Build docs` checks before merge.

## Releases

Releases are published from GitHub Releases. The release tag must match the package version,
for example `package.json` version `0.2.0` must use the tag `v0.2.0`. The publish workflow
uses npm Trusted Publishing with OIDC; no npm token is stored in the repository.
