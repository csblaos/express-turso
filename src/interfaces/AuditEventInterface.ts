import { randomUUID } from "crypto";

import { InValue } from "@libsql/client";

import { DbConn } from "@connections/DbConn";

export type AuditEventFilters = {
	storeId?: string;
	query?: string;
	scope?: string;
	result?: string;
	entityType?: string;
	actorRole?: string;
	page?: number;
	limit?: number;
};

export type AuditEventListResult = {
	items: AuditEventRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
};

export type AuditEventCountFilters = {
	since: string;
	scope?: string;
	scopes?: string[];
	actions?: string[];
	entityType?: string;
	result?: string;
};

export type AuditEventRecord = {
	id: string;
	scope: string;
	store_id: string | null;
	actor_user_id: string | null;
	actor_name: string | null;
	actor_role: string | null;
	action: string;
	entity_type: string;
	entity_id: string | null;
	result: string;
	reason_code: string | null;
	ip_address: string | null;
	user_agent: string | null;
	request_id: string | null;
	metadata: unknown | null;
	before: unknown | null;
	after: unknown | null;
	occurred_at: string;
};

export type AuditEventCreatePayload = {
	scope: string;
	store_id?: string | null;
	actor_user_id?: string | null;
	actor_name?: string | null;
	actor_role?: string | null;
	action: string;
	entity_type: string;
	entity_id?: string | null;
	result?: string;
	reason_code?: string | null;
	ip_address?: string | null;
	user_agent?: string | null;
	request_id?: string | null;
	metadata?: unknown;
	before?: unknown;
	after?: unknown;
	occurred_at?: string;
};

function parseJson(value: unknown): unknown | null {
	if (value === null || value === undefined) return null;
	if (typeof value !== "string") return value;
	const trimmed = value.trim();
	if (!trimmed) return null;

	try {
		return JSON.parse(trimmed);
	} catch {
		return trimmed;
	}
}

function serializeJson(value: unknown): string | null {
	if (value === null || value === undefined) return null;
	if (typeof value === "string") {
		const trimmed = value.trim();
		return trimmed ? trimmed : null;
	}

	return JSON.stringify(value);
}

function mapRow(row: Record<string, unknown>): AuditEventRecord {
	return {
		id: String(row.id),
		scope: String(row.scope),
		store_id: row.store_id ? String(row.store_id) : null,
		actor_user_id: row.actor_user_id ? String(row.actor_user_id) : null,
		actor_name: row.actor_name ? String(row.actor_name) : null,
		actor_role: row.actor_role ? String(row.actor_role) : null,
		action: String(row.action),
		entity_type: String(row.entity_type),
		entity_id: row.entity_id ? String(row.entity_id) : null,
		result: String(row.result),
		reason_code: row.reason_code ? String(row.reason_code) : null,
		ip_address: row.ip_address ? String(row.ip_address) : null,
		user_agent: row.user_agent ? String(row.user_agent) : null,
		request_id: row.request_id ? String(row.request_id) : null,
		metadata: parseJson(row.metadata),
		before: parseJson(row.before),
		after: parseJson(row.after),
		occurred_at: String(row.occurred_at),
	};
}

export class AuditEventInterface {
	private static initialized = false;

	private static async ensureTable(): Promise<void> {
		if (AuditEventInterface.initialized) return;

		const db = DbConn.getClient();

		await db.execute(`
			CREATE TABLE IF NOT EXISTS audit_events (
				id TEXT PRIMARY KEY,
				scope TEXT NOT NULL,
				store_id TEXT,
				actor_user_id TEXT,
				actor_name TEXT,
				actor_role TEXT,
				action TEXT NOT NULL,
				entity_type TEXT NOT NULL,
				entity_id TEXT,
				result TEXT NOT NULL DEFAULT 'success',
				reason_code TEXT,
				ip_address TEXT,
				user_agent TEXT,
				request_id TEXT,
				metadata TEXT,
				"before" TEXT,
				"after" TEXT,
				occurred_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
			)
		`);

		await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_occurred_at ON audit_events (occurred_at DESC)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_scope ON audit_events (scope)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_entity_type ON audit_events (entity_type)");
		await db.execute("CREATE INDEX IF NOT EXISTS idx_audit_events_result ON audit_events (result)");

		AuditEventInterface.initialized = true;
	}

	static async findMany(filters: AuditEventFilters = {}): Promise<AuditEventListResult> {
		await AuditEventInterface.ensureTable();

		const db = DbConn.getClient();
		const where: string[] = [];
		const args: InValue[] = [];

		if (filters.storeId) {
			where.push("store_id = ?");
			args.push(filters.storeId);
		}

		if (filters.query) {
			const like = `%${filters.query.trim().toLowerCase()}%`;
			where.push(
				"(LOWER(COALESCE(actor_name, '')) LIKE ? OR LOWER(action) LIKE ? OR LOWER(entity_type) LIKE ? OR LOWER(COALESCE(entity_id, '')) LIKE ? OR LOWER(COALESCE(request_id, '')) LIKE ?)",
			);
			args.push(like, like, like, like, like);
		}

		if (filters.scope) {
			where.push("scope = ?");
			args.push(filters.scope);
		}

		if (filters.result) {
			where.push("result = ?");
			args.push(filters.result);
		}

		if (filters.entityType) {
			where.push("entity_type = ?");
			args.push(filters.entityType);
		}

		if (filters.actorRole) {
			where.push("actor_role = ?");
			args.push(filters.actorRole);
		}

		const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";
		const page = Math.max(1, Number(filters.page) || 1);
		const limit = Math.max(1, Math.min(filters.limit ?? 100, 200));
		const offset = (page - 1) * limit;

		const countResult = await db.execute({
			sql: `
				SELECT COUNT(*) AS total
				FROM audit_events
				${whereClause}
			`,
			args,
		});
		const total = Number((countResult.rows[0] as Record<string, unknown> | undefined)?.total || 0);

		const result = await db.execute({
			sql: `
				SELECT
					id,
					scope,
					store_id,
					actor_user_id,
					actor_name,
					actor_role,
					action,
					entity_type,
					entity_id,
					result,
					reason_code,
					ip_address,
					user_agent,
					request_id,
					metadata,
					"before",
					"after",
					occurred_at
				FROM audit_events
				${whereClause}
				ORDER BY occurred_at DESC
				LIMIT ?
				OFFSET ?
			`,
			args: [ ...args, limit, offset ],
		});

		const items = result.rows.map((row) => mapRow(row as Record<string, unknown>));
		return {
			items,
			page,
			limit,
			total,
			has_more: offset + items.length < total,
		};
	}

