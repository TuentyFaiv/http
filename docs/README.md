# Documentation and live examples

Astro + Starlight documentation, prerendered for Cloudflare Workers Static Assets.
Only `/api/examples/*` executes server code. English lives at `/` and Spanish
(Mexico) at `/es-mx/` on https://http.tuentyfaiv.com. Legacy `/http` and `/http/*`
URLs redirect to the corresponding root paths with method-preserving 308 redirects.

## Local development

Use **Node.js 22.12+ (Node 24 recommended)** and the repository's Bun version.
From the repository root:

```sh
bun install
bun dev
```

Open the URL printed by Astro, then `/examples/live/` or
`/es-mx/examples/live/`. The adapter runs dynamic routes in local `workerd`.
For a production build and local Workers preview:

```sh
bun run docs:build
bun run docs:preview
```

The docs use a compatible, pinned Astro 6 / Cloudflare adapter 13 / Starlight 0.39
release set. Upgrade these together and rerun browser checks; framework upgrades can
change component overrides and Markdown compilation. Library runtime dependencies
and the library's Node 20+ consumer support are unchanged.

## Visual identity

The docs use the Open f / Hand Baseline identity with violet/saffron light and dark
themes. Fonts are self-hosted, documentation-only assets; the published library
remains dependency-free. Keep the served `public/fonts-license.txt` copyright and
OFL notices with the fonts.

## Deploy to Workers

No Cloudflare resources have been provisioned by this setup. The baseline needs
**no R2, KV, D1, bindings to other Workers, or application secrets**. The null session
driver prevents the adapter from automatically provisioning KV; these examples do
not use sessions. Image optimization happens at build time, not via a paid Images binding.

1. Choose the Worker name in `wrangler.jsonc` (currently `http-docs`).
2. Authenticate Wrangler to your Cloudflare account.
3. The default production origin is **`https://http.tuentyfaiv.com`**. To publish
   elsewhere, override **`DOCS_SITE`** with the public HTTPS origin, **without a path**.
   Canonical URLs and the sitemap use this origin; there is no `/http` base path.
   In Cloudflare dashboard builds, remove `/http` from any existing `DOCS_SITE` value.
4. From `docs/`, run `bun run deploy` when ready to publish. This builds, then calls
   `wrangler deploy`, using the generated configuration in `dist/server/`.

Do not upload `dist` as a Pages project or deploy only `dist/client`: the dynamic
examples require the Worker as well as its static assets.

### Observability

`wrangler.jsonc` enables Workers Logs, traces, and Issues, with 100% sampling for
logs and traces. Astro carries these settings into the generated deployment
configuration. Keep the source configuration in sync with the intended production
settings: a Wrangler deployment can overwrite dashboard-only changes.

Review telemetry volume, account limits, and costs before deployment. Do not log
credentials, authorization headers, or request bodies. Enabling observability does
not add application-level payload logging or configure external telemetry exports.

### Optional FetchZen domain

The existing origin stays in place until a replacement is registered and configured.
If you register `fetchzen.dev`, add it as a Custom Domain on the existing Worker,
verify HTTPS, then set `DOCS_SITE=https://fetchzen.dev` in your deployment environment
and rebuild/redeploy. This keeps both the docs and `/api/examples/` on one origin.
Do not change the Worker name just to change its public domain.

`.dev` domains require HTTPS in browsers because the entire TLD is HSTS-preloaded.
Configure the TLS certificate before using the domain; Cloudflare Workers Custom
Domains can manage it. Only redirect the old origin after the new site works,
using method-preserving redirects for API requests. No domain registration, DNS,
certificate, or deployment is performed by the package rename.

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

Cloudflare Workers Builds is a separate Git integration and can automatically
deploy on changes to its production branch, independently of this manual GitHub
workflow. GitHub CI's **Build docs** job only builds; it does not deploy.
Use one normal production deployment path and reserve the other for intentional
manual deployments.

In Workers Builds, keep the build and deploy commands separate. Do not use the
docs workspace's `bun run deploy` as the build command: it already runs both
`astro build` and `wrangler deploy`, so a subsequent deploy command would deploy
again. Inspect the build log and version IDs before treating a build-history row
and a Wrangler deployment row as two separate builds.

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
| `upload-chunk` | POST | Read actual raw body up to 256 KiB before returning envelope `{ data: { receivedBytes, stored: false } }`; stateless count/discard, no assembly. |
| `multipart` | POST | Native FormData parsing only after a 1 MiB + 16 KiB actual wire cap; one file and one name field, counts only, no filenames echoed. |
| `download` | GET | Generated 256 KiB response; known or unknown length, paced chunks. |
| `stream` | GET | Six finite NDJSON records, about 200 ms apart. |

The examples overview links to 14 focused pages in English and es-MX, each with
a short usage snippet and one interactive demo. The UI runs the local HTTP client
source; it no longer displays every helper or the UI runner.
Requests start only after Run. Cancellation, validation, safe results, hooks,
and streaming use the site's demo API, without an external service.

**Native Fetch has no upload-transfer callbacks.** Raw/multipart panels remain
indeterminate until a server receipt. The confirmed-upload panel uses Fetch-only
`uploadConfirmed`, sequential 256 KiB chunks and synthetic files up to 1 MiB.
Its percentage counts exact server receipts, not stored or processed files.
No upload persistence, XHR, polling or browser storage is involved.
See the [recipe](src/content/docs/recipes/confirmed-uploads.md) for production
session, ordering, idempotency, finalization and cleanup requirements.
Download progress uses `onDownloadProgress`;
unknown lengths never show a fabricated percentage. Streaming parses across network
chunk boundaries. Content-Length uses a Workers `FixedLengthStream` for known-size
downloads; network buffering may still merge chunks.

### Limits, privacy, and cost

- This checkout targets 0.2.0 on npm's `latest` dist-tag, pending publication. Production still needs a manual redeployment to replace the old tuple docs; no deployment was performed.
- Before promotion, manually verify Cloudflare zone/Worker route coverage, available WAF/rate rules for `/api/examples/*`, request/CPU limits, usage alerts and billing plan. Test normal, oversized and repeated requests on the production origin. Do not assume a dashboard rule covers `workers.dev` or every custom domain.
- No in-memory IP bucket is presented as global protection: isolates restart and do not coordinate, and client-supplied identity headers are not trustworthy outside the deployment boundary. Account-level controls remain an operator task; their availability and costs depend on the plan.
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
