<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { normalizeCurrencyCode, type CurrencyCode } from "~/utils/currency";
import { Landmark } from "@lucide/vue";
import { LAO_BANKS, findLaoBank, type LaoBank } from "~/utils/lao-banks";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };

type StoreRecord = {
	id: string;
	name: string;
	currency: string;
	supported_currencies: string | null;
};

type StorePaymentAccountRecord = {
	id: string;
	store_id: string;
	display_name: string;
	account_type: "bank" | "qr" | "other" | string | null;
	bank_name: string | null;
	account_name: string;
	account_number: string | null;
	qr_id: string | null;
	is_default: number;
	is_active: number;
	created_at: string;
	updated_at: string;
	qr_image_url: string | null;
	currency: string;
};

const CURRENCY_OPTIONS: Array<{ code: CurrencyCode; label: string; hint: string }> = [
	{ code: "LAK", label: "LAK", hint: "Lao kip" },
	{ code: "THB", label: "THB", hint: "Thai baht" },
	{ code: "USD", label: "USD", hint: "US dollar" },
];

const { apiFetch } = useApiClient();
const { t } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();
const runtimeConfig = useRuntimeConfig();

const storesPending = ref(true);
const accountsPending = ref(true);
const saving = ref(false);
const settingDefaultId = ref("");
const deletingId = ref("");
const accountModalOpen = ref(false);
const deleteConfirmOpen = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const accountCurrencyFilter = ref<"all" | CurrencyCode>("all");
const accountTypeFilter = ref<"all" | "bank" | "qr" | "other" | "none">("all");
const accountStatusFilter = ref<"all" | "active" | "inactive" | "default" | "qr">("all");

const stores = ref<StoreRecord[]>([]);
const selectedStoreId = ref("");
const authPermissionReady = ref(false);
const accounts = ref<StorePaymentAccountRecord[]>([]);
const editingAccountId = ref<string | null>(null);
const searchQuery = ref("");
const qrImageInputRef = ref<HTMLInputElement | null>(null);
const qrImageName = ref("");
const qrPreviewOpen = ref(false);
const qrPreviewAccount = ref<StorePaymentAccountRecord | null>(null);

const bankPickerOpen = ref(false);
const bankTriggerRef = ref<HTMLElement | null>(null);
// The picker lives inside a scrolling modal, so an absolutely positioned menu is
// clipped by it. Rendering to <body> at a fixed position removes the clipping,
// and measuring the trigger lets it open upwards when there is no room below —
// what a native select does.
const bankMenuStyle = ref<Record<string, string>>({});
const MENU_MAX_HEIGHT = 288;

function positionBankMenu() {
	const element = bankTriggerRef.value;
	if (!element) return;
	const rect = element.getBoundingClientRect();
	const below = window.innerHeight - rect.bottom - 8;
	const above = rect.top - 8;
	// Open downwards unless the space above is genuinely better.
	const openUp = below < Math.min(MENU_MAX_HEIGHT, above) && above > below;
	bankMenuStyle.value = {
		position: "fixed",
		left: `${rect.left}px`,
		width: `${rect.width}px`,
		maxHeight: `${Math.max(160, Math.min(MENU_MAX_HEIGHT, openUp ? above : below))}px`,
		...(openUp ? { bottom: `${window.innerHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` }),
	};
}

function toggleBankPicker() {
	if (bankPickerOpen.value) { bankPickerOpen.value = false; return; }
	positionBankMenu();
	bankPickerOpen.value = true;
}

onMounted(() => {
	// Scrolling or resizing moves the trigger, and a fixed menu would stay behind.
	const reposition = () => { if (bankPickerOpen.value) positionBankMenu(); };
	window.addEventListener("resize", reposition);
	window.addEventListener("scroll", reposition, true);
	onBeforeUnmount(() => {
		window.removeEventListener("resize", reposition);
		window.removeEventListener("scroll", reposition, true);
	});
});
// Set when the shop banks somewhere not on the list, so the free-text field is
// shown instead. bank_name itself stays free text either way.
const bankNameCustom = ref(false);
const selectedBank = computed(() => findLaoBank(form.bank_name));
// One lookup per row, and no TypeScript-only syntax inside the template.
function bankLogo(bankName: string | null | undefined) {
	return findLaoBank(bankName)?.logo || "";
}
function selectBank(bank: LaoBank) {
	form.bank_name = bank.name;
	bankNameCustom.value = false;
	bankPickerOpen.value = false;
}
function startCustomBank() {
	bankNameCustom.value = true;
	bankPickerOpen.value = false;
}

const form = reactive({
	display_name: "",
	bank_name: "",
	account_name: "",
	account_number: "",
	qr_id: "",
	qr_image_url: "",
	currency: "LAK" as CurrencyCode,
	is_active: true,
	is_default: false,
});

const lockedStoreId = computed(() => (
	currentStoreId.value
	|| currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| ""
));

const effectiveStoreId = computed(() => (
	selectedStoreId.value
	|| lockedStoreId.value
	|| stores.value[0]?.id
	|| ""
));

const selectedStore = computed(() => stores.value.find((store) => store.id === effectiveStoreId.value) || null);
const currentStoreName = computed(() => selectedStore.value?.name || "-");
const canUpdateStorePayments = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
	|| can("settings.payments.update")
));
const reloading = computed(() => storesPending.value || accountsPending.value);

const totalAccounts = computed(() => accounts.value.length);
const activeAccounts = computed(() => accounts.value.filter((account) => Number(account.is_active) === 1).length);
const defaultAccounts = computed(() => accounts.value.filter((account) => Number(account.is_default) === 1).length);
const qrAccounts = computed(() => accounts.value.filter((account) => Boolean(account.qr_id) || Boolean(account.qr_image_url)).length);
const filteredAccounts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();
	return accounts.value.filter((account) => {
		const normalizedCurrency = normalizeCurrencyCode(account.currency) || currentCurrency.value;
		const normalizedType = account.account_type || "none";
		const searchableValues = [
			account.display_name,
			account.account_type,
			account.bank_name,
			account.account_name,
			account.account_number,
			account.qr_id,
			account.qr_image_url,
			normalizedCurrency,
			accountTypeLabel(account.account_type),
		];

		const matchesQuery = !query || searchableValues.some((value) => String(value || "").toLowerCase().includes(query));
		const matchesCurrency = accountCurrencyFilter.value === "all" || normalizedCurrency === accountCurrencyFilter.value;
		const matchesType = accountTypeFilter.value === "all" || normalizedType === accountTypeFilter.value;
		const matchesStatus = accountStatusFilter.value === "all"
			|| (accountStatusFilter.value === "active" && Number(account.is_active) === 1)
			|| (accountStatusFilter.value === "inactive" && Number(account.is_active) === 0)
			|| (accountStatusFilter.value === "default" && Number(account.is_default) === 1)
			|| (accountStatusFilter.value === "qr" && (Boolean(account.qr_id) || Boolean(account.qr_image_url)));

		return matchesQuery && matchesCurrency && matchesType && matchesStatus;
	});
});
const totalPages = computed(() => Math.max(1, Math.ceil(filteredAccounts.value.length / pageSize.value)));
const paginatedAccounts = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredAccounts.value.slice(startIndex, startIndex + pageSize.value);
});
const pageLabel = computed(() => t("storePaymentsPage.pageLabel", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	filteredAccounts.value.length === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, filteredAccounts.value.length));
const pageSummaryText = computed(() => (
	filteredAccounts.value.length === 0
		? t("storePaymentsPage.noData")
		: t("storePaymentsPage.pageSummary", { start: pageStart.value, end: pageEnd.value, count: filteredAccounts.value.length })
));

