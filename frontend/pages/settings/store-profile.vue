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
const runtimeConfig = useRuntimeConfig();
const { locale } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const toast = useAppToast();

const copy = computed(() => {
	if (locale.value === "lo") return {
		settings: "ຕັ້ງຄ່າ", title: "ຂໍ້ມູນຮ້ານ", description: "ແກ້ໄຂຊື່ ໂລໂກ້ ທີ່ຢູ່ ແລະ ເບີໂທຂອງຮ້ານ",
		storeName: "ຊື່ຮ້ານ", storeNameHint: "ຊື່ນີ້ຈະສະແດງໃນລະບົບ ແລະ ເອກະສານ", logo: "ໂລໂກ້ຮ້ານ", logoHint: "ຮູບຈະຖືກຫຍໍ້ເປັນ WebP 640px ກ່ອນອັບໂຫຼດ", address: "ທີ່ຢູ່", phone: "ເບີໂທ",
		chooseImage: "ເລືອກຮູບ", changeImage: "ປ່ຽນຮູບ", removeImage: "ລຶບຮູບ", imageAdded: "ກຽມຮູບຮ້ານແລ້ວ", imageFailed: "ກຽມຮູບບໍ່ສຳເລັດ", contact: "ຂໍ້ມູນຕິດຕໍ່", identity: "ຂໍ້ມູນຮ້ານ",
		preview: "ຕົວຢ່າງ", noLogo: "ຍັງບໍ່ມີໂລໂກ້", reload: "ໂຫຼດໃໝ່", save: "ບັນທຶກ", saving: "ກຳລັງບັນທຶກ", saved: "ບັນທຶກຂໍ້ມູນຮ້ານແລ້ວ",
		loadFailed: "ໂຫຼດຂໍ້ມູນຮ້ານບໍ່ສຳເລັດ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ", nameRequired: "ກະລຸນາລະບຸຊື່ຮ້ານ", noPermission: "ທ່ານບໍ່ມີສິດແກ້ໄຂຮ້ານນີ້",
	};
	if (locale.value === "th") return {
		settings: "ตั้งค่า", title: "ข้อมูลร้าน", description: "แก้ไขชื่อ โลโก้ ที่อยู่ และเบอร์โทรของร้าน",
		storeName: "ชื่อร้าน", storeNameHint: "ชื่อนี้จะแสดงในระบบและเอกสาร", logo: "โลโก้ร้าน", logoHint: "รูปจะถูกย่อและแปลงเป็น WebP ขนาดไม่เกิน 640px ก่อนอัปโหลด", address: "ที่อยู่", phone: "เบอร์โทร",
		chooseImage: "เลือกรูป", changeImage: "เปลี่ยนรูป", removeImage: "ลบรูป", imageAdded: "เตรียมรูปร้านแล้ว", imageFailed: "เตรียมรูปไม่สำเร็จ", contact: "ข้อมูลติดต่อ", identity: "ข้อมูลร้าน",
		preview: "ตัวอย่าง", noLogo: "ยังไม่มีโลโก้", reload: "โหลดใหม่", save: "บันทึก", saving: "กำลังบันทึก", saved: "บันทึกข้อมูลร้านแล้ว",
		loadFailed: "โหลดข้อมูลร้านไม่สำเร็จ", saveFailed: "บันทึกไม่สำเร็จ", nameRequired: "กรุณาระบุชื่อร้าน", noPermission: "คุณไม่มีสิทธิ์แก้ไขร้านนี้",
	};
	return {
		settings: "Settings", title: "Store information", description: "Edit the store name, logo, address, and phone number",
		storeName: "Store name", storeNameHint: "This name appears across the system and documents", logo: "Store logo", logoHint: "The image is resized and converted to WebP at up to 640px before upload", address: "Address", phone: "Phone",
		chooseImage: "Choose image", changeImage: "Change image", removeImage: "Remove image", imageAdded: "Store image prepared", imageFailed: "Could not prepare image", contact: "Contact details", identity: "Store details",
		preview: "Preview", noLogo: "No logo yet", reload: "Reload", save: "Save", saving: "Saving", saved: "Store information saved",
		loadFailed: "Could not load store information", saveFailed: "Could not save", nameRequired: "Store name is required", noPermission: "You do not have permission to update this store",
	};
});

const storeId = computed(() => currentStoreId.value || currentAccess.value?.store_id || currentAccess.value?.memberships?.[0]?.store_id || "");
const elevated = computed(() => currentUser.value?.systemRole === "superadmin" || currentUser.value?.systemRole === "system_admin");
const canUpdate = computed(() => elevated.value || can("settings.store.update"));
const loading = ref(true);
const saving = ref(false);
const preparingImage = ref(false);
const logoInput = ref<HTMLInputElement | null>(null);
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
const logoPreviewUrl = computed(() => {
	if (!form.logoUrl) return "";
	if (/^(https?:\/\/|data:|blob:)/i.test(form.logoUrl)) return form.logoUrl;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = form.logoUrl.startsWith("/") ? form.logoUrl : `/${form.logoUrl}`;
	return `${base}${path}`;
});

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

