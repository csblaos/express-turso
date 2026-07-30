<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type StoreRecord = {
	id: string;
	name: string;
	logo_name: string | null;
	logo_url: string | null;
	address: string | null;
	phone_number: string | null;
};

const { apiFetch } = useApiClient();
const { locale } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const toast = useAppToast();

const copy = computed(() => {
	if (locale.value === "lo") return {
		settings: "ຕັ້ງຄ່າ", title: "ຂໍ້ມູນຮ້ານ", description: "ແກ້ໄຂຊື່ ໂລໂກ້ ທີ່ຢູ່ ແລະ ເບີໂທຂອງຮ້ານ",
		storeName: "ຊື່ຮ້ານ", storeNameHint: "ຊື່ນີ້ຈະສະແດງໃນລະບົບ ແລະ ເອກະສານ", logoUrl: "ລິ້ງໂລໂກ້", logoUrlHint: "ໃຊ້ລິ້ງ HTTPS ຂອງຮູບໂລໂກ້", address: "ທີ່ຢູ່", phone: "ເບີໂທ",
		preview: "ຕົວຢ່າງ", noLogo: "ຍັງບໍ່ມີໂລໂກ້", reload: "ໂຫຼດໃໝ່", save: "ບັນທຶກ", saving: "ກຳລັງບັນທຶກ", saved: "ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ",
		loadFailed: "ໂຫຼດຂໍ້ມູນຮ້ານບໍ່ສຳເລັດ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ", nameRequired: "ກະລຸນາລະບຸຊື່ຮ້ານ", noPermission: "ທ່ານບໍ່ມີສິດແກ້ໄຂຮ້ານນີ້",
	};
	if (locale.value === "th") return {
		settings: "ตั้งค่า", title: "ข้อมูลร้าน", description: "แก้ไขชื่อ โลโก้ ที่อยู่ และเบอร์โทรของร้าน",
		storeName: "ชื่อร้าน", storeNameHint: "ชื่อนี้จะแสดงในระบบและเอกสาร", logoUrl: "ลิงก์โลโก้", logoUrlHint: "ใช้ลิงก์ HTTPS ของรูปโลโก้", address: "ที่อยู่", phone: "เบอร์โทร",
		preview: "ตัวอย่าง", noLogo: "ยังไม่มีโลโก้", reload: "โหลดใหม่", save: "บันทึก", saving: "กำลังบันทึก", saved: "บันทึกข้อมูลร้านแล้ว",
		loadFailed: "โหลดข้อมูลร้านไม่สำเร็จ", saveFailed: "บันทึกไม่สำเร็จ", nameRequired: "กรุณาระบุชื่อร้าน", noPermission: "คุณไม่มีสิทธิ์แก้ไขร้านนี้",
	};
	return {
		settings: "Settings", title: "Store information", description: "Edit the store name, logo, address, and phone number",
		storeName: "Store name", storeNameHint: "This name appears across the system and documents", logoUrl: "Logo URL", logoUrlHint: "Use an HTTPS URL for the store logo", address: "Address", phone: "Phone",
		preview: "Preview", noLogo: "No logo yet", reload: "Reload", save: "Save", saving: "Saving", saved: "Store information saved",
		loadFailed: "Could not load store information", saveFailed: "Could not save", nameRequired: "Store name is required", noPermission: "You do not have permission to update this store",
	};
});

const storeId = computed(() => currentStoreId.value || currentAccess.value?.store_id || currentAccess.value?.memberships?.[0]?.store_id || "");
const elevated = computed(() => currentUser.value?.systemRole === "superadmin" || currentUser.value?.systemRole === "system_admin");
const canUpdate = computed(() => elevated.value || can("settings.store.update"));
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const initial = ref("");
const form = reactive({ name: "", logoUrl: "", address: "", phone: "" });

const snapshot = computed(() => JSON.stringify({
	name: form.name.trim(),
	logo_url: form.logoUrl.trim(),
	address: form.address.trim(),
	phone_number: form.phone.trim(),
}));
const hasChanges = computed(() => snapshot.value !== initial.value);
const canSave = computed(() => canUpdate.value && Boolean(storeId.value) && Boolean(form.name.trim()) && hasChanges.value && !loading.value);

function hydrate(store: StoreRecord) {
	form.name = store.name || "";
	form.logoUrl = store.logo_url || "";
	form.address = store.address || "";
	form.phone = store.phone_number || "";
	initial.value = snapshot.value;
}

