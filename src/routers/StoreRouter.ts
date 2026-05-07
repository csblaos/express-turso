import { Router } from "express";

import { StoreController } from "@controllers/StoreController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";

export class StoreRouter {
	private static instance: StoreRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.read"), StoreController.getAll);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("stores.read"), StoreController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_store"), StoreController.create);
		this.router.put("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_store"), StoreController.update);
		this.router.delete("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("settings.manage_store"), StoreController.delete);
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
