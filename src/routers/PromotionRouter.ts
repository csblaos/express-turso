import { Router } from "express";
import { PromotionController } from "@controllers/PromotionController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import PromotionValidator from "@validators/PromotionValidator";

export class PromotionRouter {
	private static instance: PromotionRouter;
	private readonly router = Router();
	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("promotions.view"), PromotionController.list);
		this.router.post("/evaluate", PermissionMiddleware.require("pos.create_order"), PromotionValidator.evaluate, PromotionController.evaluate);
		this.router.post("/", PermissionMiddleware.require("promotions.create"), PromotionValidator.save, PromotionController.create);
		this.router.put("/:id", PermissionMiddleware.require("promotions.update"), PromotionValidator.save, PromotionController.update);
		this.router.delete("/:id", PermissionMiddleware.require("promotions.archive"), PromotionController.archive);
	}
	static getInstance() { return PromotionRouter.instance ||= new PromotionRouter(); }
	getRouter() { return this.router; }
}
