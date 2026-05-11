import { createHash, randomUUID } from "crypto";

import bcrypt from "bcryptjs";
import { Request } from "express";

import { ENV } from "@configs/ENV";
import { ErrorConfig } from "@configs/ErrorConfig";
import { RedisConn } from "@connections/RedisConn";
import { AuthInterface } from "@interfaces/AuthInterface";
import { RbacInterface } from "@interfaces/RbacInterface";
import { StoreInterface } from "@interfaces/StoreInterface";
import { SystemConfigInterface } from "@interfaces/SystemConfigInterface";
import { ApiError } from "@middlewares/ApiError";
import { User } from "@models/User";
import { AuthToken, AuthTokenPayload } from "@utils/AuthToken";
import { SystemRuntimeTelemetry } from "@utils/SystemRuntimeTelemetry";

type LoginInput = {
	emailOrUsername: string;
	password: string;
	rememberMe?: boolean;
};

type RefreshInput = {
	refreshToken: string;
};

type LogoutInput = {
	refreshToken?: string;
	sessionId?: string;
};

type UpdateProfileInput = {
	name: string;
};

type ChangePasswordInput = {
	currentPassword: string;
	newPassword: string;
	confirmPassword?: string;
};

type AuthPolicy = {
	defaultSessionLimit: number;
	accessTokenTtlMinutes: number;
	refreshTokenTtlDays: number;
	rememberMeRefreshTtlDays: number;
	maxFailedAttempts: number;
	lockoutMinutes: number;
	allowMultiSession: boolean;
};

type SessionRecord = {
	id: string;
	userId: string;
	email: string;
	name: string;
	systemRole: string;
	rememberMe: boolean;
	createdAt: string;
	updatedAt: string;
	refreshExpiresAt: string;
};

type LoginResponse = {
	user: {
		id: string;
		email: string;
		name: string;
		systemRole: string;
		mustChangePassword: boolean;
		uiLocale: string;
		canCreateStores: boolean;
		maxStores: number | null;
		canCreateBranches: boolean;
		maxBranchesPerStore: number | null;
		ownedStoresCount: number;
	};
	session: SessionRecord;
	tokens: {
		accessToken: string;
		refreshToken: string;
		tokenType: "Bearer";
		expiresInSeconds: number;
		refreshExpiresInSeconds: number;
	};
};

function getAuthPolicyValue(value: number | null | undefined, fallback: number): number {
	if (value === undefined || value === null || !Number.isFinite(value)) return fallback;
	return Number(value);
}

function getUserId(user: User): string {
	return String(user.id);
}

function getSessionKey(sessionId: string): string {
	return `auth:session:${sessionId}`;
}

function getUserSessionsKey(userId: string): string {
	return `auth:user-sessions:${userId}`;
}

function getFailedLoginKey(identifier: string): string {
	return `auth:failed-login:${identifier.trim().toLowerCase()}`;
}

async function getJsonValue<T>(key: string): Promise<T | null> {
	const rawValue = await RedisConn.get(key);
	if (!rawValue) return null;

	try {
		return JSON.parse(rawValue) as T;
	} catch {
		return null;
	}
}

async function setJsonValue(key: string, value: unknown, exSeconds?: number): Promise<void> {
	await RedisConn.set(
		key,
		JSON.stringify(value),
		exSeconds ? { exSeconds } : undefined,
	);
}

function buildUserSummary(user: User) {
	return {
		id: getUserId(user),
		email: user.email,
		name: user.name,
		systemRole: user.system_role,
		mustChangePassword: Boolean(user.must_change_password),
		uiLocale: user.ui_locale || "th",
		canCreateStores: Boolean(user.can_create_stores),
		maxStores: user.max_stores === null || user.max_stores === undefined ? null : Number(user.max_stores),
		canCreateBranches: Boolean(user.can_create_branches),
		maxBranchesPerStore: user.max_branches_per_store === null || user.max_branches_per_store === undefined ? null : Number(user.max_branches_per_store),
	};
}

async function buildUserSummaryWithOnboarding(user: User) {
	const summary = buildUserSummary(user);
	const ownedStoresCount = user.system_role === "superadmin"
		? await StoreInterface.countByOwnerUserId(getUserId(user))
		: 0;

	return {
		...summary,
		ownedStoresCount,
	};
}

async function getSessionRecord(sessionId: string): Promise<SessionRecord | null> {
	return getJsonValue<SessionRecord>(getSessionKey(sessionId));
}

