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
	logo_url: string | null;
	address: string | null;
	phone_number: string | null;
	pdf_show_logo: number;
	receipt_show_store_name: number;
	receipt_show_store_address: number;
	receipt_show_store_phone: number;
	receipt_show_tendered: number;
	receipt_show_change: number;
	receipt_show_payment_method: number;
	receipt_show_queue: number;
	receipt_language: string | null;
	receipt_show_powered_by: number;
	pickup_queue_enabled: number;
};

const { apiFetch } = useApiClient();
const runtimeConfig = useRuntimeConfig();
const { t, locale, loadLocaleMessages } = useI18n();
// Empty means follow the interface, which is what every store did before this
// setting existed, so no one is forced to choose on upgrade.
const receiptLanguage = ref("");
const showPoweredBy = ref(true);
const RECEIPT_LANGUAGES = [ "", "lo", "th", "en" ] as const;
const receiptLocale = computed(() => receiptLanguage.value || locale.value);
// Never switch locale.value for this - that would repaint the whole page.
const receiptMessagesReady = ref(0);
watch(receiptLanguage, async (next) => {
	if (!next) return;
	await loadLocaleMessages(next);
	// Bumped so anything built with pt() re-evaluates once the messages arrive.
	receiptMessagesReady.value += 1;
}, { immediate: true });
function pt(key: string, params: Record<string, unknown> = {}) {
	void receiptMessagesReady.value;
	return receiptLanguage.value ? t(key, params, { locale: receiptLanguage.value }) : t(key, params);
}
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

