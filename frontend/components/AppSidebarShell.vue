<script setup lang="ts">
import type { AppNavItem } from "~/utils/app-nav";

const props = defineProps<{
	navItems: AppNavItem[];
	activeIds: string[];
	sidebarEyebrow: string;
	sidebarTitle: string;
	sidebarCompactTitle: string;
	sidebarDescription: string;
}>();

const mobileSidebarOpen = ref(false);
const sidebarCollapsed = useState<boolean>("app-sidebar-collapsed", () => true);
const logoutConfirmOpen = ref(false);
const shellError = ref<string | null>(null);
const isDesktopViewport = ref(false);
const { logout, currentUser } = useAuthSession();
const route = useRoute();
const currentNavItem = computed(() => props.navItems.find((item) => props.activeIds.includes(item.id)));
let mediaQueryList: MediaQueryList | null = null;
let syncViewportListener: (() => void) | null = null;

function openSidebar() {
	mobileSidebarOpen.value = true;
}

function toggleSidebar() {
	if (isDesktopViewport.value) {
		sidebarCollapsed.value = !sidebarCollapsed.value;
		return;
	}

	mobileSidebarOpen.value = true;
}

const topbarMenuTitle = computed(() => (
	isDesktopViewport.value
		? (sidebarCollapsed.value ? "ขยายเมนู" : "ย่อเมนู")
		: "เปิดเมนู"
));

const profileMenuItems = computed(() => [[
	{
		label: "ตั้งค่าโปรไฟล์",
		icon: "i-heroicons-cog-6-tooth",
		onSelect: () => navigateTo("/profile"),
	},
], [
	{
		label: "ออกจากระบบ",
		icon: "i-heroicons-arrow-left-on-rectangle",
		onSelect: () => openLogoutConfirm(),
	},
]]);

function isNavActive(id: string) {
	return props.activeIds.includes(id);
}

function openLogoutConfirm() {
	logoutConfirmOpen.value = true;
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
});

onMounted(() => {
	mediaQueryList = window.matchMedia("(min-width: 1024px)");
	syncViewportListener = () => {
		isDesktopViewport.value = mediaQueryList?.matches ?? false;
	};

	syncViewportListener();
	mediaQueryList.addEventListener("change", syncViewportListener);
});

onUnmounted(() => {
	if (mediaQueryList && syncViewportListener) {
		mediaQueryList.removeEventListener("change", syncViewportListener);
	}
});

onErrorCaptured((error) => {
	shellError.value = extractShellErrorMessage(error);
	console.error("[AppSidebarShell] captured descendant error", error);
	return false;
});
</script>

