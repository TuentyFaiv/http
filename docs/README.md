# Documentation and live examples

Astro + Starlight documentation, prerendered for Cloudflare Workers Static Assets.
Only `/http/api/examples/*` executes server code. English lives at `/http/` and
Spanish (Mexico) at `/http/es-mx/`; the existing `/http` prefix is retained.

## Local development

Use **Node.js 22.12+ (Node 24 recommended)** and the repository's Bun version.
From the repository root:

```sh
bun install
bun dev
```

Open the URL printed by Astro, then `/http/examples/live/` or
`/http/es-mx/examples/live/`. The adapter runs dynamic routes in local `workerd`.
For a production build and local Workers preview:

```sh
bun run docs:build
bun run docs:preview
```

The docs use a compatible, pinned Astro 6 / Cloudflare adapter 13 / Starlight 0.39
release set. Upgrade these together and rerun browser checks; framework upgrades can
change component overrides and Markdown compilation. Library runtime dependencies
and the library's Node 20+ consumer support are unchanged.

## Deploy to Workers

No Cloudflare resources have been provisioned by this setup. The baseline needs
**no R2, KV, D1, bindings to other Workers, or application secrets**. The null session
driver prevents the adapter from automatically provisioning KV; these examples do
not use sessions. Image optimization happens at build time, not via a paid Images binding.

1. Choose the Worker name in `wrangler.jsonc` (currently `http-docs`).
2. Authenticate Wrangler to your Cloudflare account.
3. Set the build environment variable **`DOCS_SITE`** to the actual public HTTPS
   origin (your custom domain or assigned `workers.dev` origin), **without `/http`**.
   Astro adds the base path to canonical URLs and the sitemap. Local builds may omit
   it; they skip the sitemap rather than publish an invented production URL.
4. From `docs/`, run `bun run deploy` when ready to publish. This builds, then calls
   `wrangler deploy`, using the generated configuration in `dist/server/`.

Do not upload `dist` as a Pages project or deploy only `dist/client`: the dynamic
examples require the Worker as well as its static assets.

### Optional manual GitHub workflow

`.github/workflows/docs.yml` replaces the old GitHub Pages deployment. It runs **only
through workflow_dispatch**, not automatically on pushes. Create a protected
`cloudflare-docs` environment and configure:

- Variable `DOCS_SITE`: the public origin described above.
- Variable `CLOUDFLARE_ACCOUNT_ID`: the target account ID.
- Secret `CLOUDFLARE_API_TOKEN`: a token scoped to deploy Workers in that account.
  Use Cloudflare's Workers deployment token permissions; add zone permissions only
  if you later configure routes that require them.

Then manually run **Deploy docs to Workers**. Pull requests still build the docs
without Cloudflare credentials. Never put account tokens in public environment
variables, client scripts, the repository, or uploaded example files.

## Demo API

The Astro route `src/pages/api/examples/[action].ts` explicitly opts out of
prerendering. Its portable handler is in `src/server/demo.ts` and is covered by
`tests/docs-api.test.ts` in the repository root.

| Action | Method | Behavior |
| --- | --- | --- |
| `echo` | GET / POST | Query echo or allowlisted string `name`/`message` fields from JSON; 16 KiB input limit. |
| `status` | GET | Allowlisted status codes with problem details; 429/503 advertise `Retry-After: 1`. |
| `retry` | GET | Explicit `X-Demo-Attempt` header: 503 on attempts 1/2, success on 3. No shared counter. |
| `delay` | GET | Abort-aware delay, bounded to 0–3000 ms. |
| `upload` | POST | Count and discard raw bytes, up to 1 MiB; return a receipt. |
| `download` | GET | Generated 256 KiB response; known or unknown length, paced chunks. |
| `stream` | GET | Six finite NDJSON records, about 200 ms apart. |

The UI imports the actual HTTP client source and shows the actual demo source.
Requests start only after Run. Cancellation, schema failures, safe error tuples,
request/response hooks and streaming are exercised without an external API.

**Upload progress is not a native Fetch feature.** The upload panel remains
indeterminate until a server receipt. Download progress uses `onDownloadProgress`;
unknown lengths never show a fabricated percentage. Streaming parses across network
chunk boundaries. Content-Length uses a Workers `FixedLengthStream` for known-size
downloads; network buffering may still merge chunks.

### Limits, privacy, and cost

- No application persistence or request-body logging. Uploads are not stored.
- No arbitrary URL proxy, reflected authorization/cookies, or unbounded response stream.
- Same-origin browser checks, bounded inputs, `no-store, no-transform`, and `nosniff`.
- These checks are **not authentication or rate limiting**. Non-browser clients can
  call public endpoints; configure account-level abuse controls and monitor usage
  before promoting the site broadly.
- Static asset requests and Worker execution have different billing rules. Public
  demo calls consume Workers request/CPU allowances; limits do not guarantee zero cost.
- Requests pass through Cloudflare. No application storage is not a claim that the
  platform retains no request metadata. Use synthetic data, not personal files.

## Optional Cloudflare extensions

Add services only when a future example needs their behavior:

| Service | Useful extension | Additional responsibility |
| --- | --- | --- |
| R2 | Persistent files, signed download URLs, multipart upload | Bucket, object expiry, authorization, operation/storage costs. |
| D1 | Real CRUD, filtering, pagination | Schema/migrations and data retention. |
| KV | Read-heavy preferences or cached fixtures | Eventual consistency; not a strict counter. |
| Durable Objects | Coordinated counters or shared realtime state | Object lifecycle, bindings, quotas. |
| Queues | Background jobs and status polling | Producer, consumer, durable job state. |
| Cache API | Edge cache hit/miss or conditional requests | Per-data-center cache semantics; not durable storage. |
| Turnstile | Challenge before costly requests | Server-side token verification and a secret; not a substitute for all abuse controls. |

References: [Astro server endpoints](https://docs.astro.build/en/guides/endpoints/#server-endpoints-api-routes),
[Workers Static Assets](https://developers.cloudflare.com/workers/static-assets/),
[Workers limits](https://developers.cloudflare.com/workers/platform/limits/),
[Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/),
[R2](https://developers.cloudflare.com/r2/), [D1](https://developers.cloudflare.com/d1/),
[KV](https://developers.cloudflare.com/kv/), [Durable Objects](https://developers.cloudflare.com/durable-objects/),
[Queues](https://developers.cloudflare.com/queues/), [Cache API](https://developers.cloudflare.com/workers/runtime-apis/cache/),
[Turnstile](https://developers.cloudflare.com/turnstile/).
