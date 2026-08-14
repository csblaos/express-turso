import { Router } from "express";

import { NotificationController } from "@controllers/NotificationController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";

export class NotificationRouter {
	private static instance: NotificationRouter;
	private readonly router = Router();

	private constructor() {
		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/", PermissionMiddleware.require("settings.users.view"), NotificationController.list);
		this.router.put("/read-all", PermissionMiddleware.require("settings.users.view"), NotificationController.markAllRead);
		this.router.put("/:id/read", PermissionMiddleware.require("settings.users.view"), NotificationController.markRead);
	}

	static getInstance() {
		return NotificationRouter.instance ||= new NotificationRouter();
	}

	getRouter() {
		return this.router;
	}
}