<template>
	<main class="min-h-screen w-full bg-transparent lg:h-screen lg:overflow-hidden">
		<div class="flex min-h-screen w-full lg:h-screen lg:overflow-hidden">
			<div
				v-if="mobileSidebarOpen"
				class="fixed inset-0 z-40 bg-black/45 lg:hidden"
				@click="mobileSidebarOpen = false"
			/>

			<aside
				class="fixed inset-y-0 left-0 z-50 flex bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] transition-[width,transform] duration-200 ease-out lg:relative lg:h-screen lg:overflow-hidden lg:shadow-none"
				:class="[
					sidebarCollapsed ? 'w-[84px]' : 'w-[280px]',
					mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
				]"
			>
				<div class="scrollbar-soft flex w-full flex-col gap-4 overflow-y-auto p-3">
					<div class="flex items-center justify-between">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e9de] text-lg font-semibold text-[#97532c]">
							P
						</div>

						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							class="lg:hidden"
							label="ปิด"
							@click="mobileSidebarOpen = false"
						/>
					</div>

					<nav class="flex flex-1 flex-col gap-2">
						<NuxtLink
							v-for="item in navItems"
							:key="item.id"
							:to="item.to"
							class="group flex items-center rounded-2xl px-3 py-3 text-left transition-colors"
							:title="item.label"
							:aria-label="item.label"
							:class="[
								sidebarCollapsed ? 'gap-0' : 'gap-3',
								isNavActive(item.id)
									? (sidebarCollapsed
										? 'text-[#97532c]'
										: 'bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]')
									: (sidebarCollapsed
										? 'text-stone-500 hover:text-[#97532c]'
										: 'text-stone-500 hover:bg-[#fbf1ea] hover:text-[#97532c] hover:ring-1 hover:ring-[#efd7c6]')
							]"
						>
							<div
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold transition-colors"
								:class="isNavActive(item.id)
									? 'bg-white text-[#97532c] ring-1 ring-[#efd7c6]'
									: 'bg-[#f7f5f1] text-stone-600 ring-1 ring-[#e7e4dd] group-hover:bg-white group-hover:text-[#97532c] group-hover:ring-[#efd7c6]'"
							>
								<UIcon :name="item.icon" class="h-5 w-5" />
							</div>
							<div
								class="min-w-0 overflow-hidden transition-[width,opacity] duration-150 ease-out"
								:class="sidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'"
								aria-hidden="true"
							>
								<p class="truncate text-sm font-medium whitespace-nowrap">{{ item.label }}</p>
							</div>
						</NuxtLink>
					</nav>

					<div class="px-3 pt-1">
						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							icon="i-heroicons-arrow-left-on-rectangle"
							class="items-center rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 shadow-sm transition-colors hover:bg-white hover:text-stone-900"
							:class="sidebarCollapsed ? 'h-11 w-11 justify-center px-0' : 'flex h-11 w-full justify-start gap-3 px-3 py-2.5'"
							:title="sidebarCollapsed ? 'ออกจากระบบ' : undefined"
							:aria-label="'ออกจากระบบ'"
							@click="openLogoutConfirm"
						>
							<span
								class="min-w-0 overflow-hidden text-sm font-medium whitespace-nowrap transition-[width,opacity] duration-150 ease-out"
								:class="sidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'"
								aria-hidden="true"
							>
								ออกจากระบบ
							</span>
						</UButton>
					</div>
				</div>
			</aside>

			<div class="min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
				<div class="flex min-h-screen w-full lg:h-screen lg:min-h-0 lg:overflow-hidden">
					<section class="min-w-0 flex-1 pb-2 sm:pb-3 lg:min-h-0 lg:overflow-hidden">
						<div class="flex h-full min-h-0 flex-col gap-3">
							<div class="sticky top-0 z-30">
								<AppTopNavbar
									:title="currentNavItem?.label || sidebarTitle"
									:eyebrow="sidebarEyebrow"
									:icon="currentNavItem?.icon"
									:menu-title="topbarMenuTitle"
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

										<UDropdownMenu
											:items="profileMenuItems"
											:content="{ side: 'bottom', align: 'end', sideOffset: 8 }"
										>
											<UButton
												color="gray"
												variant="ghost"
												size="md"
												class="h-9 w-9 justify-center rounded-xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 hover:bg-white hover:text-stone-900"
												icon="i-heroicons-user-circle"
												:title="currentUser?.name || 'โปรไฟล์'"
												:aria-label="currentUser?.name || 'โปรไฟล์'"
											/>
										</UDropdownMenu>
									</template>
								</AppTopNavbar>
							</div>

							<div class="min-h-0 flex-1 px-0 sm:px-2 lg:px-3">
								<div
									v-if="shellError"
									class="flex h-full min-h-[260px] items-center justify-center"
								>
									<div class="w-full max-w-xl rounded-2xl border border-[#f1d6cc] bg-[#fff8f5] p-6 text-center ring-1 ring-[#f7e7df]">
										<p class="text-sm font-semibold text-stone-900">โหลดหน้านี้ไม่สำเร็จ</p>
										<p class="mt-2 text-sm text-stone-500">{{ shellError }}</p>
										<div class="mt-4 flex justify-center gap-2">
											<UButton
												color="gray"
												variant="soft"
												size="sm"
												class="rounded-md"
												@click="reloadCurrentView"
											>
												รีโหลดหน้า
											</UButton>
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
	</main>
</template>
