# Project Context (Architecture + Config + Errors + Logging)

This file is the single source of truth for this repo’s architecture and conventions.

It replaces the previous context docs:
- `AI_PROJECT_BLUEPRINT.md`
- `ERROR_CONFIG_CONTEXT.md`
- `LOG_STYLE.md`

---

## 1) Non‑negotiable constraints

- Runtime/language: Node.js + TypeScript (CommonJS output)
- Web framework: Express
- Formatting/style:
	- Indent: tabs
	- Quotes: double quotes
	- Semicolons: enabled
- Architecture: class-based layers
	- routers → controllers → components → interfaces → connections
	- middlewares for cross-cutting concerns (logging, validation, error handling)
	- configs for environment/config + error catalog
	- utils for shared helpers
- Path aliases:
	- TypeScript paths in `tsconfig.json`
	- Runtime alias registration using `module-alias` in `src/Server.ts`
- Observability:
	- request-id request/response log per request
	- (optional) tracer can be added later if needed

---

## 2) Folder structure (actual repo)

```
	src/
		App.ts
		Server.ts
		components/
	configs/
	connections/
	controllers/
	interfaces/
	middlewares/
	models/
	providers/
	routers/
	storage/
	tstypes/
	utils/
```

### Key responsibilities

- `src/Server.ts`
	- Loads env (`dotenv`)
	- Registers `module-alias` runtime aliases
	- Connects DB (`DbConn.connect()`) and initializes schema
	- Connects Redis (`RedisConn.connect()`) using local Redis in dev or Upstash in prod based on env
	- Starts Express
	- Implements graceful shutdown for signals + unhandled errors
- `src/App.ts`
	- Express setup (`/healthz`, CORS, JSON parsing)
	- Request-id logging middleware
	- Mounts `IndexRouter` under `/api`
	- 404 → throws `ApiError.NotFoundError(...)`
	- Uses global error middleware (`ErrorHandler.errorHandler`)
- `src/routers/*`
	- One class per router, singleton (`getInstance()`), owns an `express.Router()`
	- Defines routes and attaches controller handlers
- `src/controllers/*`
	- Controllers are thin: parse/validate request shape, call component, return response
	- Uses `SyncFunction.handler` / `SyncFunction.seamlessHandler`
- `src/components/*`
	- Business orchestration layer
	- Calls `interfaces/*` (DB access) and `providers/*` (external services)
- `src/interfaces/*`
	- Data-access layer (DB queries via `DbConn.getClient()`)
- `src/connections/*`
	- Connection singletons (`DbConn`, `RedisConn`, `AxiosConn`, etc.)
- `src/middlewares/*`
	- Request lifecycle (request-id logging, validators)
	- Error handling (`ApiError`, `ErrorHandler`)
	- Async wrappers (`SyncFunction`, `AsyncFunction`)
- `src/configs/*`
	- Environment variables (`ENV`)
	- Config selection + constants (`Config`)
	- Error catalog (`ErrorConfig`)
- `src/utils/*`
	- Logging (`Log`), UUID, safe stringify, JSON parsing helpers
- `src/tstypes/*`
	- Express request augmentation (`req.requestId`, `req.isSeamless`)

---

## 3) TypeScript path aliases (required)

### TypeScript compile-time

Defined in `tsconfig.json` using `"baseUrl": "./src"` and `"paths"` for:

- `@components/*`, `@configs/*`, `@connections/*`, `@controllers/*`, `@interfaces/*`
- `@middlewares/*`, `@models/*`, `@providers/*`, `@routers/*`, `@storage/*`
- `@tstypes/*`, `@utils/*`

### Runtime

Aliases are registered in `src/Server.ts` using `moduleAlias.addAliases(...)` so compiled JS under `dist/` can resolve `@...` imports.

---

## 4) Config selection (dev vs prod)

Files:
- `src/configs/Config.ts`
- `src/configs/Config.development.ts`
- `src/configs/Config.production.ts`

Rules:
- `Config.ts` picks dev if `ENV.SERVER.NODE_ENV === "development"`, else prod.
- Before selecting, `Config.ts` validates that **both dev and prod contain the same nested keys**.
	- If any key path exists in dev but not prod (or vice-versa), the app throws on startup.
- Config is for constants + behavior flags (non-secret).
- Secrets belong in `.env` via `ENV.ts`.

When adding a new config value:
- Add the same key path to both `Config.development.ts` and `Config.production.ts` (values can differ).

---

## 5) ENV (runtime environment variables)

File:
- `src/configs/ENV.ts`

