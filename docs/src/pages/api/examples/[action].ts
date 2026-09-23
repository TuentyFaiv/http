import type { APIRoute } from "astro";

import { handleDemo } from "../../../server/demo";

// biome-ignore lint/style/useExportsLast: Astro statically discovers this route directive.
export const prerender = false;
const ALL: APIRoute = ({ request }) => handleDemo(request);

export { ALL };
