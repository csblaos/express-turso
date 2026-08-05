import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";
import { StoreInterface } from "@interfaces/StoreInterface";

export type InventoryCostSummaryRow = {
	store_id: string;
	product_id: string;
	qty_base_on_hand: number;
	total_cost_base: number;
	average_unit_cost_base: number;
	last_receipt_at: string | null;
	updated_at: string;
};

export type InventoryCostLayerRow = {
	id: string;
	store_id: string;
	product_id: string;
	source_type: string;
	source_id: string;
	source_line_id: string | null;
	cost_method: string;
	qty_base_in: number;
	qty_base_remaining: number;
	unit_cost_base: number;
	total_cost_base: number;
	note: string | null;
	meta_json: string | null;
	created_at: string;
	updated_at: string;
};

export type InventoryCostIssueAllocation = {
	product_id: string;
	qty_base: number;
	qty_from_layers: number;
	qty_uncosted: number;
	cost_base: number;
	unit_cost_base: number;
};

export type InventoryCostReceiptInput = {
	store_id: string;
	product_id: string;
	qty_base: number;
	unit_cost_base: number;
	source_type: string;
	source_id: string;
	source_line_id?: string | null;
	cost_method?: string | null;
	note?: string | null;
	meta?: Record<string, unknown> | null;
	received_at?: string;
};

// "batch" is included so a receipt can send its writes in one round trip; both
// the client and a transaction expose it.
type SqlExecutor = Pick<ReturnType<typeof DbConn.getClient>, "execute" | "batch">;

// Reads only. Callers that hold a transaction of their own often cannot offer a
// libsql-shaped batch(), and planning an issue never needs one.
type SqlReader = { execute: SqlExecutor["execute"] };

function toNumber(value: unknown): number {
	return Number(value ?? 0);
}

