<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type StoreRecord = {
	id: string;
	name: string;
	address: string | null;
	phone_number: string | null;
	pdf_company_name: string | null;
	pdf_company_address: string | null;
	pdf_company_phone: string | null;
	receipt_show_store_address: number;
	receipt_show_store_phone: number;
	receipt_show_tendered: number;
	receipt_show_change: number;
	receipt_show_payment_method: number;
	receipt_show_queue: number;
	pickup_queue_enabled: number;
};

const { apiFetch } = useApiClient();
const { t, locale } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

const copy = computed(() => {
	if (locale.value === "en") {
		return {
			title: "Sales receipt",
			description: "Configure the store details and payment lines shown on printed POS receipts.",
			settings: "Settings",
			reload: "Reload",
			save: "Save",
			saving: "Saving",
			store: "Store",
			storeInfo: "Receipt store info",
			storeInfoHint: "These values are used at the top of the sales receipt.",
			storeName: "Store name on receipt",
			address: "Address",
			phone: "Phone",
			displayOptions: "Display options",
			displayOptionsHint: "Choose which store and payment details appear on the customer receipt.",
			showAddress: "Show store address",
			showPhone: "Show store phone",
			showTendered: "Show amount received",
			showChange: "Show change",
			showPaymentMethod: "Show payment method",
			showQueue: "Show queue number",
			queueFollowsSetting: "Follows the storefront queue setting",
			queueEnabled: "Queue enabled",
			queueDisabled: "Queue disabled",
			queue: "Queue",
			preview: "Receipt preview",
			previewHint: "80 mm receipt preview",
			salesReceipt: "Sales receipt",
			invoice: "Invoice",
			purchaseOrder: "Purchase order",
			comingSoon: "Coming soon",
			subtotal: "Items total",
			total: "Payment total",
			method: "Payment method",
			tendered: "Received",
			change: "Change",
			cash: "Cash",
			done: "Receipt settings saved",
			saveFailed: "Unable to save receipt settings",
			loadFailed: "Unable to load receipt settings",
			networkError: "Unable to connect to the server. Check your internet connection and try again.",
			noPermission: "You do not have permission to update this store.",
		};
	}
	if (locale.value === "th") {
		return {
			title: "บิลขาย",
			description: "ตั้งค่าข้อมูลร้านและบรรทัดการชำระเงินที่แสดงบนบิล POS",
			settings: "ตั้งค่า",
			reload: "โหลดใหม่",
			save: "บันทึก",
			saving: "กำลังบันทึก",
			store: "ร้าน",
			storeInfo: "ข้อมูลร้านบนบิล",
			storeInfoHint: "ข้อมูลชุดนี้จะแสดงด้านบนของบิลขาย",
			storeName: "ชื่อร้านบนบิล",
			address: "ที่อยู่",
			phone: "เบอร์โทร",
			displayOptions: "ตัวเลือกการแสดงผล",
			displayOptionsHint: "เลือกข้อมูลร้านและข้อมูลการชำระเงินที่จะแสดงบนบิลลูกค้า",
			showAddress: "แสดงที่อยู่ร้าน",
			showPhone: "แสดงเบอร์โทรร้าน",
			showTendered: "แสดงยอดรับเงิน",
			showChange: "แสดงเงินทอน",
			showPaymentMethod: "แสดงวิธีชำระเงิน",
			showQueue: "แสดงเลขคิว",
			queueFollowsSetting: "แสดงตามการตั้งค่าคิวหน้าร้านโดยอัตโนมัติ",
			queueEnabled: "เปิดระบบคิว",
			queueDisabled: "ปิดระบบคิว",
			queue: "คิว",
			preview: "ตัวอย่างบิล",
			previewHint: "ตัวอย่างบิลขนาด 80 มม.",
			salesReceipt: "บิลขาย",
			invoice: "Invoice",
			purchaseOrder: "ใบสั่งซื้อ",
			comingSoon: "เร็ว ๆ นี้",
			subtotal: "ยอดสินค้า",
			total: "ยอดชำระ",
			method: "วิธีชำระ",
			tendered: "รับเงิน",
			change: "เงินทอน",
			cash: "เงินสด",
			done: "บันทึกการตั้งค่าบิลแล้ว",
			saveFailed: "บันทึกการตั้งค่าบิลไม่สำเร็จ",
			loadFailed: "โหลดการตั้งค่าบิลไม่สำเร็จ",
			networkError: "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่อีกครั้ง",
			noPermission: "คุณไม่มีสิทธิ์แก้ไขร้านนี้",
		};
	}
	return {
		title: "ບິນຂາຍ",
		description: "ຕັ້ງຄ່າຂໍ້ມູນຮ້ານ ແລະ ບັນທັດການຊຳລະທີ່ສະແດງໃນບິນ POS.",
		settings: "ຕັ້ງຄ່າ",
		reload: "ໂຫຼດໃໝ່",
		save: "ບັນທຶກ",
		saving: "ກຳລັງບັນທຶກ",
		store: "ຮ້ານ",
		storeInfo: "ຂໍ້ມູນຮ້ານໃນບິນ",
		storeInfoHint: "ຂໍ້ມູນຊຸດນີ້ຈະສະແດງຢູ່ດ້ານເທິງຂອງບິນຂາຍ.",
		storeName: "ຊື່ຮ້ານໃນບິນ",
		address: "ທີ່ຢູ່",
		phone: "ເບີໂທ",
		displayOptions: "ຕົວເລືອກການສະແດງ",
		displayOptionsHint: "ເລືອກຂໍ້ມູນຮ້ານ ແລະ ຂໍ້ມູນການຊຳລະທີ່ຈະສະແດງໃນບິນລູກຄ້າ.",
		showAddress: "ສະແດງທີ່ຢູ່ຮ້ານ",
		showPhone: "ສະແດງເບີໂທຮ້ານ",
		showTendered: "ສະແດງຍອດຮັບເງິນ",
		showChange: "ສະແດງເງິນທອນ",
		showPaymentMethod: "ສະແດງວິທີຊຳລະ",
		showQueue: "ສະແດງເລກຄິວ",
		queueFollowsSetting: "ສະແດງຕາມການຕັ້ງຄ່າຄິວໜ້າຮ້ານອັດຕະໂນມັດ",
		queueEnabled: "ເປີດລະບົບຄິວ",
		queueDisabled: "ປິດລະບົບຄິວ",
		queue: "ຄິວ",
		preview: "ຕົວຢ່າງບິນ",
		previewHint: "ຕົວຢ່າງບິນຂະໜາດ 80 ມມ.",
		salesReceipt: "ບິນຂາຍ",
		invoice: "Invoice",
		purchaseOrder: "ໃບສັ່ງຊື້",
		comingSoon: "ໄວໆນີ້",
		subtotal: "ຍອດສິນຄ້າ",
		total: "ຍອດຊຳລະ",
		method: "ວິທີຊຳລະ",
		tendered: "ຮັບເງິນ",
		change: "ເງິນທອນ",
		cash: "ເງິນສົດ",
		done: "ບັນທຶກການຕັ້ງຄ່າບິນແລ້ວ",
		saveFailed: "ບັນທຶກການຕັ້ງຄ່າບິນບໍ່ສຳເລັດ",
		loadFailed: "ໂຫຼດການຕັ້ງຄ່າບິນບໍ່ສຳເລັດ",
		networkError: "ບໍ່ສາມາດເຊື່ອມຕໍ່ເຊີບເວີໄດ້ ກະລຸນາກວດສອບອິນເຕີເນັດ ແລ້ວລອງໃໝ່ອີກຄັ້ງ",
		noPermission: "ທ່ານບໍ່ມີສິດແກ້ໄຂຮ້ານນີ້",
	};
});

