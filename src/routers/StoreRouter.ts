import { Router } from "express";

import { StoreController } from "@controllers/StoreController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import CommonValidator from "@validators/CommonValidator";

export class StoreRouter {
	private static instance: StoreRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.view"), StoreController.getAll);
			this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.view"), StoreController.getById);
			this.router.get("/:id/cost-method/history", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCostMethodHistory);
			this.router.get("/:id/currency-rates", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCurrencyRates);
			this.router.get("/:id/currency-rates/history", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.getCurrencyRateHistory);
			this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.create"), StoreController.create);
			this.router.put("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), StoreController.update);
			this.router.put("/:id/currency-rates", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), CommonValidator.resourceId, StoreController.updateCurrencyRates);
			this.router.delete("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.archive"), StoreController.delete);
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
