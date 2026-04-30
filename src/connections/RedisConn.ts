import { Redis as UpstashRedis } from "@upstash/redis";
import { createClient, RedisClientType } from "redis";

import { ENV } from "@configs/ENV";

type RedisDriver = "local" | "upstash";
type RedisValue = string | number | Buffer;
type SetOptions = {
	exSeconds?: number;
	pxMilliseconds?: number;
};

function assertSupportedDriver(value: string): RedisDriver {
	if (value === "local" || value === "upstash") return value;
	throw new Error(`[redis] unsupported REDIS_DRIVER '${value}'. Expected 'local' or 'upstash'.`);
}

export class RedisConn {
	private static localClient: RedisClientType | null = null;
	private static upstashClient: UpstashRedis | null = null;
	private static connectPromise: Promise<void> | null = null;
	private static driver: RedisDriver | null = null;

	static getDriver(): RedisDriver {
		RedisConn.driver = RedisConn.driver || assertSupportedDriver(ENV.REDIS.DRIVER);
		return RedisConn.driver;
	}

	static isConnected(): boolean {
		if (RedisConn.getDriver() === "local") {
			return Boolean(RedisConn.localClient?.isOpen);
		}
		return Boolean(RedisConn.upstashClient);
	}

	static async connect(): Promise<void> {
		if (RedisConn.isConnected()) return;
		if (RedisConn.connectPromise) return RedisConn.connectPromise;

		RedisConn.connectPromise = (async () => {
			const driver = RedisConn.getDriver();
			const startedAt = Date.now();

			try {
				if (driver === "local") {
					await RedisConn.connectLocal(startedAt);
					return;
				}
				await RedisConn.connectUpstash(startedAt);
			} catch (error) {
				await RedisConn.disconnect();
				throw error;
			}
		})().finally(() => {
			RedisConn.connectPromise = null;
		});

		return RedisConn.connectPromise;
	}

	static getLocalClient(): RedisClientType {
		if (!RedisConn.localClient) {
			throw new Error("RedisConn local client not connected. Call RedisConn.connect() first.");
		}
		return RedisConn.localClient;
	}

	static getUpstashClient(): UpstashRedis {
		if (!RedisConn.upstashClient) {
			throw new Error("RedisConn Upstash client not connected. Call RedisConn.connect() first.");
		}
		return RedisConn.upstashClient;
	}

	static async get(key: string): Promise<string | null> {
		if (RedisConn.getDriver() === "local") {
			return RedisConn.getLocalClient().get(key);
		}
		const value = await RedisConn.getUpstashClient().get<string>(key);
		return value ?? null;
	}

	static async set(key: string, value: RedisValue, options?: SetOptions): Promise<void> {
		if (RedisConn.getDriver() === "local") {
			if (options?.exSeconds) {
				await RedisConn.getLocalClient().set(key, value, { EX: options.exSeconds });
				return;
			}
			if (options?.pxMilliseconds) {
				await RedisConn.getLocalClient().set(key, value, { PX: options.pxMilliseconds });
				return;
			}
			await RedisConn.getLocalClient().set(key, value);
			return;
		}

		const upstash = RedisConn.getUpstashClient();
		if (options?.exSeconds) {
			await upstash.set(key, value, { ex: options.exSeconds });
			return;
		}
		if (options?.pxMilliseconds) {
			await upstash.set(key, value, { px: options.pxMilliseconds });
			return;
		}
		await upstash.set(key, value);
	}

	static async del(...keys: string[]): Promise<number> {
		if (keys.length === 0) return 0;
		if (RedisConn.getDriver() === "local") {
			return RedisConn.getLocalClient().del(keys);
		}
		return RedisConn.getUpstashClient().del(...keys);
	}

	static async ping(): Promise<string> {
		if (RedisConn.getDriver() === "local") {
			return RedisConn.getLocalClient().ping();
		}
		return RedisConn.getUpstashClient().ping();
	}

	static async disconnect(): Promise<void> {
		if (RedisConn.localClient?.isOpen) {
			await RedisConn.localClient.quit();
		}
		RedisConn.localClient = null;
		RedisConn.upstashClient = null;
	}

	private static async connectLocal(startedAt: number): Promise<void> {
		const url = ENV.REDIS.URL;
		if (!url) {
			throw new Error("[redis] REDIS_URL is required when REDIS_DRIVER=local");
		}

		RedisConn.localClient = createClient({ url });
		RedisConn.localClient.on("error", (error) => {
			console.error("[redis] local client error", error);
		});

		console.log("[redis] connecting (local)");
		await RedisConn.localClient.connect();
		await RedisConn.localClient.ping();
		console.log(`[redis] connected (local) in ${Date.now() - startedAt}ms`);
	}

	private static async connectUpstash(startedAt: number): Promise<void> {
		const url = ENV.REDIS.UPSTASH_REDIS_REST_URL;
		const token = ENV.REDIS.UPSTASH_REDIS_REST_TOKEN;

		if (!url || !token) {
			throw new Error("[redis] UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN are required when REDIS_DRIVER=upstash");
		}

		RedisConn.upstashClient = new UpstashRedis({ url, token });

		console.log("[redis] connecting (upstash)");
		await RedisConn.upstashClient.ping();
		console.log(`[redis] connected (upstash) in ${Date.now() - startedAt}ms`);
	}
}
