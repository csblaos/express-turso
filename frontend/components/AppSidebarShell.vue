<script setup lang="ts">
import type { AppNavItem } from "~/utils/app-nav";
import { resolveBreadcrumbs } from "~/utils/breadcrumbs";

const props = defineProps<{
	navItems: AppNavItem[];
	activeIds: string[];
	sidebarEyebrow: string;
	sidebarTitle: string;
	sidebarCompactTitle: string;
	sidebarDescription: string;
}>();

const mobileSidebarOpen = ref(false);
const sidebarCollapsedCookie = useCookie<boolean>("app.sidebarCollapsed", {
	sameSite: "lax",
	path: "/",
	default: () => true,
});
const sidebarCollapsed = useState<boolean>("app-sidebar-collapsed", () => sidebarCollapsedCookie.value ?? true);
const logoutConfirmOpen = ref(false);
const profileMenuOpen = ref(false);
const storeSwitcherOpen = ref(false);
const shellError = ref<string | null>(null);
const requestHeaders = import.meta.server ? useRequestHeaders([ "user-agent" ]) : {};
const initialUserAgent = import.meta.server ? requestHeaders["user-agent"] || "" : "";
const isDesktopViewport = ref(import.meta.server
	? !/(android|iphone|ipad|ipod|mobile)/i.test(initialUserAgent)
	: false);
const isReducedMotion = ref(false);
const pendingMobileNavigation = ref(false);
const { logout, currentUser, currentAccess, currentStoreId, switchStore } = useAuthSession();
const { apiFetch } = useApiClient();
const appToast = useAppToast();
const colorMode = useColorMode();
const systemRoleCookie = useCookie<string | null>("pos.auth.systemRole", {
	sameSite: "lax",
	path: "/",
	default: () => null,
});
const route = useRoute();
type AccessibleStoreRecord = {
	id: string;
	name: string;
	currency?: string;
};
type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};
const currentNavItem = computed(() => props.navItems.find((item) => props.activeIds.includes(item.id)));
let mediaQueryList: MediaQueryList | null = null;
let syncViewportListener: (() => void) | null = null;
let reducedMotionQueryList: MediaQueryList | null = null;
let syncReducedMotionListener: (() => void) | null = null;
const MOBILE_SIDEBAR_CLOSE_DELAY_MS = 180;
const switchStorePending = ref(false);
const accessibleStores = ref<AccessibleStoreRecord[]>([]);

const sidebarWidthClass = computed(() => {
	if (!isDesktopViewport.value) {
		return "w-[88vw] max-w-[320px]";
	}

	return sidebarCollapsed.value ? "w-[84px]" : "w-[280px]";
});

const isSidebarCompact = computed(() => (
	isDesktopViewport.value && sidebarCollapsed.value
));

function openSidebar() {
	profileMenuOpen.value = false;
	mobileSidebarOpen.value = true;
}

function toggleSidebar() {
	if (isDesktopViewport.value) {
		sidebarCollapsed.value = !sidebarCollapsed.value;
		return;
	}

	profileMenuOpen.value = false;
	mobileSidebarOpen.value = true;
}

function closeMobileSidebar() {
	mobileSidebarOpen.value = false;
}

function isModifiedClick(event: MouseEvent) {
	return event.metaKey || event.ctrlKey || event.altKey || event.shiftKey || event.button !== 0;
}

function wait(ms: number) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

async function handleNavItemClick(event: MouseEvent, item: AppNavItem) {
	if (isDesktopViewport.value || !mobileSidebarOpen.value) return;
	if (event.defaultPrevented || isModifiedClick(event)) return;

	event.preventDefault();

	if (pendingMobileNavigation.value) return;

	const destination = item.to;
	if (route.path === destination) {
		closeMobileSidebar();
		return;
	}

	pendingMobileNavigation.value = true;
	try {
		closeMobileSidebar();
		if (!isReducedMotion.value) {
			await wait(MOBILE_SIDEBAR_CLOSE_DELAY_MS);
		}
		await navigateTo(destination);
	} finally {
		pendingMobileNavigation.value = false;
	}
}

