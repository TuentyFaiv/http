# FetchZen

## Release 0.2.0

**[FetchZen 0.2.0](https://www.npmjs.com/package/fetchzen/v/0.2.0) is published on npm.**
Install with `bun add fetchzen`,
`npm install fetchzen`, or `pnpm add fetchzen`.
Version **0.2.0** is available under npm's `latest` dist-tag.

### Support and limits

| Capability | Support |
| --- | --- |
| JSON/text/blob/array buffer | Built-in response parsing; schema validators may transform parsed output. |
| Raw response / `ReadableStream` | Supported; incremental NDJSON is an application reader example, not a built-in NDJSON parser. |
| `FormData` file + fields | Supported; let Fetch set the multipart boundary. |
| `ReadableStream` request body | Runtime-dependent; the client supplies `duplex: "half"` when omitted and forwards it to Fetch. Some browsers do not support streamed requests. |
| Download progress | Received bytes; percentages only when a usable total is available. Non-identity or CORS-hidden content encoding leaves total/percentage unknown because Content-Length can describe compressed bytes. |
| Upload progress | No native Fetch upload-transfer callbacks. Opt-in `uploadConfirmed` supports server-confirmed progress with a cooperating chunk endpoint. |
| Resumable uploads, request deduplication | Not provided; upload sessions, idempotency and persistence belong to the application/server. |

A TypeScript-first HTTP client built on native `fetch`, with opinionated defaults and neutral,
composable internals.

- Zero runtime dependencies
- Fetch-only sequential acknowledged uploads via `uploadConfirmed` from the root or `/helpers`; receipts confirm bytes, not file storage.
- ESM-only output
- Typed `Http.create()` clients with proxy-generated HTTP methods
- Customizable response presets, API conventions, validation, hooks, timeout, retry, and progress
- Works for consumers using Bun, npm, or pnpm

```ts
import { Http } from "fetchzen";

const api = Http.create("https://api.example.com");
const { payload } = await api.get<User>("/me");
```

For utilities without client initialization:

```ts
import { normalizeError, buildUrl } from "fetchzen/helpers";
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