const accountTypeLabel = (accountType: StorePaymentAccountRecord["account_type"]) => {
	if (!accountType) return t("storePaymentsPage.unspecified");
	if (accountType === "bank") return t("storePaymentsPage.bankAccount");
	if (accountType === "qr") return "QR";
	if (accountType === "other") return t("storePaymentsPage.other");
	return t("storePaymentsPage.unspecified");
};

const currentCurrency = computed(() => normalizeCurrencyCode(selectedStore.value?.currency) || "LAK");
const enabledCurrencyCodes = computed(() => {
	const baseCurrency = normalizeCurrencyCode(selectedStore.value?.currency) || "LAK";
	const supported = String(selectedStore.value?.supported_currencies || "")
		.trim()
		.split(",")
		.map((part) => normalizeCurrencyCode(part))
		.filter((code): code is CurrencyCode => Boolean(code));

	return Array.from(new Set([ baseCurrency, ...supported ])) as CurrencyCode[];
});
const enabledCurrencyOptions = computed(() => (
	CURRENCY_OPTIONS.filter((option) => enabledCurrencyCodes.value.includes(option.code))
));
const qrImagePreviewUrl = computed(() => resolveQrImageUrl(form.qr_image_url));
const qrImageSelected = computed(() => Boolean(form.qr_image_url.trim()));
const qrPreviewImageUrl = computed(() => resolveQrImageUrl(qrPreviewAccount.value?.qr_image_url || ""));
const qrPreviewTitle = computed(() => qrPreviewAccount.value?.display_name || t("storePaymentsPage.qrPreview"));
const deleteTargetAccount = computed(() => (
	editingAccountId.value
		? accounts.value.find((account) => account.id === editingAccountId.value) || null
		: null
));
const isEditingDefaultAccount = computed(() => Number(deleteTargetAccount.value?.is_default || 0) === 1);
const deleteTargetLabel = computed(() => deleteTargetAccount.value?.display_name || form.display_name.trim() || t("storePaymentsPage.paymentAccounts"));
const accountCurrencyOptions = computed(() => ([
	{ code: "all" as const, label: t("storePaymentsPage.allCurrencies") },
	...enabledCurrencyOptions.value,
]));
const accountTypeFilterOptions = computed(() => ([
	{ id: "all" as const, label: t("storePaymentsPage.allTypes") },
	{ id: "bank" as const, label: t("storePaymentsPage.bankAccount") },
	{ id: "qr" as const, label: "QR" },
	{ id: "other" as const, label: t("storePaymentsPage.other") },
	{ id: "none" as const, label: t("storePaymentsPage.unspecified") },
]));
const accountStatusOptions = computed(() => ([
	{ id: "all" as const, label: t("storePaymentsPage.all") },
	{ id: "active" as const, label: t("storePaymentsPage.active") },
	{ id: "inactive" as const, label: t("storePaymentsPage.inactive") },
	{ id: "default" as const, label: t("storePaymentsPage.default") },
	{ id: "qr" as const, label: t("storePaymentsPage.hasQr") },
]));
const hasActiveAccountFilters = computed(() => (
	searchQuery.value.trim().length > 0
	|| accountCurrencyFilter.value !== "all"
	|| accountTypeFilter.value !== "all"
	|| accountStatusFilter.value !== "all"
));

function resolveApiErrorMessage(errorValue: unknown, fallback = t("storePaymentsPage.tryAgain")) {
	if (typeof errorValue === "object" && errorValue) {
		const response = Reflect.get(errorValue, "response");
		if (typeof response === "object" && response) {
			const data = Reflect.get(response, "_data") || Reflect.get(response, "data");
			if (typeof data === "object" && data) {
				const message = Reflect.get(data, "message");
				if (typeof message === "string" && message.trim()) {
					if (message === "Store not found") return t("storePaymentsPage.storeNotFound");
					if (message === "Store payment account not found") return t("storePaymentsPage.paymentAccountNotFound");
					return message;
				}
			}
		}
	}
	if (errorValue instanceof Error && errorValue.message.trim()) {
		return errorValue.message;
	}
	return fallback;
}

function resolveQrImageUrl(imageUrl: string | null) {
	const value = String(imageUrl || "").trim();
	if (!value) return "";
	if (value.startsWith("data:") || value.startsWith("blob:") || /^https?:\/\//i.test(value)) {
		return value;
	}

	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	if (!base) return value;

	const path = value.startsWith("/") ? value : `/${value}`;
	return `${base}${path}`;
}

function getPreferredCurrency(): CurrencyCode {
	return enabledCurrencyOptions.value[0]?.code || (normalizeCurrencyCode(selectedStore.value?.currency) || "LAK");
}

function resetForm(next?: StorePaymentAccountRecord | null) {
	const targetCurrency = getPreferredCurrency();
	qrImageName.value = "";
	if (qrImageInputRef.value) {
		qrImageInputRef.value.value = "";
	}
	if (!next) {
		editingAccountId.value = null;
		form.display_name = "";
		form.bank_name = "";
	bankNameCustom.value = false;
	bankPickerOpen.value = false;
		form.account_name = "";
		form.account_number = "";
		form.qr_id = "";
		form.qr_image_url = "";
		form.currency = targetCurrency;
		form.is_active = true;
		form.is_default = false;
		return;
	}

	editingAccountId.value = next.id;
	form.display_name = next.display_name || "";
	form.bank_name = next.bank_name || "";
	// A name that is not one of the listed banks keeps its free-text field.
	bankNameCustom.value = Boolean(form.bank_name) && !findLaoBank(form.bank_name);
	bankPickerOpen.value = false;
	form.account_name = next.account_name || "";
	form.account_number = next.account_number || "";
	form.qr_id = next.qr_id || "";
	form.qr_image_url = next.qr_image_url || "";
	form.currency = normalizeCurrencyCode(next.currency) || targetCurrency;
	form.is_active = Number(next.is_active) === 1;
	form.is_default = Number(next.is_default) === 1;
}