	static async findById(id: string): Promise<AuditEventRecord | null> {
		await AuditEventInterface.ensureTable();

		const db = DbConn.getClient();
		const result = await db.execute({
			sql: `
				SELECT
					id,
					scope,
					store_id,
					actor_user_id,
					actor_name,
					actor_role,
					action,
					entity_type,
					entity_id,
					result,
					reason_code,
					ip_address,
					user_agent,
					request_id,
					metadata,
					"before",
					"after",
					occurred_at
				FROM audit_events
				WHERE id = ?
				LIMIT 1
			`,
			args: [id],
		});

		const row = result.rows[0] as Record<string, unknown> | undefined;
		return row ? mapRow(row) : null;
	}

	static async findRecentByEntity(params: {
		entityType: string;
		entityId: string;
		action?: string;
		limit?: number;
	}): Promise<AuditEventRecord[]> {
		await AuditEventInterface.ensureTable();

		const db = DbConn.getClient();
		const limit = Math.max(1, Math.min(params.limit ?? 20, 200));
		const where: string[] = [ "entity_type = ?", "entity_id = ?" ];
		const args: InValue[] = [ params.entityType, params.entityId ];

		if (params.action) {
			where.push("action = ?");
			args.push(params.action);
		}

		const result = await db.execute({
			sql: `
				SELECT
					id,
					scope,
					store_id,
					actor_user_id,
					actor_name,
					actor_role,
					action,
					entity_type,
					entity_id,
					result,
					reason_code,
					ip_address,
					user_agent,
					request_id,
					metadata,
					"before",
					"after",
					occurred_at
				FROM audit_events
				WHERE ${where.join(" AND ")}
				ORDER BY occurred_at DESC
				LIMIT ?
			`,
			args: [ ...args, limit ],
		});

		return result.rows.map((row) => mapRow(row as Record<string, unknown>));
	}

	static async create(payload: AuditEventCreatePayload): Promise<AuditEventRecord> {
		await AuditEventInterface.ensureTable();

		const db = DbConn.getClient();
		const id = randomUUID();
		const occurredAt = payload.occurred_at || new Date().toISOString();

		await db.execute({
			sql: `
				INSERT INTO audit_events (
					id,
					scope,
					store_id,
					actor_user_id,
					actor_name,
					actor_role,
					action,
					entity_type,
					entity_id,
					result,
					reason_code,
					ip_address,
					user_agent,
					request_id,
					metadata,
					"before",
					"after",
					occurred_at
				) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
			`,
			args: [
				id,
				payload.scope,
				payload.store_id ?? null,
				payload.actor_user_id ?? null,
				payload.actor_name ?? null,
				payload.actor_role ?? null,
				payload.action,
				payload.entity_type,
				payload.entity_id ?? null,
				payload.result ?? "success",
				payload.reason_code ?? null,
				payload.ip_address ?? null,
				payload.user_agent ?? null,
				payload.request_id ?? null,
				serializeJson(payload.metadata),
				serializeJson(payload.before),
				serializeJson(payload.after),
				occurredAt,
			],
		});

		const created = await AuditEventInterface.findById(id);
		if (!created) {
			throw new Error("Failed to load created audit event");
		}

		return created;
	}

	static async countSince(filters: AuditEventCountFilters): Promise<number> {
		await AuditEventInterface.ensureTable();

		const db = DbConn.getClient();
		const where: string[] = [ "occurred_at >= ?" ];
		const args: InValue[] = [ filters.since ];

		if (filters.scope) {
			where.push("scope = ?");
			args.push(filters.scope);
		}

		if (filters.scopes?.length) {
			const placeholders = filters.scopes.map(() => "?").join(", ");
			where.push(`scope IN (${placeholders})`);
			args.push(...filters.scopes);
		}

		if (filters.actions?.length) {
			const placeholders = filters.actions.map(() => "?").join(", ");
			where.push(`action IN (${placeholders})`);
			args.push(...filters.actions);
		}

		if (filters.entityType) {
			where.push("entity_type = ?");
			args.push(filters.entityType);
		}

		if (filters.result) {
			where.push("result = ?");
			args.push(filters.result);
		}

		const result = await db.execute({
			sql: `
				SELECT COUNT(*) AS total
				FROM audit_events
				WHERE ${where.join(" AND ")}
			`,
			args,
		});

		return Number(result.rows[0]?.total || 0);
	}
}
