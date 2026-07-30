import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";

export type PromotionType = "buy_x_get_y" | "cart_total_gift" | "cart_discount" | "cart_threshold_discount";
export type PromotionInput = {
	name: string;
	type: PromotionType;
	qualifying_product_id?: string | null;
	qualifying_qty?: number | null;
	minimum_subtotal?: number | null;
	gift_product_id?: string | null;
	gift_qty?: number | null;
	discount_method?: "percent" | "fixed" | null;
	discount_value?: number | null;
	max_applications_per_bill?: number | null;
	max_discount_amount_per_bill?: number | null;
	starts_at?: string | null;
	ends_at?: string | null;
	is_active?: boolean | number;
	apply_mode?: "automatic" | "manual";
};
export type PromotionCartItem = { product_id: string; qty: number; is_gift?: boolean };
export type AppliedPromotion = {
	promotion_id: string;
	name: string;
	type: PromotionType;
	apply_mode: "automatic" | "manual";
	applications: number;
	qualifying_product_id?: string | null;
	qualifying_qty?: number | null;
	gift_product_id: string | null;
	gift_product_name?: string;
	gift_qty: number;
	discount_method?: "percent" | "fixed" | null;
	discount_value?: number;
	discount_amount: number;
	max_applications_per_bill?: number | null;
	max_discount_amount_per_bill?: number | null;
	eligible?: boolean;
	remaining_qty?: number;
	remaining_amount?: number;
};

