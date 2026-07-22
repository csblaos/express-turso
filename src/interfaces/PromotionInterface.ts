import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";

export type PromotionType = "buy_x_get_y" | "cart_total_gift";
export type PromotionInput = {
	name: string;
	type: PromotionType;
	qualifying_product_id?: string | null;
	qualifying_qty?: number | null;
	minimum_subtotal?: number | null;
	gift_product_id: string;
	gift_qty: number;
	starts_at?: string | null;
	ends_at?: string | null;
	is_active?: boolean | number;
};
export type PromotionCartItem = { product_id: string; qty: number; is_gift?: boolean };
export type AppliedPromotion = { promotion_id: string; name: string; type: PromotionType; applications: number; gift_product_id: string; gift_qty: number };

type Executor = { execute: (statement: any) => Promise<{ rows: any[] }> };

function text(value: unknown): string { return String(value || "").trim(); }
function number(value: unknown): number { const parsed = Number(value); return Number.isFinite(parsed) ? parsed : 0; }

export class PromotionInterface {
	private static ensured: Promise<void> | null = null;

	static async ensureTables(): Promise<void> {
		if (PromotionInterface.ensured) return PromotionInterface.ensured;
		PromotionInterface.ensured = (async () => {
			const db = DbConn.getClient();
			await db.execute(`CREATE TABLE IF NOT EXISTS promotions (
				id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, type TEXT NOT NULL,
				qualifying_product_id TEXT, qualifying_qty INTEGER, minimum_subtotal REAL,
				gift_product_id TEXT NOT NULL, gift_qty INTEGER NOT NULL, starts_at TEXT, ends_at TEXT,
				is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			)`);
			await db.execute(`CREATE TABLE IF NOT EXISTS order_promotions (
				id TEXT PRIMARY KEY, order_id TEXT NOT NULL, promotion_id TEXT NOT NULL, promotion_name TEXT NOT NULL,
				promotion_type TEXT NOT NULL, applications INTEGER NOT NULL, gift_product_id TEXT NOT NULL, gift_qty INTEGER NOT NULL, created_at TEXT NOT NULL
			)`);
			await db.execute("CREATE INDEX IF NOT EXISTS idx_promotions_store_active ON promotions (store_id, is_active, starts_at, ends_at)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_order_promotions_order ON order_promotions (order_id)");
			const itemInfo = await db.execute("PRAGMA table_info(order_items)");
			const columns = new Set(itemInfo.rows.map((row: any) => String(row.name)));
			if (!columns.has("is_gift")) await db.execute("ALTER TABLE order_items ADD COLUMN is_gift INTEGER NOT NULL DEFAULT 0");
			if (!columns.has("promotion_id")) await db.execute("ALTER TABLE order_items ADD COLUMN promotion_id TEXT");
		})();
		try { await PromotionInterface.ensured; } catch (error) { PromotionInterface.ensured = null; throw error; }
	}

	static async list(storeId: string): Promise<Array<Record<string, unknown>>> {
		await PromotionInterface.ensureTables();
		const db = DbConn.getClient();
		const result = await db.execute({ sql: `SELECT p.*, gp.name AS gift_product_name, qp.name AS qualifying_product_name,
			COALESCE((SELECT COUNT(*) FROM order_promotions op WHERE op.promotion_id = p.id), 0) AS order_count
			FROM promotions p JOIN products gp ON gp.id = p.gift_product_id LEFT JOIN products qp ON qp.id = p.qualifying_product_id
			WHERE p.store_id = ? AND p.deleted_at IS NULL ORDER BY p.created_at DESC`, args: [ storeId ] });
		return result.rows as Array<Record<string, unknown>>;
	}