function normalizeOptionalString(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export class InventoryCostInterface {
	private static initialized = false;

	// Public so a caller holding a write transaction can run this first: it uses
	// its own connection, and issuing DDL on a second connection while a write
	// transaction is open both costs round trips and risks lock contention.
	static async ensureTables(): Promise<void> {
		if (InventoryCostInterface.initialized) return;

		const db = DbConn.getClient();
		await db.execute(`
			CREATE TABLE IF NOT EXISTS inventory_cost_summaries (
				store_id TEXT NOT NULL,
				product_id TEXT NOT NULL,
				qty_base_on_hand REAL NOT NULL DEFAULT 0,
				total_cost_base REAL NOT NULL DEFAULT 0,
				average_unit_cost_base REAL NOT NULL DEFAULT 0,
				last_receipt_at TEXT,
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				PRIMARY KEY (store_id, product_id)
			)
		`);

		await db.execute(`
			CREATE TABLE IF NOT EXISTS inventory_cost_layers (
				id TEXT PRIMARY KEY,
				store_id TEXT NOT NULL,
				product_id TEXT NOT NULL,
				source_type TEXT NOT NULL,
				source_id TEXT NOT NULL,
				source_line_id TEXT,
				cost_method TEXT NOT NULL DEFAULT 'average',
				qty_base_in REAL NOT NULL,
				qty_base_remaining REAL NOT NULL,
				unit_cost_base REAL NOT NULL,
				total_cost_base REAL NOT NULL,
				note TEXT,
				meta_json TEXT,
				created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
				updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_store_product_created ON inventory_cost_layers (store_id, product_id, created_at ASC, id ASC)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_inventory_cost_layers_store_product_remaining ON inventory_cost_layers (store_id, product_id, qty_base_remaining)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_inventory_cost_summaries_store_product ON inventory_cost_summaries (store_id, product_id)");

		InventoryCostInterface.initialized = true;
	}

	static async warmup(): Promise<void> {
		await InventoryCostInterface.ensureTables();
	}

	static async findSummaryByProductId(
		storeId: string,
		productId: string,
		executor?: SqlExecutor,
	): Promise<InventoryCostSummaryRow | null> {
		await InventoryCostInterface.ensureTables();
		const db = executor || DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT
					store_id,
					product_id,
					qty_base_on_hand,
					total_cost_base,
					average_unit_cost_base,
					last_receipt_at,
					updated_at
				FROM inventory_cost_summaries
				WHERE store_id = ? AND product_id = ?
				LIMIT 1
			`,
			args: [ storeId, productId ],
		});

		const row = result.rows[0] as Record<string, unknown> | undefined;
		if (!row) return null;

		return {
			store_id: String(row.store_id),
			product_id: String(row.product_id),
			qty_base_on_hand: toNumber(row.qty_base_on_hand),
			total_cost_base: toNumber(row.total_cost_base),
			average_unit_cost_base: toNumber(row.average_unit_cost_base),
			last_receipt_at: row.last_receipt_at ? String(row.last_receipt_at) : null,
			updated_at: String(row.updated_at),
		};
	}

	static async findOpenLayers(
		storeId: string,
		productId: string,
		options: { limit?: number } = {},
		executor?: SqlExecutor,
	): Promise<InventoryCostLayerRow[]> {
		await InventoryCostInterface.ensureTables();
		const db = executor || DbConn.getClient();
		const limit = Math.min(Math.max(Number(options.limit ?? 200) || 200, 1), 1000);
		const result = await db.execute({
			sql: `
				SELECT
					id,
					store_id,
					product_id,
					source_type,
					source_id,
					source_line_id,
					cost_method,
					qty_base_in,
					qty_base_remaining,
					unit_cost_base,
					total_cost_base,
					note,
					meta_json,
					created_at,
					updated_at
				FROM inventory_cost_layers
				WHERE store_id = ? AND product_id = ? AND qty_base_remaining > 0
				ORDER BY created_at ASC, id ASC
				LIMIT ?
			`,
			args: [ storeId, productId, limit ] as InValue[],
		});

		return result.rows.map((row) => ({
			id: String(row.id),
			store_id: String(row.store_id),
			product_id: String(row.product_id),
			source_type: String(row.source_type),
			source_id: String(row.source_id),
			source_line_id: row.source_line_id ? String(row.source_line_id) : null,
			cost_method: String(row.cost_method),
			qty_base_in: toNumber(row.qty_base_in),
			qty_base_remaining: toNumber(row.qty_base_remaining),
			unit_cost_base: toNumber(row.unit_cost_base),
			total_cost_base: toNumber(row.total_cost_base),
			note: row.note ? String(row.note) : null,
			meta_json: row.meta_json ? String(row.meta_json) : null,
			created_at: String(row.created_at),
			updated_at: String(row.updated_at),
		}));
	}

	static async recordReceipt(
		input: InventoryCostReceiptInput,
		executor?: SqlExecutor,
	): Promise<{
		layer: InventoryCostLayerRow;
		summary: InventoryCostSummaryRow;
	}> {
		await InventoryCostInterface.ensureTables();

		const qtyBase = Number(input.qty_base);
		const unitCostBase = Number(input.unit_cost_base);
		if (!Number.isFinite(qtyBase) || qtyBase <= 0) {
			throw new Error("qty_base must be greater than 0");
		}
		if (!Number.isFinite(unitCostBase) || unitCostBase < 0) {
			throw new Error("unit_cost_base must be a valid number");
		}

		const db = executor || DbConn.getClient();
		const now = input.received_at || new Date().toISOString();
		const totalCostBase = qtyBase * unitCostBase;
		const layerId = randomUUID();
		const costMethod = normalizeOptionalString(input.cost_method) || "average";
		const metaJson = input.meta ? JSON.stringify(input.meta) : null;

		// Both writes plus the read-back go out together: the receive path runs
		// inside a write transaction, and every extra round trip there is time the
		// Turso HTTP stream stays open. RETURNING avoids a separate SELECT for the
		// running average, which the caller needs for the product cost.
		const [ summaryResult ] = await db.batch([
			{
				sql: `
					INSERT INTO inventory_cost_summaries (
						store_id,
						product_id,
						qty_base_on_hand,
						total_cost_base,
						average_unit_cost_base,
						last_receipt_at,
						updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?)
					ON CONFLICT(store_id, product_id) DO UPDATE SET
						qty_base_on_hand = inventory_cost_summaries.qty_base_on_hand + excluded.qty_base_on_hand,
						total_cost_base = inventory_cost_summaries.total_cost_base + excluded.total_cost_base,
						average_unit_cost_base = CASE
							WHEN (inventory_cost_summaries.qty_base_on_hand + excluded.qty_base_on_hand) > 0
								THEN (inventory_cost_summaries.total_cost_base + excluded.total_cost_base) / (inventory_cost_summaries.qty_base_on_hand + excluded.qty_base_on_hand)
							ELSE 0
						END,
						last_receipt_at = excluded.last_receipt_at,
						updated_at = excluded.updated_at
					RETURNING qty_base_on_hand, total_cost_base, average_unit_cost_base, last_receipt_at, updated_at
				`,
				args: [
					input.store_id,
					input.product_id,
					qtyBase,
					totalCostBase,
					qtyBase > 0 ? unitCostBase : 0,
					now,
					now,
				],
			},
			{
				sql: `
					INSERT INTO inventory_cost_layers (
						id,
						store_id,
						product_id,
						source_type,
						source_id,
						source_line_id,
						cost_method,
						qty_base_in,
						qty_base_remaining,
						unit_cost_base,
						total_cost_base,
						note,
						meta_json,
						created_at,
						updated_at
					) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
				`,
				args: [
					layerId,
					input.store_id,
					input.product_id,
					input.source_type,
					input.source_id,
					input.source_line_id ?? null,
					costMethod,
					qtyBase,
					qtyBase,
					unitCostBase,
					totalCostBase,
					normalizeOptionalString(input.note),
					metaJson,
					now,
					now,
				],
			},
		], "write");

		const summaryRow = summaryResult?.rows[0] as Record<string, unknown> | undefined;

		return {
			layer: {
				id: layerId,
				store_id: input.store_id,
				product_id: input.product_id,
				source_type: input.source_type,
				source_id: input.source_id,
				source_line_id: input.source_line_id ?? null,
				cost_method: costMethod,
				qty_base_in: qtyBase,
				qty_base_remaining: qtyBase,
				unit_cost_base: unitCostBase,
				total_cost_base: totalCostBase,
				note: normalizeOptionalString(input.note),
				meta_json: metaJson,
				created_at: now,
				updated_at: now,
			},
			summary: {
				store_id: input.store_id,
				product_id: input.product_id,
				qty_base_on_hand: toNumber(summaryRow?.qty_base_on_hand ?? qtyBase),
				total_cost_base: toNumber(summaryRow?.total_cost_base ?? totalCostBase),
				average_unit_cost_base: toNumber(summaryRow?.average_unit_cost_base ?? unitCostBase),
				last_receipt_at: summaryRow?.last_receipt_at ? String(summaryRow.last_receipt_at) : now,
				updated_at: summaryRow?.updated_at ? String(summaryRow.updated_at) : now,
			},
		};
	}

	// Every path that takes stock off the shelf has to draw the cost layers down
	// with it, or the open layers keep counting goods that were sold long ago and
	// a FIFO store never actually gets FIFO. The write is returned as statements
	// rather than executed so callers can send it inside the transaction that is
	// already moving the balance - the two must land together or neither.
	static async planIssues(
		storeId: string,
		requests: Array<{ product_id: string; qty_base: number }>,
		executor?: SqlReader,
	): Promise<{
		statements: Array<{ sql: string; args: InValue[] }>;
		allocations: Map<string, InventoryCostIssueAllocation>;
	}> {
		await InventoryCostInterface.ensureTables();

		const wanted = new Map<string, number>();
		for (const request of requests) {
			const qty = Number(request.qty_base);
			if (!Number.isFinite(qty) || qty <= 0) continue;
			wanted.set(request.product_id, (wanted.get(request.product_id) || 0) + qty);
		}

		const statements: Array<{ sql: string; args: InValue[] }> = [];
		const allocations = new Map<string, InventoryCostIssueAllocation>();
		if (wanted.size === 0) return { statements, allocations };

		const db = executor || DbConn.getClient();
		const productIds = [ ...wanted.keys() ];
		const placeholders = productIds.map(() => "?").join(",");
		const layerResult = await db.execute({
			sql: `
				SELECT id, product_id, qty_base_remaining, unit_cost_base
				FROM inventory_cost_layers
				WHERE store_id = ? AND product_id IN (${placeholders}) AND qty_base_remaining > 0
				ORDER BY product_id ASC, created_at ASC, id ASC
			`,
			args: [ storeId, ...productIds ] as InValue[],
		});

		const layersByProduct = new Map<string, Array<{ id: string; remaining: number; unitCost: number }>>();
		for (const row of layerResult.rows) {
			const productId = String(row.product_id);
			const list = layersByProduct.get(productId) || [];
			list.push({ id: String(row.id), remaining: toNumber(row.qty_base_remaining), unitCost: toNumber(row.unit_cost_base) });
			layersByProduct.set(productId, list);
		}

		const now = new Date().toISOString();
		for (const [ productId, qtyBase ] of wanted) {
			let outstanding = qtyBase;
			let costBase = 0;
			for (const layer of layersByProduct.get(productId) || []) {
				if (outstanding <= 0) break;
				const taken = Math.min(layer.remaining, outstanding);
				if (taken <= 0) continue;
				outstanding -= taken;
				costBase += taken * layer.unitCost;
				statements.push({
					sql: "UPDATE inventory_cost_layers SET qty_base_remaining = MAX(qty_base_remaining - ?, 0), updated_at = ? WHERE id = ?",
					args: [ taken, now, layer.id ],
				});
			}

			// The average has to survive an issue untouched - it only moves when
			// goods come in - so the cost removed is always quantity x average,
			// whatever the layers happened to cost.
			statements.push({
				sql: `
					UPDATE inventory_cost_summaries SET
						total_cost_base = CASE WHEN (qty_base_on_hand - ?) <= 0 THEN 0 ELSE MAX(total_cost_base - (average_unit_cost_base * ?), 0) END,
						qty_base_on_hand = MAX(qty_base_on_hand - ?, 0),
						updated_at = ?
					WHERE store_id = ? AND product_id = ?
				`,
				args: [ qtyBase, qtyBase, qtyBase, now, storeId, productId ],
			});

			const fromLayers = qtyBase - outstanding;
			allocations.set(productId, {
				product_id: productId,
				qty_base: qtyBase,
				qty_from_layers: fromLayers,
				// Stock added by a manual adjustment never created a layer, so a shop
				// that counts stock in by hand will always have some quantity here.
				qty_uncosted: outstanding,
				cost_base: costBase,
				unit_cost_base: fromLayers > 0 ? costBase / fromLayers : 0,
			});
		}

		return { statements, allocations };
	}

	// The freight bill usually turns up after the goods do, so the shipping figure
	// on a purchase order can change once the stock is already on the shelf. When
	// it does, the layers that receipt created have to be re-priced or the stock
	// stays valued at a cost nobody ever paid.
	//
	// Only what is still on hand is revalued. Whatever was already sold keeps the
	// cost it was sold at: restating a bill after the fact would move a profit
	// figure the shop has already read.
	static async repriceReceipt(
		input: {
			store_id: string;
			product_id: string;
			source_type: string;
			source_id: string;
			source_line_id?: string | null;
			delta_per_base_unit: number;
		},
		executor?: SqlReader,
	): Promise<{ statements: Array<{ sql: string; args: InValue[] }>; revalued_qty: number; revalued_cost: number }> {
		await InventoryCostInterface.ensureTables();
		const statements: Array<{ sql: string; args: InValue[] }> = [];
		const delta = Number(input.delta_per_base_unit);
		if (!Number.isFinite(delta) || delta === 0) return { statements, revalued_qty: 0, revalued_cost: 0 };

		const db = executor || DbConn.getClient();
		const conditions = [ "store_id = ?", "product_id = ?", "source_type = ?", "source_id = ?" ];
		const args: InValue[] = [ input.store_id, input.product_id, input.source_type, input.source_id ];
		if (input.source_line_id) {
			conditions.push("source_line_id = ?");
			args.push(input.source_line_id);
		}

		const layers = await db.execute({
			sql: `SELECT id, qty_base_in, qty_base_remaining, unit_cost_base FROM inventory_cost_layers WHERE ${conditions.join(" AND ")}`,
			args,
		});
		if (layers.rows.length === 0) return { statements, revalued_qty: 0, revalued_cost: 0 };

		const now = new Date().toISOString();
		let revaluedQty = 0;
		for (const row of layers.rows) {
			// A layer must never go negative, however wrong the correction is.
			const nextUnitCost = Math.max(0, toNumber(row.unit_cost_base) + delta);
			revaluedQty += toNumber(row.qty_base_remaining);
			statements.push({
				sql: "UPDATE inventory_cost_layers SET unit_cost_base = ?, total_cost_base = qty_base_in * ?, updated_at = ? WHERE id = ?",
				args: [ nextUnitCost, nextUnitCost, now, String(row.id) ],
			});
		}

		const revaluedCost = revaluedQty * delta;
		if (revaluedCost !== 0) {
			statements.push({
				sql: `
					UPDATE inventory_cost_summaries SET
						total_cost_base = MAX(total_cost_base + ?, 0),
						average_unit_cost_base = CASE WHEN qty_base_on_hand > 0 THEN MAX(total_cost_base + ?, 0) / qty_base_on_hand ELSE 0 END,
						updated_at = ?
					WHERE store_id = ? AND product_id = ?
				`,
				args: [ revaluedCost, revaluedCost, now, input.store_id, input.product_id ],
			});
		}

		return { statements, revalued_qty: revaluedQty, revalued_cost: revaluedCost };
	}

	// What a FIFO store should record as the cost of the goods it just issued.
	// Quantity the layers could not cover is priced at the product's own cost, so
	// a shop that counts stock in by hand still gets a whole number back rather
	// than a cost that silently ignores part of the sale.
	static issueUnitCost(allocation: InventoryCostIssueAllocation | undefined, fallbackUnitCost: number): number {
		if (!allocation || allocation.qty_base <= 0 || allocation.qty_from_layers <= 0) return fallbackUnitCost;
		return (allocation.cost_base + (allocation.qty_uncosted * fallbackUnitCost)) / allocation.qty_base;
	}

	// For callers that are not already batching their own writes.
	static async recordIssues(
		storeId: string,
		requests: Array<{ product_id: string; qty_base: number }>,
		executor?: SqlExecutor,
	): Promise<Map<string, InventoryCostIssueAllocation>> {
		const { statements, allocations } = await InventoryCostInterface.planIssues(storeId, requests, executor);
		if (statements.length > 0) await (executor || DbConn.getClient()).batch(statements, "write");
		return allocations;
	}

	static async getCostSummary(
		storeId: string,
		productId: string,
		executor?: SqlExecutor,
	): Promise<{
		store_id: string;
		product_id: string;
		qty_base_on_hand: number;
		total_cost_base: number;
		average_unit_cost_base: number;
		fifo_open_cost_base: number;
		fifo_open_qty_base: number;
		layer_count: number;
	} | null> {
		await InventoryCostInterface.ensureTables();
		const summary = await InventoryCostInterface.findSummaryByProductId(storeId, productId, executor);
		const layers = await InventoryCostInterface.findOpenLayers(storeId, productId, { limit: 1000 }, executor);
		if (!summary && layers.length === 0) return null;

		const fifoOpenQtyBase = layers.reduce((sum, layer) => sum + toNumber(layer.qty_base_remaining), 0);
		const fifoOpenCostBase = layers.reduce((sum, layer) => sum + (toNumber(layer.qty_base_remaining) * toNumber(layer.unit_cost_base)), 0);

		return {
			store_id: storeId,
			product_id: productId,
			qty_base_on_hand: summary?.qty_base_on_hand ?? fifoOpenQtyBase,
			total_cost_base: summary?.total_cost_base ?? fifoOpenCostBase,
			average_unit_cost_base: summary?.average_unit_cost_base ?? (fifoOpenQtyBase > 0 ? fifoOpenCostBase / fifoOpenQtyBase : 0),
			fifo_open_cost_base: fifoOpenCostBase,
			fifo_open_qty_base: fifoOpenQtyBase,
			layer_count: layers.length,
		};
	}

	static async getStoreCostMethod(
		storeId: string,
		executor?: SqlExecutor,
	): Promise<"average" | "fifo"> {
		await InventoryCostInterface.ensureTables();
		const store = await StoreInterface.findById(storeId, executor);
		return store?.cost_method === "fifo" ? "fifo" : "average";
	}
}
