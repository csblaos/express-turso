import { Router } from "express";

import { InventoryController } from "@controllers/InventoryController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import InventoryValidator from "@validators/InventoryValidator";

export class InventoryRouter {
	private static instance: InventoryRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("inventory.view"), InventoryValidator.list, InventoryController.getBalances);
		this.router.get("/movements", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("inventory.view"), InventoryValidator.movements, InventoryController.getMovements);
		this.router.post("/adjustments", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("inventory.adjust"), InventoryValidator.adjustment, InventoryController.adjust);
	}

	static getInstance(): InventoryRouter {
		if (!InventoryRouter.instance) {
			InventoryRouter.instance = new InventoryRouter();
		}
		return InventoryRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
