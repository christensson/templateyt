// Helpers for calling the HTTP endpoints of backend.js with a fake context in unit tests.

export type Endpoint = { scope: string; method: string; path: string; handle: (ctx: unknown) => void };

export const findEndpoint = (
  endpoints: Array<Endpoint>,
  scope: string,
  method: string,
  path: string,
): Endpoint => {
  const endpoint = endpoints.find((e) => e.scope === scope && e.method === method && e.path === path);
  if (endpoint === undefined) {
    throw new Error(`No endpoint ${scope} ${method} ${path}`);
  }
  return endpoint;
};

// Calls an endpoint with the given context (entity, project, currentUser) and request body.
// Returns the JSON response.
export const callEndpoint = (
  endpoint: Endpoint,
  ctx: Record<string, unknown>,
  body?: unknown,
): Record<string, unknown> => {
  let json: Record<string, unknown> = {};
  endpoint.handle({
    ...ctx,
    request: { body: JSON.stringify(body ?? {}) },
    response: {
      status: 200,
      json: (value: Record<string, unknown>) => {
        json = value;
      },
    },
  });
  return json;
};
