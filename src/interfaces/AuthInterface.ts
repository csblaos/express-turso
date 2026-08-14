import { ENV } from "@configs/ENV";
import { DbConn } from "@connections/DbConn";
import { User } from "@models/User";

const USER_AUTH_COLUMNS = [
	{
		name: "username",
		sql: "ALTER TABLE users ADD COLUMN username TEXT",
	},
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

const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._]{2,31}$/;

export function normalizeUsername(value: string): string {
	return value.trim().toLowerCase();
}

export function assertUsername(value: string): string {
	const username = normalizeUsername(value);
	if (!USERNAME_PATTERN.test(username)) throw new Error("USERNAME_INVALID");
	return username;
}

function usernameBaseFromEmail(email: string): string {
	const base = (email.split("@")[0] || "user").toLowerCase()
		.replace(/[^a-z0-9._]/g, ".")
		.replace(/[._]+/g, ".")
		.replace(/^\.|\.$/g, "");
	return (base.length >= 3 ? base : "user").slice(0, 26);
}

type DevelopmentAuthAccount = {
	id: string;
	email: string;
	name: string;
	password: string;
	system_role: string;
	ui_locale?: string;
};

let DEVELOPMENT_AUTH_ACCOUNTS: DevelopmentAuthAccount[] = [
	{
		id: "__dev_user__",
		email: "dev@codesabai.local",
		name: "Dev Admin",
		password: "dev123456",
		system_role: "system_admin",
		ui_locale: "th",
	},
	{
		id: "__dev_owner__",
		email: "owner@codesabai.local",
		name: "Dev Owner",
		password: "dev123456",
		system_role: "owner",
		ui_locale: "th",
	},
	{
		id: "__dev_manager__",
		email: "manager@codesabai.local",
		name: "Dev Manager",
		password: "dev123456",
		system_role: "manager",
		ui_locale: "th",
	},
	{
		id: "__dev_cashier__",
		email: "cashier@codesabai.local",
		name: "Dev Cashier",
		password: "dev123456",
		system_role: "cashier",
		ui_locale: "th",
	},
	{
		id: "__dev_stock__",
		email: "stock@codesabai.local",
		name: "Dev Stock",
		password: "dev123456",
		system_role: "inventory_staff",
		ui_locale: "th",
	},
];

function findDevelopmentAccountById(id: string) {
	return DEVELOPMENT_AUTH_ACCOUNTS.find((account) => account.id === id) || null;
}

function findDevelopmentAccountByIdentifier(identifier: string) {
	const normalized = identifier.trim().toLowerCase();
	return DEVELOPMENT_AUTH_ACCOUNTS.find((account) => (
		normalized === account.email.toLowerCase() ||
		normalized === account.name.toLowerCase()
	)) || null;
}

function updateDevelopmentAccount(id: string, updater: (account: DevelopmentAuthAccount) => DevelopmentAuthAccount) {
	const index = DEVELOPMENT_AUTH_ACCOUNTS.findIndex((account) => account.id === id);
	if (index === -1) return null;

	DEVELOPMENT_AUTH_ACCOUNTS = DEVELOPMENT_AUTH_ACCOUNTS.map((account, accountIndex) => (
		accountIndex === index ? updater(account) : account
	));

	return DEVELOPMENT_AUTH_ACCOUNTS[index] || null;
}

function createDevelopmentUser(account: DevelopmentAuthAccount): User {
	return {
		id: account.id,
		email: account.email,
		name: account.name,
		username: usernameBaseFromEmail(account.email),
		password_hash: `plain:${account.password}`,
		created_at: new Date(0).toISOString(),
		session_limit: null,
		system_role: account.system_role,
		can_create_stores: 1,
		max_stores: null,
		created_by: null,
		must_change_password: 0,
		password_updated_at: new Date(0).toISOString(),
		ui_locale: account.ui_locale || "th",
		client_suspended: 0,
		client_suspended_at: null,
		client_suspended_reason: null,
		client_suspended_by: null,
	};
}

