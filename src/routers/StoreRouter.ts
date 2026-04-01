import { Router } from "express";

import { StoreController } from "@controllers/StoreController";

export class StoreRouter {
	private static instance: StoreRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/", StoreController.getAll);
		this.router.get("/:id", StoreController.getById);
		this.router.post("/", StoreController.create);
		this.router.put("/:id", StoreController.update);
		this.router.delete("/:id", StoreController.delete);
	}

	static getInstance(): StoreRouter {
		if (!StoreRouter.instance) {
			StoreRouter.instance = new StoreRouter();
		}
		return StoreRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}