const topbarMenuTitle = computed(() => (
	isDesktopViewport.value
		? (sidebarCollapsed.value ? "ขยายเมนู" : "ย่อเมนู")
		: "เปิดเมนู"
));

const topbarMenuIcon = computed(() => {
	if (!isDesktopViewport.value) return "i-heroicons-bars-3-20-solid";
	return sidebarCollapsed.value
		? "i-heroicons-chevron-double-right-20-solid"
		: "i-heroicons-chevron-double-left-20-solid";
});

const roleLabelMap: Record<string, string> = {
	system_admin: "System admin",
	superadmin: "Superadmin",
	store_admin: "Store admin",
	manager: "Manager",
};

const profileDisplayName = computed(() => currentUser.value?.name || "ทีมงานร้าน");
const profileDisplayEmail = computed(() => currentUser.value?.email || "ไม่ได้ระบุอีเมล");
const inferredWorkspaceRole = computed(() => {
	if (route.path === "/system-admin" || route.path.startsWith("/system-admin/")) return "system_admin";
	if (route.path === "/superadmin" || route.path.startsWith("/superadmin/")) return "superadmin";
	return "";
});
const resolvedSystemRole = computed(() => (
	currentUser.value?.systemRole
	|| systemRoleCookie.value
	|| inferredWorkspaceRole.value
	|| ""
));
const profileDisplayRole = computed(() => {
	const systemRole = resolvedSystemRole.value;
	if (!systemRole) return "Staff";
	return roleLabelMap[systemRole] || systemRole.replace(/_/g, " ");
});
const profileStoreSummary = computed(() => {
	const membershipCount = currentAccess.value?.memberships?.length || 0;
	if (!membershipCount) return "ยังไม่ได้ผูกกับร้าน";
	return membershipCount === 1 ? "ดูแล 1 store" : `ดูแล ${membershipCount} stores`;
});
const canShowStoreSection = computed(() => (
	resolvedSystemRole.value !== "system_admin"
	&& (currentAccess.value?.memberships?.length ?? 0) > 0
));
const canSwitchStores = computed(() => (
	resolvedSystemRole.value !== "system_admin"
	&& (currentAccess.value?.memberships?.length ?? 0) > 1
));
const currentStoreCount = computed(() => visibleSwitchableStores.value.length);
const storeSectionTitle = computed(() => (
	canSwitchStores.value ? "เปลี่ยนร้าน" : "ร้านปัจจุบัน"
));
const currentStoreLabel = computed(() => (
	accessibleStores.value.find((store) => store.id === currentStoreId.value)?.name
	|| (currentStoreId.value ? "ร้านที่กำลังใช้งาน" : "ยังไม่ได้เลือกร้าน")
));
const visibleSwitchableStores = computed(() => {
	if (!canShowStoreSection.value) return [];
	const membershipIds = new Set((currentAccess.value?.memberships || []).map((membership) => membership.store_id));
	const storesById = new Map(
		accessibleStores.value
			.filter((store) => membershipIds.has(store.id))
			.map((store) => [ store.id, store ]),
	);
	return Array.from(membershipIds).map((storeId) => ({
		id: storeId,
		name: storesById.get(storeId)?.name || (storeId === currentStoreId.value ? currentStoreLabel.value : "ร้านที่ไม่ทราบชื่อ"),
		currency: storesById.get(storeId)?.currency,
	}));
});
const membershipStoreKey = computed(() => (
	(currentAccess.value?.memberships || [])
		.map((membership) => membership.store_id)
		.sort()
		.join("|")
));
const profileInitials = computed(() => (
	profileDisplayName.value
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
	.join("") || "ST"
));
const currentBreadcrumbs = computed(() => resolveBreadcrumbs(route.path, props.navItems));
const STORE_NAV_IDS = new Set([ "pos", "products", "orders", "stock", "purchase", "reports", "activity", "settings" ]);
const SYSTEM_ADMIN_NAV_IDS = new Set([ "system-dashboard", "system-clients", "system-policy", "system-monitoring", "system-security", "system-thirdparty-usage" ]);