export class AuthInterface {
	private static userAuthColumnsEnsured = false;
	private static ensureUserAuthColumnsPromise: Promise<void> | null = null;
	private static developmentAccountsPersisted = false;
	private static ensureDevelopmentAccountsPromise: Promise<void> | null = null;

	static async ensureDevelopmentAccountsPersisted(): Promise<void> {
		if (ENV.SERVER.NODE_ENV === "production") return;
		if (AuthInterface.developmentAccountsPersisted) return;
		if (AuthInterface.ensureDevelopmentAccountsPromise) {
			return AuthInterface.ensureDevelopmentAccountsPromise;
		}

		AuthInterface.ensureDevelopmentAccountsPromise = (async () => {
			await AuthInterface.ensureUserAuthColumns();
			const db = DbConn.getClient();

			for (const account of DEVELOPMENT_AUTH_ACCOUNTS) {
				const existing = await db.execute({
					sql: "SELECT id, email FROM users WHERE id = ? OR LOWER(email) = ? LIMIT 1",
					args: [ account.id, account.email.toLowerCase() ],
				});

				if (existing.rows.length > 0) continue;

				await db.execute({
					sql: `
						INSERT INTO users (
							id, email, name, password_hash, created_at, session_limit, system_role,
							can_create_stores, max_stores,
							created_by, must_change_password, password_updated_at, ui_locale,
							client_suspended, client_suspended_at, client_suspended_reason, client_suspended_by
						)
						VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
					`,
					args: [
						account.id,
						account.email.toLowerCase(),
						account.name,
						`plain:${account.password}`,
						new Date(0).toISOString(),
						null,
						account.system_role,
						1,
						account.system_role === "superadmin" ? 1 : null,
						1,
						null,
						null,
						0,
						new Date(0).toISOString(),
						account.ui_locale || "th",
						0,
						null,
						null,
						null,
					],
				});
			}

			AuthInterface.developmentAccountsPersisted = true;
		})().catch((error) => {
			AuthInterface.ensureDevelopmentAccountsPromise = null;
			throw error;
		});

		return AuthInterface.ensureDevelopmentAccountsPromise;
	}