async function load() {
	if (!storeId.value) return;
	loading.value = true;
	error.value = "";
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(storeId.value)}`);
		hydrate(response.data);
	} catch (cause) {
		error.value = resolveApiErrorMessage(cause, copy.value.loadFailed);
	} finally {
		loading.value = false;
	}
}

async function save() {
	if (!form.name.trim()) {
		error.value = copy.value.nameRequired;
		return;
	}
	if (!canSave.value || saving.value) return;
	saving.value = true;
	error.value = "";
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(storeId.value)}`, {
			method: "PUT",
			body: {
				name: form.name.trim(),
				logo_name: form.name.trim(),
				logo_url: form.logoUrl.trim() || null,
				address: form.address.trim() || null,
				phone_number: form.phone.trim() || null,
			},
		});
		hydrate(response.data);
		toast.success({ title: copy.value.saved });
	} catch (cause) {
		error.value = resolveApiErrorMessage(cause, copy.value.saveFailed);
		toast.error({ title: copy.value.saveFailed, description: error.value });
	} finally {
		saving.value = false;
	}
}

watch(storeId, (value) => { if (value) void load(); }, { immediate: true });
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="copy.settings"
		:sidebar-title="copy.title"
		sidebar-compact-title="SHOP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-4">
				<AppPageHeader :description="copy.description" :title-badge="false" compact @menu="openSidebar">
					<div class="ml-auto hidden gap-2 md:flex">
						<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="loading" :disabled="loading" @click="load">
							{{ copy.reload }}
						</AppButton>
						<AppButton color="primary" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canSave" @click="save">
							{{ saving ? copy.saving : copy.save }}
						</AppButton>
					</div>
				</AppPageHeader>

				<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300">
					{{ error }}
				</div>
				<div v-else-if="!canUpdate && !loading" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
					{{ copy.noPermission }}
				</div>

				<div class="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
					<UCard class="rounded-md ring-1 ring-neutral-200 dark:bg-[#1c1814] dark:ring-[#3c3429]">
						<div class="space-y-5">
							<label class="block">
								<span class="text-sm font-medium text-stone-800 dark:text-stone-200">{{ copy.storeName }}</span>
								<input v-model="form.name" type="text" maxlength="120" :disabled="loading || !canUpdate" class="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-emerald-500 dark:border-[#4a4034] dark:bg-[#17130f] dark:text-stone-100">
								<span class="mt-1.5 block text-xs text-stone-500">{{ copy.storeNameHint }}</span>
							</label>
							<label class="block">
								<span class="text-sm font-medium text-stone-800 dark:text-stone-200">{{ copy.logoUrl }}</span>
								<input v-model="form.logoUrl" type="url" maxlength="1000" placeholder="https://..." :disabled="loading || !canUpdate" class="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-emerald-500 dark:border-[#4a4034] dark:bg-[#17130f] dark:text-stone-100">
								<span class="mt-1.5 block text-xs text-stone-500">{{ copy.logoUrlHint }}</span>
							</label>
							<div class="grid gap-4 sm:grid-cols-2">
								<label class="block">
									<span class="text-sm font-medium text-stone-800 dark:text-stone-200">{{ copy.phone }}</span>
									<input v-model="form.phone" type="tel" maxlength="40" :disabled="loading || !canUpdate" class="mt-2 w-full rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-emerald-500 dark:border-[#4a4034] dark:bg-[#17130f] dark:text-stone-100">
								</label>
								<label class="block">
									<span class="text-sm font-medium text-stone-800 dark:text-stone-200">{{ copy.address }}</span>
									<textarea v-model="form.address" rows="3" maxlength="500" :disabled="loading || !canUpdate" class="mt-2 w-full resize-none rounded-md border border-neutral-300 bg-white px-3 py-2.5 text-sm text-stone-950 outline-none focus:border-emerald-500 dark:border-[#4a4034] dark:bg-[#17130f] dark:text-stone-100" />
								</label>
							</div>
						</div>
					</UCard>

					<UCard class="rounded-md ring-1 ring-neutral-200 dark:bg-[#1c1814] dark:ring-[#3c3429]">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.preview }}</p>
						<div class="mt-5 flex min-h-52 flex-col items-center justify-center text-center">
							<img v-if="form.logoUrl" :src="form.logoUrl" :alt="form.name" class="h-20 w-20 rounded-xl object-contain ring-1 ring-neutral-200 dark:ring-[#4a4034]">
							<div v-else class="flex h-20 w-20 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
								<UIcon name="i-heroicons-building-storefront" class="h-9 w-9" />
							</div>
							<h2 class="mt-4 text-lg font-semibold text-stone-950 dark:text-stone-100">{{ form.name || copy.noLogo }}</h2>
							<p v-if="form.phone" class="mt-1 text-sm text-stone-500">{{ form.phone }}</p>
							<p v-if="form.address" class="mt-2 whitespace-pre-line text-sm leading-6 text-stone-500">{{ form.address }}</p>
						</div>
					</UCard>
				</div>

				<div class="fixed inset-x-0 bottom-0 z-20 border-t border-neutral-200 bg-white/95 p-3 backdrop-blur md:hidden dark:border-[#3c3429] dark:bg-[#17130f]/95">
					<AppButton class="w-full justify-center" color="primary" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canSave" @click="save">
						{{ saving ? copy.saving : copy.save }}
					</AppButton>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
