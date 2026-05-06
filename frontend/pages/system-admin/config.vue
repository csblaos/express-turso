<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type SectionLink = { title: string; description: string; to?: string; badge?: string; icon: string };

const sectionLinks: SectionLink[] = [
	{ title: "Clients", description: "จัดการ client / superadmin accounts, quota และการ suspend/enable", icon: "i-heroicons-briefcase", badge: "เร็ว ๆ นี้" },
	{ title: "System", description: "branch policy, session policy และ store logo policy", icon: "i-heroicons-cog-8-tooth", to: "/system-admin/config/system", badge: "พร้อมใช้งาน" },
	{ title: "Stores & Users", description: "แก้ config ของร้านและผู้ใช้จากส่วนกลาง", icon: "i-heroicons-user-group", badge: "เร็ว ๆ นี้" },
	{ title: "Security", description: "ดูภาพรวมด้านความปลอดภัยของระบบ", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
	{ title: "Monitoring", description: "database health, cache health และ integration health", icon: "i-heroicons-signal", badge: "เร็ว ๆ นี้" },
];
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="เมนู config กลางของแพลตฟอร์ม เช่น clients, policy, security และ monitoring"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="flex items-start gap-3">
						<UButton color="gray" variant="soft" size="lg" class="justify-center lg:hidden" icon="i-heroicons-bars-3-20-solid" aria-label="เปิดเมนู" title="เปิดเมนู" @click="openSidebar" />
						<div>
							<div class="flex flex-wrap items-center gap-2">
								<NuxtLink to="/system-admin"><UBadge color="gray" variant="soft" label="กลับ System Admin" /></NuxtLink>
								<UBadge color="orange" variant="soft" label="Config hub" />
							</div>
							<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">System Admin Config</h1>
							<p class="mt-1 text-sm text-stone-500">จุดรวมสำหรับเข้าไปยังหมวด config ต่าง ๆ ของระบบกลาง</p>
						</div>
					</div>
				</UCard>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
						<component
							:is="item.to ? 'NuxtLink' : 'div'"
							v-for="item in sectionLinks"
							:key="item.title"
							:to="item.to"
							class="rounded-2xl border border-[#e7e4dd] bg-white p-4 shadow-lg ring-1 ring-[#e7e4dd]"
							:class="item.to ? 'cursor-pointer transition hover:border-[#d9d5cd] hover:shadow-xl' : ''"
						>
							<div class="flex items-start justify-between gap-3">
								<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
									<UIcon :name="item.icon" class="h-5 w-5" />
								</div>
								<UBadge v-if="item.badge" :color="item.badge === 'พร้อมใช้งาน' ? 'green' : 'gray'" variant="soft" :label="item.badge" />
							</div>
							<div class="mt-4">
								<h2 class="text-sm font-semibold text-stone-900">{{ item.title }}</h2>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ item.description }}</p>
							</div>
						</component>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
