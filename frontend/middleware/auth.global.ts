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

// The customer-facing screen is fed entirely over BroadcastChannel by the POS
// window. It must never authenticate, fetch, or redirect.
function isCustomerDisplayRoute(path: string) {
	// The static build serves directory URLs, so this arrives as
	// "/customer-display/" in production and "/customer-display" in dev.
	return path.replace(/\/+$/, "") === "/customer-display";
}

function requiredSettingsPermission(path: string): string | null {
	const normalizedPath = path.replace(/\/+$/, "") || "/";
	const routes: Array<[string, string]> = [
		[ "/settings/printing/sales-receipt", "settings.printing.view" ],
		[ "/settings/printing/kitchen", "settings.printing.view" ],
		[ "/settings/store-finance", "settings.finance.view" ],
		[ "/settings/stock", "settings.stock_policy.view" ],
		[ "/settings/store-payments", "settings.payments.view" ],
		[ "/settings/customer-display", "settings.customer_display.view" ],
		[ "/settings/store-profile", "settings.store.view" ],
		[ "/settings/restaurant", "settings.restaurant.view" ],
		[ "/settings/users", "settings.users.view" ],
		[ "/settings/categories", "products.view" ],
		[ "/settings/units", "products.view" ],
	];
	return routes.find(([ route ]) => normalizedPath === route || normalizedPath.startsWith(`${route}/`))?.[1] || null;
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

	if (isCustomerDisplayRoute(to.path)) return;

	const accessTokenCookie = useCookie<string | null>("pos.auth.accessToken", {
		sameSite: "lax",
		path: "/",
		default: () => null,
	});

	let hasAccessToken = Boolean(accessTokenCookie.value);

	if (import.meta.client) {
		const { hydrateAuthState, accessToken, currentUser, currentAccess, fetchMe, can } = useAuthSession();
		const accessRevalidated = useState<boolean>("auth.access-revalidated", () => false);
		hydrateAuthState();
		hasAccessToken = Boolean(accessToken.value || accessTokenCookie.value);

		// Permissions are persisted for a fast first paint, but roles can be changed
		// by an owner while a staff member is still signed in. Revalidate once per
		// app session so newly granted navigation items appear without requiring a
		// logout, while avoiding an API request on every route change.
		if (hasAccessToken && (!currentUser.value || !currentAccess.value || !accessRevalidated.value)) {
			try {
				await fetchMe();
				accessRevalidated.value = true;
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

		const settingsPermission = requiredSettingsPermission(to.path);
		if (
			hasAccessToken
			&& settingsPermission
			&& ![ "system_admin", "superadmin" ].includes(nextUser?.systemRole || "")
			&& !can(settingsPermission)
		) {
			return navigateTo("/settings", { replace: true });
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
