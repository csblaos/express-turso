type ApiFetchOptions = Parameters<typeof $fetch>[1] & {
	auth?: boolean;
};

export function useApiClient() {
	const runtimeConfig = useRuntimeConfig();
	const { authHeaders, hydrateAuthState, handleAuthFailure, refreshAccessToken } = useAuthSession();

	async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
		hydrateAuthState();
		const { auth = true, headers, ...rest } = options;
		try {
			return await $fetch<T>(`${runtimeConfig.public.apiBase}${path}`, {
				...rest,
				headers: auth ? authHeaders(headers) : headers,
			});
		} catch (error: unknown) {
			const statusCode = typeof error === "object" && error && "response" in error
				? Reflect.get(error.response as object, "status")
				: undefined;
			if (auth && statusCode === 401) {
				const refreshed = await refreshAccessToken();
				if (refreshed) {
					return $fetch<T>(`${runtimeConfig.public.apiBase}${path}`, {
						...rest,
						headers: authHeaders(headers),
					});
				}
				await handleAuthFailure();
			}
			throw error;
		}
	}

	return {
		apiFetch,
	};
}
