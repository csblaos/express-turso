<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="overview, global config, users, stores, quotas และ security summary"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="flex items-start gap-3">
						<UButton color="gray" variant="soft" size="lg" class="justify-center lg:hidden" icon="i-heroicons-bars-3-20-solid" aria-label="เปิดเมนู" title="เปิดเมนู" @click="openSidebar" />
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<NuxtLink to="/superadmin"><UBadge color="gray" variant="soft" label="กลับ Superadmin" /></NuxtLink>
								<UBadge color="orange" variant="soft" label="Overview" />
							</div>
							<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Superadmin Overview</h1>
							<p class="mt-1 text-sm text-stone-500">starter dashboard สำหรับภาพรวมของ superadmin เช่น users, stores, quotas และ security summary</p>
						</div>
					</div>
				</UCard>
				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
						<div class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"><p class="text-xs uppercase tracking-[0.16em] text-stone-400">Users</p><p class="mt-3 text-2xl font-semibold text-stone-950">--</p></div>
						<div class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"><p class="text-xs uppercase tracking-[0.16em] text-stone-400">Stores</p><p class="mt-3 text-2xl font-semibold text-stone-950">--</p></div>
						<div class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"><p class="text-xs uppercase tracking-[0.16em] text-stone-400">Quotas</p><p class="mt-3 text-2xl font-semibold text-stone-950">--</p></div>
						<div class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"><p class="text-xs uppercase tracking-[0.16em] text-stone-400">Security</p><p class="mt-3 text-2xl font-semibold text-stone-950">--</p></div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
