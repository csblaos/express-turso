<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type ApiSystemConfig = {
	id: string;
	payment_max_accounts_per_store: number;
	updated_at: string;
};
const { apiFetch } = useApiClient();
const { can } = useAuthSession();
const pending = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const toast = ref("");
const maxAccountsPerStore = ref(5);
const canManageSystem = computed(() => can("system_admin.manage"));
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function setToast(message: string) {
	toast.value = message;
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { toast.value = ""; }, 2200);
}
async function loadConfig() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/settings");
		maxAccountsPerStore.value = response.data.payment_max_accounts_per_store;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด global config ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}
async function saveConfig() {
	saving.value = true;
	try {
		await apiFetch("/settings", {
			method: "PUT",
			body: {
				payment_max_accounts_per_store: Number(maxAccountsPerStore.value),
			},
		});
		setToast("บันทึก Global Config แล้ว");
	} catch (err) {
		setToast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
	} finally {
		saving.value = false;
	}
}
onMounted(loadConfig);
onBeforeUnmount(() => { if (toastTimer) clearTimeout(toastTimer); });
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="global config และ business-level controls ของฝั่ง superadmin"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader title="Superadmin Global Config" description="ตั้งค่ากลางของระบบฝั่ง superadmin โดยรอบนี้โฟกัสที่ `maxAccountsPerStore` ก่อนตามเอกสาร" @menu="openSidebar">
					<template #badges>
						<NuxtLink to="/settings"><UBadge color="neutral" variant="soft" label="Settings" /></NuxtLink>
						<NuxtLink to="/superadmin"><UBadge color="neutral" variant="soft" label="Superadmin" /></NuxtLink>
						<UBadge color="primary" variant="soft" label="Global Config" />
					</template>

					<template #actions>
						<AppButton color="neutral" variant="soft" size="lg" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadConfig">รีโหลด</AppButton>
						<UButton color="primary" variant="solid" size="lg" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem" @click="saveConfig">บันทึก</UButton>
					</template>
				</AppPageHeader>
				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<UCard v-if="pending" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"><div class="py-10 text-center text-stone-500">กำลังโหลด global config…</div></UCard>
					<UCard v-else-if="error" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"><div class="py-10 text-center text-stone-500">{{ error }}</div></UCard>
					<UCard v-else class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
						<div class="space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Business limit</p>
								<h2 class="mt-2 text-lg font-semibold text-stone-950">จำนวนบัญชีรับเงินสูงสุดต่อร้าน</h2>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">maxAccountsPerStore</label>
								<input v-model.number="maxAccountsPerStore" type="number" min="1" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
							</div>
						</div>
					</UCard>
				</div>
			</div>
			<Transition enter-active-class="transition duration-200 ease-out" enter-from-class="translate-y-3 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-3 opacity-0">
				<div v-if="toast" class="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-[#1f1c18] px-4 py-3 text-sm font-medium text-white shadow-xl">{{ toast }}</div>
			</Transition>
		</template>
	</AppSidebarShell>
</template>
