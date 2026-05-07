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

const accessQuickLinks: SettingsEntry[] = [
	{
		id: "access-users",
		title: "ผู้ใช้งาน",
		description: "ดูสมาชิกในร้าน, เปลี่ยนบทบาท และรีเซ็ตรหัสผ่าน",
		icon: "i-heroicons-users",
		to: "/settings/access/users",
		badge: "พร้อมใช้งาน",
	},
	{
		id: "access-roles",
		title: "บทบาท",
		description: "จัดการ role และ permission ที่แต่ละบทบาทถืออยู่",
		icon: "i-heroicons-identification",
		to: "/settings/access/roles",
		badge: "พร้อมใช้งาน",
	},
];

const settingsSections: SettingsSection[] = [
	{
		id: "user",
		eyebrow: "User settings",
		title: "ตั้งค่าทั่วไปของผู้ใช้",
		description: "ของผู้ใช้ในร้าน เช่น โปรไฟล์, ความปลอดภัย, สิทธิ์, ผู้ใช้, บทบาท และข้อมูลประกอบการขายบางส่วน",
		entries: [
			{ id: "profile", title: "Profile", description: "จัดการข้อมูลบัญชีและเปลี่ยนรหัสผ่าน", icon: "i-heroicons-user-circle", to: "/profile", badge: "พร้อมใช้งาน" },
			{ id: "language", title: "Language", description: "ตั้งค่าภาษา UI และรูปแบบการแสดงผล", icon: "i-heroicons-language", badge: "เร็ว ๆ นี้" },
			{ id: "permissions", title: "Permissions", description: "ดูสิทธิ์ที่อนุญาตผ่าน role และ policy ของร้าน", icon: "i-heroicons-lock-closed", to: "/settings/access/roles", badge: "พร้อมใช้งาน" },
			{ id: "security", title: "Security", description: "ดูข้อมูลความปลอดภัยของบัญชีและ session", icon: "i-heroicons-shield-check", badge: "เร็ว ๆ นี้" },
			{ id: "roles", title: "Roles", description: "จัดการบทบาทของผู้ใช้งานในร้าน และสิทธิ์ที่ role นั้นถืออยู่", icon: "i-heroicons-identification", to: "/settings/access/roles", badge: "พร้อมใช้งาน" },
			{ id: "users", title: "Users", description: "จัดการสมาชิกในร้าน, เปลี่ยนบทบาท และดู permission summary", icon: "i-heroicons-users", to: "/settings/access/users", badge: "พร้อมใช้งาน" },
			{ id: "categories", title: "Categories", description: "จัดการหมวดหมู่สินค้า", icon: "i-heroicons-tag", to: "/products" },
			{ id: "units", title: "Units", description: "จัดการหน่วยสินค้าและหน่วยขาย", icon: "i-heroicons-scale", to: "/products" },
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
		description: "สิ่งที่กระทบการขายของร้านปัจจุบัน เช่น โปรไฟล์ร้าน, การเงิน, การชำระเงิน, ขนส่ง และการสลับสาขา",
		entries: [
			{ id: "store-profile", title: "Store Profile", description: "ชื่อร้าน โลโก้ ที่อยู่ และช่องทางติดต่อ", icon: "i-heroicons-building-storefront", badge: "เร็ว ๆ นี้" },
			{ id: "store-finance", title: "Store Finance", description: "base currency, supported currencies และ VAT", icon: "i-heroicons-banknotes", badge: "เร็ว ๆ นี้" },
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
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader title="ศูนย์รวมการตั้งค่า" description="หน้าหลักนี้ใช้เป็น hub สำหรับการตั้งค่าของผู้ใช้และร้านปัจจุบันเท่านั้น" @menu="openSidebar">
					<template #badges>
						<UBadge color="gray" variant="soft" label="Settings" />
						<UBadge color="orange" variant="soft" label="User + Store settings" />
					</template>

					<template #actions>
						<UBadge color="gray" variant="soft" label="User + Store settings hub" />
					</template>
				</AppPageHeader>

				<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto lg:pr-1">
					<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
						<div class="space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Access control</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">สิทธิ์การใช้งาน</h2>
								<p class="mt-2 max-w-3xl text-sm leading-6 text-stone-500">เข้า 2 หน้านี้ได้ตรง ๆ จาก settings เพื่อจัดการผู้ใช้งานและบทบาทของร้าน</p>
							</div>

							<div class="grid gap-3 md:grid-cols-2">
								<NuxtLink
									v-for="entry in accessQuickLinks"
									:key="entry.id"
									:to="entry.to"
									class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4 transition hover:border-[#d9d5cd] hover:shadow-sm"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
											<UIcon :name="entry.icon" class="h-5 w-5" />
										</div>
										<UBadge color="green" variant="soft" :label="entry.badge" />
									</div>

									<div class="mt-4">
										<h3 class="text-sm font-semibold text-stone-900">{{ entry.title }}</h3>
										<p class="mt-2 text-sm leading-6 text-stone-500">{{ entry.description }}</p>
									</div>
								</NuxtLink>
							</div>
						</div>
					</UCard>

					<UCard
						v-for="section in settingsSections"
						:key="section.id"
						class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]"
					>
						<div class="space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ section.eyebrow }}</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">{{ section.title }}</h2>
								<p class="mt-2 max-w-3xl text-sm leading-6 text-stone-500">{{ section.description }}</p>
							</div>

							<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
								<NuxtLink
									v-for="entry in linkedEntries(section)"
									:key="entry.id"
									:to="entry.to"
									class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4 transition hover:border-[#d9d5cd] hover:shadow-sm"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
											<UIcon :name="entry.icon" class="h-5 w-5" />
										</div>
										<UBadge
											v-if="entry.badge"
											:color="entry.badge === 'พร้อมใช้งาน' ? 'green' : 'gray'"
											variant="soft"
											:label="entry.badge"
										/>
									</div>

									<div class="mt-4">
										<h3 class="text-sm font-semibold text-stone-900">{{ entry.title }}</h3>
										<p class="mt-2 text-sm leading-6 text-stone-500">{{ entry.description }}</p>
									</div>
								</NuxtLink>

								<div
									v-for="entry in staticEntries(section)"
									:key="entry.id"
									class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4 transition hover:border-[#d9d5cd] hover:shadow-sm"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
											<UIcon :name="entry.icon" class="h-5 w-5" />
										</div>
										<UBadge
											v-if="entry.badge"
											:color="entry.badge === 'พร้อมใช้งาน' ? 'green' : 'gray'"
											variant="soft"
											:label="entry.badge"
										/>
									</div>

									<div class="mt-4">
										<h3 class="text-sm font-semibold text-stone-900">{{ entry.title }}</h3>
										<p class="mt-2 text-sm leading-6 text-stone-500">{{ entry.description }}</p>
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
