import "dotenv/config";

import * as moduleAlias from "module-alias";
import path from "path";

const rootDir = __dirname;

moduleAlias.addAliases({
	"@components": path.join(rootDir, "components"),
	"@configs": path.join(rootDir, "configs"),
	"@connections": path.join(rootDir, "connections"),
	"@controllers": path.join(rootDir, "controllers"),
	"@interfaces": path.join(rootDir, "interfaces"),
	"@middlewares": path.join(rootDir, "middlewares"),
	"@models": path.join(rootDir, "models"),
	"@providers": path.join(rootDir, "providers"),
	"@routers": path.join(rootDir, "routers"),
	"@storage": path.join(rootDir, "storage"),
	"@tstypes": path.join(rootDir, "tstypes"),
	"@utils": path.join(rootDir, "utils"),
});

async function bootstrap(): Promise<void> {
	const { ENV } = await import("@configs/ENV");
	const { DbConn } = await import("@connections/DbConn");
	const { RedisConn } = await import("@connections/RedisConn");
	const { default: app } = await import("./App");

	await DbConn.connect();
	await RedisConn.connect();

	const server = app.listen(ENV.SERVER.PORT, () => {
		console.log(`Server running on http://localhost:${ENV.SERVER.PORT}`);
	});

	const shutdown = async (signal: string) => {
		console.log(`[shutdown] ${signal}`);
		server.close(async () => {
			await RedisConn.disconnect();
			process.exit(0);
		});
		setTimeout(() => process.exit(1), 10_000).unref();
	};

	process.once("SIGINT", () => void shutdown("SIGINT"));
	process.once("SIGTERM", () => void shutdown("SIGTERM"));
	process.once("unhandledRejection", (reason) => {
		console.error("[unhandledRejection]", reason);
		void shutdown("unhandledRejection");
	});
	process.once("uncaughtException", (error) => {
		console.error("[uncaughtException]", error);
		void shutdown("uncaughtException");
	});
}

bootstrap().catch((error: unknown) => {
	console.error("Failed to start server:", error);
	process.exit(1);
});
