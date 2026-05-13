export class ENV {
	static readonly SERVER = {
		NODE_ENV: process.env.NODE_ENV || "development",
		PORT: Number(process.env.PORT || 3000),
		HOST: process.env.HOST || "0.0.0.0",
		SELF_CHECK_HOST: process.env.SERVER_SELF_CHECK_HOST || "127.0.0.1",
	};

	static readonly TURSO = {
		DATABASE_URL: process.env.TURSO_DATABASE_URL,
		AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
	};

	static readonly DB = {
		URL: process.env.DATABASE_URL,
	};

	static readonly REDIS = {
		DRIVER: (process.env.REDIS_DRIVER || (process.env.NODE_ENV === "production" ? "upstash" : "local")).toLowerCase(),
		URL: process.env.REDIS_URL || "redis://127.0.0.1:6379",
		UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL,
		UPSTASH_REDIS_REST_TOKEN: process.env.UPSTASH_REDIS_REST_TOKEN,
	};

	static readonly AUTH = {
		JWT_SECRET: process.env.AUTH_JWT_SECRET || "dev-jwt-secret-change-me",
	};
}
