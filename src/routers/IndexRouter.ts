import { Router } from "express";

import { ProductCategoryRouter } from "@routers/ProductCategoryRouter";
import { ProductRouter } from "@routers/ProductRouter";
import { ProductUnitRouter } from "@routers/ProductUnitRouter";
import { StoreRouter } from "@routers/StoreRouter";
import { UnitRouter } from "@routers/UnitRouter";
import { SuccessHandler } from "@utils/SuccessHandler";

export class IndexRouter {
	private static instance: IndexRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/health", (req, res) => {
			SuccessHandler.send(res, req.requestId, "Server is running");
		});

		this.router.use("/stores", StoreRouter.getInstance().getRouter());
		this.router.use("/products", ProductRouter.getInstance().getRouter());
		this.router.use("/product-units", ProductUnitRouter.getInstance().getRouter());
		this.router.use("/units", UnitRouter.getInstance().getRouter());
		this.router.use("/product-categories", ProductCategoryRouter.getInstance().getRouter());
	}

	static getInstance(): IndexRouter {
		if (!IndexRouter.instance) {
			IndexRouter.instance = new IndexRouter();
		}
		return IndexRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
