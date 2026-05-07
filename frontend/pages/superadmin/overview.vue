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
				<AppPageHeader title="Superadmin Overview" description="starter dashboard สำหรับภาพรวมของ superadmin เช่น users, stores, quotas และ security summary" @menu="openSidebar">
					<template #badges>
						<NuxtLink to="/superadmin"><UBadge color="gray" variant="soft" label="กลับ Superadmin" /></NuxtLink>
						<UBadge color="orange" variant="soft" label="Overview" />
					</template>
				</AppPageHeader>
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
