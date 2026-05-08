<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

const overviewBlocks = [
	{ title: "Users", value: "--", note: "ผู้ใช้ทั้งหมดในภาพรวม" },
	{ title: "Stores", value: "--", note: "ร้านที่อยู่ในความดูแล" },
	{ title: "Quotas", value: "--", note: "สถานะโควตาโดยรวม" },
	{ title: "Security", value: "--", note: "สัญญาณด้านความปลอดภัย" },
];
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
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="Superadmin Overview"
					description="starter dashboard สำหรับภาพรวมของ superadmin เช่น users, stores, quotas และ security summary"
					@menu="openSidebar"
				/>

				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Overview snapshot</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">มุมมองภาพรวมแบบรวบรัดเพื่อเริ่มตรวจสุขภาพระบบฝั่งธุรกิจได้เร็ว</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ overviewBlocks.length }} blocks
								</div>
							</div>

							<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto p-4">
								<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
									<div
										v-for="block in overviewBlocks"
										:key="block.title"
										class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
									>
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ block.title }}</p>
										<p class="mt-2 text-2xl font-semibold text-stone-950">{{ block.value }}</p>
										<p class="mt-1 text-xs text-stone-500">{{ block.note }}</p>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