function openQrImagePicker() {
	qrImageInputRef.value?.click();
}

function openQrPreview(account: StorePaymentAccountRecord) {
	if (!account.qr_image_url) return;
	qrPreviewAccount.value = account;
	qrPreviewOpen.value = true;
}

function closeQrPreview() {
	qrPreviewOpen.value = false;
	qrPreviewAccount.value = null;
}

function removeQrImage() {
	form.qr_image_url = "";
	qrImageName.value = "";
	if (qrImageInputRef.value) {
		qrImageInputRef.value.value = "";
	}
}

async function readFileAsDataUrl(file: Blob) {
	return await new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error || new Error(t("storePaymentsPage.readImageFailed")));
		reader.readAsDataURL(file);
	});
}

async function transformQrImage(file: File) {
	const bitmap = await createImageBitmap(file);
	const maxSize = 640;
	const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const width = Math.max(1, Math.round(bitmap.width * ratio));
	const height = Math.max(1, Math.round(bitmap.height * ratio));
	const canvas = document.createElement("canvas");
	canvas.width = width;
	canvas.height = height;
	const context = canvas.getContext("2d");
	if (!context) {
		bitmap.close();
		throw new Error(t("storePaymentsPage.prepareImageFailed"));
	}
	context.drawImage(bitmap, 0, 0, width, height);
	bitmap.close();

	const qualities = [ 0.88, 0.78, 0.68, 0.58 ];
	let outputBlob: Blob | null = null;
	for (const quality of qualities) {
		outputBlob = await new Promise<Blob | null>((resolve) => {
			canvas.toBlob((blob) => resolve(blob), "image/webp", quality);
		});
		if (outputBlob && outputBlob.size <= 3 * 1024 * 1024) break;
	}

	if (!outputBlob) {
		throw new Error(t("storePaymentsPage.convertImageFailed"));
	}

	if (outputBlob.size > 3 * 1024 * 1024) {
		throw new Error(t("storePaymentsPage.imageTooLarge"));
	}

	return {
		dataUrl: await readFileAsDataUrl(outputBlob),
		fileName: file.name.replace(/\.[^.]+$/, "") + ".webp",
	};
}

async function handleQrImageChange(event: Event) {
	const input = event.target as HTMLInputElement | null;
	const file = input?.files?.[0];
	if (!file) return;

	try {
		const transformed = await transformQrImage(file);
		form.qr_image_url = transformed.dataUrl;
		qrImageName.value = transformed.fileName;
		appToast.success({
			title: t("storePaymentsPage.imageAdded"),
			description: transformed.fileName,
		});
	} catch (error) {
		appToast.error({
			title: t("storePaymentsPage.imageAddFailed"),
			description: error instanceof Error ? error.message : t("storePaymentsPage.tryAgain"),
			timeout: 3200,
		});
	} finally {
		if (input) {
			input.value = "";
		}
	}
}

function openAccountModal(next?: StorePaymentAccountRecord | null) {
	resetForm(next || null);
	accountModalOpen.value = true;
}

function closeAccountModal() {
	accountModalOpen.value = false;
	deleteConfirmOpen.value = false;
	resetForm();
}

function openDeleteConfirm() {
	if (!editingAccountId.value) return;
	deleteConfirmOpen.value = true;
}

function closeDeleteConfirm() {
	deleteConfirmOpen.value = false;
}

function clearAccountFilters() {
	searchQuery.value = "";
	accountCurrencyFilter.value = "all";
	accountTypeFilter.value = "all";
	accountStatusFilter.value = "all";
}

async function fetchStores() {
	storesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
		stores.value = response.data;
		const nextLockedStoreId = resolveVisibleStoreId();
		if (nextLockedStoreId) selectedStoreId.value = nextLockedStoreId;
	} catch (err) {
		appToast.error({
			title: t("storePaymentsPage.loadStoresFailed"),
			description: resolveApiErrorMessage(err, t("storePaymentsPage.tryAgain")),
			timeout: 3200,
		});
		stores.value = [];
	} finally {
		storesPending.value = false;
	}
}

async function hydrateAccounts() {
	if (!effectiveStoreId.value) return;
	accountsPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<StorePaymentAccountRecord[]>>(storePaymentAccountsPath(effectiveStoreId.value));
		accounts.value = response.data;

		if (accountModalOpen.value && editingAccountId.value) {
			const match = accounts.value.find((account) => account.id === editingAccountId.value);
			if (match) {
				resetForm(match);
			}
		}
	} catch (err) {
		appToast.error({
			title: t("storePaymentsPage.loadAccountsFailed"),
			description: resolveApiErrorMessage(err, t("storePaymentsPage.tryAgain")),
			timeout: 3200,
		});
		accounts.value = [];
	} finally {
		accountsPending.value = false;
	}
}

function scrollStorePaymentsListToTop() {
	if (!import.meta.client) return;
	document.getElementById("app-shell-scroll-root")?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollStorePaymentsListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	nextTick(() => {
		scrollStorePaymentsListToTop();
	});
}

async function reloadAll() {
	await fetchStores();
	await hydrateAccounts();
}

function startCreateAccount() {
	openAccountModal();
}

function normalizeOptional(value: string) {
	const text = value.trim();
	return text ? text : null;
}

function normalizeStoreId(value?: string | null) {
	return String(value || "").trim();
}

function resolveVisibleStoreId() {
	const lockedId = normalizeStoreId(lockedStoreId.value);
	if (lockedId && stores.value.some((store) => store.id === lockedId)) {
		return lockedId;
	}
	return stores.value[0]?.id || "";
}

function accountStoreId(account?: Pick<StorePaymentAccountRecord, "store_id"> | null) {
	return normalizeStoreId(account?.store_id) || effectiveStoreId.value;
}

function storePaymentAccountsPath(storeId: string, suffix = "") {
	const encodedStoreId = encodeURIComponent(storeId);
	const normalizedSuffix = suffix ? `/${suffix.replace(/^\//, "")}` : "";
	return `/stores/${encodedStoreId}/payment-accounts${normalizedSuffix}?store_id=${encodedStoreId}`;
}

