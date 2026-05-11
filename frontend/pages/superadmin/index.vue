<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type Entry = { title: string; description: string; icon: string; to?: string; badge?: string };

const entries: Entry[] = [
	{ title: "Overview", description: "หน้าสรุปภาพรวมแบบ dashboard", icon: "i-heroicons-chart-pie", to: "/superadmin/overview", badge: "พร้อมใช้งาน" },
	{ title: "Global Config", description: "ตั้งค่ากลางของระบบฝั่ง superadmin เช่น max accounts per store", icon: "i-heroicons-adjustments-horizontal", to: "/superadmin/global-config", badge: "พร้อมใช้งาน" },
	{ title: "Users", description: "จัดการพนักงานและผู้ใช้ภายใต้ร้านที่คุณดูแล", icon: "i-heroicons-users", to: "/superadmin/users", badge: "พร้อมใช้งาน" },
	{ title: "Role Settings", description: "กำหนดบทบาทและสิทธิ์ของผู้ใช้ในแต่ละร้าน", icon: "i-heroicons-shield-check", to: "/superadmin/roles", badge: "พร้อมใช้งาน" },
	{ title: "Stores", description: "ดูและจัดการร้านในระดับ superadmin", icon: "i-heroicons-building-storefront", to: "/superadmin/stores", badge: "พร้อมใช้งาน" },
	{ title: "กิจกรรม", description: "ดูประวัติการเปลี่ยนแปลงและกิจกรรมสำคัญ", icon: "i-heroicons-clipboard-document-check", to: "/activity", badge: "พร้อมใช้งาน" },
	{ title: "Security", description: "ดู snapshot ของบัญชี ร้าน และทีม ภายใต้ superadmin นี้", icon: "i-heroicons-shield-check", to: "/superadmin/security", badge: "พร้อมใช้งาน" },
	{ title: "Quotas", description: "ดู quota ร้านและสาขาของบัญชีภายใต้ superadmin นี้", icon: "i-heroicons-swatch", to: "/superadmin/quotas", badge: "พร้อมใช้งาน" },
	{ title: "Integrations", description: "workspace สำหรับ social, commerce และ shipping integrations", icon: "i-heroicons-link", to: "/superadmin/integrations", badge: "พร้อมใช้งาน" },
	{ title: "Store Config", description: "ตั้งค่าระดับร้านจากมุม superadmin", icon: "i-heroicons-wrench-screwdriver", badge: "เร็ว ๆ นี้" },
	{ title: "Branch Config", description: "ดู branch config และความพร้อมของสาขาใต้ superadmin นี้", icon: "i-heroicons-building-office-2", to: "/superadmin/branch", badge: "พร้อมใช้งาน" },
];

const coreEntries = computed(() => entries.filter((entry) => entry.badge !== "เร็ว ๆ นี้"));
const plannedEntries = computed(() => entries.filter((entry) => entry.badge === "เร็ว ๆ นี้"));
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
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="Superadmin Settings"
					description="พื้นที่ผู้ดูแลระดับสูงฝั่งธุรกิจ/องค์กร แยกจาก System Admin กลางของแพลตฟอร์ม"
					@menu="openSidebar"
				/>

				<div class="scrollbar-soft min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 lg:block">Core tools</p>
								<h2 class="text-lg font-semibold text-stone-950 lg:hidden">เครื่องมือหลัก</h2>
								<h2 class="mt-2 hidden text-lg font-semibold text-stone-950 sm:text-xl lg:block">เครื่องมือหลักของ Superadmin</h2>
								<p class="mt-2 hidden max-w-3xl text-sm leading-6 text-stone-500 lg:block">รวมหน้าที่พร้อมใช้งานสำหรับภาพรวมระบบระดับธุรกิจและการกำหนด policy สำคัญ</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<NuxtLink
									v-for="entry in coreEntries"
									:key="entry.title"
									:to="entry.to || '/superadmin'"
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
													:color="entry.badge === 'พร้อมใช้งาน' ? 'success' : 'neutral'"
													variant="soft"
													:label="entry.badge"
													class="shrink-0"
												/>
											</div>
											<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm sm:leading-6">{{ entry.description }}</p>
										</div>
									</div>
								</NuxtLink>
							</div>
						</div>
					</UCard>

					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="hidden text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 lg:block">Planned areas</p>
								<h2 class="text-lg font-semibold text-stone-950 lg:hidden">กำลังจะตามมา</h2>
								<h2 class="mt-2 hidden text-lg font-semibold text-stone-950 sm:text-xl lg:block">พื้นที่ที่กำลังจะตามมา</h2>
								<p class="mt-2 hidden max-w-3xl text-sm leading-6 text-stone-500 lg:block">ขยายความสามารถสำหรับการดูแลผู้ใช้ ร้าน โควตา และความปลอดภัยระดับธุรกิจ</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<div
									v-for="entry in plannedEntries"
									:key="entry.title"
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