const visibleNavItems = computed(() => {
	const systemRole = resolvedSystemRole.value;

	if (systemRole === "system_admin") {
		return props.navItems.filter((item) => SYSTEM_ADMIN_NAV_IDS.has(item.id));
	}

	if (systemRole === "superadmin") {
		return props.navItems.filter((item) => STORE_NAV_IDS.has(item.id) || item.id === "superadmin");
	}

	return props.navItems.filter((item) => STORE_NAV_IDS.has(item.id));
});
const isDarkMode = computed(() => colorMode.value === "dark");
const colorModeLabel = computed(() => isDarkMode.value ? "โหมดสว่าง" : "โหมดมืด");
const colorModeIcon = computed(() => (
	isDarkMode.value ? "i-heroicons-sun-20-solid" : "i-heroicons-moon-20-solid"
));

function isNavItemActive(item: AppNavItem) {
	if (props.activeIds.includes(item.id)) return true;

	if (item.id === "settings") {
		return route.path === "/profile" || route.path.startsWith("/settings");
	}

	if (item.to === "/") {
		return route.path === "/";
	}

	return route.path === item.to || route.path.startsWith(`${item.to}/`);
}

function toggleColorMode() {
	const nextMode = isDarkMode.value ? "light" : "dark";
	colorMode.preference = nextMode;
	colorMode.value = nextMode;
	if (import.meta.client) {
		document.documentElement.style.colorScheme = nextMode;
	}
}

function openLogoutConfirm() {
	logoutConfirmOpen.value = true;
}

async function openLogoutConfirmFromProfile() {
	profileMenuOpen.value = false;
	await nextTick();
	logoutConfirmOpen.value = true;
}

async function navigateToProfile() {
	profileMenuOpen.value = false;
	await navigateTo("/profile");
}

async function openStoreSwitcher() {
	await loadAccessibleStores();
	profileMenuOpen.value = false;
	await nextTick();
	storeSwitcherOpen.value = true;
}

async function loadAccessibleStores() {
	if (!canShowStoreSection.value || accessibleStores.value.length > 0) return;
	try {
		const response = await apiFetch<ApiEnvelope<AccessibleStoreRecord[]>>("/stores");
		accessibleStores.value = response.data;
	} catch {
		accessibleStores.value = [];
	}
}

async function handleSwitchStore(storeId: string) {
	if (switchStorePending.value || storeId === currentStoreId.value) {
		profileMenuOpen.value = false;
		return;
	}

	const targetStoreName = visibleSwitchableStores.value.find((store) => store.id === storeId)?.name || "ร้านที่เลือก";
	storeSwitcherOpen.value = false;
	profileMenuOpen.value = false;
	switchStorePending.value = true;
	try {
		await switchStore(storeId);
		if (route.path !== "/") {
			await navigateTo("/");
		}
		appToast.success({
			title: "เปลี่ยนร้านแล้ว",
			description: targetStoreName,
			timeout: 1800,
		});
	} catch (error) {
		appToast.error({
			title: "เปลี่ยนร้านไม่สำเร็จ",
			description: error instanceof Error ? error.message : "โปรดลองอีกครั้ง",
			timeout: 3200,
		});
	} finally {
		switchStorePending.value = false;
	}
}

async function confirmLogout() {
	logoutConfirmOpen.value = false;
	await logout();
	return navigateTo("/login");
}

function extractShellErrorMessage(error: unknown) {
	if (error instanceof Error && error.message) return error.message;
	return "เกิดข้อผิดพลาดระหว่างโหลดหน้าปัจจุบัน";
}

function reloadCurrentView() {
	shellError.value = null;
	if (import.meta.client) {
		return window.location.reload();
	}
}

watch(() => route.fullPath, () => {
	shellError.value = null;
	if (!isDesktopViewport.value && mobileSidebarOpen.value) {
		mobileSidebarOpen.value = false;
	}
});

watch(mobileSidebarOpen, (isOpen) => {
	if (isOpen && !isDesktopViewport.value) {
		profileMenuOpen.value = false;
	}
});

watch(profileMenuOpen, (opened) => {
	if (!opened) return;
	void loadAccessibleStores();
});

watch(membershipStoreKey, () => {
	accessibleStores.value = [];
});

watch(sidebarCollapsed, (value) => {
	sidebarCollapsedCookie.value = value;
});

