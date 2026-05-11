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
const baselineMaxAccountsPerStore = ref<number | null>(null);
const canManageSystem = computed(() => (
	can("system_admin.config.update")
	|| can("superadmin.manage")
));
const hasChanges = computed(() => (
	baselineMaxAccountsPerStore.value !== null && maxAccountsPerStore.value !== baselineMaxAccountsPerStore.value
));

let toastTimer: ReturnType<typeof setTimeout> | null = null;

function setToast(message: string) {
	toast.value = message;
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toast.value = "";
	}, 2200);
}

async function loadConfig() {
	pending.value = true;
	error.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/superadmin/config");
		maxAccountsPerStore.value = response.data.payment_max_accounts_per_store;
		baselineMaxAccountsPerStore.value = response.data.payment_max_accounts_per_store;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด global config ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}

async function saveConfig() {
	saving.value = true;
	try {
		await apiFetch("/superadmin/config", {
			method: "PUT",
			body: {
				payment_max_accounts_per_store: Number(maxAccountsPerStore.value),
			},
		});
		baselineMaxAccountsPerStore.value = maxAccountsPerStore.value;
		setToast("บันทึก Global Config แล้ว");
	} catch (err) {
		setToast(err instanceof Error ? err.message : "บันทึกไม่สำเร็จ");
	} finally {
		saving.value = false;
	}
}

onMounted(loadConfig);
onBeforeUnmount(() => {
	if (toastTimer) clearTimeout(toastTimer);
});
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
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Superadmin Global Config"
					description="ตั้งค่ากลางของระบบฝั่ง superadmin โดยรอบนี้โฟกัสที่ max accounts per store"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 lg:flex lg:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadConfig">รีโหลด</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges" :spin-icon-on-loading="true" @click="saveConfig">บันทึก</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Business limit</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">กำหนดข้อจำกัดการใช้งานฝั่งธุรกิจให้คงมาตรฐานเดียวกันทุกร้าน</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									1 setting
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div v-if="pending" class="min-h-[260px] p-4">
									<div class="rounded-md border border-dashed border-[#d9d5cd] bg-[#fbfbf8] py-10 text-center text-stone-500">
										กำลังโหลด global config…
									</div>
								</div>
								<div v-else-if="error" class="min-h-[260px] p-4">
									<div class="rounded-md border border-dashed border-[#f1c7c0] bg-[#fff7f5] py-10 text-center text-stone-500">
										{{ error }}
									</div>
								</div>
								<div v-else class="p-4">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<p class="text-xs font-medium text-stone-500">maxAccountsPerStore</p>
										<p class="mt-1 text-sm text-stone-500">จำนวนบัญชีรับเงินสูงสุดต่อร้าน</p>
										<div class="mt-3">
											<input
												v-model.number="maxAccountsPerStore"
												type="number"
												min="1"
												class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											>
										</div>
									</div>
								</div>
							</div>

							<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
								<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
										<span v-if="pending">กำลังโหลด Global Config…</span>
										<span v-else-if="hasChanges">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>
										<span v-else>Global Config เป็นเวอร์ชันล่าสุดแล้ว</span>
									</div>

									<div class="grid w-full grid-cols-2 gap-2">
										<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadConfig">
											รีโหลด
										</AppButton>
										<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges" :spin-icon-on-loading="true" :block="true" @click="saveConfig">
											บันทึก
										</AppButton>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<Transition enter-active-class="transition duration-200 ease-out" enter-from-class="translate-y-3 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-3 opacity-0">
					<div v-if="toast" class="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-md bg-[#1f1c18] px-4 py-3 text-sm font-medium text-white shadow-[0_12px_30px_rgba(31,28,24,0.18)]">{{ toast }}</div>
				</Transition>
			</div>
		</template>
	</AppSidebarShell>
</template>
