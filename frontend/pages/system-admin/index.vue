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
	{ id: "clients", title: "Clients", description: "จัดการ client / superadmin accounts, quota และการ suspend/enable", icon: "i-heroicons-briefcase", to: "/system-admin/clients", badge: "พร้อมใช้งาน" },
	{ id: "system", title: "System Policy", description: "branch policy, session policy และ store logo policy", icon: "i-heroicons-cog-8-tooth", to: "/system-admin/system", badge: "พร้อมใช้งาน" },
	{ id: "stores-users", title: "Stores & Users", description: "แก้ config ของร้านและผู้ใช้จากส่วนกลาง", icon: "i-heroicons-user-group", badge: "เร็ว ๆ นี้" },
	{ id: "security", title: "Security", description: "ดูสถานะ JWT, Redis/session และ audit/security status", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
	{ id: "monitoring", title: "Monitoring", description: "ดู database, cache, integration และ FB/WA health summary", icon: "i-heroicons-signal", badge: "เร็ว ๆ นี้" },
];

const coreEntries = computed(() => adminEntries.filter((entry) => entry.badge !== "เร็ว ๆ นี้"));
const plannedEntries = computed(() => adminEntries.filter((entry) => entry.badge === "เร็ว ๆ นี้"));
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
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="System Admin"
					description="หน้าแยกสำหรับผู้ดูแลระบบกลางของแพลตฟอร์ม ไม่ปะปนกับ Superadmin หรือ Store Settings"
					@menu="openSidebar"
				>
				</AppPageHeader>

					<div class="scrollbar-soft min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:pr-1">
						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 lg:block">Core tools</p>
								<h2 class="text-lg font-semibold text-stone-950 lg:hidden">เครื่องมือหลัก</h2>
								<h2 class="mt-2 hidden text-lg font-semibold text-stone-950 sm:text-xl lg:block">เครื่องมือหลักของผู้ดูแลระบบ</h2>
								<p class="mt-2 hidden max-w-3xl text-sm leading-6 text-stone-500 lg:block">รวมหน้าที่ใช้งานได้แล้วสำหรับดูภาพรวม, จัดการ client accounts และตั้งค่า policy กลางของแพลตฟอร์ม</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<template v-for="entry in coreEntries" :key="entry.id">
									<NuxtLink
										v-if="entry.to"
										:to="entry.to"
										class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 transition hover:border-primary-200 hover:bg-primary-50 sm:p-4"
									>
										<div class="flex items-center gap-3 sm:items-start sm:justify-between">
											<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 sm:h-11 sm:w-11">
												<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
											</div>
											<div class="min-w-0 flex-1">
												<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
													<h2 class="truncate text-sm font-semibold text-stone-900">{{ entry.title }}</h2>
													<UBadge
														v-if="entry.badge"
														:color="entry.badge === 'พร้อมใช้งาน' || entry.badge === 'หน้านี้' ? 'success' : 'neutral'"
														variant="soft"
														:label="entry.badge"
														class="shrink-0"
													/>
												</div>
												<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm sm:leading-6">{{ entry.description }}</p>
											</div>
										</div>
									</NuxtLink>

									<div
										v-else
										class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 sm:p-4"
									>
										<div class="flex items-center gap-3 sm:items-start sm:justify-between">
											<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 sm:h-11 sm:w-11">
												<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
											</div>
											<div class="min-w-0 flex-1">
												<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
													<h2 class="truncate text-sm font-semibold text-stone-900">{{ entry.title }}</h2>
													<UBadge
														v-if="entry.badge"
														:color="entry.badge === 'พร้อมใช้งาน' || entry.badge === 'หน้านี้' ? 'success' : 'neutral'"
														variant="soft"
														:label="entry.badge"
														class="shrink-0"
													/>
												</div>
												<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm sm:leading-6">{{ entry.description }}</p>
											</div>
										</div>
									</div>
								</template>
							</div>
						</div>
					</UCard>

						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 lg:block">Planned areas</p>
								<h2 class="text-lg font-semibold text-stone-950 lg:hidden">กำลังจะตามมา</h2>
								<h2 class="mt-2 hidden text-lg font-semibold text-stone-950 sm:text-xl lg:block">พื้นที่ที่กำลังจะตามมา</h2>
								<p class="mt-2 hidden max-w-3xl text-sm leading-6 text-stone-500 lg:block">ส่วนนี้เป็นความสามารถที่เตรียมไว้สำหรับงานดูแลร้าน, ผู้ใช้, ความปลอดภัย และ monitoring ระดับแพลตฟอร์ม</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<div
									v-for="entry in plannedEntries"
									:key="entry.id"
									class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 sm:p-4"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 sm:h-11 sm:w-11">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h2 class="truncate text-sm font-semibold text-stone-900">{{ entry.title }}</h2>
												<UBadge v-if="entry.badge" color="neutral" variant="soft" :label="entry.badge" class="shrink-0" />
											</div>
											<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm sm:leading-6">{{ entry.description }}</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