function hasIdentifier() {
	return Boolean(form.account_number.trim() || form.qr_id.trim() || form.qr_image_url.trim());
}

const canSave = computed(() => (
	authPermissionReady.value
	&& canUpdateStorePayments.value
	&& Boolean(effectiveStoreId.value)
	&& Boolean(form.display_name.trim())
	&& Boolean(form.account_name.trim())
	&& hasIdentifier()
));

async function saveAccount() {
	if (!canSave.value || saving.value) return;
	saving.value = true;
	try {
		const targetStoreId = accountStoreId(deleteTargetAccount.value);
		const targetCurrency = enabledCurrencyCodes.value.includes(form.currency)
			? form.currency
			: getPreferredCurrency();
		const body: Record<string, unknown> = {
			display_name: form.display_name.trim(),
			bank_name: normalizeOptional(form.bank_name),
			account_name: form.account_name.trim(),
			account_number: normalizeOptional(form.account_number),
			qr_id: normalizeOptional(form.qr_id),
			qr_image_url: normalizeOptional(form.qr_image_url),
			currency: targetCurrency,
			is_active: form.is_active ? 1 : 0,
		};
		if (!editingAccountId.value || form.is_default) {
			body.is_default = form.is_default ? 1 : 0;
		}
		body.store_id = editingAccountId.value ? targetStoreId : effectiveStoreId.value;

		if (editingAccountId.value) {
			await apiFetch(storePaymentAccountsPath(targetStoreId, encodeURIComponent(editingAccountId.value)), {
				method: "PUT",
				body,
			});
			appToast.success({
				title: t("storePaymentsPage.accountSaved"),
				description: form.display_name.trim(),
			});
		} else {
			await apiFetch(storePaymentAccountsPath(effectiveStoreId.value), {
				method: "POST",
				body,
			});
			appToast.success({
				title: t("storePaymentsPage.accountAdded"),
				description: form.display_name.trim(),
			});
		}

		await hydrateAccounts();
		closeAccountModal();
	} catch (err) {
		const message = resolveApiErrorMessage(err, t("storePaymentsPage.accountSaveFailed"));
		appToast.error({ title: t("storePaymentsPage.saveFailed"), description: message, timeout: 3200 });
	} finally {
		saving.value = false;
	}
}

async function setDefault(account: StorePaymentAccountRecord) {
	const targetStoreId = accountStoreId(account);
	if (!account.id || !targetStoreId || saving.value || !canUpdateStorePayments.value || Number(account.is_default) === 1) return;
	saving.value = true;
	settingDefaultId.value = account.id;
	try {
		await apiFetch(storePaymentAccountsPath(targetStoreId, encodeURIComponent(account.id)), {
			method: "PUT",
			body: {
				is_default: 1,
				store_id: targetStoreId,
			},
		});
		appToast.success({
			title: t("storePaymentsPage.defaultAccountSaved"),
			description: account.display_name,
		});
		await hydrateAccounts();
	} catch (err) {
		const message = resolveApiErrorMessage(err, t("storePaymentsPage.defaultAccountSaveFailed"));
		appToast.error({ title: t("storePaymentsPage.defaultAccountSaveFailed"), description: message, timeout: 3200 });
	} finally {
		settingDefaultId.value = "";
		saving.value = false;
	}
}

async function deleteAccount() {
	const target = deleteTargetAccount.value;
	if (!target?.id || deletingId.value) return;
	const targetStoreId = accountStoreId(target);
	if (!targetStoreId) return;
	deletingId.value = target.id;
	try {
		await apiFetch(storePaymentAccountsPath(targetStoreId, encodeURIComponent(target.id)), {
			method: "DELETE",
			body: { store_id: targetStoreId },
		});
		appToast.success({
			title: t("storePaymentsPage.accountDeleted"),
			description: target.display_name,
		});
		if (editingAccountId.value === target.id) {
			closeDeleteConfirm();
			closeAccountModal();
		}
		await hydrateAccounts();
	} catch (err) {
		const message = resolveApiErrorMessage(err, t("storePaymentsPage.accountDeleteFailed"));
		appToast.error({ title: t("storePaymentsPage.deleteFailed"), description: message, timeout: 3200 });
	} finally {
		deletingId.value = "";
	}
}

watch([lockedStoreId, stores], () => {
	const nextStoreId = resolveVisibleStoreId();
	if (nextStoreId && selectedStoreId.value !== nextStoreId) {
		selectedStoreId.value = nextStoreId;
	}
}, { immediate: true });

watch(filteredAccounts, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
}, { immediate: true });

watch(searchQuery, () => {
	currentPage.value = 1;
});

watch([accountCurrencyFilter, accountTypeFilter, accountStatusFilter], () => {
	currentPage.value = 1;
});

watch(pageSize, () => {
	currentPage.value = 1;
});

watch(effectiveStoreId, async (value) => {
	if (!value) return;
	await hydrateAccounts();
}, { immediate: true });

