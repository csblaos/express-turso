<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type AdminEntry = {
	id: string;
	title: string;
	description: string;
	icon: string;
	to?: string;
	badge?: string;
};

const adminEntries: AdminEntry[] = [
	{ id: "dashboard", title: "Dashboard", description: "ดูภาพรวมระบบ, security signals และสถานะสำคัญ", icon: "i-heroicons-chart-pie", badge: "หน้านี้" },
	{ id: "config", title: "Config", description: "เข้าเมนูรวมของ clients, system policy, stores-users, security และ monitoring", icon: "i-heroicons-adjustments-horizontal", to: "/system-admin/config", badge: "พร้อมใช้งาน" },
	{ id: "clients", title: "Clients", description: "จัดการ client / superadmin accounts, quota และการ suspend/enable", icon: "i-heroicons-briefcase", badge: "เร็ว ๆ นี้" },
	{ id: "system", title: "System Policy", description: "branch policy, session policy และ store logo policy", icon: "i-heroicons-cog-8-tooth", to: "/system-admin/config/system", badge: "พร้อมใช้งาน" },
	{ id: "stores-users", title: "Stores & Users", description: "แก้ config ของร้านและผู้ใช้จากส่วนกลาง", icon: "i-heroicons-user-group", badge: "เร็ว ๆ นี้" },
	{ id: "security", title: "Security", description: "ดูสถานะ JWT, Redis/session และ audit/security status", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
	{ id: "monitoring", title: "Monitoring", description: "ดู database, cache, integration และ FB/WA health summary", icon: "i-heroicons-signal", badge: "เร็ว ๆ นี้" },
];
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="พื้นที่ดูแล policy กลาง, clients, security และ monitoring"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="flex items-start gap-3">
						<UButton color="gray" variant="soft" size="lg" class="justify-center lg:hidden" icon="i-heroicons-bars-3-20-solid" aria-label="เปิดเมนู" title="เปิดเมนู" @click="openSidebar" />
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<UBadge color="orange" variant="soft" label="System Admin" />
								<UBadge color="gray" variant="soft" label="Platform-level only" />
							</div>
							<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">System Admin</h1>
							<p class="mt-1 text-sm text-stone-500">หน้าแยกสำหรับผู้ดูแลระบบกลางของแพลตฟอร์ม ไม่ปะปนกับ Superadmin หรือ Store Settings</p>
						</div>
					</div>
				</UCard>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<component
							:is="entry.to ? 'NuxtLink' : 'div'"
							v-for="entry in adminEntries"
							:key="entry.id"
							:to="entry.to"
							class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd] transition hover:border-[#d9d5cd] hover:shadow-xl"
							:class="entry.to ? 'cursor-pointer' : ''"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
									<UIcon :name="entry.icon" class="h-5 w-5" />
								</div>
								<UBadge v-if="entry.badge" :color="entry.badge === 'พร้อมใช้งาน' || entry.badge === 'หน้านี้' ? 'green' : 'gray'" variant="soft" :label="entry.badge" />
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
