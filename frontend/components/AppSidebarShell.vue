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
const { logout } = useAuthSession();

function openSidebar() {
	mobileSidebarOpen.value = true;
}

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

					<div class="hidden px-3 lg:block">
						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							class="items-center rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 shadow-sm transition-colors hover:bg-white hover:text-stone-900"
							:class="sidebarCollapsed ? 'h-11 w-11 justify-center px-0' : 'flex w-full justify-between px-3 py-2.5'"
							:icon="sidebarCollapsed ? 'i-heroicons-chevron-double-right-20-solid' : 'i-heroicons-chevron-double-left-20-solid'"
							:title="sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'"
							:aria-label="sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'"
							@click="sidebarCollapsed = !sidebarCollapsed"
						/>
					</div>

					<nav class="flex flex-1 flex-col gap-2">
						<NuxtLink
							v-for="item in navItems"
							:key="item.id"
							:to="item.to"
							class="flex items-center rounded-2xl px-3 py-3 text-left"
							:title="item.label"
							:aria-label="item.label"
							:class="[
								sidebarCollapsed ? 'gap-0' : 'gap-3',
								isNavActive(item.id)
									? (sidebarCollapsed
										? 'text-[#97532c]'
										: 'bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]')
									: 'text-stone-500 hover:bg-[#f7f5f1] hover:text-stone-900'
							]"
						>
							<div
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold"
								:class="isNavActive(item.id)
									? 'bg-white text-[#97532c] ring-1 ring-[#efd7c6]'
									: 'bg-[#f7f5f1] text-stone-600 ring-1 ring-[#e7e4dd]'"
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
					<section class="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:min-h-0 lg:overflow-hidden lg:px-5">
						<slot :open-sidebar="openSidebar" />
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
