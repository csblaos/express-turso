import { Router } from "express";

import { ProductUnitController } from "@controllers/ProductUnitController";
import CommonValidator from "@validators/CommonValidator";
import ProductUnitValidator from "@validators/ProductUnitValidator";

export class ProductUnitRouter {
	private static instance: ProductUnitRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", ProductUnitValidator.list, ProductUnitController.getAll);
		this.router.get("/:id", CommonValidator.resourceId, ProductUnitController.getById);
		this.router.post("/", ProductUnitValidator.create, ProductUnitController.create);
		this.router.put("/:id", ProductUnitValidator.update, ProductUnitController.update);
		this.router.delete("/:id", CommonValidator.resourceId, ProductUnitController.delete);
	}

	static getInstance(): ProductUnitRouter {
		if (!ProductUnitRouter.instance) {
			ProductUnitRouter.instance = new ProductUnitRouter();
		}
		return ProductUnitRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
