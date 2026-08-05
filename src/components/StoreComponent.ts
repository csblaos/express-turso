import { ErrorConfig } from "@configs/ErrorConfig";
import { randomUUID } from "crypto";
import { DbConn } from "@connections/DbConn";
import { AuditEventInterface } from "@interfaces/AuditEventInterface";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { StoreAccessActor, StoreInterface } from "@interfaces/StoreInterface";
import { StoreCostMethodHistoryInterface } from "@interfaces/StoreCostMethodHistoryInterface";
import { UnitInterface } from "@interfaces/UnitInterface";
import { CreateStoreInput, Store } from "@models/Store";
import { R2Storage } from "@storage/R2Storage";

const MAX_CUSTOMER_DISPLAY_ADS = 3;

function parseAdKeys(value: unknown): string[] {
	if (typeof value !== "string" || !value.trim()) return [];
	try {
		const parsed = JSON.parse(value);
		return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string" && Boolean(item.trim())) : [];
	} catch {
		return [];
	}
}

const UPDATABLE_FIELDS: Array<keyof Store> = [
	"name",
	"logo_name",
	"logo_url",
	"customer_display_enabled",
	"customer_display_ad_url",
	"customer_display_ads",
	"customer_display_ad_interval",
	"receipt_language",
	"receipt_show_powered_by",
	"customer_display_banner_enabled",
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

const ACTIVITY_STORE_FIELDS = new Set<UpdatableStoreKey>([
	"name", "address", "phone_number", "store_type", "currency", "supported_currencies",
	"vat_enabled", "vat_rate", "vat_mode", "cost_method", "out_stock_threshold",
	"low_stock_threshold", "allow_negative_stock", "receipt_language", "pickup_queue_enabled",
	"business_day_start_minutes", "customer_display_enabled", "customer_display_banner_enabled",
]);

function activitySnapshot(source: Partial<Store>, keys: UpdatableStoreKey[]): Record<string, unknown> {
	return Object.fromEntries(keys.map((key) => [ key, source[key] ?? null ]));
}

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
		// The advert gallery arrives as an array mixing freshly picked data URLs with
		// keys that are already stored. New ones are uploaded, dropped ones are
		// removed from R2 so deleting in the UI frees the object too.
		if (Array.isArray((data as Record<string, unknown>).customer_display_ads)) {
			const incoming = (data as Record<string, unknown>).customer_display_ads as unknown[];
			const resolved: string[] = [];
			for (const entry of incoming.slice(0, MAX_CUSTOMER_DISPLAY_ADS)) {
				if (typeof entry !== "string" || !entry.trim()) continue;
				if (entry.trim().startsWith("data:")) {
					const uploaded = await R2Storage.uploadStoreLogo({ storeId: id, dataUrl: entry });
					resolved.push(uploaded.key);
					continue;
				}
				resolved.push(entry.trim());
			}
			const previous = parseAdKeys(existing.customer_display_ads);
			if (existing.customer_display_ad_url) previous.push(existing.customer_display_ad_url);
			const removed = previous.filter((key) => !resolved.includes(key));
			await Promise.allSettled(removed.map((key) => R2Storage.deleteObject(key)));
			updateData.customer_display_ads = JSON.stringify(resolved);
			updateData.customer_display_ad_url = null;
		}

		const costMethodChanged = typeof updateData.cost_method === "string" && updateData.cost_method !== existing.cost_method;
		const changedActivityFields = (Object.keys(updateData) as UpdatableStoreKey[])
			.filter((key) => ACTIVITY_STORE_FIELDS.has(key))
			.filter((key) => existing[key] !== updateData[key]);
		// DDL is intentionally completed before opening the write transaction.
		if (changedActivityFields.length) await AuditEventInterface.ensureTable();
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			const updated = await StoreInterface.update(id, updateData, transaction);
			if (updateData.business_day_start_minutes !== undefined) {
				await transaction.execute({ sql: "UPDATE stores SET business_day_start_confirmed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?", args: [ id ] });
			}
			if (costMethodChanged) {
				await StoreCostMethodHistoryInterface.insert({
					store_id: id,
					cost_method: updated.cost_method,
					actor_user_id: actor.userId,
				}, transaction);
			}
			if (changedActivityFields.length) {
				await transaction.execute(AuditEventInterface.buildInsertStatement(randomUUID(), {
					scope: "settings",
					store_id: id,
					actor_user_id: actor.userId,
					actor_role: actor.systemRole || null,
					action: "store.settings_updated",
					entity_type: "store",
					entity_id: id,
					metadata: { changed_fields: changedActivityFields },
					before: activitySnapshot(existing, changedActivityFields),
					after: activitySnapshot(updated, changedActivityFields),
				}, new Date().toISOString()));
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
