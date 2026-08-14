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
const { locale } = useI18n();

const copy = computed(() => locale.value === "lo" ? {
	description: "ການຕັ້ງຄ່າກາງ ແລະ ການຄວບຄຸມລະດັບທຸລະກິດສຳລັບ Super Admin",
	reload: "ໂຫຼດໃໝ່", save: "ບັນທຶກ", businessLimit: "ຂີດຈຳກັດທຸລະກິດ", businessHint: "ກຳນົດຂີດຈຳກັດການໃຊ້ງານໃຫ້ມາດຕະຖານດຽວກັນທຸກຮ້ານ", setting: "1 ການຕັ້ງຄ່າ", maxPaymentAccounts: "ຈຳນວນບັນຊີຮັບເງິນສູງສຸດຕໍ່ຮ້ານ", loading: "ກຳລັງໂຫຼດການຕັ້ງຄ່າກາງ…", unsaved: "ມີການປ່ຽນແປງທີ່ຍັງບໍ່ໄດ້ບັນທຶກ", current: "ການຕັ້ງຄ່າກາງເປັນລຸ້ນລ່າສຸດແລ້ວ", loadFailed: "ໂຫຼດການຕັ້ງຄ່າກາງບໍ່ສຳເລັດ", saved: "ບັນທຶກການຕັ້ງຄ່າກາງແລ້ວ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ"
} : locale.value === "en" ? {
	description: "Global configuration and business-level controls for Super Admin.", reload: "Reload", save: "Save", businessLimit: "Business limits", businessHint: "Set consistent business usage limits for every store.", setting: "1 setting", maxPaymentAccounts: "Maximum receiving accounts per store", loading: "Loading global configuration…", unsaved: "There are unsaved changes", current: "Global configuration is up to date", loadFailed: "Unable to load global configuration", saved: "Global configuration saved", saveFailed: "Unable to save"
} : {
	description: "Global config และ business-level controls ของฝั่ง Super Admin", reload: "รีโหลด", save: "บันทึก", businessLimit: "ข้อจำกัดธุรกิจ", businessHint: "กำหนดข้อจำกัดการใช้งานฝั่งธุรกิจให้คงมาตรฐานเดียวกันทุกร้าน", setting: "1 การตั้งค่า", maxPaymentAccounts: "จำนวนบัญชีรับเงินสูงสุดต่อร้าน", loading: "กำลังโหลด global config…", unsaved: "มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก", current: "Global Config เป็นเวอร์ชันล่าสุดแล้ว", loadFailed: "โหลด global config ไม่สำเร็จ", saved: "บันทึก Global Config แล้ว", saveFailed: "บันทึกไม่สำเร็จ"
});

const pending = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const toast = ref("");
const maxAccountsPerStore = ref<number | null>(null);
const baselineMaxAccountsPerStore = ref<number | null>(null);
const canManageSystem = computed(() => (
	can("system_admin.config.update")
	|| can("superadmin.manage")
));
const hasChanges = computed(() => (
	baselineMaxAccountsPerStore.value !== null
	&& maxAccountsPerStore.value !== null
	&& maxAccountsPerStore.value !== baselineMaxAccountsPerStore.value
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
		error.value = err instanceof Error ? err.message : copy.value.loadFailed;
	} finally {
		pending.value = false;
	}
}

async function saveConfig() {
	saving.value = true;
	try {
		if (maxAccountsPerStore.value === null) return;
		await apiFetch("/superadmin/config", {
			method: "PUT",
			body: {
				payment_max_accounts_per_store: Number(maxAccountsPerStore.value),
			},
		});
		baselineMaxAccountsPerStore.value = maxAccountsPerStore.value;
		setToast(copy.value.saved);
	} catch (err) {
		setToast(err instanceof Error ? err.message : copy.value.saveFailed);
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
		sidebar-eyebrow="Super Admin"
		sidebar-title="Super Admin"
		sidebar-compact-title="SUP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					class="hidden md:block"
					title=""
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 pt-0.5 md:flex md:w-auto">
							<div class="flex w-full flex-wrap justify-end gap-2 md:w-auto">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadConfig">{{ copy.reload }}</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges || maxAccountsPerStore === null" :spin-icon-on-loading="true" @click="saveConfig">{{ copy.save }}</AppButton>
							</div>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="relative shrink-0">
								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
									<div>
										<p class="text-sm font-semibold text-stone-950">{{ copy.businessLimit }}</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.businessHint }}</p>
									</div>
									<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
										{{ copy.setting }}
									</div>
								</div>

								<div v-if="pending" class="pointer-events-none absolute inset-x-0 -bottom-px z-10">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div v-if="error && baselineMaxAccountsPerStore === null" class="min-h-[260px] p-4">
									<div class="rounded-md border border-dashed border-[#f1c7c0] bg-[#fff7f5] py-10 text-center text-stone-500">
										{{ error }}
									</div>
								</div>
								<div v-else class="space-y-4 p-4">

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-start justify-between gap-3">
											<div>
												<p class="text-xs font-medium text-stone-500">{{ copy.maxPaymentAccounts }}</p>
												<p class="mt-1 text-sm text-stone-500">{{ copy.maxPaymentAccounts }}</p>
											</div>
											<div class="rounded-md bg-white px-3 py-2 text-sm font-semibold text-stone-900 ring-1 ring-neutral-200">
												{{ pending || maxAccountsPerStore === null ? "-" : maxAccountsPerStore }}
											</div>
										</div>
										<div class="mt-3">
											<input
												v-model.number="maxAccountsPerStore"
												type="number"
												min="1"
												:disabled="pending"
												:placeholder="pending ? '-' : '1'"
												class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											>
										</div>
									</div>
								</div>
							</div>

							<div class="fixed inset-x-0 bottom-0 z-[70] border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm md:hidden">
								<div class="mx-auto flex w-full max-w-3xl flex-col gap-2.5">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
										<span v-if="pending">{{ copy.loading }}</span>
										<span v-else-if="hasChanges">{{ copy.unsaved }}</span>
										<span v-else>{{ copy.current }}</span>
									</div>

									<div class="grid w-full grid-cols-2 gap-2">
									<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadConfig">
										{{ copy.reload }}
									</AppButton>
									<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges" :spin-icon-on-loading="true" :block="true" @click="saveConfig">
										{{ copy.save }}
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
