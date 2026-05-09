import { Router } from "express";

import { StoreController } from "@controllers/StoreController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";

export class StoreRouter {
	private static instance: StoreRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.view"), StoreController.getAll);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.view"), StoreController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.create"), StoreController.create);
		this.router.put("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.store.update"), StoreController.update);
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
