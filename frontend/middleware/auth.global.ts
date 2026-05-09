import { needsAuthOnboarding } from "~/utils/auth-onboarding";

export default defineNuxtRouteMiddleware(async (to) => {
	const isLoginRoute = to.path === "/login";
	const isOnboardingRoute = to.path === "/onboarding";
	const accessTokenCookie = useCookie<string | null>("pos.auth.accessToken", {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});

	let hasAccessToken = Boolean(accessTokenCookie.value);

	if (import.meta.client) {
		const { hydrateAuthState, accessToken, currentUser, fetchMe } = useAuthSession();
		hydrateAuthState();
		hasAccessToken = Boolean(accessToken.value || accessTokenCookie.value);

		if (hasAccessToken && !currentUser.value) {
			try {
				await fetchMe();
			} catch {
				// let the auth branch below decide the redirect
			}
		}

		const nextUser = currentUser.value;
		const onboardingRequired = needsAuthOnboarding(nextUser);

		if (!hasAccessToken && !isLoginRoute) {
			return navigateTo("/login", { replace: true });
		}

		if (hasAccessToken && isLoginRoute) {
			return navigateTo(onboardingRequired ? "/onboarding" : "/", { replace: true });
		}

		if (hasAccessToken && onboardingRequired && !isOnboardingRoute) {
			return navigateTo("/onboarding", { replace: true });
		}

		if (hasAccessToken && isOnboardingRoute && !onboardingRequired) {
			return navigateTo("/", { replace: true });
		}

		return;
	}

	if (hasAccessToken && isLoginRoute) {
		return navigateTo("/", { replace: true });
	}

	if (!hasAccessToken && !isLoginRoute) {
		return navigateTo("/login", { replace: true });
	}
});
