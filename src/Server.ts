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
	"@validators": path.join(rootDir, "validators"),
});

async function bootstrap(): Promise<void> {
	const { ENV } = await import("@configs/ENV");
	const { DbConn } = await import("@connections/DbConn");
	const { RedisConn } = await import("@connections/RedisConn");
		const { AuthInterface } = await import("@interfaces/AuthInterface");
		const { SystemAdminClientInterface } = await import("@interfaces/SystemAdminClientInterface");
		const { ProductInterface } = await import("@interfaces/ProductInterface");
		const { StoreInterface } = await import("@interfaces/StoreInterface");
		const { RbacInterface } = await import("@interfaces/RbacInterface");
		const { OrderInterface } = await import("@interfaces/OrderInterface");
		const { NotificationInterface } = await import("@interfaces/NotificationInterface");
		const { PromotionInterface } = await import("@interfaces/PromotionInterface");
		const { StoreCurrencyRateInterface } = await import("@interfaces/StoreCurrencyRateInterface");
		const { StoreCurrencyRateHistoryInterface } = await import("@interfaces/StoreCurrencyRateHistoryInterface");
		const { default: app } = await import("./App");

	await DbConn.connect();
	await RedisConn.connect();
	await AuthInterface.ensureUserAuthColumns();
	await AuthInterface.ensureDevelopmentAccountsPersisted();
		await SystemAdminClientInterface.ensureColumns();
		await ProductInterface.ensureColumns();
		await StoreInterface.ensureColumns();
		await RbacInterface.warmup();
		await OrderInterface.ensureTables();
		await PromotionInterface.ensureTables();
		await NotificationInterface.startBackgroundJobs();
		await StoreCurrencyRateInterface.warmup();
		await StoreCurrencyRateHistoryInterface.warmup();

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
