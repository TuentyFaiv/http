// biome-ignore-all lint/style/useNamingConvention: dictionary keys preserve the English source copy, including capitalization.
// English source strings are the keys, so missing translations are type errors.
const spanish = {
	"Typed results": "Resultados tipados",
	"An envelope by default. The payload type is yours.":
		"Una respuesta envuelta por defecto. Tú defines el tipo del contenido.",
	"Safe errors": "Errores seguros",
	"Choose an error/result tuple or the throwing API.":
		"Elige una tupla error/resultado o la API que lanza excepciones.",
	"Your conventions": "Tus convenciones",
	"just the parsed body": "solo el cuerpo procesado",
	"Also included: envelope, rest, problem.": "También se incluyen: envelope, rest, problem.",
	"Change the return shape without changing the transport.":
		"Cambia la estructura del resultado sin cambiar el transporte.",
	"A complete HTTP client.": "Un cliente HTTP completo.",
	Still: "Con",
	"underneath.": "por debajo.",
	"Still fetch underneath.": "Con fetch por debajo.",
	"Typed responses, retries, validation, and hooks. The parts you keep rebuilding around a request, in one dependency-free client.":
		"Respuestas tipadas, reintentos, validación y hooks. Todo lo que sueles volver a implementar en cada solicitud, en un solo cliente sin dependencias.",
	"Get started": "Comienza aquí",
	"See the comparisons": "Consulta las comparaciones",
	"One client. Your API.": "Un cliente. Tu API.",
	"Library at a glance": "La biblioteca de un vistazo",
	"minified + gzip¹": "minificado + gzip¹",
	"runtime dependencies": "dependencias de ejecución",
	"built-in response presets": "presets de respuesta integrados",
	Native: "Nativos",
	"fetch, signals, and streams": "fetch, señales y flujos",
	"¹ Local build, browser GET + JSON fixture. Not the published release.":
		"¹ Compilación local, caso de prueba GET + JSON para navegador. No es la versión publicada.",
	"Measurement details": "Detalles de la medición",
	Transport: "Transporte",
	"Native fetch": "fetch nativo",
	"Typed response presets": "Presets de respuesta tipados",
	"4 + custom presets": "4 + presets personalizados",
	"Transforms / wrapper": "Transformaciones / envoltorio",
	"Custom wrapper": "Envoltorio personalizado",
	"Request lifecycle": "Ciclo de vida de la solicitud",
	"Async hooks": "Hooks asíncronos",
	Interceptors: "Interceptores",
	"Automatic retry": "Reintentos automáticos",
	"Built-in option": "Opción integrada",
	"Plugin / custom code": "Plugin / código personalizado",
	"Custom code": "Código personalizado",
	"Standard Schema validation": "Validación con Standard Schema",
	"Built in": "Integrado",
	"Custom integration": "Integración personalizada",
	"Error / result tuple": "Tupla error / resultado",
	"Download progress": "Progreso de descarga",
	"Read the stream": "Leer el flujo",
	"Upload progress callback": "Callback de progreso de carga",
	"Not built in": "No integrado",
	"Adapter-dependent": "Depende del adaptador",
	"Your API sets the shape.": "Tu API define la estructura.",
	"Envelope, raw body, REST-style metadata, or problem details. Pick a preset or define a typed shape of your own.":
		"Respuesta envuelta, cuerpo sin envolver, metadatos estilo REST o detalles del problema. Elige un preset o define tu propia estructura tipada.",
	"Explore presets": "Explora los presets",
	"Failure is part of the API.": "Los errores son parte de la API.",
	"Keep status, cause, response, and request context together. Handle errors as values when that fits your code.":
		"Mantén juntos el estado, la causa, la respuesta y el contexto de la solicitud. Maneja los errores como valores cuando sea lo más adecuado para tu código.",
	"Handle errors": "Maneja los errores",
	"Bring your own validator.": "Usa tu propio validador.",
	"Validate with Standard Schema-compatible tools such as Zod or Valibot. Your validator stays a separate dependency.":
		"Valida con herramientas compatibles con Standard Schema, como Zod o Valibot. Tu validador sigue siendo una dependencia independiente.",
	"Validate a response": "Valida una respuesta",
	"Beyond a shorter fetch call": "Más que una llamada a fetch más corta",
	"Opinionated defaults.": "Valores predeterminados con criterio.",
	"Your conventions.": "Tus convenciones.",
	"Keep the platform primitives. Add the behavior your application needs without making a new wrapper for every project.":
		"Conserva las primitivas de la plataforma. Agrega el comportamiento que necesita tu aplicación sin crear un nuevo envoltorio para cada proyecto.",
	"Also included": "También incluye",
	"Timeouts & retries ↗": "Tiempos de espera y reintentos ↗",
	"Composable hooks ↗": "Hooks combinables ↗",
	"Handle errors ↗": "Maneja los errores ↗",
	"Choose the right abstraction": "Elige la abstracción adecuada",
	"More than a size contest.": "No todo es cuestión de tamaño.",
	"These clients make different choices. Here is what each provides directly, and what you would wire up yourself.":
		"Estos clientes toman decisiones distintas. Esto es lo que ofrece cada uno directamente y lo que tendrías que integrar por tu cuenta.",
	"HTTP client capability comparison": "Comparación de capacidades de clientes HTTP",
	"“Custom” means implementable in application code, not impossible. Validation requires a compatible schema; progress support depends on the runtime.":
		// biome-ignore lint/security/noSecrets: public Spanish table caption, not a credential.
		"“Personalizado” significa que se puede implementar en el código de la aplicación, no que sea imposible. La validación requiere un esquema compatible; el soporte de progreso depende del entorno de ejecución.",
	Capability: "Capacidad",
	"local build": "compilación local",
	"Web platform": "Plataforma web",
	"References:": "Referencias:",
	"HTTP docs": "Documentación de HTTP",
	"Fetch API ↗": "API Fetch ↗",
	"When would you choose something else?": "¿Cuándo conviene elegir otra opción?",
	"Use native fetch when a few requests and your own error handling are enough. Axios offers a mature interceptor ecosystem and multiple transport adapters. Choose this client when typed response conventions and an integrated error model are the parts you want to stop rebuilding.":
		"Usa fetch nativo cuando basten unas cuantas solicitudes y tu propio manejo de errores. Axios ofrece un ecosistema maduro de interceptores y varios adaptadores de transporte. Elige este cliente cuando quieras dejar de reimplementar convenciones de respuesta tipadas y un modelo de errores integrado.",
	"No framework required": "No necesitas un framework",
	"Start with one request.": "Comienza con una solicitud.",
	"Set a base URL. Choose your conventions. Keep your stack.":
		"Define una URL base. Elige tus convenciones. Conserva tus herramientas.",
	"Read the quickstart": "Lee la guía de inicio rápido",
	"View source": "Consulta el código fuente",
	"Bundle size": "Tamaño del paquete",
	"What ships to the browser": "Lo que se envía al navegador",
	"kB, minified + gzip · lower is smaller": "kB, minificado + gzip · menos es más pequeño",
	"Same bundler, separate GET + JSON entrypoints. Includes client code and the request wrapper. Native fetch is built into the runtime; its bar is only the wrapper.":
		"Mismo empaquetador, puntos de entrada GET + JSON separados. Incluye el código del cliente y el envoltorio de la solicitud. fetch nativo está integrado en el entorno de ejecución; su barra solo representa el envoltorio.",
	"Request overhead": "Sobrecosto por solicitud",
	"The work around a request": "El trabajo que rodea una solicitud",
	"µs / operation · lower is less overhead": "µs / operación · menos es menor sobrecosto",
	"An in-memory test, not network speed. Median of sample means for GET + JSON, run in Bun with retries and timeouts disabled.":
		"Una prueba en memoria, no de velocidad de red. Mediana de las medias muestrales para GET + JSON, ejecutada en Bun con reintentos y tiempos de espera desactivados.",
	Dependencies: "Dependencias",
	"What else gets installed": "Qué más se instala",
	"declared direct runtime dependencies": "dependencias directas de ejecución declaradas",
	"Package-level runtime dependencies, not transitive packages or code retained in your browser bundle. Axios also supports Node-specific transports.":
		"Dependencias de ejecución a nivel de paquete, no paquetes transitivos ni código incluido en el paquete del navegador. Axios también admite transportes específicos de Node.",
	"The cost of a client": "El costo de un cliente",
	"Small footprint.": "Poco espacio.",
	"Visible tradeoffs.": "Ventajas y límites claros.",
	"Bundle size is one part of the decision. Compare the code you ship, the work per request, and the dependencies you take on.":
		"El tamaño del paquete es solo una parte de la decisión. Compara el código que envías, el trabajo por solicitud y las dependencias que incorporas.",
	Local: "Local",
	Measured: "Medición del",
	"How we measured": "Cómo medimos",
	"Methodology, exact results, and reproduction": "Metodología, resultados exactos y reproducción",
	"Browser bundle": "Paquete para navegador",
	"Bun.build {version}, minified ESM, gzip level {level}. Separate exported GET + JSON functions with runtime URLs. Defaults remain in the size fixtures; HTTP uses the bare preset. Decimal kB = 1,000 bytes.":
		"Bun.build {version}, ESM minificado, nivel de gzip {level}. Funciones GET + JSON exportadas por separado con URLs definidas en tiempo de ejecución. Los casos de prueba de tamaño conservan los valores predeterminados; HTTP usa el preset bare. kB decimal = 1,000 bytes.",
	"Client overhead": "Sobrecosto del cliente",
	"{warmup} warmups, {samples} samples of {iterations} sequential operations per client. Identical {bytes}-byte JSON responses, parsing and payload checks. No DNS, TLS, server, or network latency.":
		"{warmup} operaciones de calentamiento, {samples} muestras de {iterations} operaciones secuenciales por cliente. Respuestas JSON idénticas de {bytes} bytes, procesamiento y comprobaciones del contenido. Sin DNS, TLS, servidor ni latencia de red.",
	"Limits of this snapshot": "Límites de esta medición",
	"macOS {arch}, {cpu}. Browser bundles executed in Bun, not browser-engine timings. Reused instances; no retries or timeouts. These results do not measure uploads, failed requests, or end-to-end latency.":
		"macOS {arch}, {cpu}. Paquetes para navegador ejecutados en Bun; no son tiempos de un motor de navegador. Instancias reutilizadas; sin reintentos ni tiempos de espera. Estos resultados no miden cargas, solicitudes fallidas ni latencia de extremo a extremo.",
	"Exact benchmark measurements": "Mediciones exactas de rendimiento",
	"Min/max are sample means, not request percentiles. Lower is not necessarily better for your use case.":
		"Los valores mínimo y máximo son medias muestrales, no percentiles de solicitudes. Un valor menor no es necesariamente mejor para tu caso de uso.",
	Client: "Cliente",
	"Minified bytes": "Bytes minificados",
	"Gzip bytes": "Bytes con gzip",
	"Median µs/op": "Mediana µs/op",
	"Min–max µs/op": "Mín–máx µs/op",
	"HTTP is measured from the local working tree, not the npm release with the same version. Source fingerprint:":
		"HTTP se mide desde el árbol de trabajo local, no desde la publicación en npm con la misma versión. Huella del código fuente:",
	". Timing varies with CPU load, garbage collection, and runtime. No statistical significance is claimed.":
		". Los tiempos varían según la carga del CPU, la recolección de basura y el entorno de ejecución. No se afirma significancia estadística.",
	"Benchmark source ↗": "Código de las pruebas de rendimiento ↗",
	"Raw samples + build settings ↗": "Muestras sin procesar + configuración de compilación ↗",
	"Footer documentation": "Documentación en el pie de página",
	Documentation: "Documentación",
	"Getting started": "Primeros pasos",
	"Response presets": "Presets de respuesta",
	"Validation guide": "Guía de validación",
	"Footer project": "Proyecto en el pie de página",
	Project: "Proyecto",
	"Report an issue": "Reporta un problema",
	"Built by": "Creado por",
	"MIT licensed": "Licencia MIT",
} as const;

const trailingSlashes = /\/+$/;
const placeholders = /\{(\w+)\}/g;

function homepageLocale(pathname: string, baseUrl = import.meta.env.BASE_URL) {
	const base = baseUrl.replace(trailingSlashes, "");
	const path = pathname.replace(trailingSlashes, "");
	const spanishRoot = `${base}/es-mx`;
	const isSpanish = path === spanishRoot || path.startsWith(`${spanishRoot}/`);
	const root = isSpanish ? spanishRoot : base;
	return {
		locale: isSpanish ? "es-MX" : "en-US",
		isHome: path === root,
		href: (page = "") => `${root}/${page}`,
		t: (text: keyof typeof spanish, values: Record<string, string | number> = {}) => {
			const translation = isSpanish ? spanish[text] : text;
			return translation.replace(placeholders, (match, key: string) => String(values[key] ?? match));
		},
	};
}

export { homepageLocale };