function openLogoPicker() {
	if (!canUpdate.value || loading.value || preparingImage.value) return;
	logoInput.value?.click();
}

function readFileAsDataUrl(file: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error || new Error(copy.value.imageFailed));
		reader.readAsDataURL(file);
	});
}

async function prepareLogo(file: File) {
	const bitmap = await createImageBitmap(file);
	const maxSize = 640;
	const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
	canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
	const context = canvas.getContext("2d");
	if (!context) {
		bitmap.close();
		throw new Error(copy.value.imageFailed);
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const qualities = [0.88, 0.78, 0.68, 0.58];
	let output: Blob | null = null;
	for (const quality of qualities) {
		output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
		if (output && output.size <= 3 * 1024 * 1024) break;
	}
	if (!output || output.size > 3 * 1024 * 1024) throw new Error(copy.value.imageFailed);
	return readFileAsDataUrl(output);
}

async function onLogoSelected(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (!file) return;
	preparingImage.value = true;
	try {
		form.logoUrl = await prepareLogo(file);
		toast.success({ title: copy.value.imageAdded, description: file.name });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : copy.value.imageFailed;
		toast.error({ title: copy.value.imageFailed, description: message });
	} finally {
		preparingImage.value = false;
		input.value = "";
	}
}

function removeLogo() {
	form.logoUrl = "";
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
				<AppPageHeader :title="copy.title" :description="copy.description" :title-badge="false" tablet-layout compact @menu="openSidebar">
					<template #actions>
						<div class="hidden gap-2 md:flex">
						<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="loading" :disabled="loading" @click="load">
							{{ copy.reload }}
						</AppButton>
						<AppButton color="primary" icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canSave" @click="save">
							{{ saving ? copy.saving : copy.save }}
						</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div v-if="error" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700 dark:border-rose-400/30 dark:bg-rose-500/10 dark:text-rose-300">
					{{ error }}
				</div>
				<div v-else-if="!canUpdate && !loading" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-300">
					{{ copy.noPermission }}
				</div>

				<div class="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
					<div class="space-y-4">
						<UCard class="rounded-md shadow-sm ring-1 ring-neutral-200 dark:bg-[#1c1814] dark:ring-[#3c3429]">
							<div class="mb-4 flex items-center gap-3 border-b border-neutral-100 pb-4 dark:border-[#3c3429]">
								<div class="flex h-9 w-9 items-center justify-center rounded-md bg-primary-50 text-primary-600 dark:bg-emerald-400/10 dark:text-emerald-300">
									<UIcon name="i-heroicons-building-storefront-20-solid" class="h-5 w-5" />
								</div>
								<div>
									<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.identity }}</h2>
									<p class="text-xs text-stone-500">{{ copy.storeNameHint }}</p>
								</div>
							</div>

							<input ref="logoInput" type="file" accept="image/*" class="hidden" @change="onLogoSelected">
							<div class="flex flex-col gap-4 sm:flex-row sm:items-center">
								<button
									type="button"
									class="group flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-dashed border-neutral-300 bg-neutral-50 transition hover:border-primary-300 hover:bg-primary-50 disabled:cursor-not-allowed disabled:opacity-60 dark:border-[#4a4034] dark:bg-[#17130f]"
									:disabled="loading || !canUpdate || preparingImage"
									@click="openLogoPicker"
								>
									<img v-if="logoPreviewUrl" :src="logoPreviewUrl" :alt="form.name" class="h-full w-full object-cover">
									<div v-else class="flex flex-col items-center gap-1 text-stone-400">
										<UIcon name="i-heroicons-photo-20-solid" class="h-6 w-6 group-hover:text-primary-500" />
										<span class="text-[11px] font-medium group-hover:text-primary-600">{{ copy.chooseImage }}</span>
									</div>
								</button>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-center gap-2">
										<p class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.logo }}</p>
										<UBadge color="neutral" variant="soft" label="640px WebP" />
										<UBadge color="neutral" variant="soft" label="≤ 3 MB" />
									</div>
									<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.logoHint }}</p>
									<div class="mt-3 flex flex-wrap gap-2">
										<AppButton color="neutral" variant="soft" size="xs" :loading="preparingImage" :icon="logoPreviewUrl ? 'i-heroicons-arrow-path-20-solid' : 'i-heroicons-photo-20-solid'" @click="openLogoPicker">
											{{ logoPreviewUrl ? copy.changeImage : copy.chooseImage }}
										</AppButton>
										<AppButton v-if="logoPreviewUrl" color="neutral" variant="ghost" size="xs" icon="i-heroicons-trash-20-solid" @click="removeLogo">
											{{ copy.removeImage }}
										</AppButton>
									</div>
								</div>
							</div>

							<div class="mt-5 space-y-2">
								<label class="text-sm font-medium text-stone-700 dark:text-stone-200">{{ copy.storeName }}</label>
								<UInput v-model="form.name" size="lg" color="neutral" maxlength="120" :disabled="loading || !canUpdate" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:transition-colors [&_input]:hover:border-neutral-300 [&_input]:focus:border-primary-400 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-100 dark:[&_input]:border-[#4a4034] dark:[&_input]:bg-[#17130f] dark:[&_input]:hover:border-[#655746] dark:[&_input]:focus:border-emerald-500 dark:[&_input]:focus:ring-emerald-500/15" />
								<p class="text-xs leading-5 text-stone-500">{{ copy.storeNameHint }}</p>
							</div>
						</UCard>

						<UCard class="rounded-md shadow-sm ring-1 ring-neutral-200 dark:bg-[#1c1814] dark:ring-[#3c3429]">
							<div class="mb-4 flex items-center gap-3 border-b border-neutral-100 pb-4 dark:border-[#3c3429]">
								<div class="flex h-9 w-9 items-center justify-center rounded-md bg-neutral-100 text-stone-600 dark:bg-white/5 dark:text-stone-300">
									<UIcon name="i-heroicons-map-pin-20-solid" class="h-5 w-5" />
								</div>
								<h2 class="text-sm font-semibold text-stone-900 dark:text-stone-100">{{ copy.contact }}</h2>
							</div>
							<div class="grid gap-4 md:grid-cols-2">
								<div class="space-y-2">
									<label class="text-sm font-medium text-stone-700 dark:text-stone-200">{{ copy.phone }}</label>
									<UInput v-model="form.phone" type="tel" size="lg" color="neutral" maxlength="40" icon="i-heroicons-phone-20-solid" :disabled="loading || !canUpdate" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:transition-colors [&_input]:hover:border-neutral-300 [&_input]:focus:border-primary-400 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-100 dark:[&_input]:border-[#4a4034] dark:[&_input]:bg-[#17130f] dark:[&_input]:hover:border-[#655746] dark:[&_input]:focus:border-emerald-500 dark:[&_input]:focus:ring-emerald-500/15" />
								</div>
								<div class="space-y-2 md:row-span-2">
									<label class="text-sm font-medium text-stone-700 dark:text-stone-200">{{ copy.address }}</label>
									<UTextarea v-model="form.address" :rows="5" autoresize :maxrows="7" maxlength="500" :disabled="loading || !canUpdate" class="w-full [&_textarea]:rounded-md [&_textarea]:border-neutral-200 [&_textarea]:bg-white [&_textarea]:leading-6 [&_textarea]:transition-colors [&_textarea]:hover:border-neutral-300 [&_textarea]:focus:border-primary-400 [&_textarea]:focus:ring-2 [&_textarea]:focus:ring-primary-100 dark:[&_textarea]:border-[#4a4034] dark:[&_textarea]:bg-[#17130f] dark:[&_textarea]:hover:border-[#655746] dark:[&_textarea]:focus:border-emerald-500 dark:[&_textarea]:focus:ring-emerald-500/15" />
								</div>
							</div>
						</UCard>
					</div>

					<UCard class="h-fit rounded-md shadow-sm ring-1 ring-neutral-200 xl:sticky xl:top-24 dark:bg-[#1c1814] dark:ring-[#3c3429]">
						<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.preview }}</p>
						<div class="mt-5 flex min-h-60 flex-col items-center justify-center text-center">
							<img v-if="logoPreviewUrl" :src="logoPreviewUrl" :alt="form.name" class="h-24 w-24 rounded-2xl object-cover shadow-sm ring-1 ring-neutral-200 dark:ring-[#4a4034]">
							<div v-else class="flex h-24 w-24 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20">
								<UIcon name="i-heroicons-building-storefront" class="h-10 w-10" />
							</div>
							<h2 class="mt-4 text-xl font-semibold text-stone-950 dark:text-stone-100">{{ form.name || copy.noLogo }}</h2>
							<p v-if="form.phone" class="mt-2 flex items-center gap-1.5 text-sm text-stone-500"><UIcon name="i-heroicons-phone-20-solid" class="h-4 w-4" />{{ form.phone }}</p>
							<p v-if="form.address" class="mt-2 max-w-xs whitespace-pre-line text-sm leading-6 text-stone-500">{{ form.address }}</p>
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