async function verifyPassword(password: string, passwordHash: string): Promise<boolean> {
	if (!passwordHash) return false;

	if (passwordHash.startsWith("$2a$") || passwordHash.startsWith("$2b$") || passwordHash.startsWith("$2y$")) {
		return bcrypt.compare(password, passwordHash);
	}

	if (passwordHash.startsWith("plain:")) {
		return passwordHash.slice("plain:".length) === password;
	}

	if (passwordHash.startsWith("sha256:")) {
		const digest = createHash("sha256").update(password).digest("hex");
		return passwordHash.slice("sha256:".length) === digest;
	}

	return passwordHash === password;
}

export class AuthComponent {
	private static async getAuthPolicy(): Promise<AuthPolicy> {
		const config = await SystemConfigInterface.getConfig();
		return {
			defaultSessionLimit: getAuthPolicyValue(config.default_session_limit, 3),
			accessTokenTtlMinutes: getAuthPolicyValue(config.auth_access_token_ttl_minutes, 15),
			refreshTokenTtlDays: getAuthPolicyValue(config.auth_refresh_token_ttl_days, 7),
			rememberMeRefreshTtlDays: getAuthPolicyValue(config.auth_remember_me_refresh_ttl_days, 30),
			maxFailedAttempts: getAuthPolicyValue(config.auth_max_failed_attempts, 5),
			lockoutMinutes: getAuthPolicyValue(config.auth_lockout_minutes, 15),
			allowMultiSession: Boolean(config.auth_allow_multi_session),
		};
	}

	private static getSessionLimit(user: User, policy: AuthPolicy): number {
		if (user.session_limit && Number.isFinite(user.session_limit)) {
			return Math.max(1, Number(user.session_limit));
		}
		return Math.max(1, policy.defaultSessionLimit);
	}

	private static getExpiresAtFromDays(days: number): string {
		return new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();
	}

	private static getExpiresAtFromMinutes(minutes: number): number {
		return Math.floor(Date.now() / 1000) + (minutes * 60);
	}

	private static async getSessionIds(userId: string): Promise<string[]> {
		return (await getJsonValue<string[]>(getUserSessionsKey(userId))) || [];
	}

	private static async saveSessionIds(userId: string, sessionIds: string[]): Promise<void> {
		await setJsonValue(getUserSessionsKey(userId), sessionIds);
	}

	private static async revokeSession(sessionId: string): Promise<void> {
		const session = await getSessionRecord(sessionId);
		if (session?.userId) {
			const existingSessionIds = await AuthComponent.getSessionIds(session.userId);
			const nextSessionIds = existingSessionIds.filter((id) => id !== sessionId);
			await AuthComponent.saveSessionIds(session.userId, nextSessionIds);
		}
		await RedisConn.del(getSessionKey(sessionId));
	}

	private static async updateSessionSnapshot(sessionId: string, user: User): Promise<void> {
		const session = await getSessionRecord(sessionId);
		if (!session) return;

		const nextSession: SessionRecord = {
			...session,
			email: user.email,
			name: user.name,
			systemRole: user.system_role,
			updatedAt: new Date().toISOString(),
		};

		const expiresAtMs = new Date(session.refreshExpiresAt).getTime();
		const ttlSeconds = Math.max(1, Math.floor((expiresAtMs - Date.now()) / 1000));
		await setJsonValue(getSessionKey(sessionId), nextSession, ttlSeconds);
	}

	private static async revokeOtherSessions(userId: string, keepSessionId: string): Promise<void> {
		const sessionIds = await AuthComponent.getSessionIds(userId);
		for (const sessionId of sessionIds) {
			if (sessionId === keepSessionId) continue;
			await AuthComponent.revokeSession(sessionId);
		}
	}

