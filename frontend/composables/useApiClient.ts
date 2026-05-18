import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiFetchOptions = Parameters<typeof $fetch>[1] & {
	auth?: boolean;
};

export function useApiClient() {
	const runtimeConfig = useRuntimeConfig();
	const { authHeaders, hydrateAuthState, handleAuthFailure, refreshAccessToken, currentStoreId } = useAuthSession();

	const STORE_SCOPED_PREFIXES = [
		"/products",
		"/product-categories",
		"/units",
		"/inventory",
		"/purchase-orders",
		"/audit-events",
		"/rbac/roles",
		"/rbac/store-members",
	] as const;

	function shouldAttachStoreId(path: string) {
		return STORE_SCOPED_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
	}

	function attachStoreIdToPath(path: string) {
		const storeId = currentStoreId.value?.trim();
		if (!storeId || !shouldAttachStoreId(path)) return path;

		const [pathname, existingQuery = "" ] = path.split("?");
		const params = new URLSearchParams(existingQuery);
		if (params.has("store_id")) return path;
		params.set("store_id", storeId);
		const nextQuery = params.toString();
		return nextQuery ? `${pathname}?${nextQuery}` : pathname;
	}

	async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
		hydrateAuthState();
		const { auth = true, headers, ...rest } = options;
		const resolvedPath = auth ? attachStoreIdToPath(path) : path;
		try {
			return await $fetch<T>(`${runtimeConfig.public.apiBase}${resolvedPath}`, {
				...rest,
				headers: auth ? authHeaders(headers) : headers,
			});
			} catch (error: unknown) {
				const response = typeof error === "object" && error && "response" in error
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					? (error as any).response
					: undefined;
				const statusCode = response && typeof response === "object" && "status" in response
					// eslint-disable-next-line @typescript-eslint/no-explicit-any
					? (response as any).status
					: undefined;
				if (auth && statusCode === 401) {
					const refreshed = await refreshAccessToken();
					if (refreshed) {
					const retryPath = attachStoreIdToPath(path);
					return $fetch<T>(`${runtimeConfig.public.apiBase}${retryPath}`, {
						...rest,
						headers: authHeaders(headers),
					});
				}
					await handleAuthFailure();
				}

				// Normalize network errors so pages won't display raw fetch messages like:
				// `[GET] "http://...": <no response> Failed to fetch`
				if (statusCode === undefined || statusCode === null) {
					const message = resolveApiErrorMessage(error, "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาลองใหม่อีกครั้ง");
					if (message.includes("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้")) {
						const normalized = Object.assign(new Error(message), { cause: error });
						throw normalized;
					}
				}

				throw error;
			}
		}

	return {
		apiFetch,
	};
}
