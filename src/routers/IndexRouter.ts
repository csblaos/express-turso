import { Router } from "express";

import { AuditEventRouter } from "@routers/AuditEventRouter";
import { AuthRouter } from "@routers/AuthRouter";
import { InventoryRouter } from "@routers/InventoryRouter";
import { ProductCategoryRouter } from "@routers/ProductCategoryRouter";
import { ProductRouter } from "@routers/ProductRouter";
import { ProductUnitRouter } from "@routers/ProductUnitRouter";
import { PurchaseOrderRouter } from "@routers/PurchaseOrderRouter";
import { RbacRouter } from "@routers/RbacRouter";
import { StoreRouter } from "@routers/StoreRouter";
import { SystemConfigRouter } from "@routers/SystemConfigRouter";
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
		this.router.use("/auth", AuthRouter.getInstance().getRouter());
		this.router.use("/rbac", RbacRouter.getInstance().getRouter());
		this.router.use("/products", ProductRouter.getInstance().getRouter());
		this.router.use("/audit-events", AuditEventRouter.getInstance().getRouter());
		this.router.use("/inventory", InventoryRouter.getInstance().getRouter());
		this.router.use("/purchase-orders", PurchaseOrderRouter.getInstance().getRouter());
		this.router.use("/product-units", ProductUnitRouter.getInstance().getRouter());
		this.router.use("/units", UnitRouter.getInstance().getRouter());
		this.router.use("/product-categories", ProductCategoryRouter.getInstance().getRouter());
		this.router.use("/settings", SystemConfigRouter.getInstance().getRouter());
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
