// biome-ignore lint/style/useNamingConvention: const-object stand-in for an enum (noEnum); PascalCase is the public api
const HttpMethod = {
	GET: "GET",
	HEAD: "HEAD",
	POST: "POST",
	PUT: "PUT",
	DELETE: "DELETE",
	PATCH: "PATCH",
	OPTIONS: "OPTIONS",
} as const;

// biome-ignore lint/style/useNamingConvention: const-object stand-in for an enum (noEnum); PascalCase is the public api
const HttpMethodLower = {
	get: "get",
	head: "head",
	post: "post",
	put: "put",
	delete: "delete",
	patch: "patch",
	options: "options",
} as const;

/** Methods whose second argument is config, because they carry no body. */
// biome-ignore lint/style/useNamingConvention: const-object stand-in for an enum (noEnum); PascalCase is the public api
const HttpMethodBodyless = [HttpMethodLower.get, HttpMethodLower.head] as const;

Object.freeze(HttpMethod);
Object.freeze(HttpMethodLower);
Object.seal(HttpMethod);
Object.seal(HttpMethodLower);

export type HttpMethods = (typeof HttpMethod)[keyof typeof HttpMethod];
export type HttpMethodsLower = (typeof HttpMethodLower)[keyof typeof HttpMethodLower];
export type HttpMethodsBodyless = (typeof HttpMethodBodyless)[number];

export { HttpMethod, HttpMethodBodyless, HttpMethodLower };