onMounted(async () => {
	authPermissionReady.value = true;
	await fetchStores();
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="t('storePaymentsPage.settings')"
		:sidebar-title="t('storePaymentsPage.title')"
		sidebar-compact-title="PAY"
		:sidebar-description="t('storePaymentsPage.sidebarDescription')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:gap-4 lg:pb-3">
				<AppPageHeader
					title=""
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								:placeholder="t('storePaymentsPage.searchPlaceholder')"
								color="neutral"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:pr-12 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18] dark:[&_input]:text-stone-100"
							/>
							<AppButton
								v-if="searchQuery"
								color="neutral"
								variant="ghost"
								size="xs"
								icon="i-heroicons-x-mark-20-solid"
								class="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-md"
								:aria-label="t('storePaymentsPage.clearSearch')"
								:title="t('storePaymentsPage.clearSearch')"
								@click="searchQuery = ''"
							/>
						</div>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="justify-center rounded-md"
							:loading="reloading"
							:disabled="reloading"
							:spin-icon-on-loading="true"
							:aria-label="t('storePaymentsPage.reload')"
							:title="t('storePaymentsPage.reload')"
							@click="reloadAll"
						>
							<span class="hidden sm:inline">{{ t('storePaymentsPage.reload') }}</span>
						</AppButton>
						<AppButton
							color="primary"
							variant="solid"
							size="md"
							icon="i-heroicons-plus-20-solid"
							class="justify-center rounded-md"
							:aria-label="t('storePaymentsPage.addAccount')"
							:title="t('storePaymentsPage.addAccount')"
							@click="startCreateAccount"
						>
							<span class="hidden sm:inline">{{ t('storePaymentsPage.addAccount') }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid gap-3 lg:pr-1">
					<UCard
					class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 dark:bg-[#221d18] dark:shadow-[0_8px_24px_rgba(0,0,0,0.28)] dark:ring-[#3a332a] sm:rounded-md"
						:ui="{ body: 'p-1.5 sm:p-2 lg:p-2.5' }"
					>
						<div class="grid grid-cols-4 gap-1.5 p-0">
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center dark:border-[#3a332a] dark:bg-[#2a241d]">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storePaymentsPage.store') }}</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950" :title="selectedStore?.name || ''">
									{{ selectedStore?.name || "-" }}
								</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center dark:border-[#3a332a] dark:bg-[#2a241d]">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storePaymentsPage.all') }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ totalAccounts }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center dark:border-[#3a332a] dark:bg-[#2a241d]">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('storePaymentsPage.active') }}</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ activeAccounts }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center dark:border-[#3a332a] dark:bg-[#2a241d]">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">QR</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ qrAccounts }}</p>
							</div>
						</div>
					</UCard>

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] dark:border-[#3a332a] dark:bg-[#221d18] dark:shadow-[0_8px_24px_rgba(0,0,0,0.28)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5 dark:border-[#3a332a]">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storePaymentsPage.paymentFilters') }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500 dark:bg-[#2a241d] dark:text-stone-300">
									{{ t('storePaymentsPage.itemCount', { count: filteredAccounts.length }) }}
								</div>
							</div>

							<div class="grid gap-2 px-4 py-3">
								<div class="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)] md:items-end">
									<div class="min-w-0">
										<label class="mb-1 block text-[11px] font-medium text-stone-500" for="store-payment-currency-filter">
											{{ t('storePaymentsPage.currency') }}
										</label>
										<div class="relative">
											<select
												id="store-payment-currency-filter"
												v-model="accountCurrencyFilter"
												class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-100"
											>
												<option
													v-for="option in accountCurrencyOptions"
													:key="option.code"
													:value="option.code"
												>
													{{ option.label }}
												</option>
											</select>
											<UIcon
												name="i-heroicons-chevron-up-down"
												class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
											/>
										</div>
									</div>

									<div class="min-w-0">
										<label class="mb-1 block text-[11px] font-medium text-stone-500" for="store-payment-type-filter">
											{{ t('storePaymentsPage.accountType') }}
										</label>
										<div class="relative">
											<select
												id="store-payment-type-filter"
												v-model="accountTypeFilter"
												class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-100"
											>
												<option
													v-for="option in accountTypeFilterOptions"
													:key="option.id"
													:value="option.id"
												>
													{{ option.label }}
												</option>
											</select>
											<UIcon
												name="i-heroicons-arrows-up-down"
												class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
											/>
										</div>
									</div>
								</div>

								<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
									<AppButton
										v-for="status in accountStatusOptions"
										:key="status.id"
										:color="accountStatusFilter === status.id ? 'primary' : 'neutral'"
										:variant="accountStatusFilter === status.id ? 'solid' : 'soft'"
										size="md"
										class="whitespace-nowrap rounded-md"
										@click="accountStatusFilter = status.id"
									>
										{{ status.label }}
									</AppButton>
								</div>
							</div>
						</div>
					</div>

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] dark:border-[#3a332a] dark:bg-[#221d18] dark:shadow-[0_8px_24px_rgba(0,0,0,0.28)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5 dark:border-[#3a332a]">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('storePaymentsPage.paymentAccounts') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('storePaymentsPage.paymentAccountsDescription') }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500 dark:bg-[#2a241d] dark:text-stone-300">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="accountsPending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100 dark:bg-[#2a241d]" />
								</div>

								<div v-else-if="!filteredAccounts.length" class="flex min-h-[280px] items-center justify-center px-4 py-8 text-center">
									<div class="space-y-3">
										<p class="text-sm font-medium text-stone-900">
											{{ hasActiveAccountFilters ? t('storePaymentsPage.noFilterResults') : searchQuery ? t('storePaymentsPage.noSearchResults') : t('storePaymentsPage.noAccounts') }}
										</p>
										<p class="text-sm text-stone-500">
											{{ hasActiveAccountFilters ? t('storePaymentsPage.noFilterResultsHint') : searchQuery ? t('storePaymentsPage.noSearchResultsHint') : t('storePaymentsPage.noAccountsHint') }}
										</p>
										<AppButton
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-plus-20-solid"
											class="rounded-md"
											:disabled="hasActiveAccountFilters ? false : searchQuery ? false : !canUpdateStorePayments"
											@click="hasActiveAccountFilters ? clearAccountFilters() : searchQuery ? (searchQuery = '') : startCreateAccount()"
										>
											{{ hasActiveAccountFilters ? t('storePaymentsPage.clearFilters') : searchQuery ? t('storePaymentsPage.clearSearch') : t('storePaymentsPage.addFirstAccount') }}
										</AppButton>
									</div>
								</div>

								<table v-else class="min-w-[1180px] w-full border-separate border-spacing-0">
									<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
										<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.qrImage') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.accountName') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.currency') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.bankName') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.bankAccountNumber') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.phone') }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('storePaymentsPage.action') }}</th>
										</tr>
									</thead>
									<tbody>
										<tr
											v-for="account in paginatedAccounts"
											:key="account.id"
											class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50 dark:text-stone-200 dark:hover:bg-[#2b241d]"
											:class="accountModalOpen && editingAccountId === account.id ? 'bg-primary-50 dark:bg-[#2b241d]' : 'bg-white dark:bg-[#221d18]'"
											tabindex="0"
											@click="openAccountModal(account)"
											@keydown.enter.prevent="openAccountModal(account)"
											@keydown.space.prevent="openAccountModal(account)"
										>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<div class="flex items-center gap-3">
													<button
														v-if="account.qr_image_url"
														type="button"
														class="group flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md border border-neutral-200 bg-neutral-50 transition hover:border-primary-300 hover:bg-primary-50 dark:border-[#3a332a] dark:bg-[#2a241d] dark:hover:border-primary-500 dark:hover:bg-[#2f2620]"
														:aria-label="t('storePaymentsPage.viewQrImage', { account: account.display_name })"
														@click.stop="openQrPreview(account)"
													>
														<img
															:src="resolveQrImageUrl(account.qr_image_url)"
															:alt="t('storePaymentsPage.qrAccountAlt')"
															class="h-full w-full object-cover transition group-hover:scale-[1.02]"
														>
													</button>
													<div
														v-else
														class="flex h-14 w-14 shrink-0 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-[11px] font-medium text-stone-400 dark:border-[#3a332a] dark:bg-[#2a241d]"
													>
														-
													</div>
												</div>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<div class="flex min-w-0 flex-col gap-1">
													<div class="flex flex-wrap items-center gap-2">
														<p class="truncate text-sm font-semibold text-stone-900">{{ account.display_name }}</p>
														<UBadge v-if="Number(account.is_default) === 1" color="success" variant="soft" :label="t('storePaymentsPage.defaultAccount')" />
													</div>
													<p class="text-xs text-stone-500">{{ t('storePaymentsPage.accountDescription') }}</p>
												</div>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<UBadge
													:color="enabledCurrencyCodes.includes(normalizeCurrencyCode(account.currency) || currentCurrency) ? 'neutral' : 'warning'"
													variant="soft"
													:label="normalizeCurrencyCode(account.currency) || currentCurrency"
												/>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<div class="flex items-center gap-2.5 text-sm text-stone-700">
													<img v-if="bankLogo(account.bank_name)" :src="bankLogo(account.bank_name)" alt="" class="size-8 shrink-0 rounded object-contain">
													<!-- A bank typed by hand has no logo; a neutral mark keeps the column aligned. -->
													<span v-else-if="account.bank_name" class="grid size-8 shrink-0 place-items-center rounded bg-neutral-100 text-stone-400 dark:bg-white/5">
														<Landmark class="size-4" />
													</span>
													<div class="min-w-0 space-y-1">
														<p class="truncate font-medium text-stone-900">{{ account.bank_name || "-" }}</p>
														<p class="text-xs text-stone-500">{{ t('storePaymentsPage.bankDescription') }}</p>
													</div>
												</div>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<div class="space-y-1 text-sm text-stone-700">
													<p class="font-medium text-stone-900">{{ account.account_number || "-" }}</p>
													<p class="text-xs text-stone-500">{{ t('storePaymentsPage.accountNumberDescription') }}</p>
												</div>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 dark:border-[#342d26]">
												<div class="space-y-1 text-sm text-stone-700">
													<p class="font-medium text-stone-900">{{ account.qr_id || "-" }}</p>
													<p class="text-xs text-stone-500">{{ t('storePaymentsPage.phoneQrDescription') }}</p>
												</div>
											</td>
											<td class="border-b border-neutral-100 px-4 py-4 text-right dark:border-[#342d26]">
												<div class="flex items-center justify-end gap-2">
													<AppButton
														v-if="Number(account.is_default) !== 1"
														color="success"
														variant="soft"
														size="md"
														class="rounded-md"
														icon="i-heroicons-star-20-solid"
														:loading="settingDefaultId === account.id"
														:disabled="!canUpdateStorePayments || saving"
														@click.stop="setDefault(account)"
													>
														{{ t('storePaymentsPage.setDefaultAccount') }}
													</AppButton>
													<AppButton
														color="neutral"
														variant="soft"
														size="md"
														class="rounded-md"
														icon="i-heroicons-chevron-right-20-solid"
														:disabled="!canUpdateStorePayments"
														@click.stop="openAccountModal(account)"
													>
														{{ t('storePaymentsPage.manage') }}
													</AppButton>
												</div>
											</td>
										</tr>
									</tbody>
								</table>
							</div>

							<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.96)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]">
								<div class="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
									<div class="flex items-center justify-between gap-3 md:min-w-0 md:flex-1">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span class="sm:hidden">{{ pageSummaryText }}</span>
											<span class="hidden sm:inline">{{ pageLabel }} • {{ pageSummaryText }}</span>
										</div>
										<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 dark:bg-[#2a241d] dark:text-stone-300 sm:hidden">
											{{ pageLabel }}
										</div>
									</div>

									<div class="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end md:flex-nowrap md:justify-end">
										<div class="flex items-center gap-2">
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('storePaymentsPage.rowsPerPage') }}</label>
											<select
												:value="pageSize"
												class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-100"
												@change="updatePageSize(($event.target as HTMLSelectElement).value)"
											>
												<option v-for="option in pageSizeOptions" :key="option" :value="option">
													{{ option }}
												</option>
											</select>
										</div>

										<div class="flex items-center gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-left-20-solid"
												:disabled="currentPage <= 1 || accountsPending"
												:aria-label="t('storePaymentsPage.previousPage')"
												:title="t('storePaymentsPage.previousPage')"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">{{ t('storePaymentsPage.previous') }}</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || accountsPending"
												:aria-label="t('storePaymentsPage.nextPage')"
												:title="t('storePaymentsPage.nextPage')"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">{{ t('storePaymentsPage.next') }}</span>
											</AppButton>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<AppResponsivePanel
					v-model="accountModalOpen"
					:title="editingAccountId ? t('storePaymentsPage.editAccount') : t('storePaymentsPage.addAccount')"
					:description="t('storePaymentsPage.accountModalDescription')"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					full-bleed-header
					content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
				>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
							<input
								ref="qrImageInputRef"
								type="file"
								accept="image/*"
								class="hidden"
								@change="handleQrImageChange"
							>

							<div class="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-stone-700 dark:border-[#3a332a] dark:bg-[#2a241d] dark:text-stone-100">
								<UIcon name="i-heroicons-building-storefront-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
								<span class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('storePaymentsPage.store') }}</span>
								<UBadge color="neutral" variant="soft" class="max-w-full">
									<span class="truncate">{{ currentStoreName }}</span>
								</UBadge>
							</div>

							<div class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
								<div class="flex items-start gap-4">
									<button
										type="button"
										class="group flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed border-neutral-300 bg-neutral-50 transition hover:border-primary-300 hover:bg-primary-50 dark:border-[#3a332a] dark:bg-[#2a241d] dark:hover:border-primary-500 dark:hover:bg-[#2f2620]"
										@click="openQrImagePicker"
									>
										<img
											v-if="qrImagePreviewUrl"
											:src="qrImagePreviewUrl"
											:alt="t('storePaymentsPage.qrPreview')"
											class="h-full w-full object-cover"
										>
										<div v-else class="flex flex-col items-center gap-1 text-stone-400">
											<UIcon name="i-heroicons-photo-20-solid" class="h-5 w-5 transition group-hover:text-primary-500" />
											<span class="text-[11px] font-medium transition group-hover:text-primary-600">{{ t('storePaymentsPage.addImage') }}</span>
										</div>
									</button>

									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-center gap-2">
											<p class="text-sm font-medium text-stone-900">{{ t('storePaymentsPage.qrImageOptional') }}</p>
											<UBadge color="neutral" variant="soft" label="640px WebP" />
											<UBadge color="neutral" variant="soft" :label="t('storePaymentsPage.maxFileSize')" />
										</div>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('storePaymentsPage.qrImageHint') }}</p>
										<div class="mt-3 flex flex-wrap gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="xs"
												:icon="qrImageSelected ? 'i-heroicons-arrow-path-20-solid' : 'i-heroicons-photo-20-solid'"
											:label="qrImageSelected ? t('storePaymentsPage.changeImage') : t('storePaymentsPage.chooseImage')"
												@click="openQrImagePicker"
											/>
											<AppButton
												v-if="qrImageSelected"
												color="neutral"
												variant="ghost"
												size="xs"
												icon="i-heroicons-trash-20-solid"
											:label="t('storePaymentsPage.removeImage')"
												@click="removeQrImage"
											/>
										</div>
										<p v-if="qrImageName" class="mt-2 truncate text-xs text-stone-400">{{ qrImageName }}</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
								<div class="grid gap-4">
									<div class="space-y-2">
										<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.accountName') }}</label>
										<UInput
											v-model="form.display_name"
											size="lg"
											color="neutral"
											:placeholder="t('storePaymentsPage.accountNamePlaceholder')"
											class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18] dark:[&_input]:text-stone-100"
										/>
									</div>

										<div class="grid gap-4">
											<div class="space-y-2">
												<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.currency') }}</label>
												<select
													v-model="form.currency"
												class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-100"
												>
													<option v-for="option in enabledCurrencyOptions" :key="option.code" :value="option.code">
														{{ option.label }}
													</option>
												</select>
											</div>
										</div>

									<div class="space-y-2">
										<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.recipientName') }}</label>
										<UInput
											v-model="form.account_name"
											size="lg"
											color="neutral"
											:placeholder="t('storePaymentsPage.recipientNamePlaceholder')"
											class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18] dark:[&_input]:text-stone-100"
										/>
									</div>

									<div class="grid gap-4 sm:grid-cols-2">
										<div class="space-y-2">
											<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.bankName') }}</label>
											<div class="relative">
												<button
													ref="bankTriggerRef"
													type="button"
													class="flex w-full items-center gap-2.5 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-start text-sm shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#221d18]"
													@click="toggleBankPicker"
												>
													<img v-if="selectedBank" :src="selectedBank.logo" alt="" class="size-6 shrink-0 rounded object-contain">
													<span v-else-if="form.bank_name" class="grid size-6 shrink-0 place-items-center rounded bg-neutral-100 text-stone-400 dark:bg-white/5">
														<Landmark class="size-3.5" />
													</span>
													<span class="min-w-0 flex-1 truncate" :class="form.bank_name ? 'text-stone-900 dark:text-stone-100' : 'text-stone-400'">
														{{ form.bank_name || t('storePaymentsPage.bankNamePlaceholder') }}
													</span>
													<UIcon name="i-heroicons-chevron-up-down-20-solid" class="size-4 shrink-0 text-stone-400" />
												</button>

												<Teleport to="body">
													<div v-if="bankPickerOpen" class="fixed inset-0 z-[60]" @click="bankPickerOpen = false" />
													<div v-if="bankPickerOpen" :style="bankMenuStyle" class="z-[61] flex flex-col overflow-hidden rounded-md border border-neutral-200 bg-white shadow-2xl ring-1 ring-black/5 dark:border-[#3a332a] dark:bg-[#221d18]">
														<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto p-1">
														<button
															v-for="bank in LAO_BANKS"
															:key="bank.code"
															type="button"
															class="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-start transition hover:bg-neutral-50 dark:hover:bg-white/5"
															:class="form.bank_name === bank.name ? 'bg-primary-50 dark:bg-primary-500/10' : ''"
															@click="selectBank(bank)"
														>
															<img :src="bank.logo" alt="" class="size-8 shrink-0 rounded object-contain">
															<span class="min-w-0 flex-1">
																<span class="block text-sm font-medium text-stone-900 dark:text-stone-100">{{ bank.code }}</span>
																<span class="block truncate text-xs leading-4 text-stone-500">{{ bank.name }}</span>
															</span>
															<UIcon v-if="form.bank_name === bank.name" name="i-heroicons-check-20-solid" class="size-4 shrink-0 text-primary-600" />
														</button>
													</div>
														<!-- A shop banking somewhere not listed must still be able to say so. -->
														<div class="shrink-0 border-t border-neutral-100 p-1 dark:border-[#3a332a]">
															<button type="button" class="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-start text-sm text-stone-600 transition hover:bg-neutral-50 dark:text-stone-300 dark:hover:bg-white/5" @click="startCustomBank">
																<UIcon name="i-heroicons-pencil-square-20-solid" class="size-4 shrink-0 text-stone-400" />
																{{ t('storePaymentsPage.bankNameOther') }}
															</button>
														</div>
													</div>
												</Teleport>
											</div>
											<UInput
												v-if="bankNameCustom"
												v-model="form.bank_name"
												size="lg"
												color="neutral"
												:placeholder="t('storePaymentsPage.bankNamePlaceholder')"
												class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18]"
											/>
										</div>

										<div class="space-y-2">
											<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.accountNumber') }}</label>
											<UInput
												v-model="form.account_number"
												size="lg"
												color="neutral"
												:placeholder="t('storePaymentsPage.accountNumber')"
											class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18] dark:[&_input]:text-stone-100"
											/>
										</div>
									</div>

									<div class="grid gap-4 sm:grid-cols-2">
										<div class="space-y-2">
											<label class="text-sm font-medium text-stone-700">{{ t('storePaymentsPage.phoneOrQr') }}</label>
											<UInput
												v-model="form.qr_id"
												size="lg"
												color="neutral"
												:placeholder="t('storePaymentsPage.phoneOrQrPlaceholder')"
												class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 dark:[&_input]:border-[#3a332a] dark:[&_input]:bg-[#221d18] dark:[&_input]:text-stone-100"
											/>
										</div>

										<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-[#3a332a] dark:bg-[#2a241d]">
											<div class="flex items-start justify-between gap-4">
												<span class="min-w-0">
													<span class="block text-sm font-medium text-stone-900">{{ t('storePaymentsPage.activeAccount') }}</span>
													<span class="mt-1 block text-xs leading-5 text-stone-500">{{ t('storePaymentsPage.activeAccountHint') }}</span>
												</span>
												<label class="relative inline-flex shrink-0 cursor-pointer items-center">
													<input v-model="form.is_active" type="checkbox" class="peer sr-only">
													<span class="h-6 w-11 rounded-full bg-stone-200 transition peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-200 peer-checked:bg-primary-600" />
													<span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 dark:bg-[#fcfbf8]" />
												</label>
											</div>
										</div>
									</div>

									<div class="rounded-md border border-emerald-100 bg-emerald-50/70 px-4 py-3 dark:border-emerald-900/50 dark:bg-emerald-950/20">
										<div class="flex items-start justify-between gap-4">
											<span class="min-w-0">
												<span class="block text-sm font-medium text-stone-900">{{ t('storePaymentsPage.defaultAccount') }}</span>
												<span class="mt-1 block text-xs leading-5 text-stone-500">
													{{ isEditingDefaultAccount ? t('storePaymentsPage.alreadyDefaultAccount') : t('storePaymentsPage.defaultAccountHint') }}
												</span>
											</span>
											<label
												class="relative inline-flex shrink-0 items-center"
												:class="(!canUpdateStorePayments || saving || isEditingDefaultAccount) ? 'cursor-not-allowed' : 'cursor-pointer'"
											>
												<input
													v-model="form.is_default"
													type="checkbox"
													class="peer sr-only"
													:disabled="!canUpdateStorePayments || saving || isEditingDefaultAccount"
												>
												<span class="h-6 w-11 rounded-full bg-stone-200 transition peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-emerald-200 peer-checked:bg-emerald-500 peer-disabled:opacity-100" />
												<span class="absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition peer-checked:translate-x-5 dark:bg-[#fcfbf8]" />
											</label>
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3 text-xs leading-5 text-stone-500 dark:border-[#3a332a] dark:bg-[#2a241d] dark:text-stone-400">
								<p class="font-semibold text-stone-700">{{ t('storePaymentsPage.note') }}</p>
								<p class="mt-1">{{ t('storePaymentsPage.accountNote') }}</p>
							</div>
						</div>

						<div
							class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]"
							:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
						>
							<div class="grid w-full gap-2" :class="editingAccountId ? 'grid-cols-3' : 'grid-cols-2'">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeAccountModal">
									{{ t('storePaymentsPage.cancel') }}
								</AppButton>
								<AppButton
									v-if="editingAccountId"
									color="error"
									variant="soft"
									size="md"
									icon="i-heroicons-trash-20-solid"
									:block="true"
									:disabled="saving || deletingId === editingAccountId"
									@click="openDeleteConfirm"
								>
									{{ t('storePaymentsPage.delete') }}
								</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-check-20-solid"
									:loading="saving"
									:spin-icon-on-loading="true"
									:disabled="!canSave"
									:block="true"
									@click="saveAccount"
								>
									{{ editingAccountId ? t('storePaymentsPage.save') : t('storePaymentsPage.addAccount') }}
								</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="deleteConfirmOpen"
					:title="t('storePaymentsPage.deleteAccount')"
					:description="t('storePaymentsPage.deleteAccountDescription')"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@close="closeDeleteConfirm"
				>
					<div class="flex h-full min-h-0 flex-col">
						<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
							<div class="space-y-4 pb-6">
								<div class="rounded-md border border-error-200 bg-error-50 p-4 dark:border-error-900/60 dark:bg-error-950/20">
									<p class="text-sm font-semibold text-stone-950">{{ t('storePaymentsPage.permanentDelete') }}</p>
									<p class="mt-1 text-xs leading-5 text-stone-600">{{ t('storePaymentsPage.permanentDeleteHint') }}</p>
								</div>

								<div v-if="deleteTargetAccount" class="rounded-md border border-neutral-200 bg-neutral-50 p-4 dark:border-[#3a332a] dark:bg-[#2a241d]">
									<p class="text-sm font-medium text-stone-900">{{ deleteTargetAccount.display_name }}</p>
									<p class="mt-1 text-xs text-stone-500">{{ t('storePaymentsPage.store') }}: {{ currentStoreName }}</p>
									<p class="mt-1 text-xs text-stone-500">{{ t('storePaymentsPage.bankName') }}: {{ deleteTargetAccount.bank_name || "-" }}</p>
									<p class="mt-1 text-xs text-stone-500">{{ t('storePaymentsPage.phoneOrQr') }}: {{ deleteTargetAccount.qr_id || "-" }}</p>
								</div>

								<div class="rounded-md border border-neutral-200 bg-white p-4 dark:border-[#3a332a] dark:bg-[#221d18]">
									<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('storePaymentsPage.confirmDelete') }}</p>
									<p class="mt-3 text-sm text-stone-700">{{ t('storePaymentsPage.confirmDeleteHint', { account: deleteTargetLabel }) }}</p>
								</div>
							</div>
						</div>

						<div
							class="-mx-5 sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]"
							:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
						>
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDeleteConfirm">
									{{ t('storePaymentsPage.close') }}
								</AppButton>
								<AppButton
									color="error"
									variant="solid"
									size="md"
									icon="i-heroicons-trash-20-solid"
									:loading="deletingId === deleteTargetAccount?.id"
									:disabled="!deleteTargetAccount || deletingId === deleteTargetAccount.id"
									:spin-icon-on-loading="true"
									:block="true"
									@click="deleteAccount"
								>
									{{ t('storePaymentsPage.permanentDelete') }}
								</AppButton>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="qrPreviewOpen"
					:title="qrPreviewTitle"
					:description="t('storePaymentsPage.fullQrPreview')"
					desktop-width="720px"
					close-button-size="md"
					compact-header
					full-bleed-header
					content-class="flex h-full flex-col !overflow-hidden overflow-hidden"
					@close="closeQrPreview"
				>
					<div class="flex h-full min-h-0 flex-col items-center justify-center gap-4 px-4 py-6">
						<div class="flex w-full min-h-0 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 p-3 shadow-sm dark:border-[#3a332a] dark:bg-[#2a241d]">
							<img
								v-if="qrPreviewImageUrl"
								:src="qrPreviewImageUrl"
								:alt="qrPreviewTitle"
								class="max-h-[72vh] w-full max-w-full rounded-lg object-contain"
							>
							<div v-else class="py-10 text-sm text-stone-500">
								{{ t('storePaymentsPage.qrNotFound') }}
							</div>
						</div>
						<div class="w-full max-w-2xl rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-600 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-400">
							<p class="font-medium text-stone-900">{{ qrPreviewTitle }}</p>
							<p class="mt-1 text-xs text-stone-500">{{ t('storePaymentsPage.qrPreviewHint') }}</p>
						</div>
					</div>
				</AppResponsivePanel>
			</div>
		</template>
	</AppSidebarShell>
</template>
