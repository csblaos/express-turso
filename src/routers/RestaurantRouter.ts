import { Router } from "express";

import { RestaurantController } from "@controllers/RestaurantController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import RestaurantValidator from "@validators/RestaurantValidator";

export class RestaurantRouter {
	private static instance: RestaurantRouter;
	private readonly router=Router();
	private constructor(){
		this.router.use(AuthGuardMiddleware.requireAuth(),RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/zones",PermissionMiddleware.require("settings.restaurant.view"),RestaurantValidator.query,RestaurantController.zones);
		this.router.post("/zones",PermissionMiddleware.require("settings.restaurant.update"),RestaurantValidator.zone,RestaurantController.createZone);
		this.router.put("/zones/:id",PermissionMiddleware.require("settings.restaurant.update"),RestaurantValidator.zone,RestaurantController.updateZone);
		this.router.delete("/zones/:id",PermissionMiddleware.require("settings.restaurant.update"),RestaurantController.deleteZone);
		this.router.get("/tables",PermissionMiddleware.require("settings.restaurant.view"),RestaurantValidator.query,RestaurantController.tables);
		this.router.post("/tables",PermissionMiddleware.require("settings.restaurant.update"),RestaurantValidator.table,RestaurantController.createTable);
		this.router.put("/tables/:id",PermissionMiddleware.require("settings.restaurant.update"),RestaurantValidator.table,RestaurantController.updateTable);
		this.router.delete("/tables/:id",PermissionMiddleware.require("settings.restaurant.update"),RestaurantController.deleteTable);
	}
	static getInstance(){return RestaurantRouter.instance||=new RestaurantRouter();}
	getRouter(){return this.router;}
}
