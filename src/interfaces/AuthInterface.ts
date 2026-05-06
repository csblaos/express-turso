import { DbConn } from "@connections/DbConn";
import { User } from "@models/User";

const USER_AUTH_COLUMNS = [
	{
		name: "password_hash",
		sql: "ALTER TABLE users ADD COLUMN password_hash TEXT NOT NULL DEFAULT ''",
	},
	{
		name: "session_limit",
		sql: "ALTER TABLE users ADD COLUMN session_limit INTEGER",
	},
	{
		name: "system_role",
		sql: "ALTER TABLE users ADD COLUMN system_role TEXT NOT NULL DEFAULT 'staff'",
	},
	{
		name: "must_change_password",
		sql: "ALTER TABLE users ADD COLUMN must_change_password INTEGER NOT NULL DEFAULT 0",
	},
	{
		name: "password_updated_at",
		sql: "ALTER TABLE users ADD COLUMN password_updated_at TEXT",
	},
	{
		name: "ui_locale",
		sql: "ALTER TABLE users ADD COLUMN ui_locale TEXT NOT NULL DEFAULT 'th'",
	},
	{
		name: "client_suspended",
		sql: "ALTER TABLE users ADD COLUMN client_suspended INTEGER NOT NULL DEFAULT 0",
	},
	{
		name: "client_suspended_at",
		sql: "ALTER TABLE users ADD COLUMN client_suspended_at TEXT",
	},
	{
		name: "client_suspended_reason",
		sql: "ALTER TABLE users ADD COLUMN client_suspended_reason TEXT",
	},
	{
		name: "client_suspended_by",
		sql: "ALTER TABLE users ADD COLUMN client_suspended_by TEXT",
	},
] as const;

export class AuthInterface {
	private static async ensureUserAuthColumns(): Promise<void> {
		const db = DbConn.getClient();
		const pragmaResult = await db.execute("PRAGMA table_info(users)");
		const existingColumns = new Set(
			pragmaResult.rows.map((row) => String(row.name || "")),
		);

		for (const column of USER_AUTH_COLUMNS) {
			if (existingColumns.has(column.name)) continue;
			await db.execute(column.sql);
		}
	}

	static async findUserByIdentifier(identifier: string): Promise<User | null> {
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		const normalized = identifier.trim().toLowerCase();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM users
				WHERE LOWER(email) = ? OR LOWER(name) = ?
				LIMIT 1
			`,
			args: [ normalized, normalized ],
		});

		if (result.rows.length === 0) return null;
		return result.rows[0] as unknown as User;
	}

	static async findUserById(id: string): Promise<User | null> {
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM users WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return result.rows[0] as unknown as User;
	}
}