type Executor = {
	execute: (statement: any) => Promise<{ rows: any[] }>;
	batch?: (statements: any[]) => Promise<Array<{ rows: any[] }>>;
};

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
				discount_method TEXT, discount_value REAL, max_applications_per_bill INTEGER, max_discount_amount_per_bill REAL,
				apply_mode TEXT NOT NULL DEFAULT 'manual', is_active INTEGER NOT NULL DEFAULT 1, deleted_at TEXT, created_by TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
			)`);
			await db.execute(`CREATE TABLE IF NOT EXISTS order_promotions (
				id TEXT PRIMARY KEY, order_id TEXT NOT NULL, promotion_id TEXT NOT NULL, promotion_name TEXT NOT NULL,
				promotion_type TEXT NOT NULL, applications INTEGER NOT NULL, gift_product_id TEXT NOT NULL, gift_qty INTEGER NOT NULL,
				discount_amount REAL NOT NULL DEFAULT 0, created_at TEXT NOT NULL
			)`);
			await db.execute("CREATE INDEX IF NOT EXISTS idx_promotions_store_active ON promotions (store_id, is_active, starts_at, ends_at)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_order_promotions_order ON order_promotions (order_id)");
			const itemInfo = await db.execute("PRAGMA table_info(order_items)");
			const columns = new Set(itemInfo.rows.map((row: any) => String(row.name)));
			if (!columns.has("is_gift")) await db.execute("ALTER TABLE order_items ADD COLUMN is_gift INTEGER NOT NULL DEFAULT 0");
			if (!columns.has("promotion_id")) await db.execute("ALTER TABLE order_items ADD COLUMN promotion_id TEXT");
			const promotionInfo = await db.execute("PRAGMA table_info(promotions)");
			const promotionColumns = new Set(promotionInfo.rows.map((row: any) => String(row.name)));
			if (!promotionColumns.has("apply_mode")) await db.execute("ALTER TABLE promotions ADD COLUMN apply_mode TEXT NOT NULL DEFAULT 'manual'");
			if (!promotionColumns.has("discount_method")) await db.execute("ALTER TABLE promotions ADD COLUMN discount_method TEXT");
			if (!promotionColumns.has("discount_value")) await db.execute("ALTER TABLE promotions ADD COLUMN discount_value REAL");
			if (!promotionColumns.has("max_applications_per_bill")) await db.execute("ALTER TABLE promotions ADD COLUMN max_applications_per_bill INTEGER");
			if (!promotionColumns.has("max_discount_amount_per_bill")) await db.execute("ALTER TABLE promotions ADD COLUMN max_discount_amount_per_bill REAL");
			const orderPromotionInfo = await db.execute("PRAGMA table_info(order_promotions)");
			const orderPromotionColumns = new Set(orderPromotionInfo.rows.map((row: any) => String(row.name)));
			if (!orderPromotionColumns.has("discount_amount")) await db.execute("ALTER TABLE order_promotions ADD COLUMN discount_amount REAL NOT NULL DEFAULT 0");
		})();
		try { await PromotionInterface.ensured; } catch (error) { PromotionInterface.ensured = null; throw error; }
	}

	static async list(storeId: string): Promise<Array<Record<string, unknown>>> {
		await PromotionInterface.ensureTables();
		const db = DbConn.getClient();
		const result = await db.execute({ sql: `SELECT p.*, gp.name AS gift_product_name, qp.name AS qualifying_product_name,
			COALESCE((SELECT COUNT(DISTINCT op.order_id) FROM order_promotions op WHERE op.promotion_id = p.id), 0) AS order_count,
			COALESCE((SELECT SUM(op.applications) FROM order_promotions op WHERE op.promotion_id = p.id), 0) AS application_count,
			COALESCE((SELECT SUM(op.gift_qty) FROM order_promotions op WHERE op.promotion_id = p.id), 0) AS gift_quantity
			FROM promotions p LEFT JOIN products gp ON gp.id = p.gift_product_id LEFT JOIN products qp ON qp.id = p.qualifying_product_id
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
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, args: [ id, storeId, text(input.name), input.type, input.qualifying_product_id || null, input.qualifying_qty || null, input.minimum_subtotal || null, input.gift_product_id || "", input.gift_qty || 0, input.starts_at || null, input.ends_at || null, input.is_active === false || Number(input.is_active) === 0 ? 0 : 1, actorId, now, now ] });
		await db.execute({ sql: "UPDATE promotions SET apply_mode=?,discount_method=?,discount_value=?,max_applications_per_bill=?,max_discount_amount_per_bill=? WHERE id=?", args: [ input.apply_mode === "automatic" ? "automatic" : "manual", input.discount_method || null, input.discount_value || null, input.max_applications_per_bill || null, input.max_discount_amount_per_bill || null, id ] });
		return (await PromotionInterface.list(storeId)).find((row) => row.id === id) || { id };
	}

	static async update(storeId: string, id: string, input: PromotionInput): Promise<Record<string, unknown>> {
		await PromotionInterface.ensureTables();
		PromotionInterface.assertInput(input);
		const db = DbConn.getClient();
		await PromotionInterface.assertProducts(db as Executor, storeId, input);
		const result = await db.execute({ sql: `UPDATE promotions SET name=?, type=?, qualifying_product_id=?, qualifying_qty=?, minimum_subtotal=?, gift_product_id=?, gift_qty=?, discount_method=?, discount_value=?, max_applications_per_bill=?, max_discount_amount_per_bill=?, starts_at=?, ends_at=?, is_active=?, apply_mode=?, updated_at=? WHERE id=? AND store_id=? AND deleted_at IS NULL`, args: [ text(input.name), input.type, input.qualifying_product_id || null, input.qualifying_qty || null, input.minimum_subtotal || null, input.gift_product_id || "", input.gift_qty || 0, input.discount_method || null, input.discount_value || null, input.max_applications_per_bill || null, input.max_discount_amount_per_bill || null, input.starts_at || null, input.ends_at || null, input.is_active === false || Number(input.is_active) === 0 ? 0 : 1, input.apply_mode === "automatic" ? "automatic" : "manual", new Date().toISOString(), id, storeId ] });
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
		const activeStatement = { sql: `SELECT p.*, gp.name AS gift_product_name FROM promotions p LEFT JOIN products gp ON gp.id=p.gift_product_id WHERE p.store_id=? AND p.is_active=1 AND p.deleted_at IS NULL AND (p.starts_at IS NULL OR p.starts_at <= ?) AND (p.ends_at IS NULL OR p.ends_at >= ?)`, args: [ storeId, now, now ] };
		// `undefined` means evaluate every active promotion for discovery. An explicit
		// empty list means the cashier selected none; do not silently apply all promos.
		const selected = selectedIds === undefined ? null : new Set(selectedIds);
		const paidItems = items.filter((item) => !item.is_gift && number(item.qty) > 0);
		const qtyByProduct = new Map<string, number>();
		for (const item of paidItems) qtyByProduct.set(item.product_id, (qtyByProduct.get(item.product_id) || 0) + number(item.qty));
		const productStatement = paidItems.length
			? { sql: `SELECT id, price_base FROM products WHERE store_id=? AND id IN (${[ ...qtyByProduct.keys() ].map(() => "?").join(",")})`, args: [ storeId, ...qtyByProduct.keys() ] }
			: null;
		let active: { rows: any[] };
		let productRows: { rows: any[] };
		if (productStatement && db.batch) {
			[ active, productRows ] = await db.batch([ activeStatement, productStatement ]);
		} else {
			active = await db.execute(activeStatement);
			productRows = productStatement ? await db.execute(productStatement) : { rows: [] };
		}
		const priceByProduct = new Map(productRows.rows.map((row: any) => [ String(row.id), number(row.price_base) ]));
		const subtotal = [ ...qtyByProduct.entries() ].reduce((sum, [ id, qty ]) => sum + (priceByProduct.get(id) || 0) * qty, 0);
		return (active.rows as any[]).flatMap((row) => {
			if (selected && !selected.has(String(row.id))) return [];
			const type = String(row.type) as PromotionType;
			const rawApplications = type === "buy_x_get_y"
				? Math.floor((qtyByProduct.get(String(row.qualifying_product_id)) || 0) / number(row.qualifying_qty))
				: type === "cart_total_gift"
					? Math.floor(subtotal / number(row.minimum_subtotal))
					: type === "cart_threshold_discount" ? (subtotal >= number(row.minimum_subtotal) ? 1 : 0) : (subtotal > 0 ? 1 : 0);
			const applicationLimit = number(row.max_applications_per_bill);
			const applications = applicationLimit > 0 ? Math.min(rawApplications, applicationLimit) : rawApplications;
			const isGift = type === "buy_x_get_y" || type === "cart_total_gift";
			const giftQty = isGift ? applications * number(row.gift_qty) : 0;
			const uncappedDiscount = !isGift && applications > 0
				? String(row.discount_method) === "percent" ? subtotal * number(row.discount_value) / 100 : number(row.discount_value)
				: 0;
			const discountLimit = number(row.max_discount_amount_per_bill);
			const discountAmount = Math.max(0, Math.min(subtotal, discountLimit > 0 ? Math.min(uncappedDiscount, discountLimit) : uncappedDiscount));
			if (selected && applications <= 0) return [];
			return [{
				promotion_id: String(row.id),
				name: String(row.name),
				type,
				apply_mode: String(row.apply_mode || "manual") === "automatic" ? "automatic" : "manual",
				applications,
				qualifying_product_id: row.qualifying_product_id ? String(row.qualifying_product_id) : null,
				qualifying_qty: row.qualifying_qty ? number(row.qualifying_qty) : null,
				gift_product_id: isGift ? String(row.gift_product_id) : null,
				gift_product_name: String(row.gift_product_name || ""),
				gift_qty: giftQty,
				discount_method: isGift ? null : (String(row.discount_method) as "percent" | "fixed"),
				discount_value: isGift ? 0 : number(row.discount_value),
				discount_amount: discountAmount,
				max_applications_per_bill: applicationLimit > 0 ? applicationLimit : null,
				max_discount_amount_per_bill: discountLimit > 0 ? discountLimit : null,
				eligible: applications > 0,
				remaining_qty: String(row.type) === "buy_x_get_y" && applications === 0 ? Math.max(0, number(row.qualifying_qty) - (qtyByProduct.get(String(row.qualifying_product_id)) || 0)) : 0,
				remaining_amount: (type === "cart_total_gift" || type === "cart_threshold_discount") && applications === 0 ? Math.max(0, number(row.minimum_subtotal) - subtotal) : 0,
			}];
		});
	}

	private static assertInput(input: PromotionInput): void {
		if (!text(input.name)) throw ApiError.BadRequestError("promotion name is required");
		if (![ "buy_x_get_y", "cart_total_gift", "cart_discount", "cart_threshold_discount" ].includes(input.type)) throw ApiError.BadRequestError("promotion type is invalid");
		const isGift = input.type === "buy_x_get_y" || input.type === "cart_total_gift";
		if (isGift && (!text(input.gift_product_id) || !Number.isInteger(number(input.gift_qty)) || number(input.gift_qty) <= 0)) throw ApiError.BadRequestError("gift product and positive gift quantity are required");
		if (!isGift && (![ "percent", "fixed" ].includes(String(input.discount_method)) || number(input.discount_value) <= 0 || (input.discount_method === "percent" && number(input.discount_value) > 100))) throw ApiError.BadRequestError("valid discount method and value are required");
		if (input.type === "buy_x_get_y" && (!text(input.qualifying_product_id) || !Number.isInteger(number(input.qualifying_qty)) || number(input.qualifying_qty) <= 0)) throw ApiError.BadRequestError("qualifying product and quantity are required");
		if ((input.type === "cart_total_gift" || input.type === "cart_threshold_discount") && number(input.minimum_subtotal) <= 0) throw ApiError.BadRequestError("minimum subtotal is required");
		if (input.max_applications_per_bill != null && (!Number.isInteger(number(input.max_applications_per_bill)) || number(input.max_applications_per_bill) <= 0)) throw ApiError.BadRequestError("maximum applications per bill must be a positive integer");
		if (input.max_discount_amount_per_bill != null && number(input.max_discount_amount_per_bill) <= 0) throw ApiError.BadRequestError("maximum discount amount per bill must be positive");
		if (input.starts_at && input.ends_at && new Date(input.starts_at) > new Date(input.ends_at)) throw ApiError.BadRequestError("start date must be before end date");
	}

	private static async assertProducts(db: Executor, storeId: string, input: PromotionInput): Promise<void> {
		// A Buy X Get Y promotion may use the same product for both the qualifying
		// and gift lines. Query each id once; SQL returns one row for that product.
		const ids = [ ...new Set([ input.type === "buy_x_get_y" || input.type === "cart_total_gift" ? input.gift_product_id : null, input.type === "buy_x_get_y" ? input.qualifying_product_id : null ].filter(Boolean) as string[]) ];
		if (!ids.length) return;
		const found = await db.execute({ sql: `SELECT id FROM products WHERE store_id=? AND deleted_at IS NULL AND id IN (${ids.map(() => "?").join(",")})`, args: [ storeId, ...ids ] });
		if (found.rows.length !== ids.length) throw ApiError.BadRequestError("promotion products must belong to this store");
	}
}
