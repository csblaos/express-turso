import { Router } from "express";

import { ReportController } from "@controllers/ReportController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import ReportValidator from "@validators/ReportValidator";

export class ReportRouter {
	private static instance: ReportRouter;
	private readonly router = Router();
	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/dashboard", PermissionMiddleware.require("reports.view"), ReportValidator.dashboard, ReportController.dashboard);
		this.router.get("/products", PermissionMiddleware.require("reports.view"), ReportValidator.products, ReportController.products);
		this.router.get("/purchasing", PermissionMiddleware.require("reports.view"), ReportValidator.dashboard, ReportController.purchasing);
		this.router.get("/products/:productId/trend", PermissionMiddleware.require("reports.view"), ReportValidator.productTrend, ReportController.productTrend);
	}
	static getInstance(): ReportRouter { return ReportRouter.instance ||= new ReportRouter(); }
	getRouter(): Router { return this.router; }
}
