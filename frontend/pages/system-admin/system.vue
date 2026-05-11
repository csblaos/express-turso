<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type ApiSystemConfig = {
	id: string;
	default_can_create_branches: number;
	default_max_branches_per_store: number | null;
	created_at: string;
	updated_at: string;
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
	defaultCanCreateBranches: true,
	defaultMaxBranchesPerStore: "5",
	defaultSessionLimit: 3,
	storeLogoMaxSizeMb: 5,
	storeLogoAutoResize: true,
	storeLogoResizeMaxWidth: 1200,
	appLatestBuild: 1,
	appMinRequiredBuild: 1,
	appUpdateMessage: "",
});
const sectionCount = 3;
let toastTimer: ReturnType<typeof setTimeout> | null = null;
function setToast(message: string) {
	toast.value = message;
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => { toast.value = ""; }, 2200);
}
function apply(data: ApiSystemConfig) {
	form.defaultCanCreateBranches = Boolean(data.default_can_create_branches);
	form.defaultMaxBranchesPerStore = data.default_max_branches_per_store === null ? "" : String(data.default_max_branches_per_store);
	form.defaultSessionLimit = data.default_session_limit;
	form.storeLogoMaxSizeMb = data.store_logo_max_size_mb;
	form.storeLogoAutoResize = Boolean(data.store_logo_auto_resize);
	form.storeLogoResizeMaxWidth = data.store_logo_resize_max_width;
	form.appLatestBuild = data.app_latest_build;
	form.appMinRequiredBuild = data.app_min_required_build;
	form.appUpdateMessage = data.app_update_message || "";
	initialState.value = currentState.value;
}
const currentState = computed(() => JSON.stringify({
	defaultCanCreateBranches: form.defaultCanCreateBranches,
	defaultMaxBranchesPerStore: form.defaultMaxBranchesPerStore,
	defaultSessionLimit: form.defaultSessionLimit,
	storeLogoMaxSizeMb: form.storeLogoMaxSizeMb,
	storeLogoAutoResize: form.storeLogoAutoResize,
	storeLogoResizeMaxWidth: form.storeLogoResizeMaxWidth,
	appLatestBuild: form.appLatestBuild,
	appMinRequiredBuild: form.appMinRequiredBuild,
	appUpdateMessage: form.appUpdateMessage,
}));
const hasChanges = computed(() => initialState.value !== "" && currentState.value !== initialState.value);
async function loadConfig() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/system-admin/config");
		apply(response.data);
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "โหลด policy ไม่สำเร็จ", {
			forbiddenMessage: "บัญชีนี้ไม่มีสิทธิ์ดู System Policy",
		});
	} finally {
		pending.value = false;
	}
}
async function saveConfig() {
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<ApiSystemConfig>>("/system-admin/config", {
			method: "PUT",
			body: {
				default_can_create_branches: form.defaultCanCreateBranches ? 1 : 0,
				default_max_branches_per_store: form.defaultMaxBranchesPerStore.trim() === "" ? null : Number(form.defaultMaxBranchesPerStore),
				default_session_limit: Number(form.defaultSessionLimit),
				store_logo_max_size_mb: Number(form.storeLogoMaxSizeMb),
				store_logo_auto_resize: form.storeLogoAutoResize ? 1 : 0,
				store_logo_resize_max_width: Number(form.storeLogoResizeMaxWidth),
				app_latest_build: Number(form.appLatestBuild),
				app_min_required_build: Number(form.appMinRequiredBuild),
				app_update_message: form.appUpdateMessage.trim() || null,
			},
		});
		initialState.value = currentState.value;
		setToast("บันทึก System policy แล้ว");
	} catch (err) {
		setToast(resolveApiErrorMessage(err, "บันทึกไม่สำเร็จ", {
			forbiddenMessage: "บัญชีนี้ไม่มีสิทธิ์บันทึก System Policy",
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
			sidebar-eyebrow="System"
			sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="branch policy, session policy และ store logo policy ของแพลตฟอร์ม"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="System Policy"
					description="หน้าตั้งค่านโยบายระบบกลาง เช่น branch policy, session policy และ logo policy"
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
									<p class="text-sm font-semibold text-stone-950">System policy</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ตั้งค่า branch policy, session policy, logo policy และ build requirement ของแพลตฟอร์มจากมุมมองเดียว</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ sectionCount }} sections
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
								<div v-else class="grid gap-4 p-4 xl:grid-cols-2">
									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Branch policy</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">กำหนด default permission และ branch quota สำหรับร้านที่ถูกสร้างใหม่บนแพลตฟอร์ม</p>
											</div>
											<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
												<input v-model="form.defaultCanCreateBranches" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
												<div>
													<p class="text-sm font-medium text-stone-900">อนุญาตให้ร้านใหม่สร้างสาขาได้</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">ใช้เป็น policy กลางของ platform</p>
												</div>
											</label>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">จำนวนสาขาสูงสุดต่อร้าน</label>
												<input v-model="form.defaultMaxBranchesPerStore" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Session & logo policy</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ควบคุม session เริ่มต้นและข้อกำหนดของ store logo เพื่อให้ onboarding ร้านใหม่คงมาตรฐาน</p>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน session เริ่มต้น</label>
												<input v-model.number="form.defaultSessionLimit" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
											</div>
											<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
												<input v-model="form.storeLogoAutoResize" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
												<div>
													<p class="text-sm font-medium text-stone-900">ปรับขนาดโลโก้อัตโนมัติ</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">ใช้เป็น store logo policy กลาง</p>
												</div>
											</label>
											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ขนาดไฟล์สูงสุด (MB)</label>
													<input v-model.number="form.storeLogoMaxSizeMb" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ความกว้างสูงสุดหลัง resize</label>
													<input v-model.number="form.storeLogoResizeMaxWidth" type="number" min="320" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Build policy</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ตั้ง latest build, minimum build ที่ต้องใช้ และข้อความแจ้งเตือนเมื่อบังคับให้อัปเดตแอป</p>
											</div>
											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Latest build</label>
													<input v-model.number="form.appLatestBuild" type="number" min="0" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Min required build</label>
													<input v-model.number="form.appMinRequiredBuild" type="number" min="0" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
												</div>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">ข้อความแจ้งเตือนการอัปเดต</label>
												<textarea v-model="form.appUpdateMessage" rows="4" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200" />
											</div>
										</div>
									</UCard>
								</div>
							</div>

								<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
									<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span v-if="pending">กำลังโหลด System policy…</span>
											<span v-else-if="hasChanges">มีการเปลี่ยนแปลงที่ยังไม่ได้บันทึก</span>
											<span v-else>นโยบายระบบเป็นเวอร์ชันล่าสุดแล้ว</span>
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