function copyFor(activeLocale: string) {
	if (activeLocale === "en") {
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
			showName: "Show store name",
			showLogo: "Show store logo",
			showTendered: "Show amount received",
			showChange: "Show change",
			showPaymentMethod: "Show payment method",
			showQueue: "Show queue number",
			showPoweredBy: "Show \"Powered by O KhaiDee+\"",
			showPoweredByHint: "The small line at the bottom of the receipt",
			receiptLanguage: "Receipt language",
			receiptLanguageHint: "The receipt is read by the customer, not the cashier, so it need not follow the interface language",
			receiptLanguageSystem: "Follow the interface",
			receiptLanguageNames: { lo: "Lao", th: "Thai", en: "English" },
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
	if (activeLocale === "th") {
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
			showName: "แสดงชื่อร้าน",
			showLogo: "แสดงโลโก้ร้าน",
			showTendered: "แสดงยอดรับเงิน",
			showChange: "แสดงเงินทอน",
			showPaymentMethod: "แสดงวิธีชำระเงิน",
			showQueue: "แสดงเลขคิว",
			showPoweredBy: "แสดง \"Powered by O KhaiDee+\"",
			showPoweredByHint: "บรรทัดเล็กท้ายบิล",
			receiptLanguage: "ภาษาในบิล",
			receiptLanguageHint: "บิลคือสิ่งที่ลูกค้าอ่าน ไม่ใช่พนักงาน จึงไม่จำเป็นต้องตามภาษาหน้าจอ",
			receiptLanguageSystem: "ตามภาษาระบบ",
			receiptLanguageNames: { lo: "ลาว", th: "ไทย", en: "English" },
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
		showName: "ສະແດງຊື່ຮ້ານ",
		showLogo: "ສະແດງໂລໂກ້ຮ້ານ",
		showTendered: "ສະແດງຍອດຮັບເງິນ",
		showChange: "ສະແດງເງິນທອນ",
		showPaymentMethod: "ສະແດງວິທີຊຳລະ",
		showQueue: "ສະແດງເລກຄິວ",
		showPoweredBy: "ສະແດງ \"Powered by O KhaiDee+\"",
		showPoweredByHint: "ແຖວນ້ອຍທ້າຍບິນ",
		receiptLanguage: "ພາສາໃນບິນ",
		receiptLanguageHint: "ບິນແມ່ນລູກຄ້າອ່ານ ບໍ່ແມ່ນພະນັກງານ ຈຶ່ງບໍ່ຈຳເປັນຕ້ອງຕາມພາສາໜ້າຈໍ",
		receiptLanguageSystem: "ຕາມພາສາລະບົບ",
		receiptLanguageNames: { lo: "ລາວ", th: "ໄທ", en: "English" },
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
}
const copy = computed(() => copyFor(locale.value));
// The preview must read as the printed receipt will, not as the interface does.
const previewCopy = computed(() => copyFor(receiptLocale.value));

const selectedStore = ref<StoreRecord | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");

const showStoreName = ref(true);
const showStoreLogo = ref(true);
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

const previewName = computed(() => selectedStore.value?.name || "DShop");
const previewAddress = computed(() => selectedStore.value?.address || "");
const previewPhone = computed(() => selectedStore.value?.phone_number || "");
const previewLogo = computed(() => {
	const value = selectedStore.value?.logo_url || "";
	if (!value) return "";
	if (/^(https?:\/\/|data:|blob:)/i.test(value)) return value;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	return `${base}/${value.replace(/^\//, "")}`;
});
const previewLines = computed(() => [
	showStoreAddress.value ? previewAddress.value : "",
	showStorePhone.value && previewPhone.value ? `${pt("posPanels.receiptPhone")}: ${previewPhone.value}` : "",
].filter(Boolean));

const currentSnapshot = computed(() => JSON.stringify({
	storeId: effectiveStoreId.value,
	showStoreName: showStoreName.value,
	showStoreLogo: showStoreLogo.value,
	showStoreAddress: showStoreAddress.value,
	showStorePhone: showStorePhone.value,
	showTendered: showTendered.value,
	showChange: showChange.value,
	showPaymentMethod: showPaymentMethod.value,
	showPoweredBy: showPoweredBy.value,
	receiptLanguage: receiptLanguage.value,
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
	showStoreName.value = Number(store.receipt_show_store_name ?? 1) !== 0;
	showStoreLogo.value = Number(store.pdf_show_logo ?? 1) !== 0;
	showStoreAddress.value = Number(store.receipt_show_store_address ?? 1) !== 0;
	showStorePhone.value = Number(store.receipt_show_store_phone ?? 1) !== 0;
	showTendered.value = Number(store.receipt_show_tendered ?? 1) !== 0;
	receiptLanguage.value = String(store.receipt_language || "");
	showPoweredBy.value = Number(store.receipt_show_powered_by ?? 1) !== 0;
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
				receipt_show_store_name: showStoreName.value ? 1 : 0,
				pdf_show_logo: showStoreLogo.value ? 1 : 0,
				receipt_show_store_address: showStoreAddress.value ? 1 : 0,
				receipt_show_store_phone: showStorePhone.value ? 1 : 0,
				receipt_show_tendered: showTendered.value ? 1 : 0,
				receipt_show_change: showChange.value ? 1 : 0,
				receipt_show_payment_method: showPaymentMethod.value ? 1 : 0,
				receipt_language: receiptLanguage.value,
				receipt_show_powered_by: showPoweredBy.value ? 1 : 0,
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
								<div>
									<h2 class="text-base font-semibold text-stone-950">{{ copy.displayOptions }}</h2>
									<p class="mt-1 text-sm text-stone-500">{{ copy.displayOptionsHint }}</p>
								</div>
								<div class="grid gap-3 sm:grid-cols-2">
									<label v-for="option in [
										{ key: 'name', label: copy.showName },
										{ key: 'logo', label: copy.showLogo },
										{ key: 'address', label: copy.showAddress },
										{ key: 'phone', label: copy.showPhone },
										{ key: 'tendered', label: copy.showTendered },
										{ key: 'change', label: copy.showChange },
										{ key: 'paymentMethod', label: copy.showPaymentMethod },
									]" :key="option.key" class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-3">
										<span class="text-sm font-medium text-stone-800">{{ option.label }}</span>
										<input
											v-if="option.key === 'name'"
											v-model="showStoreName"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
										<input
											v-else-if="option.key === 'logo'"
											v-model="showStoreLogo"
											type="checkbox"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
										<input
											v-else-if="option.key === 'address'"
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

									<label class="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white p-3 sm:col-span-2">
										<div>
											<p class="text-sm font-medium text-stone-800">{{ copy.showPoweredBy }}</p>
											<p class="mt-1 text-xs text-stone-500">{{ copy.showPoweredByHint }}</p>
										</div>
										<input
											v-model="showPoweredBy"
											type="checkbox"
											:disabled="!canUpdateReceiptSettings || saving"
											class="h-5 w-5 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
										>
									</label>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-3 sm:col-span-2">
										<p class="text-sm font-medium text-stone-800">{{ copy.receiptLanguage }}</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.receiptLanguageHint }}</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<button
												v-for="option in RECEIPT_LANGUAGES"
												:key="option || 'system'"
												type="button"
												class="rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
												:class="receiptLanguage === option ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-neutral-200 bg-white text-stone-700 hover:border-emerald-200'"
												:disabled="!canUpdateReceiptSettings || saving"
												@click="receiptLanguage = option"
											>
												{{ option ? copy.receiptLanguageNames[option] : copy.receiptLanguageSystem }}
											</button>
										</div>
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
										<img v-if="showStoreLogo && previewLogo" :src="previewLogo" :alt="previewName" class="mx-auto mb-2 h-12 w-12 object-contain">
										<p v-if="showStoreName" class="text-[13px] font-bold text-stone-950">{{ previewName }}</p>
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
											<span>{{ previewCopy.subtotal }}</span>
											<span class="font-mono tabular-nums">80,000₭</span>
										</div>
										<div class="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[13px] font-bold">
											<span>{{ previewCopy.total }}</span>
											<span class="font-mono tabular-nums">80,000₭</span>
										</div>
										<div v-if="showPaymentMethod" class="flex justify-between gap-3 text-stone-600">
											<span>{{ previewCopy.method }}</span>
											<span>{{ previewCopy.cash }}</span>
										</div>
										<div v-if="showTendered" class="flex justify-between gap-3 text-stone-600">
											<span>{{ previewCopy.tendered }}</span>
											<span class="font-mono tabular-nums">200,000₭</span>
										</div>
										<div v-if="showChange" class="flex justify-between gap-3 text-stone-600">
											<span>{{ previewCopy.change }}</span>
											<span class="font-mono tabular-nums">120,000₭</span>
										</div>
									</div>
									<div class="mt-4 border-t border-dashed border-neutral-300 pt-3 text-center">
										<div v-if="showQueue" class="mb-3">
											<p class="font-sans text-[11px] text-stone-500">{{ previewCopy.queue }}</p>
											<p class="text-lg font-bold leading-tight text-stone-950">004</p>
										</div>
										<p class="font-sans text-[11px] text-stone-500">{{ pt('posPanels.thankYou') }}</p>
										<p v-if="showPoweredBy" class="mt-1 text-[10px] text-stone-400">Powered by O KhaiDee+</p>
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