Pattern:
- `ENV` is a class with `static readonly` fields reading from `process.env`.
- Connection/provider layers read service URLs/tokens from `ENV`, not `Config`.
- Redis selection is environment-driven via `REDIS_DRIVER`:
	- `local` uses `REDIS_URL`
	- `upstash` uses `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

Rule:
- Keep `.env.example` aligned with the fields used in `ENV.ts`.

---

## 6) Error catalog (ErrorConfig)

File:
- `src/configs/ErrorConfig.ts`

What it contains:
- `RESPONSE_FORMAT.*` defaults (`BAD_REQUEST`, `NOT_FOUND`, `INTERNAL_SERVER_ERROR`, etc.)
- Domain errors grouped under `DOMAIN.*` (expandable into other domains as the project grows)

Error object fields:
- `httpStatusCode`: number (normal mode HTTP status)
- `code`: number (internal numeric code)
- `message`: string
- Optional seamless fields:
	- `seamlessStatusCode`: string
	- `seamlessMessage`: string

Rule:
- Add a new error to `ErrorConfig` first, then throw it via `ApiError.CustomError(...)`.

---

## 7) ApiError (error type used everywhere)

File:
- `src/middlewares/ApiError.ts`

Behavior:
- Stores:
	- `httpStatusCode`, `code`, `message`
	- seamless fields (`isSeamless`, `seamlessStatusCode`, `seamlessMessage`)
- `ApiError.handler(...)` formats output:
	- Normal mode: `res.status(httpStatusCode).json({ code, message })`
	- Seamless mode: `res.status(200).json({ status, desc })`

Provided constructors:
- `BadRequestError`, `NotFoundError`, `UnauthorizedError`, `ForbiddenError`, `InternalError`, `CustomError`

Rule:
- Throw `ApiError.*` from controllers/components/providers; don’t manually format error responses in controllers.

---

## 8) ErrorHandler (single global Express error middleware)

File:
- `src/middlewares/ErrorHandler.ts`

What it does:
- Binds seamless mode (`err.isSeamless = req.isSeamless`).
- Writes error details into `Log.logs[req.requestId]`:
	- `error: true`, `errorTrack`, `isAxiosError`, `isSequelizeError`, optional `axiosErrors`
- Special case forwarding (non-seamless):
	- If an upstream/internal API returned `{ code, message }`, it forwards that as `ApiError.CustomError`.
- Always replies using `ApiError.handler(...)` or wraps unknown errors as `INTERNAL_SERVER_ERROR`.

Rule:
- Keep response-format logic centralized here + `ApiError.handler`.

---

## 9) SyncFunction / seamless mode

File:
- `src/middlewares/SyncFunction.ts`

Purpose:
- Wrap async Express handlers and route errors to `next(err)` safely.
- Sets seamless mode:
	- `SyncFunction.handler(...)` → `req.isSeamless = false`
	- `SyncFunction.seamlessHandler(...)` → `req.isSeamless = true`

Rule:
- For seamless endpoints, always use `SyncFunction.seamlessHandler(...)`.

---

## 10) Logging (request-id + one print per request)

This repo uses an in-memory per-request log object stored in `Log.logs[requestId]` and prints it once at the end of the request.

Files:
- `src/middlewares/RequestMiddleware.ts`
- `src/utils/Log.ts`

### Request-id lifecycle

- Incoming `request-id` header is preferred; otherwise generate one.
- `RequestMiddleware.requestResponseLog` sets:
	- `req.requestId`
	- `res.setHeader("request-id", requestId)`
- Most layers accept `requestId: string` and pass it down (`controller` → `component` → `provider`/`interface`).

### Base request log structure

Created in `RequestMiddleware`:
- `requestId`
- `requestTime`, `method`, `path`
- `params`
- `query` (secret keys masked)
- `body` (secret keys masked)
- `headers` (excludes keys listed in `Config.ExcludeHeadersFromLog`)
- `error`, `errorTrack`

Response fields added before printing:
- `responseStatus`
- `response` (minimized; arrays logged as `[ <length> ]`)
- `responseTime`
- `responseDuration` (seconds)

### Response minimization rules

- If response is an array, log `[ <length> ]`.
- If response is an object with `data` as an array, log `{ ...rest, data: [ <length> ] }`.
- A `res.on("finish")` fallback prints even when the response does not go through `res.json`.

### Redaction (secrets)

- Request `body` and `query` mask keys listed in `Config.secretParameters` as `"******"`.
- Headers listed in `Config.ExcludeHeadersFromLog` are removed from logged `headers`.

### Output format

In `Log.printLog`:
- Development: prints the log object directly
- Otherwise: prints JSON stringified output via `Utils.stringify(...)` (handles circular structures)

### Console messages (per request)

Use:
- `Log.console(requestId, "message")`

---

## 11) Provider logging (external services)

Files:
- `src/connections/AxiosConn.ts`
- `src/middlewares/ProviderMiddleware.ts`

Provider usage pattern:
1) Build URL from `ENV.<SERVICE>.API_URL` + suffix.
2) Choose axios instance (`AxiosConn.getInstance().axios` vs `axiosExtendedTimeout`).
3) Wrap the axios call with `ProviderMiddleware.axiosHandler(...)` or `customAxiosHandler(...)`.
4) Return `response.data`.
5) In `catch`, map upstream errors to `ErrorConfig` and throw `ApiError.CustomError(...)`.

Provider log shape (under a key you choose, e.g. `"registerPlayer"`):
- `requestUrl`
- `requestMethod`
- `requestBody`
- `response` (success only)
- `error` boolean
- `axiosRequestTime`
- `axiosResponseTime`
- `axiosResponseDuration` (seconds)
- `errorResponse` (error only): `{ data, status, statusText }`

Nested provider logs (`customAxiosHandler`) store logs under:
- `Log.addLog(requestId, logName, { [subRequestId]: logData })`

---

## 12) DB connection

File:
- `src/connections/DbConn.ts`

- Logs connect/connected at startup:
	- `[db] connecting (turso|sqlite)`
	- `[db] connected (turso|sqlite) in <ms>ms`
- Initializes schema on connect (creates tables if missing).

Tip:
- If Turso network is blocked, switch to local:
	- `TURSO_DATABASE_URL=file:./database.db` (or set `DATABASE_URL=file:./database.db`)

## 13) Redis connection

Files:
- `src/connections/RedisConn.ts`
- `src/configs/ENV.ts`

- Logs connect/connected at startup:
	- `[redis] connecting (local|upstash)`
	- `[redis] connected (local|upstash) in <ms>ms`
- Driver selection:
	- `REDIS_DRIVER=local` uses TCP Redis via `REDIS_URL`
	- `REDIS_DRIVER=upstash` uses REST Redis via Upstash credentials
- `RedisConn` exposes a driver-agnostic API for basic cache operations (`get`, `set`, `del`, `ping` via connect check).
