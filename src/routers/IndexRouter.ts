import { Router } from "express";

import { StoreRouter } from "@routers/StoreRouter";

export class IndexRouter {
	private static instance: IndexRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.get("/health", (req, res) => {
			res.status(200).json({ success: true, message: "Server is running" });
		});

		this.router.use("/stores", StoreRouter.getInstance().getRouter());
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

