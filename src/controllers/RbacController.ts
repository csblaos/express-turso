import { Request, Response } from "express";

import { RbacComponent } from "@components/RbacComponent";
import { SyncFunction } from "@middlewares/SyncFunction";
import { CreateRoleInput, UpdateRoleInput } from "@models/Role";
import { SuccessHandler } from "@utils/SuccessHandler";

export class RbacController {
	static listStoreMembers = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.listStoreMembers(req.requestId, {
			store_id: String(req.query.store_id),
			search: typeof req.query.search === "string" ? req.query.search : undefined,
			status: typeof req.query.status === "string" ? req.query.status : undefined,
			role_id: typeof req.query.role_id === "string" ? req.query.role_id : undefined,
		}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

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

	static duplicateRole = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.duplicateRole(
			req.requestId,
			req.params.id as string,
			req.body || {},
		);
		SuccessHandler.created(res, req.requestId, { data });
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
			{
				userId: req.auth?.userId || "",
				systemRole: req.auth?.systemRole || "",
			},
		);
		SuccessHandler.send(res, req.requestId, { data });
	});

	static createStoreMember = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.createStoreMember(req.requestId, req.body || {}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.created(res, req.requestId, { data });
	});

	static updateStoreMemberStatus = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.updateStoreMemberStatus(req.requestId, {
			store_id: req.params.storeId as string,
			user_id: req.params.userId as string,
			status: req.body?.status,
			added_by: req.body?.added_by,
		}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});

	static resetStoreMemberPassword = SyncFunction.handler(async (req: Request, res: Response) => {
		const data = await RbacComponent.resetStoreMemberPassword(req.requestId, {
			store_id: req.params.storeId as string,
			user_id: req.params.userId as string,
			password: req.body?.password,
			must_change_password: req.body?.must_change_password,
			actor_user_id: req.body?.actor_user_id,
		}, {
			userId: req.auth?.userId || "",
			systemRole: req.auth?.systemRole || "",
		});
		SuccessHandler.send(res, req.requestId, { data });
	});
}
