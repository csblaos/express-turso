import { ErrorConfig } from "@configs/ErrorConfig";
import { DbConn } from "@connections/DbConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { StoreAccessActor, StoreInterface } from "@interfaces/StoreInterface";
import { StoreCostMethodHistoryInterface } from "@interfaces/StoreCostMethodHistoryInterface";
import { UnitInterface } from "@interfaces/UnitInterface";
import { CreateStoreInput, Store } from "@models/Store";
import { R2Storage } from "@storage/R2Storage";

const UPDATABLE_FIELDS: Array<keyof Store> = [
	"name",
	"logo_name",
	"logo_url",
	"address",
	"phone_number",
	"store_type",
	"currency",
	"supported_currencies",
	"vat_enabled",
	"vat_rate",
	"vat_mode",
	"cost_method",
	"out_stock_threshold",
	"low_stock_threshold",
	"allow_negative_stock",
	"max_branches_override",
	"pdf_show_logo",
	"pdf_show_signature",
	"pdf_show_note",
	"pdf_header_color",
	"pdf_company_name",
	"pdf_company_address",
	"pdf_company_phone",
	"receipt_show_store_address",
	"receipt_show_store_phone",
	"receipt_show_store_name",
	"receipt_show_tendered",
	"receipt_show_change",
	"receipt_show_payment_method",
	"receipt_show_queue",
	"pickup_queue_enabled",
	"business_day_start_minutes",
];

type UpdatableStoreKey = (typeof UPDATABLE_FIELDS)[number];
const ALLOWED_COST_METHODS = new Set([ "average", "fifo" ]);

function pickUpdateFields(input: Record<string, unknown>): Partial<Store> {
	const result: Partial<Record<UpdatableStoreKey, Store[UpdatableStoreKey]>> = {};
	for (const key of UPDATABLE_FIELDS) {
		if (Object.prototype.hasOwnProperty.call(input, key)) {
			result[key] = input[key] as Store[UpdatableStoreKey];
		}
	}
	return result as Partial<Store>;
}

export class StoreComponent {
	static async getAll(requestId: string, actor: StoreAccessActor): Promise<Store[]> {
		void requestId;
		return StoreInterface.findAccessible(actor);
	}

	static async getById(requestId: string, id: string, actor: StoreAccessActor): Promise<Store> {
		void requestId;
		const store = await StoreInterface.findAccessibleById(id, actor);
		if (!store) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		return store;
	}

	static async create(requestId: string, payload: CreateStoreInput, actor: StoreAccessActor): Promise<Store> {
		void requestId;
		if (!payload?.name) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NAME_REQUIRED);
		}

		if (actor.systemRole === "superadmin") {
			const user = await AuthInterface.findUserById(actor.userId);
			if (!user || !user.can_create_stores) {
				throw ApiError.ForbiddenError("User cannot create stores");
			}

			const ownedStores = await StoreInterface.countByOwnerUserId(actor.userId);
			const maxStores = Math.max(1, Number(user.max_stores || 1));
			if (ownedStores >= maxStores) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_LIMIT_REACHED);
			}

			const created = await StoreInterface.create({
				...payload,
				owner_user_id: actor.userId,
			});
			// Unit seeding does not depend on roles, so it runs alongside the role
			// and membership chain instead of waiting for it.
			await Promise.all([
				(async () => {
					await RbacInterface.ensureDefaultRolesForStore(created.id);
					await RbacInterface.ensureOwnerMembershipForStore(created.id, actor.userId);
				})(),
				UnitInterface.ensureDefaultUnitsForStore(created.id),
			]);
			return created;
		}

		if (actor.systemRole === "system_admin") {
			if (!payload.owner_user_id) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_OWNER_REQUIRED);
			}
			const created = await StoreInterface.create(payload);
			const ownerUserId = payload.owner_user_id;
			await Promise.all([
				(async () => {
					await RbacInterface.ensureDefaultRolesForStore(created.id);
					await RbacInterface.ensureOwnerMembershipForStore(created.id, ownerUserId);
				})(),
				UnitInterface.ensureDefaultUnitsForStore(created.id),
			]);
			return created;
		}

		throw ApiError.ForbiddenError("User cannot create stores");
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>, actor: StoreAccessActor): Promise<Store> {
		void requestId;
		const existing = await StoreInterface.findAccessibleById(id, actor);
		if (!existing) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}

		const updateData = pickUpdateFields(data || {});
		if (typeof updateData.cost_method === "string" && !ALLOWED_COST_METHODS.has(updateData.cost_method)) {
			throw ApiError.BadRequestError("Invalid cost method");
		}
		if (updateData.business_day_start_minutes !== undefined) {
			const minutes = Number(updateData.business_day_start_minutes);
			if (!Number.isInteger(minutes) || minutes < 0 || minutes > 1439) {
				throw ApiError.BadRequestError("Invalid business day start time");
			}
			updateData.business_day_start_minutes = minutes;
		}
		if (actor.systemRole !== "system_admin") {
			delete (updateData as Partial<Store>).owner_user_id;
		}
		if (typeof updateData.logo_url === "string" && updateData.logo_url.trim().startsWith("data:")) {
			const uploaded = await R2Storage.uploadStoreLogo({
				storeId: id,
				dataUrl: updateData.logo_url,
			});
			updateData.logo_url = uploaded.key;
		}

		const costMethodChanged = typeof updateData.cost_method === "string" && updateData.cost_method !== existing.cost_method;
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			const updated = await StoreInterface.update(id, updateData, transaction);
			if (costMethodChanged) {
				await StoreCostMethodHistoryInterface.insert({
					store_id: id,
					cost_method: updated.cost_method,
					actor_user_id: actor.userId,
				}, transaction);
			}
			await transaction.commit();
			return updated;
		} catch (error) {
			if (!transaction.closed) {
				try {
					await transaction.rollback();
				} catch {
					// keep original error
				}
			}
			throw error;
		} finally {
			transaction.close();
		}
	}

	static async delete(requestId: string, id: string, actor: StoreAccessActor): Promise<void> {
		void requestId;
		if (actor.systemRole !== "superadmin" && actor.systemRole !== "system_admin") {
			throw ApiError.ForbiddenError("Only Super Admin can permanently delete a store");
		}
		const store = await StoreInterface.findAccessibleById(id, actor);
		if (!store) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}

		const assetKeys = await StoreInterface.findAssetKeys(id);
		const ok = await StoreInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		await Promise.allSettled(assetKeys.map((assetKey) => R2Storage.deleteObject(assetKey)));
	}
}
