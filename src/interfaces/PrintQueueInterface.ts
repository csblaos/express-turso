import { createHash, randomBytes, randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";
import { kitchenPaperEnabled } from "@utils/KitchenDelivery";

type Executor = {
	execute: (statement: any) => Promise<any>;
	batch?: (statements: any[]) => Promise<any[]>;
};

export type PrintTicketItem = {
	product_id: string;
	name: string;
	qty: number;
	note?: string | null;
	is_gift?: boolean;
};

export type PrintTicketRequest = {
	kind: "kitchen" | "void";
	orderId: string;
	roundId?: string | null;
	roundNo?: number | null;
	reason?: string | null;
	/** Made unique per printer below. Repeating a request that already reached the
	 * queue must not put a second copy of the same food on the pass. */
	dedupeKey: string;
	items: PrintTicketItem[];
};

function now(): string { return new Date().toISOString(); }
function text(value: unknown): string { return String(value ?? "").trim(); }
function hashToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }

// A job an agent claimed but never acknowledged is a job whose agent died mid
// print. Long enough that a slow printer is not stolen from, short enough that
// the kitchen is not left waiting for a ticket nobody will send.
const CLAIM_TIMEOUT_MS = 120_000;

export class PrintQueueInterface {
	private static initialized = false;
	private static initializationPromise: Promise<void> | null = null;

	static async ensureTables(): Promise<void> {
		if (PrintQueueInterface.initialized) return;
		if (PrintQueueInterface.initializationPromise) return PrintQueueInterface.initializationPromise;

		PrintQueueInterface.initializationPromise = (async () => {
			const db = DbConn.getClient();
			// A printer belongs to one station, or to none at all: a station-less
			// printer is the one that catches everything no other printer claims, so
			// a shop can start with a single machine and split it later.
			await db.execute(`CREATE TABLE IF NOT EXISTS restaurant_printers (
				id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, station_id TEXT,
				address TEXT NOT NULL, paper_width INTEGER NOT NULL DEFAULT 80, sort_order INTEGER NOT NULL DEFAULT 0,
				is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
				UNIQUE(store_id, name)
			)`);
			// Agents authenticate as themselves rather than as a member of staff: the
			// token lives in a config file on a counter PC, so it must never be able
			// to do anything but take work off this queue.
			await db.execute(`CREATE TABLE IF NOT EXISTS print_agents (
				id TEXT PRIMARY KEY, store_id TEXT NOT NULL, name TEXT NOT NULL, token_hash TEXT NOT NULL,
				last_seen_at TEXT, is_active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
				UNIQUE(store_id, name)
			)`);
			await db.execute(`CREATE TABLE IF NOT EXISTS print_jobs (
				id TEXT PRIMARY KEY, store_id TEXT NOT NULL, printer_id TEXT NOT NULL, kind TEXT NOT NULL,
				order_id TEXT, round_id TEXT, station_id TEXT, dedupe_key TEXT NOT NULL, payload TEXT NOT NULL,
				status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER NOT NULL DEFAULT 0, error TEXT,
				created_at TEXT NOT NULL, claimed_at TEXT, completed_at TEXT,
				UNIQUE(store_id, dedupe_key)
			)`);
			await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS uq_print_agents_token ON print_agents(token_hash)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_print_jobs_queue ON print_jobs(store_id, status, created_at)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_restaurant_printers_store ON restaurant_printers(store_id, is_active, sort_order)");
			PrintQueueInterface.initialized = true;
		})().catch((error) => {
			PrintQueueInterface.initializationPromise = null;
			throw error;
		});

		return PrintQueueInterface.initializationPromise;
	}

