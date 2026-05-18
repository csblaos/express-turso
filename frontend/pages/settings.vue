<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type SettingsEntry = {
	id: string;
	title: string;
	description: string;
	icon: string;
	to?: string;
	badge?: string;
};

type SettingsSection = {
	id: string;
	eyebrow: string;
	title: string;
	description: string;
	entries: SettingsEntry[];
};

const route = useRoute();
const isSettingsHub = computed(() => route.path === "/settings");

function linkedEntries(section: SettingsSection) {
	return section.entries.filter((entry) => Boolean(entry.to));
}

function staticEntries(section: SettingsSection) {
	return section.entries.filter((entry) => !entry.to);
}

const settingsSections: SettingsSection[] = [
	{
		id: "user",
		eyebrow: "User settings",
		title: "ตั้งค่าทั่วไปของผู้ใช้",
		description: "โปรไฟล์ ความปลอดภัย ผู้ใช้งาน และค่าพื้นฐานที่เกี่ยวกับการใช้งานร้าน",
		entries: [
			{ id: "profile", title: "Profile", description: "จัดการข้อมูลบัญชีและเปลี่ยนรหัสผ่าน", icon: "i-heroicons-user-circle", to: "/profile", badge: "พร้อมใช้งาน" },
			{ id: "language", title: "Language", description: "ตั้งค่าภาษา UI และรูปแบบการแสดงผล", icon: "i-heroicons-language", badge: "เร็ว ๆ นี้" },
			{ id: "security", title: "Security", description: "ดูข้อมูลความปลอดภัยของบัญชีและ session", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
			{ id: "users", title: "Users", description: "จัดการสมาชิกในร้าน, เปลี่ยนบทบาท และดู permission summary", icon: "i-heroicons-users", to: "/settings/users", badge: "พร้อมใช้งาน" },
			{ id: "categories", title: "Categories", description: "จัดการหมวดหมู่สินค้า", icon: "i-heroicons-tag", to: "/settings/categories", badge: "พร้อมใช้งาน" },
			{ id: "units", title: "Units", description: "จัดการหน่วยสินค้าและหน่วยขาย", icon: "i-heroicons-scale", to: "/settings/units", badge: "พร้อมใช้งาน" },
			{ id: "stock-alert", title: "Stock", description: "ตั้งค่า stock alert และ threshold", icon: "i-heroicons-bell-alert", to: "/inventory" },
			{ id: "notifications", title: "Notifications", description: "กล่องแจ้งเตือนและกฎการ mute/snooze", icon: "i-heroicons-bell", badge: "เร็ว ๆ นี้" },
			{ id: "pdf", title: "PDF", description: "ตั้งค่าเอกสาร PDF และ template", icon: "i-heroicons-document-text", badge: "เร็ว ๆ นี้" },
			{ id: "audit-log", title: "กิจกรรม", description: "ดูประวัติการเปลี่ยนแปลงและเหตุการณ์สำคัญ", icon: "i-heroicons-clipboard-document-check", to: "/activity", badge: "พร้อมใช้งาน" },
			{ id: "stores", title: "Stores", description: "สลับร้าน/สาขา และสร้างร้าน/สาขา", icon: "i-heroicons-building-storefront", badge: "เร็ว ๆ นี้" },
		],
	},
	{
		id: "store",
		eyebrow: "Store settings",
		title: "ตั้งค่าร้านที่กำลังใช้งาน",
		description: "โปรไฟล์ร้าน การเงิน การชำระเงิน ขนส่ง และค่าของสาขาที่กำลังใช้งาน",
		entries: [
			{ id: "store-profile", title: "Store Profile", description: "ชื่อร้าน โลโก้ ที่อยู่ และช่องทางติดต่อ", icon: "i-heroicons-building-storefront", badge: "เร็ว ๆ นี้" },
				{ id: "store-finance", title: "Store Finance", description: "base currency และสกุลเงินที่รองรับ", icon: "i-heroicons-banknotes", to: "/settings/store-finance", badge: "พร้อมใช้งาน" },
			{ id: "store-payments", title: "Store Payments", description: "บัญชีรับเงินของร้าน เช่น ธนาคาร, QR และสกุลเงิน", icon: "i-heroicons-credit-card", badge: "เร็ว ๆ นี้" },
			{ id: "shipping", title: "Shipping Providers", description: "รายชื่อขนส่งหลักของร้านเพื่อใช้กับออเดอร์ออนไลน์", icon: "i-heroicons-truck", badge: "เร็ว ๆ นี้" },
			{ id: "branch-switch", title: "Store / Branch Switch", description: "เปลี่ยนร้านหรือเปลี่ยนสาขาที่ active อยู่", icon: "i-heroicons-arrows-right-left", badge: "เร็ว ๆ นี้" },
			{ id: "branch-config", title: "Store / Branch Config", description: "ตั้งค่าระดับร้านหรือสาขาใน flow การจัดการหลายร้าน", icon: "i-heroicons-adjustments-horizontal", badge: "เร็ว ๆ นี้" },
		],
	},
];
</script>

<template>
	<AppSidebarShell
		v-if="isSettingsHub"
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		sidebar-title="ศูนย์รวมการตั้งค่า"
		sidebar-compact-title="CFG"
		sidebar-description="รวมการตั้งค่าของผู้ใช้และร้านที่กำลังใช้งานไว้ในพื้นที่เดียว"
	>
		<template #default="{ openSidebar }">
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader title="ศูนย์รวมการตั้งค่า" description="รวมการตั้งค่าของผู้ใช้และร้านที่กำลังใช้งาน" @menu="openSidebar">
				</AppPageHeader>

				<div class="scrollbar-soft min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:pr-1">
					<UCard
						v-for="section in settingsSections"
						:key="section.id"
						class="min-w-0 max-w-full rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md"
					>
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ section.eyebrow }}</p>
								<h2 class="mt-2 text-lg font-semibold text-stone-950 sm:text-xl">{{ section.title }}</h2>
								<p class="mt-2 max-w-3xl text-sm leading-6 text-stone-500 lg:hidden">{{ section.description }}</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<NuxtLink
									v-for="entry in linkedEntries(section)"
									:key="entry.id"
									:to="entry.to"
									class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 transition hover:border-primary-200 hover:bg-primary-50 sm:p-4"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 sm:h-11 sm:w-11">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h3 class="truncate text-sm font-semibold text-stone-900">{{ entry.title }}</h3>
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

								<div
									v-for="entry in staticEntries(section)"
									:key="entry.id"
									class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 transition hover:border-primary-200 hover:bg-primary-50 sm:p-4"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 sm:h-11 sm:w-11">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h3 class="truncate text-sm font-semibold text-stone-900">{{ entry.title }}</h3>
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
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>
		</template>
	</AppSidebarShell>

	<NuxtPage v-else />
</template>
