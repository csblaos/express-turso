import { resolveAcceptedPermissionKeys } from "~/utils/permission-compat";

type AuthPermission = {
	id: string;
	key: string;
	resource: string;
	action: string;
};

type AuthMembership = {
	store_id: string;
	role_id: string;
	role_name: string;
	status: string;
	permissions: AuthPermission[];
};

type AuthAccess = {
	user_id: string;
	store_id?: string;
	permissions: AuthPermission[];
	memberships: AuthMembership[];
};

type AuthUser = {
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

type AuthSession = {
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

type AuthEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type LoginPayload = {
	emailOrUsername: string;
	password: string;
	rememberMe?: boolean;
	storeId?: string;
};

type LoginResponse = {
	user: AuthUser;
	session: AuthSession;
	access: AuthAccess;
	tokens: {
		accessToken: string;
		refreshToken: string;
		tokenType: "Bearer";
		expiresInSeconds: number;
		refreshExpiresInSeconds: number;
	};
};

type MeResponse = {
	user: AuthUser;
	session: AuthSession;
	access: AuthAccess;
};

const STORAGE_KEYS = {
	accessToken: "pos.auth.accessToken",
	refreshToken: "pos.auth.refreshToken",
	user: "pos.auth.user",
	session: "pos.auth.session",
	access: "pos.auth.access",
	currentStoreId: "pos.auth.currentStoreId",
} as const;

const COOKIE_KEYS = {
	accessToken: "pos.auth.accessToken",
	refreshToken: "pos.auth.refreshToken",
	systemRole: "pos.auth.systemRole",
	currentStoreId: "pos.auth.currentStoreId",
} as const;

const SYSTEM_ROLE_PERMISSION_MAP: Record<string, string[]> = {
	superadmin: [ "superadmin.manage" ],
};

let refreshInFlight: Promise<boolean> | null = null;

function getFetchErrorStatus(error: unknown): number | undefined {
	if (typeof error !== "object" || !error || !("response" in error)) return undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const response = (error as any).response;
	if (!response || typeof response !== "object") return undefined;
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const status = (response as any).status;
	return typeof status === "number" ? status : undefined;
}

function readStorageValue<T>(key: string): T | null {
	if (!import.meta.client) return null;
	const rawValue = window.localStorage.getItem(key);
	if (!rawValue) return null;
	try {
		return JSON.parse(rawValue) as T;
	} catch {
		return null;
	}
}

function writeStorageValue(key: string, value: unknown) {
	if (!import.meta.client) return;
	window.localStorage.setItem(key, JSON.stringify(value));
}

function removeStorageValue(key: string) {
	if (!import.meta.client) return;
	window.localStorage.removeItem(key);
}

function normalizeSystemRole(systemRole?: string | null) {
	return String(systemRole || "").trim().toLowerCase();
}

export function useAuthSession() {
	const runtimeConfig = useRuntimeConfig();
	const accessToken = useState<string | null>("auth.access-token", () => null);
	const refreshToken = useState<string | null>("auth.refresh-token", () => null);
	const currentUser = useState<AuthUser | null>("auth.current-user", () => null);
	const currentSession = useState<AuthSession | null>("auth.current-session", () => null);
	const currentAccess = useState<AuthAccess | null>("auth.current-access", () => null);
	const currentStoreId = useState<string | null>("auth.current-store-id", () => null);
	const hydrated = useState<boolean>("auth.hydrated", () => false);
	const redirectingToLogin = useState<boolean>("auth.redirecting-to-login", () => false);
	const accessTokenCookie = useCookie<string | null>(COOKIE_KEYS.accessToken, {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});
	const refreshTokenCookie = useCookie<string | null>(COOKIE_KEYS.refreshToken, {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});
	const systemRoleCookie = useCookie<string | null>(COOKIE_KEYS.systemRole, {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});
	const currentStoreIdCookie = useCookie<string | null>(COOKIE_KEYS.currentStoreId, {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});

	function resolveAccessStoreId(access: AuthAccess | null, requestedStoreId?: string): string | null {
		const memberships = access?.memberships || [];
		if (memberships.length === 0) return null;

		const normalizedRequestedStoreId = requestedStoreId?.trim();
		if (normalizedRequestedStoreId && memberships.some((membership) => membership.store_id === normalizedRequestedStoreId)) {
			return normalizedRequestedStoreId;
		}

		const scopedStoreId = access?.store_id?.trim();
		if (scopedStoreId && memberships.some((membership) => membership.store_id === scopedStoreId)) {
			return scopedStoreId;
		}

		const ownerMembership = memberships.find((membership) => (
			membership.status === "active" && normalizeSystemRole(membership.role_name) === "owner"
		));
		if (ownerMembership?.store_id?.trim()) {
			return ownerMembership.store_id.trim();
		}

		const activeMembership = memberships.find((membership) => membership.status === "active");
		if (activeMembership?.store_id?.trim()) {
			return activeMembership.store_id.trim();
		}

		const membershipStoreId = memberships[0]?.store_id;
		return membershipStoreId?.trim() || null;
	}

	function hydrateAuthState() {
		if (!import.meta.client || hydrated.value) return;

		accessToken.value = readStorageValue<string>(STORAGE_KEYS.accessToken) || accessTokenCookie.value;
		refreshToken.value = readStorageValue<string>(STORAGE_KEYS.refreshToken) || refreshTokenCookie.value;
		currentUser.value = readStorageValue<AuthUser>(STORAGE_KEYS.user);
		currentSession.value = readStorageValue<AuthSession>(STORAGE_KEYS.session);
		currentAccess.value = readStorageValue<AuthAccess>(STORAGE_KEYS.access);
		currentStoreId.value = readStorageValue<string>(STORAGE_KEYS.currentStoreId) || currentStoreIdCookie.value || null;
		if (!currentStoreId.value) {
			currentStoreId.value = resolveAccessStoreId(currentAccess.value);
		}
		hydrated.value = true;
	}

	function persistAuthState() {
		if (accessToken.value) {
			accessTokenCookie.value = accessToken.value;
			if (import.meta.client) {
				writeStorageValue(STORAGE_KEYS.accessToken, accessToken.value);
			}
		} else {
			accessTokenCookie.value = null;
			if (import.meta.client) {
				removeStorageValue(STORAGE_KEYS.accessToken);
			}
		}

		if (refreshToken.value) {
			refreshTokenCookie.value = refreshToken.value;
			if (import.meta.client) {
				writeStorageValue(STORAGE_KEYS.refreshToken, refreshToken.value);
			}
		} else {
			refreshTokenCookie.value = null;
			if (import.meta.client) {
				removeStorageValue(STORAGE_KEYS.refreshToken);
			}
		}

		systemRoleCookie.value = currentUser.value?.systemRole || null;
		currentStoreIdCookie.value = currentStoreId.value;

		if (!import.meta.client) return;

		if (currentUser.value) {
			writeStorageValue(STORAGE_KEYS.user, currentUser.value);
		} else {
			removeStorageValue(STORAGE_KEYS.user);
		}

		if (currentSession.value) {
			writeStorageValue(STORAGE_KEYS.session, currentSession.value);
		} else {
			removeStorageValue(STORAGE_KEYS.session);
		}

		if (currentAccess.value) {
			writeStorageValue(STORAGE_KEYS.access, currentAccess.value);
		} else {
			removeStorageValue(STORAGE_KEYS.access);
		}

		if (currentStoreId.value) {
			writeStorageValue(STORAGE_KEYS.currentStoreId, currentStoreId.value);
		} else {
			removeStorageValue(STORAGE_KEYS.currentStoreId);
		}
	}

	function clearAuthState() {
		accessToken.value = null;
		refreshToken.value = null;
		currentUser.value = null;
		currentSession.value = null;
		currentAccess.value = null;
		currentStoreId.value = null;
		persistAuthState();
	}

	async function handleAuthFailure() {
		clearAuthState();
		if (!import.meta.client || redirectingToLogin.value || window.location.pathname === "/login") return;

		redirectingToLogin.value = true;
		try {
			const redirectTarget = `${window.location.pathname}${window.location.search}${window.location.hash}`;
			await navigateTo({
				path: "/login",
				query: redirectTarget.startsWith("/") ? { redirect: redirectTarget } : undefined,
			});
		} finally {
			redirectingToLogin.value = false;
		}
	}

	async function refreshAccessToken(): Promise<boolean> {
		hydrateAuthState();
		if (!refreshToken.value) {
			await handleAuthFailure();
			return false;
		}

		if (refreshInFlight) {
			return refreshInFlight;
		}

		refreshInFlight = (async () => {
			try {
				const response = await $fetch<AuthEnvelope<LoginResponse>>(`${runtimeConfig.public.apiBase}/auth/refresh`, {
					method: "POST",
					body: {
						refreshToken: refreshToken.value,
					},
				});

				currentUser.value = response.data.user;
				currentSession.value = response.data.session;
				currentAccess.value = response.data.access;
				currentStoreId.value = resolveAccessStoreId(response.data.access, currentStoreId.value || undefined);
				setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
				persistAuthState();
				return true;
			} catch {
				await handleAuthFailure();
				return false;
			} finally {
				refreshInFlight = null;
			}
		})();

		return refreshInFlight;
	}

	function setTokens(nextAccessToken: string, nextRefreshToken: string) {
		accessToken.value = nextAccessToken;
		refreshToken.value = nextRefreshToken;
		persistAuthState();
	}

	function authHeaders(headers?: HeadersInit): HeadersInit {
		hydrateAuthState();
		const nextHeaders = new Headers(headers || {});
		if (accessToken.value) {
			nextHeaders.set("Authorization", `Bearer ${accessToken.value}`);
		}
		return nextHeaders;
	}

	async function fetchMe(storeId?: string, bootstrapPreferredStore = true) {
		hydrateAuthState();
		if (!accessToken.value) return null;

		const requestedStoreId = storeId?.trim() || currentStoreId.value || undefined;
		const queryString = requestedStoreId ? `?store_id=${encodeURIComponent(requestedStoreId)}` : "";
		let response: AuthEnvelope<MeResponse>;
		try {
			response = await $fetch<AuthEnvelope<MeResponse>>(`${runtimeConfig.public.apiBase}/auth/me${queryString}`, {
				headers: authHeaders(),
			});
		} catch (error: unknown) {
			const statusCode = getFetchErrorStatus(error);
			if (statusCode === 401) {
				const refreshed = await refreshAccessToken();
				if (refreshed) {
					return fetchMe(storeId, bootstrapPreferredStore);
				}
				await handleAuthFailure();
			}
			throw error;
		}

		const resolvedStoreId = resolveAccessStoreId(response.data.access, requestedStoreId);
		const shouldBootstrapScopedStore = (
			bootstrapPreferredStore
			&& !requestedStoreId
			&& resolvedStoreId
			&& response.data.access.store_id !== resolvedStoreId
		);

		if (shouldBootstrapScopedStore) {
			return fetchMe(resolvedStoreId, false);
		}

		currentUser.value = response.data.user;
		currentSession.value = response.data.session;
		currentAccess.value = response.data.access;
		currentStoreId.value = resolvedStoreId;
		persistAuthState();
		return response.data;
	}

	async function login(payload: LoginPayload) {
		const response = await $fetch<AuthEnvelope<LoginResponse>>(`${runtimeConfig.public.apiBase}/auth/login`, {
			method: "POST",
			body: {
				emailOrUsername: payload.emailOrUsername,
				password: payload.password,
				rememberMe: payload.rememberMe ?? true,
			},
		});

		currentUser.value = response.data.user;
		currentSession.value = response.data.session;
		currentAccess.value = response.data.access;
		currentStoreId.value = resolveAccessStoreId(response.data.access, payload.storeId);
		setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
		persistAuthState();
		return response.data;
	}

	async function switchStore(storeId: string) {
		const normalizedStoreId = storeId.trim();
		if (!normalizedStoreId) return null;
		const previousStoreId = currentStoreId.value;
		currentStoreId.value = normalizedStoreId;
		if (currentAccess.value) {
			currentAccess.value = {
				...currentAccess.value,
				store_id: normalizedStoreId,
			};
		}
		persistAuthState();

		try {
			return await fetchMe(normalizedStoreId, false);
		} catch (error) {
			currentStoreId.value = previousStoreId;
			if (currentAccess.value) {
				currentAccess.value = {
					...currentAccess.value,
					store_id: previousStoreId || undefined,
				};
			}
			persistAuthState();
			throw error;
		}
	}

	async function logout() {
		hydrateAuthState();
		try {
			if (refreshToken.value) {
				await $fetch(`${runtimeConfig.public.apiBase}/auth/logout`, {
					method: "POST",
					body: { refreshToken: refreshToken.value },
					headers: authHeaders(),
				});
			}
		} catch {
			// ignore logout API errors and clear local state anyway
		} finally {
			clearAuthState();
		}
	}

	function can(permissionKey: string): boolean {
		hydrateAuthState();
		if (currentUser.value?.systemRole === "system_admin") {
			return true;
		}

		if (currentUser.value?.systemRole) {
			const grantedPermissions = SYSTEM_ROLE_PERMISSION_MAP[currentUser.value.systemRole] || [];
			const acceptedKeys = new Set(resolveAcceptedPermissionKeys(permissionKey));
			if (grantedPermissions.some((key) => acceptedKeys.has(key))) {
				return true;
			}
		}

		const acceptedKeys = new Set(resolveAcceptedPermissionKeys(permissionKey));
		if (currentAccess.value?.permissions.some((permission) => acceptedKeys.has(permission.key))) {
			return true;
		}

		const scopedStoreId = currentStoreId.value || currentAccess.value?.store_id || resolveAccessStoreId(currentAccess.value);
		const matchingMembership = currentAccess.value?.memberships.find((membership) => membership.store_id === scopedStoreId)
			|| currentAccess.value?.memberships.find((membership) => membership.status === "active")
			|| currentAccess.value?.memberships[0];
		return Boolean(matchingMembership?.permissions.some((permission) => acceptedKeys.has(permission.key)));
	}

	hydrateAuthState();

	return {
		accessToken,
		refreshToken,
		currentUser,
		currentSession,
		currentAccess,
		currentStoreId,
		hydrateAuthState,
		authHeaders,
		login,
		logout,
		clearAuthState,
		fetchMe,
		switchStore,
		can,
		handleAuthFailure,
		refreshAccessToken,
	};
}
