<script setup lang="ts">
import type { AppNotification } from "~/composables/useNotificationCenter";
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

const { locale } = useI18n();
const { currentStoreId } = useAuthSession();
const center = useNotificationCenter();
const status = ref<"all" | "unread">("all");
const topic = ref<"all" | "stock" | "promotion">("all");
const error = ref("");

const copy = computed(() => {
	if (locale.value === "lo") return {
		title: "ການແຈ້ງເຕືອນ", description: "ຕິດຕາມສະຕັອກ ແລະ ໂປຣໂມຊັນທີ່ຕ້ອງຈັດການ", all: "ທັງໝົດ", unread: "ຍັງບໍ່ອ່ານ",
		stock: "ສະຕັອກ", promotion: "ໂປຣໂມຊັນ", allRead: "ອ່ານທັງໝົດແລ້ວ", reload: "ໂຫຼດໃໝ່", empty: "ບໍ່ມີການແຈ້ງເຕືອນຕາມຕົວກອງນີ້",
		out: "ສິນຄ້າໝົດ", low: "ສະຕັອກໃກ້ໝົດ", ending: "ໂປຣໂມຊັນໃກ້ສິ້ນສຸດ", available: "ເຫຼືອ", threshold: "ເກນ", ends: "ສິ້ນສຸດ", open: "ເປີດເບິ່ງ", read: "ໝາຍວ່າອ່ານແລ້ວ",
	};
	if (locale.value === "th") return {
		title: "การแจ้งเตือน", description: "ติดตามสต็อกและโปรโมชั่นที่ต้องจัดการ", all: "ทั้งหมด", unread: "ยังไม่อ่าน",
		stock: "สต็อก", promotion: "โปรโมชั่น", allRead: "อ่านทั้งหมดแล้ว", reload: "โหลดใหม่", empty: "ไม่มีการแจ้งเตือนตามตัวกรองนี้",
		out: "สินค้าหมด", low: "สต็อกใกล้หมด", ending: "โปรโมชั่นใกล้สิ้นสุด", available: "คงเหลือ", threshold: "เกณฑ์", ends: "สิ้นสุด", open: "เปิดดู", read: "ทำเครื่องหมายว่าอ่านแล้ว",
	};
	return {
		title: "Notifications", description: "Track stock and promotions that need attention", all: "All", unread: "Unread",
		stock: "Stock", promotion: "Promotions", allRead: "Mark all read", reload: "Reload", empty: "No notifications match these filters",
		out: "Out of stock", low: "Low stock", ending: "Promotion ending soon", available: "Available", threshold: "Threshold", ends: "Ends", open: "Open", read: "Mark as read",
	};
});

function title(item: AppNotification) {
	if (item.due_status === "out_of_stock") return copy.value.out;
	if (item.due_status === "low_stock") return copy.value.low;
	return copy.value.ending;
}

function formatDate(value: string | null) {
	if (!value) return "-";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "-";
	return formatAppDateTime(date, locale.value === "lo" ? "lo" : locale.value === "th" ? "th" : "en");
}

async function load() {
	if (!currentStoreId.value) return;
	error.value = "";
	try {
		await center.fetchNotifications(currentStoreId.value, {
			limit: 100,
			status: status.value,
			topic: topic.value,
		});
	} catch (cause) {
		error.value = resolveApiErrorMessage(cause, copy.value.title);
	}
}

async function markRead(item: AppNotification) {
	if (!currentStoreId.value || item.is_read) return;
	await center.markRead(currentStoreId.value, item.id);
	if (status.value === "unread") center.items.value = center.items.value.filter((entry) => entry.id !== item.id);
}

async function markAllRead() {
	if (!currentStoreId.value) return;
	await center.markAllRead(currentStoreId.value);
	if (status.value === "unread") center.items.value = [];
}

async function openItem(item: AppNotification) {
	await markRead(item).catch(() => undefined);
	await navigateTo(item.payload.target || (item.topic === "stock" ? "/inventory" : "/promotions"));
}

