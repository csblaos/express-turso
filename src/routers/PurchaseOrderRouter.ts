import { Router } from "express";

import { PurchaseOrderController } from "@controllers/PurchaseOrderController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import PurchaseOrderValidator from "@validators/PurchaseOrderValidator";

export class PurchaseOrderRouter {
	private static instance: PurchaseOrderRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.list, PurchaseOrderController.getAll);
		this.router.get("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.getById, PurchaseOrderController.getById);
		this.router.post("/", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.create"), PurchaseOrderValidator.create, PurchaseOrderController.create);
		this.router.patch("/:id", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.update, PurchaseOrderController.update);
		this.router.post("/:id/ordered", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.markOrdered, PurchaseOrderController.markOrdered);
		this.router.post("/:id/arrived", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.markArrived, PurchaseOrderController.markArrived);
		this.router.post("/:id/receive", AuthGuardMiddleware.requireAuth(), PermissionMiddleware.require("purchase_orders.receive"), PurchaseOrderValidator.receive, PurchaseOrderController.receive);
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
