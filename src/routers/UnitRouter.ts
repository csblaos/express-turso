import { Router } from "express";

import { UnitController } from "@controllers/UnitController";
import CommonValidator from "@validators/CommonValidator";
import UnitValidator from "@validators/UnitValidator";

export class UnitRouter {
	private static instance: UnitRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", UnitValidator.list, UnitController.getAll);
		this.router.get("/:id", CommonValidator.resourceId, UnitController.getById);
		this.router.post("/", UnitValidator.create, UnitController.create);
		this.router.put("/:id", UnitValidator.update, UnitController.update);
		this.router.delete("/:id", CommonValidator.resourceId, UnitController.delete);
	}

	static getInstance(): UnitRouter {
		if (!UnitRouter.instance) {
			UnitRouter.instance = new UnitRouter();
		}
		return UnitRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