onMounted(() => {
	mediaQueryList = window.matchMedia("(min-width: 1024px)");
	syncViewportListener = () => {
		isDesktopViewport.value = mediaQueryList?.matches ?? false;
	};
	reducedMotionQueryList = window.matchMedia("(prefers-reduced-motion: reduce)");
	syncReducedMotionListener = () => {
		isReducedMotion.value = reducedMotionQueryList?.matches ?? false;
	};

	syncViewportListener();
	syncReducedMotionListener();
	mediaQueryList.addEventListener("change", syncViewportListener);
	reducedMotionQueryList.addEventListener("change", syncReducedMotionListener);
});

onUnmounted(() => {
	if (mediaQueryList && syncViewportListener) {
		mediaQueryList.removeEventListener("change", syncViewportListener);
	}
	if (reducedMotionQueryList && syncReducedMotionListener) {
		reducedMotionQueryList.removeEventListener("change", syncReducedMotionListener);
	}
});

onErrorCaptured((error) => {
	shellError.value = extractShellErrorMessage(error);
	console.error("[AppSidebarShell] captured descendant error", error);
	return false;
});
</script>

<template>
	<main class="h-dvh min-h-svh w-full overflow-hidden bg-transparent">
		<div class="flex h-full w-full overflow-hidden">
			<Transition
				enter-active-class="transition-opacity duration-250 ease-out"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="transition-opacity duration-200 ease-in"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
				>
					<div
						v-if="mobileSidebarOpen"
						class="fixed inset-0 z-[90] bg-black/45 lg:hidden"
						@click="closeMobileSidebar"
					/>
				</Transition>

				<aside
					class="fixed inset-y-0 left-0 z-[100] flex transform-gpu bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] lg:relative lg:h-screen lg:overflow-hidden lg:shadow-none lg:transition-[width,transform] lg:duration-200 lg:ease-out"
					:class="[
						sidebarWidthClass,
						mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
					]"
				>
				<div class="scrollbar-soft flex w-full flex-col gap-4 overflow-y-auto p-3">
					<div class="flex items-center justify-between gap-3">
						<div class="flex min-w-0 items-center gap-3">
							<div class="h-14 w-14 shrink-0 overflow-hidden rounded-2xl bg-[#f8e9de] ring-1 ring-[#e7e4dd]">
								<img src="/icons/icon-192.png" alt="App logo" class="h-full w-full object-cover" />
							</div>
							<div
								v-if="!isSidebarCompact"
								class="min-w-0 flex-1"
							>
								<p class="truncate text-base font-bold tracking-[-0.01em] text-stone-950">
									O KhaiDee<span class="text-primary-600">+</span>
								</p>
							</div>
						</div>

							<AppButton
							color="neutral"
							variant="soft"
							size="sm"
							class="h-10 w-10 cursor-pointer justify-center rounded-md border border-[#e7e4dd] bg-[#fbfbf8] px-0 text-stone-600 shadow-[0_8px_18px_rgba(31,28,24,0.08)] transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 lg:hidden"
							aria-label="ปิดเมนู"
							title="ปิดเมนู"
								@click="closeMobileSidebar"
							>
							<UIcon name="i-heroicons-x-mark-20-solid" class="h-5.5 w-5.5" />
						</AppButton>
					</div>

					<nav class="flex flex-1 flex-col gap-2">
								<NuxtLink
									v-for="item in visibleNavItems"
									:key="item.id"
								:to="item.to"
								class="group relative flex items-center rounded-2xl px-3 py-3 text-left transition-all duration-200"
							:title="item.label"
							:aria-label="item.label"
							:class="[
								isSidebarCompact ? 'gap-0' : 'gap-3',
									isNavItemActive(item)
										? (isSidebarCompact
											? 'text-primary-700'
											: 'bg-primary-50 text-primary-700 ring-1 ring-primary-200')
										: (isSidebarCompact
											? 'text-stone-500 hover:text-primary-700'
											: 'text-stone-500 hover:bg-primary-50 hover:text-primary-700 hover:ring-1 hover:ring-primary-200')
								]"
								@click="handleNavItemClick($event, item)"
							>
							<div
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition-colors"
								:class="isNavItemActive(item)
									? (isSidebarCompact
										? 'bg-primary-100 text-primary-700'
										: 'bg-primary-100 text-primary-700 ring-1 ring-primary-200')
									: (isSidebarCompact
										? 'bg-[#f7f5f1] text-stone-600 group-hover:bg-primary-50 group-hover:text-primary-700'
										: 'bg-[#f7f5f1] text-stone-600 ring-1 ring-[#e7e4dd] group-hover:bg-white group-hover:text-primary-700 group-hover:ring-primary-200')"
							>
								<UIcon :name="item.icon" class="h-5 w-5" />
							</div>
							<div
								class="min-w-0 overflow-hidden transition-[width,opacity] duration-150 ease-out"
								:class="isSidebarCompact ? 'w-0 opacity-0' : 'flex-1 opacity-100'"
								aria-hidden="true"
							>
								<p class="truncate text-sm font-medium whitespace-nowrap">{{ item.label }}</p>
								<p
									v-if="!isDesktopViewport"
									class="mt-0.5 truncate text-xs text-stone-400"
								>
									{{ item.to === '/' ? 'หน้าเริ่มต้น' : 'เปิดหน้าจัดการ' }}
									</p>
								</div>
							</NuxtLink>
						</nav>

					<div class="px-3 pt-1">
						<AppButton
							color="neutral"
							variant="ghost"
							size="sm"
							icon="i-heroicons-arrow-left-on-rectangle"
							class="items-center rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 shadow-sm transition-colors hover:bg-white hover:text-stone-900"
							:class="isSidebarCompact ? 'h-11 w-11 justify-center px-0' : 'flex h-11 w-full justify-start gap-3 px-3 py-2.5'"
							:title="isSidebarCompact ? 'ออกจากระบบ' : undefined"
							:aria-label="'ออกจากระบบ'"
							@click="openLogoutConfirm"
						>
							<span
								class="min-w-0 overflow-hidden text-sm font-medium whitespace-nowrap transition-[width,opacity] duration-150 ease-out"
								:class="isSidebarCompact ? 'w-0 opacity-0' : 'w-auto opacity-100'"
								aria-hidden="true"
							>
								ออกจากระบบ
							</span>
						</AppButton>
					</div>
				</div>
			</aside>

				<div
					class="min-w-0 flex-1 min-h-0"
					:class="mobileSidebarOpen ? 'pointer-events-none select-none lg:pointer-events-auto lg:select-auto' : ''"
					:aria-hidden="mobileSidebarOpen && !isDesktopViewport ? 'true' : undefined"
				>
				<div class="flex h-full w-full min-h-0">
					<section class="min-w-0 flex-1 overflow-hidden pb-2 sm:pb-3">
						<div class="flex h-full min-h-0 flex-col gap-2">
							<div class="sticky top-0 z-40 shrink-0 overflow-hidden border-b border-[#e7e4dd] bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/85">
								<div>
									<AppTopNavbar
										:title="currentNavItem?.label || sidebarTitle"
										:eyebrow="sidebarEyebrow"
										:icon="currentNavItem?.icon"
										:menu-title="topbarMenuTitle"
										:menu-icon="topbarMenuIcon"
										@menu="toggleSidebar"
									>
										<template #left>
											<slot name="navbar-left" />
										</template>

										<template #center>
											<slot name="navbar-center" />
										</template>

										<template #right>
											<slot name="navbar-right" />

											<AppButton
												color="neutral"
												variant="soft"
												size="sm"
												:icon="colorModeIcon"
												class="h-9 cursor-pointer rounded-md border border-[#e7e4dd] bg-[#fbfbf8] px-2 text-stone-700 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 sm:h-10"
												:title="colorModeLabel"
												:aria-label="colorModeLabel"
												@click="toggleColorMode"
											>
												<span class="hidden text-xs font-medium md:inline">{{ colorModeLabel }}</span>
											</AppButton>

											<UPopover
												v-model:open="profileMenuOpen"
												:content="{ side: 'bottom', align: 'end', sideOffset: 10, collisionPadding: 8 }"
											>
												<AppButton
													color="neutral"
													variant="ghost"
													size="sm"
													class="group h-9 cursor-pointer rounded-md px-1.5 text-stone-700 transition hover:bg-primary-50 hover:text-primary-700 sm:h-10 sm:px-2"
													:title="profileDisplayName"
													:aria-label="profileDisplayName"
												>
													<span class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-100 text-[11px] font-semibold text-primary-700 sm:h-8 sm:w-8 sm:text-xs">
														{{ profileInitials }}
													</span>
													<span class="hidden min-w-0 text-left md:block">
														<span class="block truncate text-xs font-semibold text-stone-900">{{ profileDisplayName }}</span>
														<span class="block truncate text-[10px] text-stone-500">{{ profileStoreSummary }}</span>
													</span>
													<UIcon name="i-heroicons-chevron-down-20-solid" class="h-4 w-4 shrink-0 text-stone-400 transition group-hover:text-primary-700" />
												</AppButton>

												<template #content>
													<div class="w-[296px] overflow-hidden rounded-md bg-white shadow-2xl ring-1 ring-[#e7e4dd]">
														<div class="border-b border-[#efece4] px-4 py-4">
															<div class="flex items-start gap-3">
																<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-100 text-sm font-semibold text-primary-700">
																	{{ profileInitials }}
																</div>
																<div class="min-w-0 flex-1">
																	<p class="truncate text-sm font-semibold text-stone-950">{{ profileDisplayName }}</p>
																	<p class="mt-1 truncate text-xs text-stone-500">{{ profileDisplayEmail }}</p>
																	<div class="mt-2 flex flex-wrap gap-1.5">
																		<UBadge color="primary" variant="soft" :label="profileDisplayRole" />
																		<UBadge color="neutral" variant="soft" :label="profileStoreSummary" />
																	</div>
																</div>
															</div>
														</div>

														<div class="p-2">
															<div
																v-if="canShowStoreSection"
																class="mb-2 rounded-md border border-[#efece4] bg-[#fbfbf8] px-3 py-2.5"
															>
																<div class="flex items-center gap-3">
																	<div class="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-stone-700 ring-1 ring-[#e7e4dd]">
																		<UIcon name="i-heroicons-building-storefront-20-solid" class="h-4.5 w-4.5" />
																	</div>
																	<div class="min-w-0 flex-1">
																		<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">{{ storeSectionTitle }}</p>
																		<p class="mt-1 truncate text-sm font-medium text-stone-900">{{ currentStoreLabel }}</p>
																		<p class="mt-0.5 truncate text-[11px] text-stone-500">
																			{{ canSwitchStores ? `${currentStoreCount} stores available` : "1 store available" }}
																		</p>
																	</div>
																	<button
																		v-if="canSwitchStores"
																		type="button"
																		class="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-primary-200 bg-primary-50 px-3 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
																		@click="openStoreSwitcher"
																	>
																		<UIcon name="i-heroicons-arrows-right-left-20-solid" class="h-4 w-4" />
																		<span>เปลี่ยนร้าน</span>
																	</button>
																	<div
																		v-else
																		class="inline-flex h-8 shrink-0 items-center rounded-full bg-white px-2.5 text-[11px] font-medium text-stone-500 ring-1 ring-[#e7e4dd]"
																	>
																		Current
																	</div>
																</div>
															</div>

															<button
																type="button"
																class="group flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-stone-700 transition hover:bg-primary-50 hover:text-primary-700"
																@click="navigateToProfile"
															>
																<span class="flex h-9 w-9 items-center justify-center rounded-full bg-[#f5f4ef] text-stone-700 transition group-hover:bg-primary-100 group-hover:text-primary-700">
																	<UIcon name="i-heroicons-user-circle-20-solid" class="h-5 w-5" />
																</span>
																<span class="min-w-0 flex-1">
																	<span class="block font-medium">ตั้งค่าโปรไฟล์</span>
																	<span class="block truncate text-xs text-stone-500 transition group-hover:text-primary-600">จัดการข้อมูลผู้ใช้และ session ของคุณ</span>
																</span>
															</button>

															<button
																type="button"
																class="group mt-1 flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm text-rose-600 transition hover:bg-rose-50 hover:text-rose-700"
																@click="openLogoutConfirmFromProfile"
															>
																<span class="flex h-9 w-9 items-center justify-center rounded-full bg-rose-50 text-rose-600 transition group-hover:bg-rose-100 group-hover:text-rose-700">
																	<UIcon name="i-heroicons-arrow-left-on-rectangle-20-solid" class="h-5 w-5" />
																</span>
																<span class="min-w-0 flex-1">
																	<span class="block font-medium">ออกจากระบบ</span>
																	<span class="block truncate text-xs text-rose-400 transition group-hover:text-rose-500">จบ session ปัจจุบันและกลับไปหน้า login</span>
																</span>
															</button>
														</div>
													</div>
												</template>
											</UPopover>
										</template>
									</AppTopNavbar>

									<div
										v-if="currentBreadcrumbs.length"
										class="border-t border-[#f0ece4] px-3 py-2 sm:px-4 lg:px-5"
									>
										<AppBreadcrumbs :items="currentBreadcrumbs" />
									</div>
								</div>
							</div>

							<div id="app-shell-scroll-root" class="scrollbar-soft min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto px-0 sm:px-2 lg:px-3">
								<div
									v-if="shellError"
									class="flex h-full min-h-[260px] items-center justify-center"
								>
									<div class="w-full max-w-xl rounded-2xl border border-[#f1d6cc] bg-[#fff8f5] p-6 text-center ring-1 ring-[#f7e7df]">
										<p class="text-sm font-semibold text-stone-900">โหลดหน้านี้ไม่สำเร็จ</p>
										<p class="mt-2 text-sm text-stone-500">{{ shellError }}</p>
										<div class="mt-4 flex justify-center gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="sm"
												class="rounded-md"
												@click="reloadCurrentView"
											>
												รีโหลดหน้า
											</AppButton>
										</div>
									</div>
								</div>
								<slot v-else :open-sidebar="openSidebar" />
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>

		<LogoutConfirmModal
			:open="logoutConfirmOpen"
			@close="logoutConfirmOpen = false"
			@confirm="confirmLogout"
		/>
		<AppResponsivePanel
			v-model="storeSwitcherOpen"
			title="เปลี่ยนร้าน"
			description="เลือกร้านที่ต้องการใช้เป็น workspace ปัจจุบัน"
			desktop-width="680px"
			mobile-max-height="82dvh"
			close-button-size="md"
			compact-header
			full-bleed-header
			content-class="flex h-full flex-col overflow-hidden px-0 py-0"
		>
			<div class="flex h-full min-h-0 flex-col">
				<div class="border-b border-[#efece4] bg-[#fbfbf8] px-5 py-4">
					<p class="text-[11px] font-semibold uppercase tracking-[0.14em] text-stone-400">Current store</p>
					<p class="mt-1 truncate text-sm font-medium text-stone-900">{{ currentStoreLabel }}</p>
					<p class="mt-1 text-xs text-stone-500">{{ currentStoreCount }} stores available</p>
				</div>

				<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-3 py-3">
					<div class="space-y-1">
						<button
							v-for="store in visibleSwitchableStores"
							:key="store.id"
							type="button"
							class="flex w-full items-center justify-between gap-3 rounded-md border px-3 py-3 text-left transition"
							:class="store.id === currentStoreId ? 'border-primary-200 bg-primary-50 text-primary-700' : 'border-[#efece4] bg-white text-stone-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'"
							:disabled="switchStorePending"
							@click="handleSwitchStore(store.id)"
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium">{{ store.name }}</span>
								<span class="mt-0.5 block truncate text-[11px]" :class="store.id === currentStoreId ? 'text-primary-600' : 'text-stone-400'">
									{{ store.id === currentStoreId ? "ร้านที่กำลังใช้งาน" : "แตะเพื่อเปลี่ยนร้าน" }}
								</span>
							</span>
							<UIcon
								:name="store.id === currentStoreId ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-arrow-right-circle-20-solid'"
								class="h-4.5 w-4.5 shrink-0"
							/>
						</button>
					</div>
				</div>
			</div>
		</AppResponsivePanel>
		<AppFloatingGoTop :hidden="mobileSidebarOpen" />
	</main>
</template>
