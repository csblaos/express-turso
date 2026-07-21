import { Router } from "express";

import { PosController } from "@controllers/PosController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";

export class PosRouter {
	private static instance: PosRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/products", PosController.getCatalog);
		this.router.get("/orders", PosController.listOrders);
		this.router.post("/checkout", PosController.checkout);
	}

	static getInstance(): PosRouter {
		if (!PosRouter.instance) {
			PosRouter.instance = new PosRouter();
		}
		return PosRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
