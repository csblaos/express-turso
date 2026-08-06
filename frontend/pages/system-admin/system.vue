<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type ApiSystemConfig = {
	id: string;
	created_at: string;
	updated_at: string;
	default_max_users_per_store: number | null;
	default_session_limit: number;
	store_logo_max_size_mb: number;
	store_logo_auto_resize: number;
	store_logo_resize_max_width: number;
	payment_max_accounts_per_store: number;
	payment_require_slip_for_lao_qr: number;
	app_latest_build: number;
	app_min_required_build: number;
	app_update_message: string | null;
};
const { apiFetch } = useApiClient();
const { can } = useAuthSession();
const pending = ref(true);
const error = ref<string | null>(null);
const saving = ref(false);
const toast = ref("");
const canManageSystem = computed(() => can("system_admin.config.update"));
const initialState = ref("");
const form = reactive({
	defaultMaxUsersPerStore: "20",
	defaultSessionLimit: 3,
	storeLogoMaxSizeMb: 5,
	storeLogoAutoResize: true,
	storeLogoResizeMaxWidth: 1200,
});
const sectionCount = 1;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function setToast(message: string) {
	toast.value = message;
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { toast.value = ""; }, 2200);
}
function apply(data: ApiSystemConfig) {
	form.defaultMaxUsersPerStore = data.default_max_users_per_store === null ? "" : String(data.default_max_users_per_store);
	form.defaultSessionLimit = data.default_session_limit;
	form.storeLogoMaxSizeMb = data.store_logo_max_size_mb;
	form.storeLogoAutoResize = Boolean(data.store_logo_auto_resize);
	form.storeLogoResizeMaxWidth = data.store_logo_resize_max_width;
	initialState.value = currentState.value;
}
const currentState = computed(() => JSON.stringify({
	defaultMaxUsersPerStore: form.defaultMaxUsersPerStore,
	defaultSessionLimit: form.defaultSessionLimit,
	storeLogoMaxSizeMb: form.storeLogoMaxSizeMb,
	storeLogoAutoResize: form.storeLogoAutoResize,
	storeLogoResizeMaxWidth: form.storeLogoResizeMaxWidth,
}));
const hasChanges = computed(() => initialState.value !== "" && currentState.value !== initialState.value);
async function loadConfig() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/system-admin/config");
		apply(response.data);
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "ໂຫຼດນະໂຍບາຍລະບົບບໍ່ສຳເລັດ", {
			forbiddenMessage: "ບັນຊີນີ້ບໍ່ມີສິດເບິ່ງນະໂຍບາຍລະບົບ",
		});
	} finally {
		pending.value = false;
	}
}
async function saveConfig() {
	saving.value = true;
	try {
		const maxUsersPerStore = String(form.defaultMaxUsersPerStore ?? "").trim();
		await apiFetch<ApiEnvelope<ApiSystemConfig>>("/system-admin/config", {
		method: "PUT",
		body: {
			default_max_users_per_store: maxUsersPerStore === "" ? null : Number(maxUsersPerStore),
			default_session_limit: Number(form.defaultSessionLimit),
				store_logo_max_size_mb: Number(form.storeLogoMaxSizeMb),
				store_logo_auto_resize: form.storeLogoAutoResize ? 1 : 0,
				store_logo_resize_max_width: Number(form.storeLogoResizeMaxWidth),
			},
		});
		initialState.value = currentState.value;
		setToast("ບັນທຶກນະໂຍບາຍລະບົບແລ້ວ");
	} catch (err) {
		setToast(resolveApiErrorMessage(err, "ບັນທຶກບໍ່ສຳເລັດ", {
			forbiddenMessage: "ບັນຊີນີ້ບໍ່ມີສິດບັນທຶກນະໂຍບາຍລະບົບ",
		}));
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
			:active-ids="['system-policy']"
			sidebar-eyebrow="ລະບົບ"
			sidebar-title="ຜູ້ດູແລລະບົບ"
		sidebar-compact-title="SYS"
		sidebar-description="ນະໂຍບາຍ session ແລະ ໂລໂກ້ຮ້ານຂອງແພລດຟອມ"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
					<AppPageHeader
						title="ນະໂຍບາຍລະບົບ"
						description="ກຳນົດຄ່າກາງສຳລັບຮ້ານໃໝ່ໃນແພລດຟອມ"
						:title-badge="false"
						compact
						body-class="px-3 py-2.5 sm:px-4 sm:py-3"
						:tablet-layout="true"
					@menu="openSidebar"
				>

					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 lg:flex lg:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadConfig">ໂຫຼດໃໝ່</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges" :spin-icon-on-loading="true" @click="saveConfig">ບັນທຶກ</AppButton>
						</div>
					</template>
				</AppPageHeader>
					<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
						<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">ນະໂຍບາຍສຳລັບຮ້ານໃໝ່</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ຄວບຄຸມ session ແລະ ມາດຕະຖານໂລໂກ້ຈາກບ່ອນດຽວ</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ sectionCount }} ສ່ວນຕັ້ງຄ່າ
								</div>
							</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div v-if="pending" class="min-h-[320px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="system-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
								<div v-else-if="error" class="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-stone-500">
									{{ error }}
								</div>
								<div v-else class="grid gap-4 p-4">
									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-start gap-3">
												<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700 ring-1 ring-sky-100">
													<UIcon name="i-heroicons-identification-20-solid" class="h-5 w-5" />
												</div>
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Session ແລະ ໂລໂກ້ຮ້ານ</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ກຳນົດ session ເລີ່ມຕົ້ນ ແລະ ມາດຕະຖານໂລໂກ້ໃຫ້ຮ້ານໃໝ່</p>
												</div>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">ຈຳນວນຜູ້ໃຊ້ສູງສຸດຕໍ່ຮ້ານ</label>
												<input v-model="form.defaultMaxUsersPerStore" type="number" min="1" placeholder="20" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 placeholder:text-stone-400 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												<p class="mt-1.5 text-xs text-stone-500">ປ່ອຍວ່າງເພື່ອບໍ່ຈຳກັດ</p>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">ຈຳນວນ session ເລີ່ມຕົ້ນ</label>
												<input v-model.number="form.defaultSessionLimit" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
											</div>
											<label class="flex items-start gap-3 rounded-md border border-sky-100 bg-sky-50/40 p-4">
												<input v-model="form.storeLogoAutoResize" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
												<div>
													<p class="text-sm font-medium text-stone-900">ປັບຂະໜາດໂລໂກ້ອັດຕະໂນມັດ</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">ໃຊ້ເປັນນະໂຍບາຍກາງຂອງໂລໂກ້ຮ້ານ</p>
												</div>
											</label>
											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ຂະໜາດໄຟລ໌ສູງສຸດ (MB)</label>
													<input v-model.number="form.storeLogoMaxSizeMb" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ຄວາມກວ້າງສູງສຸດຫຼັງປັບຂະໜາດ</label>
													<input v-model.number="form.storeLogoResizeMaxWidth" type="number" min="320" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
											</div>
										</div>
									</UCard>
								</div>
							</div>

								<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
									<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span v-if="pending">ກຳລັງໂຫຼດນະໂຍບາຍລະບົບ…</span>
											<span v-else-if="hasChanges">ມີການປ່ຽນແປງທີ່ຍັງບໍ່ບັນທຶກ</span>
											<span v-else>ນະໂຍບາຍລະບົບເປັນຄ່າລ່າສຸດແລ້ວ</span>
										</div>

											<div class="grid w-full grid-cols-2 gap-2">
												<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadConfig">
													ໂຫຼດໃໝ່
												</AppButton>
												<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem || !hasChanges" :spin-icon-on-loading="true" :block="true" @click="saveConfig">
													ບັນທຶກ
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

<style scoped>
@keyframes system-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.system-loading-line {
	animation: system-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
