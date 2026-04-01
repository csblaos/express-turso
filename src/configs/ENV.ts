export class ENV {
	static readonly SERVER = {
		NODE_ENV: process.env.NODE_ENV || "development",
		PORT: Number(process.env.PORT || 3000),
		CORS_ORIGIN: process.env.CORS_ORIGIN || "*",
		TRACER_ENABLED: process.env.TRACER_ENABLED === "true",
	};

	static readonly TURSO = {
		DATABASE_URL: process.env.TURSO_DATABASE_URL,
		AUTH_TOKEN: process.env.TURSO_AUTH_TOKEN,
	};

	static readonly DB = {
		URL: process.env.DATABASE_URL,
	};
}
