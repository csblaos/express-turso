import { Router } from "express";

import { StoreController } from "@controllers/StoreController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import { StorePaymentAccountRouter } from "@routers/StorePaymentAccountRouter";
import CommonValidator from "@validators/CommonValidator";

export class StoreRouter {
	private static instance: StoreRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("stores.view"), StoreController.getAll);
		this.router.use("/:storeId/payment-accounts", StorePaymentAccountRouter.getInstance().getRouter());
		this.router.get("/:id", PermissionMiddleware.require("stores.view"), StoreController.getById);
		this.router.get("/:id/cost-method/history", PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCostMethodHistory);
		this.router.get("/:id/currency-rates", PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCurrencyRates);
		this.router.get("/:id/currency-rates/history", PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCurrencyRateHistory);
		this.router.post("/", PermissionMiddleware.require("settings.store.create"), StoreController.create);
		this.router.put("/:id", PermissionMiddleware.require("settings.store.update"), StoreController.update);
		this.router.put("/:id/currency-rates", PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.updateCurrencyRates);
		this.router.delete("/:id", PermissionMiddleware.require("settings.store.archive"), StoreController.delete);
	}

	static getInstance(): StoreRouter {
		if (!StoreRouter.instance) {
			StoreRouter.instance = new StoreRouter();
		}
		return StoreRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
