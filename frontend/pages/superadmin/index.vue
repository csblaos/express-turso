<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type Entry = { title: string; description: string; icon: string; to?: string; badge?: string };

const entries: Entry[] = [
	{ title: "Overview", description: "หน้าสรุปภาพรวมแบบ dashboard", icon: "i-heroicons-chart-pie", to: "/superadmin/overview", badge: "พร้อมใช้งาน" },
	{ title: "Global Config", description: "ตั้งค่ากลางของระบบฝั่ง superadmin เช่น max accounts per store", icon: "i-heroicons-adjustments-horizontal", to: "/superadmin/global-config", badge: "พร้อมใช้งาน" },
	{ title: "Users", description: "จัดการผู้ใช้ในมุม superadmin", icon: "i-heroicons-users", badge: "เร็ว ๆ นี้" },
	{ title: "Stores", description: "ดูและจัดการร้านในระดับ superadmin", icon: "i-heroicons-building-storefront", badge: "เร็ว ๆ นี้" },
	{ title: "กิจกรรม", description: "ดูประวัติการเปลี่ยนแปลงและกิจกรรมสำคัญ", icon: "i-heroicons-clipboard-document-check", to: "/activity", badge: "พร้อมใช้งาน" },
	{ title: "Security", description: "ดูข้อมูลด้าน security", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
	{ title: "Quotas", description: "ดู/จัดการ quota หรือข้อจำกัดการใช้งาน", icon: "i-heroicons-swatch", badge: "เร็ว ๆ นี้" },
	{ title: "Integrations", description: "ดูส่วน integration ที่เกี่ยวข้อง", icon: "i-heroicons-link", badge: "เร็ว ๆ นี้" },
	{ title: "Store Config", description: "ตั้งค่าระดับร้านจากมุม superadmin", icon: "i-heroicons-wrench-screwdriver", badge: "เร็ว ๆ นี้" },
	{ title: "Branch Config", description: "ตั้งค่าระดับสาขาจากมุม superadmin", icon: "i-heroicons-building-office-2", badge: "เร็ว ๆ นี้" },
];
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="พื้นที่ผู้ดูแลระดับสูงฝั่งธุรกิจ/องค์กร แยกจาก System Admin กลาง"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader title="Superadmin Settings" description="พื้นที่ผู้ดูแลระดับสูงฝั่งธุรกิจ/องค์กร แยกจาก System Admin กลางของแพลตฟอร์ม" @menu="openSidebar">
					<template #badges>
						<NuxtLink to="/settings"><UBadge color="gray" variant="soft" label="กลับ Settings" /></NuxtLink>
						<UBadge color="orange" variant="soft" label="Superadmin" />
					</template>
				</AppPageHeader>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<component
							:is="entry.to ? 'NuxtLink' : 'div'"
							v-for="entry in entries"
							:key="entry.title"
							:to="entry.to"
							class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"
							:class="entry.to ? 'cursor-pointer transition hover:border-[#d9d5cd] hover:shadow-xl' : ''"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
									<UIcon :name="entry.icon" class="h-5 w-5" />
								</div>
								<UBadge v-if="entry.badge" :color="entry.badge === 'พร้อมใช้งาน' ? 'green' : 'gray'" variant="soft" :label="entry.badge" />
							</div>
							<div class="mt-4">
								<h2 class="text-sm font-semibold text-stone-900">{{ entry.title }}</h2>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ entry.description }}</p>
							</div>
						</component>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
