import { DbConn } from "@connections/DbConn";
import { StoreInterface } from "@interfaces/StoreInterface";
import { Store } from "@models/Store";

export type SuperadminStoreRecord = Store & {
	owner_user_name: string | null;
};

export class SuperadminStoreInterface {
	static async listByOwner(ownerUserId: string): Promise<SuperadminStoreRecord[]> {
		const stores = await StoreInterface.findAll(ownerUserId);
		if (!stores.length) return [];

		const db = DbConn.getClient();
		const storeIds = stores.map((store) => store.id);
		const placeholders = storeIds.map(() => "?").join(", ");
		const ownerMembershipsResult = await db.execute({
			sql: `
				SELECT
					sm.store_id,
					sm.user_id
				FROM store_members sm
				INNER JOIN roles r ON r.id = sm.role_id AND r.deleted_at IS NULL
				WHERE sm.store_id IN (${placeholders})
					AND LOWER(TRIM(r.name)) = 'owner'
				ORDER BY sm.created_at DESC
			`,
			args: storeIds,
		});
		const ownerUserIdByStoreId = new Map<string, string>();
		for (const row of ownerMembershipsResult.rows) {
			const storeId = String(row.store_id || "");
			const userId = String(row.user_id || "");
			if (!storeId || !userId || ownerUserIdByStoreId.has(storeId)) continue;
			ownerUserIdByStoreId.set(storeId, userId);
		}

		const ownerUserIds = new Set<string>();
		for (const store of stores) {
			const membershipOwnerId = ownerUserIdByStoreId.get(store.id);
			if (membershipOwnerId) {
				ownerUserIds.add(membershipOwnerId);
			}
			if (store.owner_user_id) {
				ownerUserIds.add(store.owner_user_id);
			}
		}

		const ownerUserNameById = new Map<string, string>();
		if (ownerUserIds.size > 0) {
			const ownerUserIdList = Array.from(ownerUserIds);
			const userPlaceholders = ownerUserIdList.map(() => "?").join(", ");
			const usersResult = await db.execute({
				sql: `
					SELECT id, name, email
					FROM users
					WHERE id IN (${userPlaceholders})
				`,
				args: ownerUserIdList,
			});

			for (const row of usersResult.rows) {
				const userId = String(row.id || "");
				if (!userId) continue;

				const name = typeof row.name === "string" ? row.name.trim() : "";
				const email = typeof row.email === "string" ? row.email.trim() : "";
				const label = name || email;
				if (label) {
					ownerUserNameById.set(userId, label);
				}
			}
		}

		return stores.map((store) => ({
			...store,
			owner_user_name: (
				ownerUserNameById.get(ownerUserIdByStoreId.get(store.id) || store.owner_user_id || "") || null
			),
		}));
	}
}