const selectedStore = ref<StoreRecord | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");

const companyName = ref("");
const companyAddress = ref("");
const companyPhone = ref("");
const showStoreAddress = ref(true);
const showStorePhone = ref(true);
const showTendered = ref(true);
const showChange = ref(true);
const showPaymentMethod = ref(true);
const showQueue = computed(() => Number(selectedStore.value?.pickup_queue_enabled || 0) !== 0);

const initialSnapshot = ref("");

const lockedStoreId = computed(() => currentStoreId.value || currentAccess.value?.store_id || currentAccess.value?.memberships?.[0]?.store_id || "");
const effectiveStoreId = computed(() => lockedStoreId.value);
const isElevatedStoreManager = computed(() => currentUser.value?.systemRole === "superadmin" || currentUser.value?.systemRole === "system_admin");
const canUpdateReceiptSettings = computed(() => isElevatedStoreManager.value || can("settings.store.update"));
const canShowPermissionWarning = computed(() => !loading.value && Boolean(selectedStore.value) && Boolean(currentUser.value || currentAccess.value) && !canUpdateReceiptSettings.value);

const previewName = computed(() => companyName.value.trim() || selectedStore.value?.name || "DShop");
const previewAddress = computed(() => companyAddress.value.trim() || selectedStore.value?.address || "");
const previewPhone = computed(() => companyPhone.value.trim() || selectedStore.value?.phone_number || "");
const previewLines = computed(() => [
	showStoreAddress.value ? previewAddress.value : "",
	showStorePhone.value && previewPhone.value ? `ໂທ: ${previewPhone.value}` : "",
].filter(Boolean));

