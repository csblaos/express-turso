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
const shellError = ref<string | null>(null);
const requestHeaders = import.meta.server ? useRequestHeaders([ "user-agent" ]) : {};
const initialUserAgent = import.meta.server ? requestHeaders["user-agent"] || "" : "";
const isDesktopViewport = ref(import.meta.server
	? !/(android|iphone|ipad|ipod|mobile)/i.test(initialUserAgent)
	: false);
const isReducedMotion = ref(false);
const pendingMobileNavigation = ref(false);
const { logout, currentUser, currentAccess } = useAuthSession();
const route = useRoute();
const currentNavItem = computed(() => props.navItems.find((item) => props.activeIds.includes(item.id)));
let mediaQueryList: MediaQueryList | null = null;
let syncViewportListener: (() => void) | null = null;
let reducedMotionQueryList: MediaQueryList | null = null;
let syncReducedMotionListener: (() => void) | null = null;
const MOBILE_SIDEBAR_CLOSE_DELAY_MS = 180;

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
const profileDisplayRole = computed(() => {
	const systemRole = currentUser.value?.systemRole || "";
	if (!systemRole) return "Staff";
	return roleLabelMap[systemRole] || systemRole.replace(/_/g, " ");
});
const profileStoreSummary = computed(() => {
	const membershipCount = currentAccess.value?.memberships?.length || 0;
	if (!membershipCount) return "ยังไม่ได้ผูกกับร้าน";
	return membershipCount === 1 ? "ดูแล 1 store" : `ดูแล ${membershipCount} stores`;
});
const profileInitials = computed(() => (
	profileDisplayName.value
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "ST"
));
const currentBreadcrumbs = computed(() => resolveBreadcrumbs(route.path, props.navItems));

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
							<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#f8e9de] text-lg font-semibold text-[#97532c]">
								P
							</div>
							<div
								v-if="!isSidebarCompact"
								class="min-w-0 lg:hidden"
							>
								<p class="truncate text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Navigation</p>
								<p class="truncate text-sm font-semibold text-stone-950">เมนูหลักของระบบ</p>
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
								v-for="item in navItems"
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
		<AppFloatingGoTop :hidden="mobileSidebarOpen" />
	</main>
</template>
