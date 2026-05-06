import { Router } from "express";

import { AuthController } from "@controllers/AuthController";
import AuthValidator from "@validators/AuthValidator";

export class AuthRouter {
	private static instance: AuthRouter;
	private readonly router: Router = Router();

	private constructor() {
		this.router.post("/login", AuthValidator.login, AuthController.login);
		this.router.post("/refresh", AuthValidator.refresh, AuthController.refresh);
		this.router.post("/logout", AuthValidator.logout, AuthController.logout);
		this.router.get("/me", AuthController.me);
	}

	static getInstance(): AuthRouter {
		if (!AuthRouter.instance) {
			AuthRouter.instance = new AuthRouter();
		}
		return AuthRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
