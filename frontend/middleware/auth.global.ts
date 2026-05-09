export default defineNuxtRouteMiddleware((to) => {
	const isLoginRoute = to.path === "/login";
	const accessTokenCookie = useCookie<string | null>("pos.auth.accessToken", {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});

	let hasAccessToken = Boolean(accessTokenCookie.value);

	if (import.meta.client) {
		const { hydrateAuthState, accessToken } = useAuthSession();
		hydrateAuthState();
		hasAccessToken = Boolean(accessToken.value || accessTokenCookie.value);
	}

	if (!hasAccessToken && !isLoginRoute) {
		return navigateTo("/login", { replace: true });
	}

	if (hasAccessToken && isLoginRoute) {
		return navigateTo("/", { replace: true });
	}
});
