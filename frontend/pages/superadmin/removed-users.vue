<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type AuditEvent = {
	id: string;
	store_id: string | null;
	actor_name: string | null;
	action: string;
	metadata: unknown;
	before: unknown;
	occurred_at: string;
};
type AuditResult = { items: AuditEvent[]; total: number };
type StoreRecord = { id: string; name: string };
type RemovedUser = { id: string; name: string; email: string; role: string; storeName: string; removedAt: string; removedBy: string };

const { apiFetch } = useApiClient();
const { t, locale } = useI18n();
const pending = ref(true);
const error = ref<string | null>(null);
const query = ref("");
const events = ref<AuditEvent[]>([]);
const storeNames = ref<Record<string, string>>({});

const copy = computed(() => locale.value === "lo" ? {
	title: "ຜູ້ໃຊ້ທີ່ນຳອອກແລ້ວ", description: "ປະຫວັດຜູ້ໃຊ້ທີ່ຖືກນຳອອກຈາກຮ້ານນີ້", search: "ຄົ້ນຫາຊື່ ຫຼື ອີເມວ", user: "ຜູ້ໃຊ້", role: "ບົດບາດເດີມ", store: "ຮ້ານເດີມ", removedAt: "ນຳອອກເມື່ອ", removedBy: "ດຳເນີນການໂດຍ", empty: "ຍັງບໍ່ມີຜູ້ໃຊ້ທີ່ຖືກນຳອອກ", reload: "ໂຫຼດໃໝ່",
} : locale.value === "th" ? {
	title: "ผู้ใช้ที่นำออกแล้ว", description: "ประวัติผู้ใช้ที่ถูกนำออกจากร้านนี้", search: "ค้นหาชื่อหรืออีเมล", user: "ผู้ใช้", role: "บทบาทเดิม", store: "ร้านเดิม", removedAt: "นำออกเมื่อ", removedBy: "ดำเนินการโดย", empty: "ยังไม่มีผู้ใช้ที่ถูกนำออก", reload: "โหลดใหม่",
} : {
	title: "Removed users", description: "History of users removed from this store", search: "Search name or email", user: "User", role: "Previous role", store: "Previous store", removedAt: "Removed at", removedBy: "Removed by", empty: "No removed users yet", reload: "Reload",
});

function asRecord(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
const removedUsers = computed<RemovedUser[]>(() => events.value.map((event) => {
	const before = asRecord(event.before);
	const metadata = asRecord(event.metadata);
	const storedStoreName = String(metadata.store_name || "").trim();
	return {
		id: event.id,
		name: String(before.name || before.user_name || "-"),
		email: String(before.email || "-"),
		role: String(before.role_name || "-"),
		storeName: storedStoreName || storeNames.value[event.store_id || ""] || "-",
		removedAt: event.occurred_at,
		removedBy: event.actor_name || "-",
	};
}).filter((item) => `${item.name} ${item.email} ${item.storeName}`.toLowerCase().includes(query.value.trim().toLowerCase())));

async function load() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<AuditResult>>("/audit-events?entity_type=store_member&query=delete_store_member&limit=100");
		events.value = response.data.items.filter((event) => event.action === "delete_store_member");
		const stores = await apiFetch<ApiEnvelope<StoreRecord[]>>("/superadmin/stores").catch(() => null);
		storeNames.value = Object.fromEntries((stores?.data || []).map((store) => [ store.id, store.name ]));
	} catch {
		error.value = "Unable to load removed-user history.";
	} finally { pending.value = false; }
}

onMounted(load);
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['superadmin']" sidebar-eyebrow="Super Admin" :sidebar-title="copy.title" sidebar-compact-title="USR" :sidebar-description="copy.description">
		<div class="space-y-4">
			<AppPageHeader :title="copy.title" :description="copy.description" :title-badge="false" compact body-class="px-3 py-2.5 sm:px-4 sm:py-3">
				<template #actions><AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" @click="load">{{ copy.reload }}</AppButton></template>
			</AppPageHeader>
			<UCard class="rounded-md">
				<div class="mb-4"><UInput v-model="query" :placeholder="copy.search" icon="i-heroicons-magnifying-glass-20-solid" /></div>
				<div v-if="pending" class="space-y-2"><USkeleton v-for="index in 3" :key="index" class="h-14 w-full" /></div>
				<div v-else-if="error" class="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">{{ error }}</div>
				<div v-else-if="!removedUsers.length" class="rounded-md border border-dashed border-neutral-300 p-8 text-center text-sm text-stone-500">{{ copy.empty }}</div>
				<div v-else class="overflow-x-auto"><table class="w-full min-w-[840px] text-left text-sm"><thead class="border-b border-neutral-200 text-xs text-stone-500"><tr><th class="px-3 py-3">{{ copy.user }}</th><th class="px-3 py-3">{{ copy.role }}</th><th class="px-3 py-3">{{ copy.store }}</th><th class="px-3 py-3">{{ copy.removedAt }}</th><th class="px-3 py-3">{{ copy.removedBy }}</th></tr></thead><tbody><tr v-for="item in removedUsers" :key="item.id" class="border-b border-neutral-100"><td class="px-3 py-3"><p class="font-semibold text-stone-900">{{ item.name }}</p><p class="mt-0.5 text-xs text-stone-500">{{ item.email }}</p></td><td class="px-3 py-3">{{ item.role }}</td><td class="px-3 py-3">{{ item.storeName }}</td><td class="px-3 py-3">{{ formatAppDateTime(item.removedAt, locale) }}</td><td class="px-3 py-3">{{ item.removedBy }}</td></tr></tbody></table></div>
			</UCard>
		</div>
	</AppSidebarShell>
</template>
