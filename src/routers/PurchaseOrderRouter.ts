import { Router } from "express";

import { PurchaseOrderController } from "@controllers/PurchaseOrderController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import PurchaseOrderValidator from "@validators/PurchaseOrderValidator";

export class PurchaseOrderRouter {
	private static instance: PurchaseOrderRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.list, PurchaseOrderController.getAll);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.getById, PurchaseOrderController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.create"), PurchaseOrderValidator.create, PurchaseOrderController.create);
	}

	static getInstance(): PurchaseOrderRouter {
		if (!PurchaseOrderRouter.instance) {
			PurchaseOrderRouter.instance = new PurchaseOrderRouter();
		}
		return PurchaseOrderRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
