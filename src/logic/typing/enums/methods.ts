const HttpMethod = {
  GET: "GET",
  POST: "POST",
  PUT: "PUT",
  DELETE: "DELETE",
  PATCH: "PATCH",
  OPTIONS: "OPTIONS",
} as const;

const HttpMethodLower = {
  get: "get",
  post: "post",
  put: "put",
  delete: "delete",
  patch: "patch",
  options: "options",
} as const;

Object.freeze(HttpMethod);
Object.freeze(HttpMethodLower);
Object.seal(HttpMethod);
Object.seal(HttpMethodLower);

export type HttpMethods = typeof HttpMethod[keyof typeof HttpMethod];
export type HttpMethodsLower = typeof HttpMethodLower[keyof typeof HttpMethodLower];

export { HttpMethod, HttpMethodLower };
