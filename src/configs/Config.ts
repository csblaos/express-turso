import { ENV } from "@configs/ENV";
import Development from "@configs/Config.development";
import Production from "@configs/Config.production";

function isPlainObject(value: unknown): value is Record<string, unknown> {
	if (!value || typeof value !== "object") return false;
	return Object.getPrototypeOf(value) === Object.prototype;
}

function collectNestedKeys(
	value: unknown,
	prefix: string[] = [],
	out: Set<string> = new Set(),
): Set<string> {
	if (!isPlainObject(value)) return out;

	for (const [ key, child ] of Object.entries(value)) {
		const nextPrefix = [ ...prefix, key ];
		out.add(nextPrefix.join("."));
		collectNestedKeys(child, nextPrefix, out);
	}

	return out;
}

function findMissingNestedKeys(
	source: Record<string, unknown>,
	target: Record<string, unknown>,
): string[] {
	const sourceKeys = collectNestedKeys(source);
	const targetKeys = collectNestedKeys(target);

	const missing: string[] = [];
	for (const key of sourceKeys) {
		if (!targetKeys.has(key)) missing.push(key);
	}
	return missing.sort();
}

const devConfig = Development.config as unknown as Record<string, unknown>;
const prodConfig = Production.config as unknown as Record<string, unknown>;

const missingInProd = findMissingNestedKeys(devConfig, prodConfig);
const missingInDev = findMissingNestedKeys(prodConfig, devConfig);

if (missingInProd.length || missingInDev.length) {
	throw new Error(
		[
			"[config] dev/prod config keys mismatch",
			missingInProd.length ? `missing in production: ${missingInProd.join(", ")}` : "",
			missingInDev.length ? `missing in development: ${missingInDev.join(", ")}` : "",
		]
			.filter(Boolean)
			.join(" | "),
	);
}

if (ENV.TURSO.DATABASE_URL?.startsWith("libsql://") && !ENV.TURSO.AUTH_TOKEN) {
	console.warn("[config] TURSO_AUTH_TOKEN is not set; connection may fail");
}

if (ENV.REDIS.DRIVER === "upstash") {
	if (!ENV.REDIS.UPSTASH_REDIS_REST_URL || !ENV.REDIS.UPSTASH_REDIS_REST_TOKEN) {
		console.warn("[config] Upstash Redis is selected but credentials are incomplete");
	}
} else if (ENV.REDIS.DRIVER === "local" && !ENV.REDIS.URL) {
	console.warn("[config] REDIS_URL is not set; local Redis connection may fail");
} else if (ENV.REDIS.DRIVER !== "local" && ENV.REDIS.DRIVER !== "upstash") {
	console.warn(`[config] Unknown REDIS_DRIVER '${ENV.REDIS.DRIVER}'. Expected 'local' or 'upstash'`);
}

export const Config = {
	DEVELOPMENT: "development",
	PRODUCTION: "production",
	StandardHeadersFromLog: [
		"host",
		"connection",
		"content-length",
		"content-type",
		"user-agent",
		"accept",
		"accept-language",
		"accept-encoding",
		"origin",
		"referer",
		"cache-control",
		"pragma",
		"if-none-match",
		"if-modified-since",
		"sec-ch-ua",
		"sec-ch-ua-mobile",
		"sec-ch-ua-platform",
		"sec-fetch-site",
		"sec-fetch-mode",
		"sec-fetch-dest",
		"sec-fetch-user",
		"upgrade-insecure-requests",
		"dnt",
	],
	ExcludeHeadersFromLog: [
		"authorization",
		"cookie",
		"set-cookie",
		"x-api-key",
		"x-forwarded-for",
	],
	secretParameters: [
		"password",
		"pass",
		"token",
		"auth_token",
		"authToken",
		"api_key",
		"apikey",
		"secret",
		"signature",
	],
	...(ENV.SERVER.NODE_ENV === "development" ? Development.config : Production.config),
};