const currentSnapshot = computed(() => JSON.stringify({
	storeId: effectiveStoreId.value,
	companyName: companyName.value,
	companyAddress: companyAddress.value,
	companyPhone: companyPhone.value,
	showStoreAddress: showStoreAddress.value,
	showStorePhone: showStorePhone.value,
	showTendered: showTendered.value,
	showChange: showChange.value,
	showPaymentMethod: showPaymentMethod.value,
}));
const hasChanges = computed(() => initialSnapshot.value !== currentSnapshot.value);
const canSave = computed(() => Boolean(selectedStore.value && canUpdateReceiptSettings.value && hasChanges.value && !saving.value));

function resolveApiErrorMessage(errorValue: unknown, fallback: string) {
	const localizedNetworkMessage = (message: string) => {
		const normalized = message.toLowerCase();
		return normalized.includes("เชื่อมต่อเซิร์ฟเวอร์ไม่ได้")
			|| normalized.includes("failed to fetch")
			|| normalized.includes("fetch failed")
			|| normalized.includes("networkerror")
			|| normalized.includes("econnrefused")
			|| normalized.includes("load failed")
				? copy.value.networkError
				: message;
	};
	if (typeof errorValue === "object" && errorValue) {
		const response = Reflect.get(errorValue, "response");
		if (typeof response === "object" && response) {
			const data = Reflect.get(response, "_data") || Reflect.get(response, "data");
			if (typeof data === "object" && data) {
				const message = Reflect.get(data, "message");
				if (typeof message === "string" && message.trim()) return localizedNetworkMessage(message);
			}
		}
	}
	if (errorValue instanceof Error && errorValue.message.trim()) return localizedNetworkMessage(errorValue.message);
	return fallback;
}

function hydrateForm(store: StoreRecord) {
	companyName.value = store.pdf_company_name || store.name || "";
	companyAddress.value = store.pdf_company_address || store.address || "";
	companyPhone.value = store.pdf_company_phone || store.phone_number || "";
	showStoreAddress.value = Number(store.receipt_show_store_address ?? 1) !== 0;
	showStorePhone.value = Number(store.receipt_show_store_phone ?? 1) !== 0;
	showTendered.value = Number(store.receipt_show_tendered ?? 1) !== 0;
	showChange.value = Number(store.receipt_show_change ?? 1) !== 0;
	showPaymentMethod.value = Number(store.receipt_show_payment_method ?? 1) !== 0;
	initialSnapshot.value = currentSnapshot.value;
}

async function loadSettings() {
	loading.value = true;
	error.value = "";
	try {
		if (effectiveStoreId.value) {
			const storeResponse = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`);
			selectedStore.value = storeResponse.data;
			hydrateForm(storeResponse.data);
		}
	} catch (err) {
		error.value = resolveApiErrorMessage(err, copy.value.loadFailed);
	} finally {
		loading.value = false;
	}
}

async function reloadStore() {
	if (!effectiveStoreId.value) return;
	loading.value = true;
	error.value = "";
	try {
		const storeResponse = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`);
		selectedStore.value = storeResponse.data;
		hydrateForm(storeResponse.data);
	} catch (err) {
		error.value = resolveApiErrorMessage(err, copy.value.loadFailed);
	} finally {
		loading.value = false;
	}
}

