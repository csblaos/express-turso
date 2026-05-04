import { Router } from "express";

import { ProductController } from "@controllers/ProductController";
import CommonValidator from "@validators/CommonValidator";
import ProductValidator from "@validators/ProductValidator";

export class ProductRouter {
	private static instance: ProductRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", ProductValidator.list, ProductController.getAll);
		this.router.get("/:id", CommonValidator.resourceId, ProductController.getById);
		this.router.post("/", ProductValidator.create, ProductController.create);
		this.router.put("/:id", ProductValidator.update, ProductController.update);
		this.router.delete("/:id", CommonValidator.resourceId, ProductController.delete);
	}

	static getInstance(): ProductRouter {
		if (!ProductRouter.instance) {
			ProductRouter.instance = new ProductRouter();
		}
		return ProductRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
