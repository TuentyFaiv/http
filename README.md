# @tuentyfaiv/http

A TypeScript-first HTTP client built on native `fetch`, with opinionated defaults and neutral,
composable internals.

- Zero runtime dependencies
- ESM-only output
- Typed `Http.create()` clients with proxy-generated HTTP methods
- Customizable response presets, API conventions, validation, hooks, timeout, retry, and progress
- Works for consumers using Bun, npm, or pnpm

```ts
import { Http } from "@tuentyfaiv/http";

const api = Http.create("https://api.example.com");
const { payload } = await api.get<User>("/me");
```

Browse the [documentation](https://http.tuentyfaiv.com/), or run `bun dev` to browse
locally at `/` (English) or `/es-mx/` (Spanish). See [the docs deployment guide](./docs/README.md) for
Cloudflare Workers hosting and the same-origin example API.

## Development

```sh
bun install
bun dev
```

See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for checks, docs, and release workflow details.