	/** The till prints kitchen slips through the browser until the shop has a
	 * printer of its own; from then on the queue owns them, so the two can never
	 * both put the same round on paper. */
	static async hasActivePrinters(storeId: string): Promise<boolean> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "SELECT 1 FROM restaurant_printers WHERE store_id=? AND is_active=1 LIMIT 1", args: [ storeId ] });
		return result.rows.length > 0;
	}

	/** Returns the INSERT statements for one ticket, so the caller can commit them
	 * in the same transaction as the round they describe. A round that reaches the
	 * kitchen without a job, or a job for a round that rolled back, would both be
	 * worse than no queue at all. */
	static async ticketStatements(executor: Executor, storeId: string, request: PrintTicketRequest): Promise<any[]> {
		if (!request.items.length) return [];
		// Asked first and on its own: a shop with no printer is the common case, and
		// it should cost one indexed lookup rather than four queries whose answers
		// are about to be thrown away.
		const printers = await executor.execute({ sql: "SELECT id,name,station_id FROM restaurant_printers WHERE store_id=? AND is_active=1 ORDER BY sort_order, name", args: [ storeId ] });
		if (!printers.rows.length) return [];
		const productIds = [ ...new Set(request.items.map((item) => item.product_id).filter(Boolean)) ];
		const [ stations, header, categories ] = await Promise.all([
			executor.execute({ sql: "SELECT id,name FROM kitchen_stations WHERE store_id=?", args: [ storeId ] }),
			executor.execute({ sql: `SELECT o.order_no,o.service_mode,o.queue_no,t.name AS table_name,z.name AS zone_name,s.name AS store_name,s.kitchen_delivery_mode
				FROM orders o LEFT JOIN restaurant_tables t ON t.id=o.restaurant_table_id
				LEFT JOIN restaurant_zones z ON z.id=t.zone_id LEFT JOIN stores s ON s.id=o.store_id
				WHERE o.id=? AND o.store_id=? LIMIT 1`, args: [ request.orderId, storeId ] }),
			productIds.length
				? executor.execute({ sql: `SELECT p.id,c.station_id,
					COALESCE(p.send_to_kitchen,c.send_to_kitchen,1) AS send_to_kitchen
					FROM products p LEFT JOIN product_categories c ON c.id=p.category_id
					WHERE p.id IN (${productIds.map(() => "?").join(",")})`, args: productIds })
				: Promise.resolve({ rows: [] as any[] }),
		]);
		const order = (header.rows as any[])[0] || {};
		// A shop whose kitchen works off a screen gets no paper, printer or not. A
		// cancellation is the exception: food already on the pass has to be stopped
		// whatever the shop chose.
		if (request.kind === "kitchen" && !kitchenPaperEnabled(order.kitchen_delivery_mode)) return [];

		const stationOf = new Map((categories.rows as any[]).map((row) => [ String(row.id), row.station_id ? String(row.station_id) : "" ]));
		// A bottle taken from the fridge at the counter is still sold and still
		// leaves stock; it just has nothing to do with the kitchen. Dropping those
		// lines here is also what stops a drinks-only round printing a slip nobody
		// in the kitchen has to act on.
		const kitchenOf = new Map((categories.rows as any[]).map((row) => [ String(row.id), Number(row.send_to_kitchen ?? 1) !== 0 ]));
		const kitchenItems = request.items.filter((item) => kitchenOf.get(item.product_id) !== false);
		if (!kitchenItems.length) return [];
		const stationNames = new Map((stations.rows as any[]).map((row) => [ String(row.id), String(row.name) ]));
		const byStation = new Map<string, string>();
		let fallback = String((printers.rows as any[])[0].id);
		for (const printer of printers.rows as any[]) {
			if (printer.station_id) byStation.set(String(printer.station_id), String(printer.id));
			// The last station-less printer wins the leftovers; with none configured
			// the first printer keeps them, so no line is ever silently dropped.
			else fallback = String(printer.id);
		}

		const grouped = new Map<string, { stationId: string; items: PrintTicketItem[] }>();
		for (const item of kitchenItems) {
			const stationId = stationOf.get(item.product_id) || "";
			const printerId = (stationId && byStation.get(stationId)) || fallback;
			const group = grouped.get(printerId) || { stationId, items: [] };
			// A printer serving several stations is titled by the first one it saw,
			// which for a single-printer shop is simply the first dish on the slip.
			group.items.push(item);
			grouped.set(printerId, group);
		}

		const label = String(order.service_mode) === "pickup"
			? `#${text(order.queue_no) || "-"}`
			: [ text(order.zone_name), text(order.table_name) ].filter(Boolean).join(" · ");
		const stamp = now();
		return [ ...grouped.entries() ].map(([ printerId, group ]) => ({
			sql: `INSERT INTO print_jobs(id,store_id,printer_id,kind,order_id,round_id,station_id,dedupe_key,payload,status,attempts,created_at)
				VALUES(?,?,?,?,?,?,?,?,?,'pending',0,?)
				ON CONFLICT(store_id,dedupe_key) DO NOTHING`,
			args: [
				randomUUID(), storeId, printerId, request.kind, request.orderId, request.roundId || null,
				group.stationId || null, `${request.dedupeKey}:${printerId}`,
				JSON.stringify({
					kind: request.kind,
					store_name: text(order.store_name),
					station: group.stationId ? stationNames.get(group.stationId) || "" : "",
					label,
					order_no: text(order.order_no),
					round: request.roundNo || null,
					reason: text(request.reason) || null,
					printed_at: stamp,
					items: group.items.map((item) => ({ name: item.name, qty: Number(item.qty), note: text(item.note) || null, is_gift: Boolean(item.is_gift) })),
				}),
				stamp,
			],
		}));
	}

	/** Fire-and-forget queueing for the paths that have already committed. Used by
	 * cancellations, where the bill is settled before the kitchen is told. */
	static async enqueue(storeId: string, request: PrintTicketRequest): Promise<void> {
		await PrintQueueInterface.ensureTables();
		const db = DbConn.getClient();
		const statements = await PrintQueueInterface.ticketStatements(db as Executor, storeId, request);
		if (!statements.length) return;
		await db.batch(statements, "write");
	}

	static async listPrinters(storeId: string): Promise<any[]> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: `SELECT p.*, s.name AS station_name
			FROM restaurant_printers p LEFT JOIN kitchen_stations s ON s.id=p.station_id
			WHERE p.store_id=? ORDER BY p.sort_order, p.name`, args: [ storeId ] });
		return result.rows as any[];
	}

	static async savePrinter(storeId: string, input: any, id?: string): Promise<any> {
		await PrintQueueInterface.ensureTables();
		const name = text(input.name);
		const address = text(input.address);
		if (!name) throw ApiError.BadRequestError("printer name is required");
		if (!address) throw ApiError.BadRequestError("printer address is required");
		const db = DbConn.getClient();
		const stamp = now();
		const stationId = text(input.station_id) || null;
		const paperWidth = Number(input.paper_width) === 58 ? 58 : 80;
		const isActive = input.is_active === false || Number(input.is_active) === 0 ? 0 : 1;
		try {
			if (id) {
				const updated = await db.execute({ sql: "UPDATE restaurant_printers SET name=?,station_id=?,address=?,paper_width=?,sort_order=?,is_active=?,updated_at=? WHERE id=? AND store_id=?", args: [ name, stationId, address, paperWidth, Number(input.sort_order) || 0, isActive, stamp, id, storeId ] });
				if (!updated.rowsAffected) throw ApiError.NotFoundError("printer not found");
			} else {
				id = randomUUID();
				await db.execute({ sql: "INSERT INTO restaurant_printers(id,store_id,name,station_id,address,paper_width,sort_order,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)", args: [ id, storeId, name, stationId, address, paperWidth, Number(input.sort_order) || 0, isActive, stamp, stamp ] });
			}
		} catch (error: any) {
			if (String(error?.message).includes("UNIQUE")) throw ApiError.CustomError({ code: 409_101, message: "ชื่อเครื่องพิมพ์นี้มีอยู่แล้ว", httpStatusCode: 409 });
			throw error;
		}
		const row = await db.execute({ sql: "SELECT * FROM restaurant_printers WHERE id=? AND store_id=?", args: [ id, storeId ] });
		if (!row.rows[0]) throw ApiError.NotFoundError("printer not found");
		return row.rows[0];
	}

	static async deletePrinter(storeId: string, id: string): Promise<void> {
		await PrintQueueInterface.ensureTables();
		const db = DbConn.getClient();
		const result = await db.execute({ sql: "DELETE FROM restaurant_printers WHERE id=? AND store_id=?", args: [ id, storeId ] });
		if (!result.rowsAffected) throw ApiError.NotFoundError("printer not found");
		// Work queued for a printer that no longer exists can never be claimed, so
		// it is closed out rather than left pending forever.
		await db.execute({ sql: "UPDATE print_jobs SET status='failed',error='printer removed',completed_at=? WHERE printer_id=? AND store_id=? AND status IN ('pending','printing')", args: [ now(), id, storeId ] });
	}

	static async listAgents(storeId: string): Promise<any[]> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "SELECT id,name,last_seen_at,is_active,created_at FROM print_agents WHERE store_id=? ORDER BY created_at", args: [ storeId ] });
		return result.rows as any[];
	}

	/** The token is returned once, at creation, and only its hash is kept. A token
	 * the server could read back is a token a leaked database hands out. */
	static async createAgent(storeId: string, input: any): Promise<{ agent: any; token: string }> {
		await PrintQueueInterface.ensureTables();
		const name = text(input.name);
		if (!name) throw ApiError.BadRequestError("agent name is required");
		const token = `pa_${randomBytes(24).toString("hex")}`;
		const id = randomUUID();
		const stamp = now();
		try {
			await DbConn.getClient().execute({ sql: "INSERT INTO print_agents(id,store_id,name,token_hash,is_active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)", args: [ id, storeId, name, hashToken(token), stamp, stamp ] });
		} catch (error: any) {
			if (String(error?.message).includes("UNIQUE")) throw ApiError.CustomError({ code: 409_101, message: "ชื่อ agent นี้มีอยู่แล้ว", httpStatusCode: 409 });
			throw error;
		}
		return { agent: { id, name, is_active: 1, created_at: stamp, last_seen_at: null }, token };
	}

	static async deleteAgent(storeId: string, id: string): Promise<void> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "DELETE FROM print_agents WHERE id=? AND store_id=?", args: [ id, storeId ] });
		if (!result.rowsAffected) throw ApiError.NotFoundError("agent not found");
	}

	static async authenticateAgent(token: string): Promise<{ id: string; storeId: string } | null> {
		const normalized = text(token);
		if (!normalized) return null;
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "SELECT id,store_id FROM print_agents WHERE token_hash=? AND is_active=1 LIMIT 1", args: [ hashToken(normalized) ] });
		const row = (result.rows as any[])[0];
		return row ? { id: String(row.id), storeId: String(row.store_id) } : null;
	}

	/** Claiming is a write, not a read: two agents on the same counter must never
	 * both take the same ticket to two different printers. */
	static async claimJobs(storeId: string, agentId: string, limit: number): Promise<any[]> {
		await PrintQueueInterface.ensureTables();
		const db = DbConn.getClient();
		const stamp = now();
		const staleBefore = new Date(Date.now() - CLAIM_TIMEOUT_MS).toISOString();
		const pending = await db.execute({
			sql: `SELECT j.id FROM print_jobs j JOIN restaurant_printers p ON p.id=j.printer_id
				WHERE j.store_id=? AND p.is_active=1
				AND (j.status='pending' OR (j.status='printing' AND j.claimed_at < ?))
				ORDER BY j.created_at LIMIT ?`,
			args: [ storeId, staleBefore, Math.max(1, Math.min(20, limit)) ],
		});
		const ids = (pending.rows as any[]).map((row) => String(row.id));
		await db.execute({ sql: "UPDATE print_agents SET last_seen_at=? WHERE id=?", args: [ stamp, agentId ] });
		if (!ids.length) return [];
		const claimed = await db.batch([
			{ sql: `UPDATE print_jobs SET status='printing',claimed_at=?,attempts=attempts+1 WHERE id IN (${ids.map(() => "?").join(",")}) AND store_id=?`, args: [ stamp, ...ids, storeId ] },
			{ sql: `SELECT j.id,j.kind,j.payload,j.attempts,p.name AS printer_name,p.address,p.paper_width
				FROM print_jobs j JOIN restaurant_printers p ON p.id=j.printer_id
				WHERE j.id IN (${ids.map(() => "?").join(",")}) ORDER BY j.created_at`, args: ids },
		], "write");
		return (claimed[1].rows as any[]).map((row) => ({
			id: String(row.id),
			kind: String(row.kind),
			attempts: Number(row.attempts),
			printer_name: String(row.printer_name),
			address: String(row.address),
			paper_width: Number(row.paper_width),
			payload: JSON.parse(String(row.payload)),
		}));
	}

	static async completeJob(storeId: string, jobId: string, ok: boolean, error?: string): Promise<void> {
		await PrintQueueInterface.ensureTables();
		const stamp = now();
		// A failure goes back to pending so the next poll retries it, until the
		// attempts speak for themselves and it is left for someone to look at.
		const result = await DbConn.getClient().execute({
			sql: ok
				? "UPDATE print_jobs SET status='done',completed_at=?,error=NULL WHERE id=? AND store_id=?"
				: `UPDATE print_jobs SET status=CASE WHEN attempts>=5 THEN 'failed' ELSE 'pending' END,
					completed_at=CASE WHEN attempts>=5 THEN ? ELSE NULL END,error=? WHERE id=? AND store_id=?`,
			args: ok ? [ stamp, jobId, storeId ] : [ stamp, text(error).slice(0, 400) || "print failed", jobId, storeId ],
		});
		if (!result.rowsAffected) throw ApiError.NotFoundError("print job not found");
	}

	static async listJobs(storeId: string): Promise<any[]> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: `SELECT j.id,j.kind,j.status,j.attempts,j.error,j.created_at,j.completed_at,j.round_id,
			p.name AS printer_name, s.name AS station_name
			FROM print_jobs j LEFT JOIN restaurant_printers p ON p.id=j.printer_id
			LEFT JOIN kitchen_stations s ON s.id=j.station_id
			WHERE j.store_id=? ORDER BY j.created_at DESC LIMIT 50`, args: [ storeId ] });
		return result.rows as any[];
	}

	static async retryJob(storeId: string, jobId: string): Promise<void> {
		await PrintQueueInterface.ensureTables();
		const result = await DbConn.getClient().execute({ sql: "UPDATE print_jobs SET status='pending',attempts=0,error=NULL,claimed_at=NULL,completed_at=NULL WHERE id=? AND store_id=?", args: [ jobId, storeId ] });
		if (!result.rowsAffected) throw ApiError.NotFoundError("print job not found");
	}
}