watch([currentStoreId, status, topic], () => void load(), { immediate: true });
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Notifications"
		:sidebar-title="copy.title"
		sidebar-compact-title="NOTI"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-3 pb-4">
				<AppPageHeader :title="copy.title" :description="copy.description" :title-badge="false" actions-align="center" tablet-layout compact @menu="openSidebar">
					<template #actions>
						<div class="hidden gap-2 md:flex">
							<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="center.pending.value" @click="load">{{ copy.reload }}</AppButton>
							<AppButton color="primary" variant="solid" icon="i-heroicons-check" class="shadow-sm ring-1 ring-emerald-600/20" :disabled="center.unreadCount.value === 0" @click="markAllRead">{{ copy.allRead }}</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white p-3 shadow-sm dark:border-[#3c3429] dark:bg-[#1c1814]">
					<div class="flex flex-wrap gap-2">
						<button v-for="option in [{ value: 'all', label: copy.all }, { value: 'unread', label: copy.unread }]" :key="option.value" type="button" class="rounded-md px-3 py-2 text-sm font-medium transition" :class="status === option.value ? 'bg-emerald-500 text-white' : 'bg-neutral-100 text-stone-600 hover:bg-emerald-50 dark:bg-[#28221c] dark:text-stone-300 dark:hover:bg-emerald-500/10'" @click="status = option.value as typeof status">
							{{ option.label }}
						</button>
					</div>
					<div class="flex flex-wrap gap-2">
						<button v-for="option in [{ value: 'all', label: copy.all }, { value: 'stock', label: copy.stock }, { value: 'promotion', label: copy.promotion }]" :key="option.value" type="button" class="rounded-md px-3 py-2 text-sm font-medium transition" :class="topic === option.value ? 'bg-stone-800 text-white dark:bg-stone-100 dark:text-stone-900' : 'bg-neutral-100 text-stone-600 hover:bg-neutral-200 dark:bg-[#28221c] dark:text-stone-300'" @click="topic = option.value as typeof topic">
							{{ option.label }}
						</button>
					</div>
				</div>

				<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300">{{ error }}</div>

				<div v-if="center.pending.value && !center.items.value.length" class="grid gap-3">
					<USkeleton v-for="index in 4" :key="index" class="h-28 rounded-md" />
				</div>
				<div v-else-if="!center.items.value.length" class="rounded-md border border-dashed border-neutral-300 bg-white px-5 py-16 text-center dark:border-[#4a4034] dark:bg-[#1c1814]">
					<UIcon name="i-heroicons-bell-slash" class="mx-auto h-10 w-10 text-stone-300 dark:text-stone-600" />
					<p class="mt-3 text-sm text-stone-500">{{ copy.empty }}</p>
				</div>
				<div v-else class="grid gap-3">
					<article v-for="item in center.items.value" :key="item.id" class="rounded-md border bg-white p-4 shadow-sm transition dark:bg-[#1c1814]" :class="[item.is_read ? 'border-neutral-200 opacity-75 dark:border-[#3c3429]' : item.severity === 'critical' ? 'border-rose-200 dark:border-rose-400/30' : 'border-amber-200 dark:border-amber-400/30']">
						<div class="flex items-start gap-3">
							<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md" :class="item.severity === 'critical' ? 'bg-rose-50 text-rose-600 dark:bg-rose-500/10 dark:text-rose-300' : 'bg-amber-50 text-amber-600 dark:bg-amber-500/10 dark:text-amber-300'">
								<UIcon :name="item.topic === 'stock' ? 'i-heroicons-cube' : 'i-heroicons-gift'" class="h-5 w-5" />
							</div>
							<div class="min-w-0 flex-1">
								<div class="flex flex-wrap items-center gap-2">
									<h2 class="text-sm font-semibold text-stone-950 dark:text-stone-100">{{ title(item) }}</h2>
									<span v-if="!item.is_read" class="h-2 w-2 rounded-full bg-emerald-500" />
								</div>
								<p class="mt-1 text-sm font-medium text-stone-700 dark:text-stone-300">{{ item.payload.name || item.payload.sku || "-" }}</p>
								<p v-if="item.topic === 'stock'" class="mt-1 text-xs text-stone-500">
									{{ copy.available }} {{ item.payload.available_base ?? 0 }} · {{ copy.threshold }} {{ item.payload.threshold ?? 0 }}
								</p>
								<p v-else class="mt-1 text-xs text-stone-500">{{ copy.ends }} {{ formatDate(item.payload.ends_at || item.due_date) }}</p>
								<p class="mt-2 text-[11px] text-stone-400">{{ formatDate(item.last_detected_at) }}</p>
							</div>
							<div class="flex shrink-0 flex-col gap-2 sm:flex-row">
								<AppButton v-if="!item.is_read" color="neutral" variant="soft" size="sm" icon="i-heroicons-check" :title="copy.read" @click="markRead(item)" />
								<AppButton color="primary" variant="solid" size="sm" icon="i-heroicons-arrow-top-right-on-square" class="shadow-sm ring-1 ring-emerald-600/20" @click="openItem(item)">{{ copy.open }}</AppButton>
							</div>
						</div>
					</article>
				</div>

				<div class="flex gap-2 md:hidden">
					<AppButton class="flex-1 justify-center" color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="center.pending.value" @click="load">{{ copy.reload }}</AppButton>
					<AppButton class="flex-1 justify-center shadow-sm ring-1 ring-emerald-600/20" color="primary" variant="solid" icon="i-heroicons-check" :disabled="center.unreadCount.value === 0" @click="markAllRead">{{ copy.allRead }}</AppButton>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
