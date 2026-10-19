// index.ts — the Worker entry, and nothing else.
//
// Everything this service does lives in `handler.ts`, which is a pure function of (request,
// bindings, clock). This file is the only place that knows it is running on Cloudflare, which is
// exactly why it is this short: there is no logic here to be untested.
//
// `PhoneRoom` is re-exported because a Durable Object class must be a named export of the Worker's
// ENTRY module — that is how the runtime binds `class_name` in wrangler.toml to an implementation.
// It carries no logic of its own either; `phoneRoom.ts RoomCore` holds all of it.

import { handleRequest } from './handler'
import type { Env } from './env'

export { PhoneRoom } from './phoneRoom'

export default {
  fetch: (request: Request, env: Env): Promise<Response> => handleRequest(request, env)
}
