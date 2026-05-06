export default defineNuxtRouteMiddleware((to) => {
	if (import.meta.server) return;

	const { hydrateAuthState, accessToken } = useAuthSession();
	hydrateAuthState();

	const isLoginRoute = to.path === "/login";
	const hasAccessToken = Boolean(accessToken.value);

	if (!hasAccessToken && !isLoginRoute) {
		return navigateTo("/login");
	}

	if (hasAccessToken && isLoginRoute) {
		return navigateTo("/");
	}
});
