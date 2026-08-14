import { randomUUID } from "crypto";

import { DbConn } from "@connections/DbConn";
import { ApiError } from "@middlewares/ApiError";

type NotificationListOptions = {
	limit?: number;
	status?: "all" | "unread";
	topic?: "all" | "stock" | "promotion";
};

type DetectedNotification = {
	storeId: string;
	topic: "stock" | "promotion";
	entityType: "product" | "promotion";
	entityId: string;
	dueStatus: "out_of_stock" | "low_stock" | "ending_soon";
	title: string;
	message: string;
	severity: "warning" | "critical";
	dueDate: string | null;
	payload: Record<string, unknown>;
};

const STOCK_DEBOUNCE_MS = 500;
const STOCK_SAFETY_SCAN_INTERVAL_MS = 30 * 60_000;
const PROMOTION_SCAN_INTERVAL_MS = 6 * 60 * 60_000;

function now(): string {
	return new Date().toISOString();
}

function dedupeKey(item: DetectedNotification): string {
	return `${item.storeId}:${item.topic}:${item.entityId}:${item.dueStatus}`;
}

export class NotificationInterface {
	private static tablesEnsured = false;
	private static ensurePromise: Promise<void> | null = null;
	private static backgroundJobsStarted = false;
	private static readonly stockRefreshTimers = new Map<string, ReturnType<typeof setTimeout>>();

	static async ensureTables(): Promise<void> {
		if (NotificationInterface.tablesEnsured) return;
		if (NotificationInterface.ensurePromise) return NotificationInterface.ensurePromise;

		NotificationInterface.ensurePromise = (async () => {
			const db = DbConn.getClient();
			await db.execute(`
				CREATE TABLE IF NOT EXISTS notification_inbox (
					id TEXT PRIMARY KEY,
					store_id TEXT NOT NULL,
					topic TEXT NOT NULL DEFAULT 'stock',
					entity_type TEXT NOT NULL,
					entity_id TEXT NOT NULL,
					dedupe_key TEXT NOT NULL,
					title TEXT NOT NULL,
					message TEXT NOT NULL,
					severity TEXT NOT NULL DEFAULT 'warning',
					status TEXT NOT NULL DEFAULT 'active',
					due_status TEXT,
					due_date TEXT,
					payload TEXT NOT NULL DEFAULT '{}',
					first_detected_at TEXT NOT NULL,
					last_detected_at TEXT NOT NULL,
					read_at TEXT,
					resolved_at TEXT,
					created_at TEXT NOT NULL,
					updated_at TEXT NOT NULL
				)
			`);
			await db.execute(`
				CREATE TABLE IF NOT EXISTS notification_reads (
					notification_id TEXT NOT NULL,
					user_id TEXT NOT NULL,
					read_at TEXT NOT NULL,
					PRIMARY KEY (notification_id, user_id)
				)
			`);
			await db.execute(`
				CREATE TABLE IF NOT EXISTS notification_scan_state (
					store_id TEXT PRIMARY KEY,
					scanned_at TEXT NOT NULL
				)
			`);
			await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_inbox_dedupe ON notification_inbox (dedupe_key)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_notification_inbox_store_status_updated ON notification_inbox (store_id, status, updated_at DESC)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_notification_inbox_store_topic_entity ON notification_inbox (store_id, topic, entity_type, entity_id)");
			await db.execute("CREATE INDEX IF NOT EXISTS idx_notification_reads_user ON notification_reads (user_id, read_at DESC)");
			NotificationInterface.tablesEnsured = true;
		})().catch((error) => {
			NotificationInterface.ensurePromise = null;
			throw error;
		});

		return NotificationInterface.ensurePromise;
	}

	static queueStockRefresh(storeId: string): void {
		const normalizedStoreId = String(storeId || "").trim();
		if (!normalizedStoreId) return;
		const previous = NotificationInterface.stockRefreshTimers.get(normalizedStoreId);
		if (previous) clearTimeout(previous);
		const timer = setTimeout(() => {
			NotificationInterface.stockRefreshTimers.delete(normalizedStoreId);
			void NotificationInterface.reconcile(normalizedStoreId, [ "stock" ]).catch((error) => {
				console.error(`[notifications] stock refresh failed for store ${normalizedStoreId}`, error);
			});
		}, STOCK_DEBOUNCE_MS);
		timer.unref?.();
		NotificationInterface.stockRefreshTimers.set(normalizedStoreId, timer);
	}

