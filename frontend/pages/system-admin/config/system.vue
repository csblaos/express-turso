<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

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
const canManageSystem = computed(() => can("system_admin.manage"));
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
}
async function loadConfig() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<ApiSystemConfig>>("/settings");
		apply(response.data);
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด policy ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}
async function saveConfig() {
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<ApiSystemConfig>>("/settings", {
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
		setToast("บันทึก System policy แล้ว");
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
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="branch policy, session policy และ store logo policy ของแพลตฟอร์ม"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
						<div class="flex items-start gap-3">
							<UButton color="gray" variant="soft" size="lg" class="justify-center lg:hidden" icon="i-heroicons-bars-3-20-solid" aria-label="เปิดเมนู" title="เปิดเมนู" @click="openSidebar" />
							<div>
								<div class="flex flex-wrap items-center gap-2">
									<NuxtLink to="/system-admin"><UBadge color="gray" variant="soft" label="System Admin" /></NuxtLink>
									<NuxtLink to="/system-admin/config"><UBadge color="gray" variant="soft" label="Config" /></NuxtLink>
									<UBadge color="orange" variant="soft" label="System policy" />
								</div>
								<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">System Policy</h1>
								<p class="mt-1 text-sm text-stone-500">หน้าตั้งค่านโยบายระบบกลาง เช่น branch policy, session policy และ logo policy</p>
							</div>
						</div>
						<div class="flex gap-2">
							<UButton color="gray" variant="soft" size="lg" icon="i-heroicons-arrow-path-20-solid" @click="loadConfig">รีโหลด</UButton>
							<UButton color="orange" variant="solid" size="lg" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canManageSystem" @click="saveConfig">บันทึก</UButton>
						</div>
					</div>
				</UCard>
				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<UCard v-if="pending" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"><div class="py-10 text-center text-stone-500">กำลังโหลด policy…</div></UCard>
					<UCard v-else-if="error" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"><div class="py-10 text-center text-stone-500">{{ error }}</div></UCard>
					<div v-else class="grid gap-4 xl:grid-cols-2">
						<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
							<div class="space-y-4">
								<h2 class="text-lg font-semibold text-stone-950">Branch policy</h2>
								<label class="flex items-start gap-3 rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] p-4">
									<input v-model="form.defaultCanCreateBranches" type="checkbox" class="mt-1 h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#f3c7a7]">
									<div>
										<p class="text-sm font-medium text-stone-900">อนุญาตให้ร้านใหม่สร้างสาขาได้</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">ใช้เป็น policy กลางของ platform</p>
									</div>
								</label>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">จำนวนสาขาสูงสุดต่อร้าน</label>
									<input v-model="form.defaultMaxBranchesPerStore" type="number" min="1" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								</div>
							</div>
						</UCard>
						<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
							<div class="space-y-4">
								<h2 class="text-lg font-semibold text-stone-950">Session & logo policy</h2>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน session เริ่มต้น</label>
									<input v-model.number="form.defaultSessionLimit" type="number" min="1" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								</div>
								<label class="flex items-start gap-3 rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] p-4">
									<input v-model="form.storeLogoAutoResize" type="checkbox" class="mt-1 h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#f3c7a7]">
									<div>
										<p class="text-sm font-medium text-stone-900">ปรับขนาดโลโก้อัตโนมัติ</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">ใช้เป็น store logo policy กลาง</p>
									</div>
								</label>
								<div class="grid gap-4 sm:grid-cols-2">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ขนาดไฟล์สูงสุด (MB)</label>
										<input v-model.number="form.storeLogoMaxSizeMb" type="number" min="1" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">ความกว้างสูงสุดหลัง resize</label>
										<input v-model.number="form.storeLogoResizeMaxWidth" type="number" min="320" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
									</div>
								</div>
							</div>
						</UCard>
						<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] xl:col-span-2">
							<div class="space-y-4">
								<h2 class="text-lg font-semibold text-stone-950">Build policy</h2>
								<div class="grid gap-4 sm:grid-cols-2">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Latest build</label>
										<input v-model.number="form.appLatestBuild" type="number" min="0" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Min required build</label>
										<input v-model.number="form.appMinRequiredBuild" type="number" min="0" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
									</div>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">ข้อความแจ้งเตือนการอัปเดต</label>
									<textarea v-model="form.appUpdateMessage" rows="4" class="w-full resize-none rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]" />
								</div>
							</div>
						</UCard>
					</div>
				</div>
				<Transition enter-active-class="transition duration-200 ease-out" enter-from-class="translate-y-3 opacity-0" enter-to-class="translate-y-0 opacity-100" leave-active-class="transition duration-150 ease-in" leave-from-class="translate-y-0 opacity-100" leave-to-class="translate-y-3 opacity-0">
					<div v-if="toast" class="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-[#1f1c18] px-4 py-3 text-sm font-medium text-white shadow-xl">{{ toast }}</div>
				</Transition>
			</div>
		</template>
	</AppSidebarShell>
</template>
