export type AuthOnboardingUser = {
	systemRole: string;
	mustChangePassword: boolean;
	canCreateStores?: boolean;
	ownedStoresCount?: number;
};

export function needsAuthOnboarding(user: AuthOnboardingUser | null | undefined) {
	if (!user) return false;
	return user.systemRole === "superadmin" && (
		Boolean(user.mustChangePassword) ||
		Number(user.ownedStoresCount || 0) === 0
	);
}

export function isOnboardingBlocked(user: AuthOnboardingUser | null | undefined) {
	if (!user) return false;
	return user.systemRole === "superadmin"
		&& Number(user.ownedStoresCount || 0) === 0
		&& !Boolean(user.canCreateStores);
}
