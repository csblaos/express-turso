type ApiFetchOptions = Parameters<typeof $fetch>[1] & {
	auth?: boolean;
};

export function useApiClient() {
	const runtimeConfig = useRuntimeConfig();
	const { authHeaders, hydrateAuthState } = useAuthSession();

	async function apiFetch<T>(path: string, options: ApiFetchOptions = {}): Promise<T> {
		hydrateAuthState();
		const { auth = true, headers, ...rest } = options;
		return $fetch<T>(`${runtimeConfig.public.apiBase}${path}`, {
			...rest,
			headers: auth ? authHeaders(headers) : headers,
		});
	}

	return {
		apiFetch,
	};
}
