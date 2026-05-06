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
} as const;

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

export function useAuthSession() {
	const runtimeConfig = useRuntimeConfig();
	const accessToken = useState<string | null>("auth.access-token", () => null);
	const refreshToken = useState<string | null>("auth.refresh-token", () => null);
	const currentUser = useState<AuthUser | null>("auth.current-user", () => null);
	const currentSession = useState<AuthSession | null>("auth.current-session", () => null);
	const currentAccess = useState<AuthAccess | null>("auth.current-access", () => null);
	const hydrated = useState<boolean>("auth.hydrated", () => false);

	function hydrateAuthState() {
		if (!import.meta.client || hydrated.value) return;

		accessToken.value = readStorageValue<string>(STORAGE_KEYS.accessToken);
		refreshToken.value = readStorageValue<string>(STORAGE_KEYS.refreshToken);
		currentUser.value = readStorageValue<AuthUser>(STORAGE_KEYS.user);
		currentSession.value = readStorageValue<AuthSession>(STORAGE_KEYS.session);
		currentAccess.value = readStorageValue<AuthAccess>(STORAGE_KEYS.access);
		hydrated.value = true;
	}

	function persistAuthState() {
		if (!import.meta.client) return;

		if (accessToken.value) {
			writeStorageValue(STORAGE_KEYS.accessToken, accessToken.value);
		} else {
			removeStorageValue(STORAGE_KEYS.accessToken);
		}

		if (refreshToken.value) {
			writeStorageValue(STORAGE_KEYS.refreshToken, refreshToken.value);
		} else {
			removeStorageValue(STORAGE_KEYS.refreshToken);
		}

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
	}

	function clearAuthState() {
		accessToken.value = null;
		refreshToken.value = null;
		currentUser.value = null;
		currentSession.value = null;
		currentAccess.value = null;
		persistAuthState();
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

	async function fetchMe(storeId?: string) {
		hydrateAuthState();
		if (!accessToken.value) return null;

		const queryString = storeId ? `?store_id=${encodeURIComponent(storeId)}` : "";
		const response = await $fetch<AuthEnvelope<MeResponse>>(`${runtimeConfig.public.apiBase}/auth/me${queryString}`, {
			headers: authHeaders(),
		});

		currentUser.value = response.data.user;
		currentSession.value = response.data.session;
		currentAccess.value = response.data.access;
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
		setTokens(response.data.tokens.accessToken, response.data.tokens.refreshToken);
		await fetchMe(payload.storeId);
		return response.data;
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
		return Boolean(currentAccess.value?.permissions.some((permission) => permission.key === permissionKey));
	}

	hydrateAuthState();

	return {
		accessToken,
		refreshToken,
		currentUser,
		currentSession,
		currentAccess,
		hydrateAuthState,
		authHeaders,
		login,
		logout,
		clearAuthState,
		fetchMe,
		can,
	};
}