	static async startBackgroundJobs(): Promise<void> {
		if (NotificationInterface.backgroundJobsStarted) return;
		await NotificationInterface.ensureTables();
		NotificationInterface.backgroundJobsStarted = true;

		const runForStores = async (topics: Array<DetectedNotification["topic"]>) => {
			try {
				const stores = await DbConn.getClient().execute("SELECT id FROM stores");
				for (const row of stores.rows) {
					await NotificationInterface.reconcile(String(row.id), topics);
				}
			} catch (error) {
				console.error(`[notifications] ${topics.join("/")} safety scan failed`, error);
			}
		};
		const stockTimer = setInterval(() => void runForStores([ "stock" ]), STOCK_SAFETY_SCAN_INTERVAL_MS);
		const promotionTimer = setInterval(() => void runForStores([ "promotion" ]), PROMOTION_SCAN_INTERVAL_MS);
		stockTimer.unref?.();
		promotionTimer.unref?.();
		void runForStores([ "stock", "promotion" ]);
	}

	private static async detect(storeId: string, topics: Array<DetectedNotification["topic"]>): Promise<DetectedNotification[]> {
		const db = DbConn.getClient();
		const includeStock = topics.includes("stock");
		const includePromotion = topics.includes("promotion");
		const stockResult = includeStock ? await db.execute({
			sql: `
				SELECT p.id, p.name, p.sku, COALESCE(b.available_base, 0) AS available_base,
					CASE
						WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
						ELSE COALESCE(s.low_stock_threshold, 0)
					END AS threshold
				FROM products p
				JOIN stores s ON s.id = p.store_id
				LEFT JOIN inventory_balances b ON b.store_id = p.store_id AND b.product_id = p.id
				WHERE p.store_id = ?
					AND p.active = 1
					AND p.deleted_at IS NULL
					AND p.inventory_mode = 'tracked'
					AND (
						COALESCE(b.available_base, 0) <= 0
						OR (
							CASE
								WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
								ELSE COALESCE(s.low_stock_threshold, 0)
							END > 0
							AND COALESCE(b.available_base, 0) <= CASE
								WHEN COALESCE(p.low_stock_threshold, 0) > 0 THEN p.low_stock_threshold
								ELSE COALESCE(s.low_stock_threshold, 0)
							END
						)
					)
				ORDER BY available_base ASC, p.name ASC
				LIMIT 200
			`,
			args: [ storeId ],
		}) : { rows: [] };

		const current = new Date();
		const endingBoundary = new Date(current.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString();
		const promotionResult = includePromotion ? await db.execute({
			sql: `
				SELECT id, name, ends_at
				FROM promotions
				WHERE store_id = ?
					AND is_active = 1
					AND deleted_at IS NULL
					AND ends_at IS NOT NULL
					AND ends_at >= ?
					AND ends_at <= ?
				ORDER BY ends_at ASC
				LIMIT 200
			`,
			args: [ storeId, current.toISOString(), endingBoundary ],
		}) : { rows: [] };

		const detected: DetectedNotification[] = stockResult.rows.map((row) => {
			const available = Number(row.available_base || 0);
			const threshold = Number(row.threshold || 0);
			const dueStatus = available <= 0 ? "out_of_stock" as const : "low_stock" as const;
			return {
				storeId,
				topic: "stock" as const,
				entityType: "product" as const,
				entityId: String(row.id),
				dueStatus,
				title: dueStatus === "out_of_stock" ? "Product out of stock" : "Product stock is low",
				message: String(row.name || row.sku || ""),
				severity: dueStatus === "out_of_stock" ? "critical" as const : "warning" as const,
				dueDate: null,
				payload: {
					name: String(row.name || ""),
					sku: String(row.sku || ""),
					available_base: available,
					threshold,
					target: "/inventory",
				},
			};
		});

		for (const row of promotionResult.rows) {
			detected.push({
				storeId,
				topic: "promotion",
				entityType: "promotion",
				entityId: String(row.id),
				dueStatus: "ending_soon",
				title: "Promotion ending soon",
				message: String(row.name || ""),
				severity: "warning",
				dueDate: String(row.ends_at || ""),
				payload: {
					name: String(row.name || ""),
					ends_at: String(row.ends_at || ""),
					target: "/promotions",
				},
			});
		}

		return detected;
	}

	static async reconcile(storeId: string, topics: Array<DetectedNotification["topic"]> = [ "stock", "promotion" ]): Promise<void> {
		await NotificationInterface.ensureTables();
		const detected = await NotificationInterface.detect(storeId, topics);
		const detectedKeys = new Set(detected.map(dedupeKey));
		const stamp = now();
		const db = DbConn.getClient();
		const transaction = await db.transaction("write");
		try {
			for (const item of detected) {
				const key = dedupeKey(item);
				const existingResult = await transaction.execute({
					sql: "SELECT id, status FROM notification_inbox WHERE dedupe_key = ? LIMIT 1",
					args: [ key ],
				});
				const existing = existingResult.rows[0];
				await transaction.execute({
					sql: `
						INSERT INTO notification_inbox (
							id, store_id, topic, entity_type, entity_id, dedupe_key, title, message,
							severity, status, due_status, due_date, payload, first_detected_at,
							last_detected_at, read_at, resolved_at, created_at, updated_at
						) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, NULL, NULL, ?, ?)
						ON CONFLICT(dedupe_key) DO UPDATE SET
							title = excluded.title,
							message = excluded.message,
							severity = excluded.severity,
							status = 'active',
							due_date = excluded.due_date,
							payload = excluded.payload,
							last_detected_at = excluded.last_detected_at,
							resolved_at = NULL,
							updated_at = excluded.updated_at
					`,
					args: [
						randomUUID(), item.storeId, item.topic, item.entityType, item.entityId, key,
						item.title, item.message, item.severity, item.dueStatus, item.dueDate,
						JSON.stringify(item.payload), stamp, stamp, stamp, stamp,
					],
				});
				if (existing && String(existing.status) === "resolved") {
					await transaction.execute({
						sql: "DELETE FROM notification_reads WHERE notification_id = ?",
						args: [ String(existing.id) ],
					});
				}
			}

			const activeResult = await transaction.execute({
				sql: `SELECT id, dedupe_key FROM notification_inbox WHERE store_id = ? AND status = 'active' AND topic IN (${topics.map(() => "?").join(",")})`,
				args: [ storeId, ...topics ],
			});
			for (const row of activeResult.rows) {
				if (detectedKeys.has(String(row.dedupe_key))) continue;
				await transaction.execute({
					sql: "UPDATE notification_inbox SET status = 'resolved', resolved_at = ?, updated_at = ? WHERE id = ?",
					args: [ stamp, stamp, String(row.id) ],
				});
			}
			await transaction.execute({
				sql: `
					INSERT INTO notification_scan_state (store_id, scanned_at) VALUES (?, ?)
					ON CONFLICT(store_id) DO UPDATE SET scanned_at = excluded.scanned_at
				`,
				args: [ storeId, stamp ],
			});
			await transaction.commit();
		} catch (error) {
			if (!transaction.closed) await transaction.rollback();
			throw error;
		} finally {
			transaction.close();
		}
	}

	static async list(storeId: string, userId: string, options: NotificationListOptions = {}) {
		await NotificationInterface.ensureTables();
		const db = DbConn.getClient();
		const limit = Math.max(1, Math.min(100, Number(options.limit || 20)));
		const conditions = [ "n.store_id = ?", "n.status = 'active'" ];
		const args: Array<string | number> = [ storeId ];
		if (options.status === "unread") conditions.push("r.read_at IS NULL");
		if (options.topic && options.topic !== "all") {
			conditions.push("n.topic = ?");
			args.push(options.topic);
		}
		args.push(userId, limit);
		const result = await db.execute({
			sql: `
				SELECT n.*, r.read_at AS user_read_at
				FROM notification_inbox n
				LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
				WHERE ${conditions.join(" AND ")}
				ORDER BY CASE n.severity WHEN 'critical' THEN 0 ELSE 1 END, n.updated_at DESC
				LIMIT ?
			`,
			args: [ userId, ...args.slice(0, -2), limit ],
		});
		const unreadResult = await db.execute({
			sql: `
				SELECT COUNT(*) AS total
				FROM notification_inbox n
				LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
				WHERE n.store_id = ? AND n.status = 'active' AND r.read_at IS NULL
			`,
			args: [ userId, storeId ],
		});
		return {
			items: result.rows.map((row) => ({
				...row,
				payload: (() => {
					try { return JSON.parse(String(row.payload || "{}")); } catch { return {}; }
				})(),
				is_read: Boolean(row.user_read_at),
			})),
			unread_count: Number(unreadResult.rows[0]?.total || 0),
		};
	}

	static async markRead(storeId: string, userId: string, notificationId: string) {
		await NotificationInterface.ensureTables();
		const db = DbConn.getClient();
		const found = await db.execute({
			sql: "SELECT id FROM notification_inbox WHERE id = ? AND store_id = ? AND status = 'active' LIMIT 1",
			args: [ notificationId, storeId ],
		});
		if (!found.rows[0]) throw ApiError.NotFoundError("Notification not found");
		const stamp = now();
		await db.execute({
			sql: `
				INSERT INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)
				ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
			`,
			args: [ notificationId, userId, stamp ],
		});
		return { id: notificationId, read_at: stamp };
	}

	static async markAllRead(storeId: string, userId: string) {
		await NotificationInterface.ensureTables();
		const db = DbConn.getClient();
		const stamp = now();
		await db.execute({
			sql: `
				INSERT INTO notification_reads (notification_id, user_id, read_at)
				SELECT id, ?, ? FROM notification_inbox WHERE store_id = ? AND status = 'active'
				ON CONFLICT(notification_id, user_id) DO UPDATE SET read_at = excluded.read_at
			`,
			args: [ userId, stamp, storeId ],
		});
		return { read_at: stamp };
	}
}
