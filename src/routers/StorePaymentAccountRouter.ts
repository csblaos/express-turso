import { Router } from "express";

import { StorePaymentAccountController } from "@controllers/StorePaymentAccountController";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import CommonValidator from "@validators/CommonValidator";
import StorePaymentAccountValidator from "@validators/StorePaymentAccountValidator";

export class StorePaymentAccountRouter {
	private static instance: StorePaymentAccountRouter;
	private readonly router: Router = Router({ mergeParams: true });

	private constructor() {
		this.router.get(
			"/",
			PermissionMiddleware.require("settings.store.update"),
			StorePaymentAccountController.getAll,
		);
		this.router.post(
			"/",
			PermissionMiddleware.require("settings.store.update"),
			StorePaymentAccountValidator.create,
			StorePaymentAccountController.create,
		);
		this.router.put(
			"/:id",
			PermissionMiddleware.require("settings.store.update"),
			CommonValidator.resourceId,
			StorePaymentAccountValidator.update,
			StorePaymentAccountController.update,
		);
		this.router.delete(
			"/:id",
			PermissionMiddleware.require("settings.store.update"),
			CommonValidator.resourceId,
			StorePaymentAccountController.delete,
		);
	}

	static getInstance(): StorePaymentAccountRouter {
		if (!StorePaymentAccountRouter.instance) {
			StorePaymentAccountRouter.instance = new StorePaymentAccountRouter();
		}
		return StorePaymentAccountRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
