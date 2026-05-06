import { Request, Response } from "express";

import { RbacComponent } from "@components/RbacComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateRoleInput, UpdateRoleInput } from "@models/Role";
import { SuccessHandler } from "@utils/SuccessHandler";

export class RbacController {
	static listPermissions = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.listPermissions(req.requestId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static listRoles = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const data = await RbacComponent.listRoles(req.requestId, storeId);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getRoleById = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.getRoleById(req.requestId, req.params.id as string);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static createRole = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.createRole(
			req.requestId,
			req.body as CreateRoleInput & { permission_keys?: string[] },
		);
		SuccessHandler.created(res, req.requestId, { data });
	});

	static updateRole = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.updateRole(
			req.requestId,
			req.params.id as string,
			req.body as UpdateRoleInput & { permission_keys?: string[] },
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static getUserPermissions = SyncFunction.handler(async (req: Request, res: Response) => {
		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const data = await RbacComponent.getUserPermissions(
			req.requestId,
			req.params.userId as string,
			storeId,
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static assignStoreMemberRole = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.assignStoreMemberRole(
			req.requestId,
			req.params.storeId as string,
			req.params.userId as string,
			req.body || {},
		);
		SuccessHandler.send(res, req.requestId, { data });
	});
}
