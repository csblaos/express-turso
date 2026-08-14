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
		this.router.get("/", PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.list, PurchaseOrderController.getAll);
		this.router.get("/:id", PermissionMiddleware.require("purchase_orders.view"), PurchaseOrderValidator.getById, PurchaseOrderController.getById);
		this.router.post("/", PermissionMiddleware.require("purchase_orders.create"), PurchaseOrderValidator.create, PurchaseOrderController.create);
		this.router.patch("/:id", PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.update, PurchaseOrderController.update);
		this.router.post("/:id/ordered", PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.markOrdered, PurchaseOrderController.markOrdered);
		this.router.post("/:id/arrived", PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.markArrived, PurchaseOrderController.markArrived);
		this.router.post("/:id/receive", PermissionMiddleware.require("purchase_orders.receive"), PurchaseOrderValidator.receive, PurchaseOrderController.receive);
		this.router.post("/:id/settle", PermissionMiddleware.require("purchase_orders.update"), PurchaseOrderValidator.settle, PurchaseOrderController.settle);
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