async function saveSettings() {
	if (!selectedStore.value || !canSave.value) return;
	saving.value = true;
	error.value = "";
	try {
		await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(selectedStore.value.id)}`, {
			method: "PUT",
			body: {
				pdf_company_name: companyName.value.trim() || null,
				pdf_company_address: companyAddress.value.trim() || null,
				pdf_company_phone: companyPhone.value.trim() || null,
				receipt_show_store_address: showStoreAddress.value ? 1 : 0,
				receipt_show_store_phone: showStorePhone.value ? 1 : 0,
				receipt_show_tendered: showTendered.value ? 1 : 0,
				receipt_show_change: showChange.value ? 1 : 0,
				receipt_show_payment_method: showPaymentMethod.value ? 1 : 0,
			},
		});
		appToast.success({ title: copy.value.done, description: selectedStore.value.name });
		await reloadStore();
	} catch (err) {
		const message = resolveApiErrorMessage(err, copy.value.saveFailed);
		error.value = message;
		appToast.error({ title: copy.value.saveFailed, description: message, timeout: 3200 });
	} finally {
		saving.value = false;
	}
}

onMounted(loadSettings);
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="copy.settings"
		:sidebar-title="copy.title"
		sidebar-compact-title="PRN"
		:sidebar-description="copy.description"
	>
		<template #default>
			<div class="min-w-0 space-y-4">
				<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
					<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.settings }}</p>
							<h1 class="mt-2 text-xl font-bold text-stone-950">{{ copy.title }}</h1>
							<p class="mt-1 text-sm leading-6 text-stone-500">{{ copy.description }}</p>
						</div>
						<div class="flex gap-2">
							<UButton color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="loading" @click="reloadStore">
								{{ copy.reload }}
							</UButton>
							<UButton color="success" icon="i-heroicons-check" :loading="saving" :disabled="!canSave" @click="saveSettings">
								{{ saving ? copy.saving : copy.save }}
							</UButton>
						</div>
					</div>
				</UCard>

				<UAlert v-if="error" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :title="error" />
				<UAlert v-else-if="canShowPermissionWarning" color="warning" variant="soft" icon="i-heroicons-lock-closed" :title="copy.noPermission" />

				<div class="grid gap-3 md:grid-cols-3">
					<NuxtLink to="/settings/printing/sales-receipt" class="rounded-md border border-emerald-200 bg-emerald-50 p-4 text-emerald-950 transition dark:border-emerald-400/40 dark:bg-emerald-500/15 dark:text-emerald-100 dark:ring-1 dark:ring-emerald-400/20">
						<div class="flex items-center gap-3">
							<UIcon name="i-heroicons-receipt-percent" class="h-5 w-5" />
							<div>
								<p class="text-sm font-semibold">{{ copy.salesReceipt }}</p>
								<p class="text-xs text-emerald-700 dark:text-emerald-300">{{ copy.previewHint }}</p>
							</div>
						</div>
					</NuxtLink>
					<div class="rounded-md border border-neutral-200 bg-white p-4 text-stone-500">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-semibold text-stone-800">{{ copy.invoice }}</p>
							<UBadge color="neutral" variant="soft" :label="copy.comingSoon" />
						</div>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-4 text-stone-500">
						<div class="flex items-center justify-between gap-3">
							<p class="text-sm font-semibold text-stone-800">{{ copy.purchaseOrder }}</p>
							<UBadge color="neutral" variant="soft" :label="copy.comingSoon" />
						</div>
					</div>
				</div>

				<div class="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
					<div class="space-y-4">
						<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
							<div class="space-y-4">
								<div class="flex items-center justify-between gap-3">
									<div>
										<h2 class="text-base font-semibold text-stone-950">{{ copy.storeInfo }}</h2>
										<p class="mt-1 text-sm text-stone-500">{{ copy.storeInfoHint }}</p>
									</div>
									<UBadge v-if="selectedStore" color="neutral" variant="soft" :label="selectedStore.name" />
								</div>

								<label class="block space-y-1">
									<span class="text-sm font-medium text-stone-700">{{ copy.storeName }}</span>
									<input v-model="companyName" class="h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100">
								</label>

								<label class="block space-y-1">
									<span class="text-sm font-medium text-stone-700">{{ copy.address }}</span>
									<textarea v-model="companyAddress" rows="3" class="w-full resize-none rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm leading-6 shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100" />
								</label>

								<label class="block space-y-1">
									<span class="text-sm font-medium text-stone-700">{{ copy.phone }}</span>
									<input v-model="companyPhone" class="h-11 w-full rounded-md border border-neutral-200 bg-white px-3 text-sm shadow-sm outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100">
								</label>
							</div>
						</UCard>

						<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
							<div class="space-y-4">
								<div>
									<h2 class="text-base font-semibold text-stone-950">{{ copy.displayOptions }}</h2>
									<p class="mt-1 text-sm text-stone-500">{{ copy.displayOptionsHint }}</p>
								</div>
								<div class="grid gap-3 sm:grid-cols-2">
									<label v-for="option in [
										{ key: 'address', label: copy.showAddress },
										{ key: 'phone', label: copy.showPhone },
										{ key: 'tendered', label: copy.showTendered },
										{ key: 'change', label: copy.showChange },
										{ key: 'paymentMethod', label: copy.showPaymentMethod },
									]" :key="option.key" class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
										<span class="text-sm font-medium text-stone-800">{{ option.label }}</span>
										<input
											v-if="option.key === 'address'"
											v-model="showStoreAddress"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
										<input
											v-else-if="option.key === 'phone'"
											v-model="showStorePhone"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
										<input
											v-else-if="option.key === 'tendered'"
											v-model="showTendered"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
									<input
										v-else-if="option.key === 'change'"
											v-model="showChange"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
									>
									<input
										v-else-if="option.key === 'paymentMethod'"
										v-model="showPaymentMethod"
										type="checkbox"
										class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
									>
									</label>
									<div class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
										<div>
											<p class="text-sm font-medium text-stone-800">{{ copy.showQueue }}</p>
											<p class="mt-1 text-xs text-stone-500">{{ copy.queueFollowsSetting }}</p>
										</div>
										<UBadge :color="showQueue ? 'success' : 'neutral'" variant="soft" :label="showQueue ? copy.queueEnabled : copy.queueDisabled" />
									</div>
								</div>
							</div>
						</UCard>
					</div>

					<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
						<div class="space-y-4">
							<div>
								<h2 class="text-base font-semibold text-stone-950">{{ copy.preview }}</h2>
								<p class="mt-1 text-sm text-stone-500">{{ copy.previewHint }}</p>
							</div>
							<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-4">
								<div class="receipt-preview-sheet mx-auto w-[80mm] max-w-full rounded-sm border border-neutral-200 bg-white px-[5mm] py-[6mm] text-[12px] leading-snug text-stone-900 shadow-sm">
									<div class="text-center">
										<p class="text-[13px] font-bold text-stone-950">{{ previewName }}</p>
										<p v-for="line in previewLines" :key="line" class="mt-0.5 text-[11px] text-stone-500">{{ line }}</p>
										<p class="mt-1 text-[11px] text-stone-500">POS-20260727-0001</p>
									</div>
									<div class="my-3 border-t border-dashed border-neutral-300" />
									<div class="flex justify-between gap-3">
										<div>
											<p class="font-medium">beer</p>
											<p class="text-[11px] text-stone-500">× 4</p>
										</div>
										<span class="font-mono tabular-nums">80,000₭</span>
									</div>
									<div class="my-3 border-t border-dashed border-neutral-300" />
									<div class="space-y-2">
										<div class="flex justify-between gap-3">
											<span>{{ copy.subtotal }}</span>
											<span class="font-mono tabular-nums">80,000₭</span>
										</div>
										<div class="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[13px] font-bold">
											<span>{{ copy.total }}</span>
											<span class="font-mono tabular-nums">80,000₭</span>
										</div>
										<div v-if="showPaymentMethod" class="flex justify-between gap-3 text-stone-600">
											<span>{{ copy.method }}</span>
											<span>{{ copy.cash }}</span>
										</div>
										<div v-if="showTendered" class="flex justify-between gap-3 text-stone-600">
											<span>{{ copy.tendered }}</span>
											<span class="font-mono tabular-nums">200,000₭</span>
										</div>
										<div v-if="showChange" class="flex justify-between gap-3 text-stone-600">
											<span>{{ copy.change }}</span>
											<span class="font-mono tabular-nums">120,000₭</span>
										</div>
									</div>
									<div class="mt-4 border-t border-dashed border-neutral-300 pt-3 text-center">
										<div v-if="showQueue" class="mb-3">
											<p class="font-sans text-[11px] text-stone-500">{{ copy.queue }}</p>
											<p class="text-lg font-bold leading-tight text-stone-950">004</p>
										</div>
										<p class="font-sans text-[11px] text-stone-500">ຂອບໃຈທີ່ອຸດໜູນ</p>
										<p class="mt-1 text-[10px] text-stone-400">Powered by O KhaiDee+</p>
									</div>
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
.receipt-preview-sheet {
	font-family: "Google Sans Lao", "Avenir Next", "Segoe UI", sans-serif;
}

.receipt-preview-sheet .font-sans {
	font-family: inherit;
}
</style>
