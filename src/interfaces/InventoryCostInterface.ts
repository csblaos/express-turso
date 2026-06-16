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

type SqlExecutor = Pick<ReturnType<typeof DbConn.getClient>, "execute">;

function toNumber(value: unknown): number {
	return Number(value ?? 0);
}

function normalizeOptionalString(value?: string | null): string | null {
	const trimmed = value?.trim();
	return trimmed ? trimmed : null;
}

export class InventoryCostInterface {
	private static initialized = false;

	private static async ensureTables(): Promise<void> {
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
					cost_method: costMethod,
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

		await db.execute({
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
		});

			await db.execute({
				sql: `
					INSERT INTO inventory_cost_layers (
					id,
					store_id,
					product_id,
					source_type,
					source_id,
					source_line_id,
					cost_method: costMethod,
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
			});

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
					qty_base_on_hand: qtyBase,
					total_cost_base: totalCostBase,
					average_unit_cost_base: qtyBase > 0 ? unitCostBase : 0,
					last_receipt_at: now,
					updated_at: now,
				},
			};
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
