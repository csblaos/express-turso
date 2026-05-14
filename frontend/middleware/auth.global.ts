import { needsAuthOnboarding } from "~/utils/auth-onboarding";

function isSystemAdminRoute(path: string) {
	return path === "/system-admin" || path.startsWith("/system-admin/");
}

function isSuperadminRoute(path: string) {
	return path === "/superadmin" || path.startsWith("/superadmin/");
}

function isSettingsRoute(path: string) {
	return path === "/settings" || path.startsWith("/settings/");
}

function isProfileRoute(path: string) {
	return path === "/profile";
}

function isChooseStoreRoute(path: string) {
	return path === "/choose-store";
}

function getDefaultAuthedPath(systemRole?: string | null) {
	return systemRole === "system_admin" ? "/system-admin/dashboard" : "/";
}

function canAccessRoleScopedRoute(path: string, systemRole?: string | null) {
	if (!systemRole) return true;

	if (systemRole === "system_admin") {
		return isSystemAdminRoute(path) || isProfileRoute(path);
	}

	if (systemRole === "superadmin") {
		return !isSystemAdminRoute(path);
	}

	if (isSystemAdminRoute(path) || isSuperadminRoute(path)) {
		return false;
	}

	return true;
}

export default defineNuxtRouteMiddleware(async (to) => {
	const isLoginRoute = to.path === "/login";
	const isOnboardingRoute = to.path === "/onboarding";
	const isChooseStore = isChooseStoreRoute(to.path);
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
		const defaultAuthedPath = getDefaultAuthedPath(nextUser?.systemRole);

		if (!hasAccessToken && !isLoginRoute) {
			return navigateTo("/login", { replace: true });
		}

		if (hasAccessToken && isLoginRoute) {
			return navigateTo(onboardingRequired ? "/onboarding" : defaultAuthedPath, { replace: true });
		}

		if (hasAccessToken && onboardingRequired && !isOnboardingRoute && !isChooseStore) {
			return navigateTo("/onboarding", { replace: true });
		}

		if (hasAccessToken && isOnboardingRoute && !onboardingRequired) {
			return navigateTo(defaultAuthedPath, { replace: true });
		}

		if (
			hasAccessToken
			&& !isOnboardingRoute
			&& !isLoginRoute
			&& !canAccessRoleScopedRoute(to.path, nextUser?.systemRole)
		) {
			return navigateTo(defaultAuthedPath, { replace: true });
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