	static async findPersistedUserById(id: string): Promise<User | null> {
		await AuthInterface.ensureUserAuthColumns();
		await AuthInterface.ensureDevelopmentAccountsPersisted();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM users WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) return null;
		return result.rows[0] as unknown as User;
	}

	static async ensureUserAuthColumns(): Promise<void> {
		if (AuthInterface.userAuthColumnsEnsured) return;
		if (AuthInterface.ensureUserAuthColumnsPromise) {
			return AuthInterface.ensureUserAuthColumnsPromise;
		}

		AuthInterface.ensureUserAuthColumnsPromise = (async () => {
			const db = DbConn.getClient();
			const pragmaResult = await db.execute("PRAGMA table_info(users)");
			const existingColumns = new Set(
				pragmaResult.rows.map((row) => String(row.name || "")),
			);

			for (const column of USER_AUTH_COLUMNS) {
				if (existingColumns.has(column.name)) continue;
				await db.execute(column.sql);
			}

			const usersWithoutUsername = await db.execute("SELECT id, email FROM users WHERE username IS NULL OR TRIM(username) = ''");
			for (const row of usersWithoutUsername.rows) {
				const base = usernameBaseFromEmail(String(row.email || ""));
				let candidate = base;
				let sequence = 1;
				while (true) {
					const collision = await db.execute({ sql: "SELECT 1 FROM users WHERE LOWER(username) = ? AND id <> ? LIMIT 1", args: [ candidate, String(row.id) ] });
					if (!collision.rows.length) break;
					candidate = `${base.slice(0, 26)}.${sequence++}`;
				}
				await db.execute({ sql: "UPDATE users SET username = ? WHERE id = ?", args: [ candidate, String(row.id) ] });
			}
			await db.execute("CREATE UNIQUE INDEX IF NOT EXISTS users_username_unique ON users(username COLLATE NOCASE)");

			AuthInterface.userAuthColumnsEnsured = true;
		})().catch((error) => {
			AuthInterface.ensureUserAuthColumnsPromise = null;
			throw error;
		});

		return AuthInterface.ensureUserAuthColumnsPromise;
	}

	static async findUserByIdentifier(identifier: string): Promise<User | null> {
		await AuthInterface.ensureUserAuthColumns();
		await AuthInterface.ensureDevelopmentAccountsPersisted();
		const db = DbConn.getClient();
		const normalized = identifier.trim().toLowerCase();
		const result = await db.execute({
			sql: `
				SELECT *
				FROM users
				WHERE LOWER(email) = ? OR LOWER(username) = ?
				LIMIT 1
			`,
			args: [ normalized, normalized ],
		});

		if (result.rows.length === 0) {
			if (ENV.SERVER.NODE_ENV !== "production") {
				const account = findDevelopmentAccountByIdentifier(identifier);
				if (account) {
					return createDevelopmentUser(account);
				}
			}
			return null;
		}
		return result.rows[0] as unknown as User;
	}

	static async findUserById(id: string): Promise<User | null> {
		await AuthInterface.ensureUserAuthColumns();
		await AuthInterface.ensureDevelopmentAccountsPersisted();
		const db = DbConn.getClient();
		const result = await db.execute({
			sql: "SELECT * FROM users WHERE id = ? LIMIT 1",
			args: [ id ],
		});

		if (result.rows.length === 0) {
			if (ENV.SERVER.NODE_ENV !== "production") {
				const account = findDevelopmentAccountById(id);
				if (account) {
					return createDevelopmentUser(account);
				}
			}
			return null;
		}
		return result.rows[0] as unknown as User;
	}

	static async updateUserName(id: string, name: string): Promise<User | null> {
		if (ENV.SERVER.NODE_ENV !== "production") {
			const account = updateDevelopmentAccount(id, (current) => ({
				...current,
				name,
			}));
			if (account) {
				return createDevelopmentUser(account);
			}
		}

		await AuthInterface.ensureUserAuthColumns();
		await AuthInterface.ensureDevelopmentAccountsPersisted();
		const db = DbConn.getClient();
		await db.execute({
			sql: "UPDATE users SET name = ? WHERE id = ?",
			args: [ name, id ],
		});

		return AuthInterface.findUserById(id);
	}

	static async updateUsername(id: string, value: string): Promise<User | null> {
		const username = assertUsername(value);
		await AuthInterface.ensureUserAuthColumns();
		const db = DbConn.getClient();
		try {
			await db.execute({ sql: "UPDATE users SET username = ? WHERE id = ?", args: [ username, id ] });
		} catch (error) {
			if (String(error).toLowerCase().includes("unique")) throw new Error("USERNAME_TAKEN");
			throw error;
		}
		return AuthInterface.findUserById(id);
	}

	static async updateUserPassword(id: string, passwordHash: string, mustChangePassword = false): Promise<User | null> {
		const passwordUpdatedAt = new Date().toISOString();

		if (ENV.SERVER.NODE_ENV !== "production") {
			const account = updateDevelopmentAccount(id, (current) => ({
				...current,
				password: passwordHash.startsWith("plain:") ? passwordHash.slice("plain:".length) : current.password,
			}));
			if (account) {
				return {
					...createDevelopmentUser(account),
					password_hash: passwordHash,
					must_change_password: mustChangePassword ? 1 : 0,
					password_updated_at: passwordUpdatedAt,
				};
			}
		}

		await AuthInterface.ensureUserAuthColumns();
		await AuthInterface.ensureDevelopmentAccountsPersisted();
		const db = DbConn.getClient();
		await db.execute({
			sql: `
				UPDATE users
				SET password_hash = ?, must_change_password = ?, password_updated_at = ?
				WHERE id = ?
			`,
			args: [ passwordHash, mustChangePassword ? 1 : 0, passwordUpdatedAt, id ],
		});

		return AuthInterface.findUserById(id);
	}
}
