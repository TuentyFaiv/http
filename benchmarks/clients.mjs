import axios from "axios";

import { bare, Http } from "../dist/index.js";

function createClients(transport) {
	const http = Http.create("", { preset: bare, fetch: transport, cache: false, retry: 0, timeout: 0 });
	const axiosClient = axios.create({ adapter: "fetch", env: { fetch: transport }, timeout: 0 });

	return {
		http: (url) => http.get(url),
		axios: (url) => axiosClient.get(url, { responseType: "json" }).then((response) => response.data),

		fetch: async (url) => {
			const response = await transport(url);
			if (!response.ok) {
				throw new Error(`HTTP ${response.status}`);
			}
			return response.json();
		},
	};
}

export { createClients };