	private static async resolveAuthenticatedUser(req: Request): Promise<{ user: User; sessionId: string }> {
		if (!req.auth?.userId || !req.auth?.sessionId) {
			throw ApiError.UnauthorizedError("Missing authenticated user");
		}

		const user = await AuthInterface.findUserById(req.auth.userId);
		if (!user) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		if (user.client_suspended) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_USER_SUSPENDED);
		}

		const session = await getSessionRecord(req.auth.sessionId);
		if (!session || session.userId !== req.auth.userId) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_SESSION_INVALID);
		}

		return {
			user,
			sessionId: req.auth.sessionId,
		};
	}

	private static async enforceSessionLimit(user: User, policy: AuthPolicy): Promise<void> {
		const userId = getUserId(user);
		const existingSessionIds = await AuthComponent.getSessionIds(userId);

		if (!policy.allowMultiSession && existingSessionIds.length > 0) {
			for (const sessionId of existingSessionIds) {
				await AuthComponent.revokeSession(sessionId);
			}
			await AuthComponent.saveSessionIds(userId, []);
			return;
		}

		const sessionLimit = AuthComponent.getSessionLimit(user, policy);
		if (existingSessionIds.length < sessionLimit) return;

		const staleSessionIds = existingSessionIds.slice(0, existingSessionIds.length - sessionLimit + 1);
		for (const sessionId of staleSessionIds) {
			await AuthComponent.revokeSession(sessionId);
		}
	}

	private static async consumeFailedAttempt(identifier: string, policy: AuthPolicy): Promise<void> {
		const key = getFailedLoginKey(identifier);
		const currentCount = Number(await RedisConn.get(key) || "0");
		await RedisConn.set(key, String(currentCount + 1), {
			exSeconds: policy.lockoutMinutes * 60,
		});
	}

	private static async clearFailedAttempts(identifier: string): Promise<void> {
		await RedisConn.del(getFailedLoginKey(identifier));
	}

	private static async assertAccountNotLocked(identifier: string, policy: AuthPolicy): Promise<void> {
		const rawCount = await RedisConn.get(getFailedLoginKey(identifier));
		const failedAttempts = Number(rawCount || "0");
		if (failedAttempts >= policy.maxFailedAttempts) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_ACCOUNT_LOCKED);
		}
	}

	private static async createTokensAndSession(
		user: User,
		policy: AuthPolicy,
		rememberMe: boolean,
	): Promise<LoginResponse> {
		const userId = getUserId(user);
		const sessionId = randomUUID();
		const nowIso = new Date().toISOString();
		const refreshTtlDays = rememberMe ? policy.rememberMeRefreshTtlDays : policy.refreshTokenTtlDays;
		const refreshExpiresAt = AuthComponent.getExpiresAtFromDays(refreshTtlDays);
		const accessExpiresAt = AuthComponent.getExpiresAtFromMinutes(policy.accessTokenTtlMinutes);
		const refreshExpiresAtEpoch = Math.floor(new Date(refreshExpiresAt).getTime() / 1000);

		const accessPayload: AuthTokenPayload = {
			sub: userId,
			sid: sessionId,
			typ: "access",
			role: user.system_role,
			email: user.email,
			name: user.name,
			remember: rememberMe,
			iat: Math.floor(Date.now() / 1000),
			exp: accessExpiresAt,
		};

		const refreshPayload: AuthTokenPayload = {
			...accessPayload,
			typ: "refresh",
			exp: refreshExpiresAtEpoch,
		};

		const accessToken = AuthToken.sign(accessPayload, ENV.AUTH.JWT_SECRET);
		const refreshToken = AuthToken.sign(refreshPayload, ENV.AUTH.JWT_SECRET);

		const sessionRecord: SessionRecord = {
			id: sessionId,
			userId,
			email: user.email,
			name: user.name,
			systemRole: user.system_role,
			rememberMe,
			createdAt: nowIso,
			updatedAt: nowIso,
			refreshExpiresAt,
		};

		await setJsonValue(getSessionKey(sessionId), sessionRecord, refreshTtlDays * 24 * 60 * 60);
		const existingSessionIds = await AuthComponent.getSessionIds(userId);
		await AuthComponent.saveSessionIds(userId, [ ...existingSessionIds, sessionId ]);

		return {
			user: await buildUserSummaryWithOnboarding(user),
			session: sessionRecord,
			tokens: {
				accessToken,
				refreshToken,
				tokenType: "Bearer",
				expiresInSeconds: policy.accessTokenTtlMinutes * 60,
				refreshExpiresInSeconds: refreshTtlDays * 24 * 60 * 60,
			},
		};
	}

	private static async resolveSessionByRefreshToken(refreshToken: string): Promise<{
		token: AuthTokenPayload;
		session: SessionRecord;
		user: User;
	}> {
		const token = AuthToken.verify(refreshToken, ENV.AUTH.JWT_SECRET);
		if (!token || token.typ !== "refresh") {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_TOKEN_INVALID);
		}

		const session = await getJsonValue<SessionRecord>(getSessionKey(token.sid));
		if (!session || session.userId !== token.sub) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_SESSION_INVALID);
		}

		const user = await AuthInterface.findUserById(token.sub);
		if (!user) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		if (user.client_suspended) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_USER_SUSPENDED);
		}

		return { token, session, user };
	}

	static async login(requestId: string, input: LoginInput): Promise<LoginResponse> {
		void requestId;
		const identifier = input.emailOrUsername.trim();
		const password = input.password || "";
		const rememberMe = Boolean(input.rememberMe);
		const policy = await AuthComponent.getAuthPolicy();

		try {
			await AuthComponent.assertAccountNotLocked(identifier, policy);
		} catch (error) {
			if (error instanceof ApiError && error.code === ErrorConfig.DOMAIN.AUTH_ACCOUNT_LOCKED.code) {
				SystemRuntimeTelemetry.recordAuthEvent("account_locked");
			}
			throw error;
		}

		const user = await AuthInterface.findUserByIdentifier(identifier);
		if (!user) {
			await AuthComponent.consumeFailedAttempt(identifier, policy);
			SystemRuntimeTelemetry.recordAuthEvent("login_failure");
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		if (user.client_suspended) {
			SystemRuntimeTelemetry.recordAuthEvent("login_blocked_suspended");
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_USER_SUSPENDED);
		}

		const isValidPassword = await verifyPassword(password, user.password_hash);
		if (!isValidPassword) {
			await AuthComponent.consumeFailedAttempt(identifier, policy);
			SystemRuntimeTelemetry.recordAuthEvent("login_failure");
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		await AuthComponent.clearFailedAttempts(identifier);
		await AuthComponent.enforceSessionLimit(user, policy);
		SystemRuntimeTelemetry.recordAuthEvent("login_success");
		return AuthComponent.createTokensAndSession(user, policy, rememberMe);
	}

	static async refresh(requestId: string, input: RefreshInput): Promise<LoginResponse> {
		void requestId;
		const { token, session, user } = await AuthComponent.resolveSessionByRefreshToken(input.refreshToken);
		const policy = await AuthComponent.getAuthPolicy();
		const nextResponse = await AuthComponent.createTokensAndSession(user, policy, token.remember);
		await AuthComponent.revokeSession(session.id);
		return nextResponse;
	}

	static async logout(requestId: string, input: LogoutInput): Promise<void> {
		void requestId;

		if (input.refreshToken) {
			const token = AuthToken.verify(input.refreshToken, ENV.AUTH.JWT_SECRET);
			if (token?.sid) {
				await AuthComponent.revokeSession(token.sid);
			}
			return;
		}

		if (input.sessionId) {
			await AuthComponent.revokeSession(input.sessionId);
		}
	}

	static async me(requestId: string, req: Request): Promise<{
		user: ReturnType<typeof buildUserSummary>;
		session: SessionRecord | null;
		access: Awaited<ReturnType<typeof RbacInterface.getUserPermissions>>;
	}> {
		void requestId;
		const authorization = req.header("authorization") || "";
		const tokenValue = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
		if (!tokenValue) {
			throw ApiError.UnauthorizedError("Missing bearer token");
		}

		const token = AuthToken.verify(tokenValue, ENV.AUTH.JWT_SECRET);
		if (!token || token.typ !== "access") {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_TOKEN_INVALID);
		}

		const user = await AuthInterface.findUserById(token.sub);
		if (!user) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		if (user.client_suspended) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_USER_SUSPENDED);
		}

		const session = await getJsonValue<SessionRecord>(getSessionKey(token.sid));
		if (!session) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_SESSION_INVALID);
		}

		const storeId = typeof req.query.store_id === "string" ? req.query.store_id : undefined;
		const access = await RbacInterface.getUserPermissions(getUserId(user), storeId);

		return {
			user: await buildUserSummaryWithOnboarding(user),
			session,
			access,
		};
	}

	static async updateProfile(requestId: string, req: Request, input: UpdateProfileInput): Promise<{
		user: ReturnType<typeof buildUserSummary>;
	}> {
		void requestId;
		const { user, sessionId } = await AuthComponent.resolveAuthenticatedUser(req);
		const nextName = input.name.trim();

		if (!nextName) {
			throw ApiError.BadRequestError("name is required");
		}

		const updatedUser = await AuthInterface.updateUserName(getUserId(user), nextName);
		if (!updatedUser) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		await AuthComponent.updateSessionSnapshot(sessionId, updatedUser);

		return {
			user: await buildUserSummaryWithOnboarding(updatedUser),
		};
	}

	static async changePassword(requestId: string, req: Request, input: ChangePasswordInput): Promise<{
		user: ReturnType<typeof buildUserSummary>;
		passwordChanged: true;
	}> {
		void requestId;
		const { user, sessionId } = await AuthComponent.resolveAuthenticatedUser(req);
		const isValidPassword = await verifyPassword(input.currentPassword || "", user.password_hash);

		if (!isValidPassword) {
			throw ApiError.BadRequestError("Current password is incorrect");
		}

		if ((input.currentPassword || "") === (input.newPassword || "")) {
			throw ApiError.BadRequestError("New password must be different from current password");
		}

		const passwordHash = await bcrypt.hash(input.newPassword, 10);
		const updatedUser = await AuthInterface.updateUserPassword(getUserId(user), passwordHash, false);
		if (!updatedUser) {
			throw ApiError.CustomError(ErrorConfig.DOMAIN.AUTH_INVALID_CREDENTIALS);
		}

		await AuthComponent.updateSessionSnapshot(sessionId, updatedUser);
		await AuthComponent.revokeOtherSessions(getUserId(user), sessionId);

		return {
			user: await buildUserSummaryWithOnboarding(updatedUser),
			passwordChanged: true,
		};
	}
}