	static async create(storeId: string, input: PromotionInput, actorId: string): Promise<Record<string, unknown>> {
		await PromotionInterface.ensureTables();
		PromotionInterface.assertInput(input);
		const now = new Date().toISOString();
		const id = randomUUID();
		const db = DbConn.getClient();
		await PromotionInterface.assertProducts(db as Executor, storeId, input);
		await db.execute({ sql: `INSERT INTO promotions (id, store_id, name, type, qualifying_product_id, qualifying_qty, minimum_subtotal, gift_product_id, gift_qty, starts_at, ends_at, is_active, created_by, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [ id, storeId, text(input.name), input.type, input.qualifying_product_id || null, input.qualifying_qty || null, input.minimum_subtotal || null, input.gift_product_id, input.gift_qty, input.starts_at || null, input.ends_at || null, input.is_active === false || Number(input.is_active) === 0 ? 0 : 1, actorId, now, now ] });
		return (await PromotionInterface.list(storeId)).find((row) => row.id === id) || { id };
	}

	static async update(storeId: string, id: string, input: PromotionInput): Promise<Record<string, unknown>> {
		await PromotionInterface.ensureTables();
		PromotionInterface.assertInput(input);
		const db = DbConn.getClient();
		await PromotionInterface.assertProducts(db as Executor, storeId, input);
		const result = await db.execute({ sql: `UPDATE promotions SET name=?, type=?, qualifying_product_id=?, qualifying_qty=?, minimum_subtotal=?, gift_product_id=?, gift_qty=?, starts_at=?, ends_at=?, is_active=?, updated_at=? WHERE id=? AND store_id=? AND deleted_at IS NULL`, args: [ text(input.name), input.type, input.qualifying_product_id || null, input.qualifying_qty || null, input.minimum_subtotal || null, input.gift_product_id, input.gift_qty, input.starts_at || null, input.ends_at || null, input.is_active === false || Number(input.is_active) === 0 ? 0 : 1, new Date().toISOString(), id, storeId ] });
		if (!(result as any).rowsAffected) throw ApiError.NotFoundError("promotion not found");
		return (await PromotionInterface.list(storeId)).find((row) => row.id === id) || { id };
	}

	static async archive(storeId: string, id: string): Promise<void> {
		await PromotionInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "UPDATE promotions SET deleted_at=?, is_active=0, updated_at=? WHERE id=? AND store_id=? AND deleted_at IS NULL", args: [ new Date().toISOString(), new Date().toISOString(), id, storeId ] });
		if (!(result as any).rowsAffected) throw ApiError.NotFoundError("promotion not found");
	}

	static async evaluate(storeId: string, items: PromotionCartItem[], selectedIds?: string[], executor?: Executor): Promise<AppliedPromotion[]> {
		await PromotionInterface.ensureTables();
		const db = executor || DbConn.getClient();
		const now = new Date().toISOString();
		const active = await db.execute({ sql: `SELECT * FROM promotions WHERE store_id=? AND is_active=1 AND deleted_at IS NULL AND (starts_at IS NULL OR starts_at <= ?) AND (ends_at IS NULL OR ends_at >= ?)`, args: [ storeId, now, now ] });
		const selected = selectedIds?.length ? new Set(selectedIds) : null;
		const paidItems = items.filter((item) => !item.is_gift && number(item.qty) > 0);
		const qtyByProduct = new Map<string, number>();
		for (const item of paidItems) qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + number(item.qty));
		const productRows = paidItems.length ? await db.execute({ sql: `SELECT id, price_base FROM products WHERE store_id=? AND id IN (${[ ...qtyByProduct.keys() ].map(() => "?").join(",")})`, args: [ storeId, ...qtyByProduct.keys() ] }) : { rows: [] };
		const priceByProduct = new Map(productRows.rows.map((row: any) => [ String(row.id), number(row.price_base) ]));
		const subtotal = [ ...qtyByProduct.entries() ].reduce((sum, [ id, qty ]) => sum + (priceByProduct.get(id) || 0) * qty, 0);
		return (active.rows as any[]).flatMap((row) => {
			if (selected && !selected.has(String(row.id))) return [];
			const applications = String(row.type) === "buy_x_get_y"
				? Math.floor((qtyByProduct.get(String(row.qualifying_product_id)) || 0) / number(row.qualifying_qty))
				: Math.floor(subtotal / number(row.minimum_subtotal));
			return applications > 0 ? [{ promotion_id: String(row.id), name: String(row.name), type: String(row.type) as PromotionType, applications, gift_product_id: String(row.gift_product_id), gift_qty: applications * number(row.gift_qty) }] : [];
		});
	}

	private static assertInput(input: PromotionInput): void {
		if (!text(input.name) || !text(input.gift_product_id) || !Number.isInteger(number(input.gift_qty)) || number(input.gift_qty) <= 0) throw ApiError.BadRequestError("promotion name, gift product, and positive gift quantity are required");
		if (input.type !== "buy_x_get_y" && input.type !== "cart_total_gift") throw ApiError.BadRequestError("promotion type is invalid");
		if (input.type === "buy_x_get_y" && (!text(input.qualifying_product_id) || !Number.isInteger(number(input.qualifying_qty)) || number(input.qualifying_qty) <= 0)) throw ApiError.BadRequestError("qualifying product and quantity are required");
		if (input.type === "cart_total_gift" && number(input.minimum_subtotal) <= 0) throw ApiError.BadRequestError("minimum subtotal is required");
		if (input.starts_at && input.ends_at && new Date(input.starts_at) > new Date(input.ends_at)) throw ApiError.BadRequestError("start date must be before end date");
	}

	private static async assertProducts(db: Executor, storeId: string, input: PromotionInput): Promise<void> {
		// A Buy X Get Y promotion may use the same product for both the qualifying
		// and gift lines. Query each id once; SQL returns one row for that product.
		const ids = [ ...new Set([ input.gift_product_id, input.type === "buy_x_get_y" ? input.qualifying_product_id : null ].filter(Boolean) as string[]) ];
		const found = await db.execute({ sql: `SELECT id FROM products WHERE store_id=? AND deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`, args: [ storeId, ...ids ] });
		if (found.rows.length !== ids.length) throw ApiError.BadRequestError("promotion products must belong to this store");
	}
}
