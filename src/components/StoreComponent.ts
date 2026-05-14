import { ErrorConfig } from "@configs/ErrorConfig";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { ApiError } from "@middlewares/ApiError";
import { StoreInterface } from "@interfaces/StoreInterface";
import { UnitInterface } from "@interfaces/UnitInterface";
import { CreateStoreInput, Store } from "@models/Store";

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
	"out_stock_threshold",
	"low_stock_threshold",
	"max_branches_override",
	"pdf_show_logo",
	"pdf_show_signature",
	"pdf_show_note",
	"pdf_header_color",
	"pdf_company_name",
	"pdf_company_address",
	"pdf_company_phone",
];

type UpdatableStoreKey = (typeof UPDATABLE_FIELDS)[number];
type StoreActor = {
	userId: string;
	systemRole: string;
};

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
	private static async assertAccess(store: Store, actor: StoreActor): Promise<void> {
		if (actor.systemRole === "system_admin") return;
		if (actor.systemRole === "superadmin" && store.owner_user_id === actor.userId) return;
		const access = await RbacInterface.getUserPermissions(actor.userId);
		if (access.memberships.some((membership) => membership.store_id === store.id)) return;
		throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
	}

	static async getAll(requestId: string, actor: StoreActor): Promise<Store[]> {
		void requestId;
		if (actor.systemRole === "system_admin") {
			return StoreInterface.findAll();
		}

		if (actor.systemRole === "superadmin") {
			const access = await RbacInterface.getUserPermissions(actor.userId);
			const accessibleStoreIds = new Set(access.memberships.map((membership) => membership.store_id));
			return (await StoreInterface.findAll()).filter((store) => (
				store.owner_user_id === actor.userId || accessibleStoreIds.has(store.id)
			));
		}

		const access = await RbacInterface.getUserPermissions(actor.userId);
		const memberStoreIds = new Set(access.memberships.map((membership) => membership.store_id));
		return (await StoreInterface.findAll()).filter((store) => memberStoreIds.has(store.id));
	}

	static async getById(requestId: string, id: string, actor: StoreActor): Promise<Store> {
		void requestId;
		const store = await StoreInterface.findById(id);
		if (!store) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		await StoreComponent.assertAccess(store, actor);
		return store;
	}

	static async create(requestId: string, payload: CreateStoreInput, actor: StoreActor): Promise<Store> {
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
			await RbacInterface.ensureDefaultRolesForStore(created.id);
			await RbacInterface.ensureOwnerMembershipForStore(created.id, actor.userId);
			await UnitInterface.ensureDefaultUnitsForStore(created.id);
			return created;
		}

		if (actor.systemRole === "system_admin") {
			if (!payload.owner_user_id) {
				throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_OWNER_REQUIRED);
			}
			const created = await StoreInterface.create(payload);
			await RbacInterface.ensureDefaultRolesForStore(created.id);
			await RbacInterface.ensureOwnerMembershipForStore(created.id, payload.owner_user_id);
			await UnitInterface.ensureDefaultUnitsForStore(created.id);
			return created;
		}

		throw ApiError.ForbiddenError("User cannot create stores");
	}

	static async update(requestId: string, id: string, data: Record<string, unknown>, actor: StoreActor): Promise<Store> {
		void requestId;
		const existing = await StoreInterface.findById(id);
		if (!existing) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		await StoreComponent.assertAccess(existing, actor);

		const updateData = pickUpdateFields(data || {});
		if (actor.systemRole !== "system_admin") {
			delete (updateData as Partial<Store>).owner_user_id;
		}
		return StoreInterface.update(id, updateData);
	}

	static async delete(requestId: string, id: string, actor: StoreActor): Promise<void> {
		void requestId;
		const store = await StoreInterface.findById(id);
		if (!store) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
		await StoreComponent.assertAccess(store, actor);

		const ok = await StoreInterface.delete(id);
		if (!ok) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.STORE_NOT_FOUND);
		}
	}
}
