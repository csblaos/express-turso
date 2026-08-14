import { Router } from "express";

import { PrintQueueController } from "@controllers/PrintQueueController";
import { AuthGuardMiddleware } from "@middlewares/AuthGuardMiddleware";
import { PermissionMiddleware } from "@middlewares/PermissionMiddleware";
import { PrintAgentMiddleware } from "@middlewares/PrintAgentMiddleware";
import { RoleScopeMiddleware } from "@middlewares/RoleScopeMiddleware";
import PrintQueueValidator from "@validators/PrintQueueValidator";

export class PrintQueueRouter {
	private static instance: PrintQueueRouter;
	private readonly router: Router = Router();

	private constructor() {
		// Agent routes come first and carry their own authentication: an agent has
		// no user session and no store workspace to scope, only its own token.
		this.router.post("/agent/jobs/claim", PrintAgentMiddleware.requireAgent(), PrintQueueValidator.claim, PrintQueueController.claim);
		this.router.post("/agent/jobs/:id/complete", PrintAgentMiddleware.requireAgent(), PrintQueueValidator.complete, PrintQueueController.complete);

		this.router.use(AuthGuardMiddleware.requireAuth(), RoleScopeMiddleware.requireStoreWorkspace());
		this.router.get("/printers", PermissionMiddleware.require("settings.printing.view"), PrintQueueValidator.query, PrintQueueController.printers);
		this.router.post("/printers", PermissionMiddleware.require("settings.printing.update"), PrintQueueValidator.printer, PrintQueueController.createPrinter);
		this.router.put("/printers/:id", PermissionMiddleware.require("settings.printing.update"), PrintQueueValidator.printer, PrintQueueController.updatePrinter);
		this.router.delete("/printers/:id", PermissionMiddleware.require("settings.printing.update"), PrintQueueController.deletePrinter);
		this.router.get("/agents", PermissionMiddleware.require("settings.printing.view"), PrintQueueValidator.query, PrintQueueController.agents);
		this.router.post("/agents", PermissionMiddleware.require("settings.printing.update"), PrintQueueValidator.agent, PrintQueueController.createAgent);
		this.router.delete("/agents/:id", PermissionMiddleware.require("settings.printing.update"), PrintQueueController.deleteAgent);
		this.router.get("/jobs", PermissionMiddleware.require("settings.printing.view"), PrintQueueValidator.query, PrintQueueController.jobs);
		this.router.post("/jobs/:id/retry", PermissionMiddleware.require("settings.printing.update"), PrintQueueController.retryJob);
	}

	static getInstance(): PrintQueueRouter {
		if (!PrintQueueRouter.instance) {
			PrintQueueRouter.instance = new PrintQueueRouter();
		}
		return PrintQueueRouter.instance;
	}

	getRouter(): Router {
		return this.router;
	}
}
