<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

type StockState = "ready" | "low" | "out" | "negative" | "inactive";
type InventoryStatus = "all" | "low" | "out" | "negative" | "active" | "inactive";
type SortKey = "updated" | "name" | "available";
type AdjustmentMode = "increment" | "decrement" | "set";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiInventoryBalance = {
	store_id: string;
	product_id: string;
	sku: string;
	name: string;
	barcode: string | null;
	image_url: string | null;
	location: string | null;
	category_id: string | null;
	category_name: string | null;
	base_unit_id: string;
	unit_name: string | null;
	active: number;
	low_stock_threshold: number | null;
	out_stock_threshold: number | null;
	on_hand_base: number;
	reserved_base: number;
	available_base: number;
	updated_at: string;
};

type ApiInventoryList = {
	items: ApiInventoryBalance[];
	total: number;
	page: number;
	limit: number;
	totalPages: number;
	stats: {
		total: number;
		ready: number;
		low: number;
		out: number;
		negative: number;
		totalAvailableQty: number;
	};
	categories: Array<{
		id: string;
		label: string;
		count: number;
	}>;
};

	type ApiInventoryMovement = {
		id: string;
		store_id: string;
		product_id: string;
		product_name: string;
		product_sku: string;
		type: string;
		qty_base: number;
		ref_type: string;
		ref_id: string | null;
		note: string | null;
		created_by: string | null;
		created_by_name: string | null;
		created_at: string;
		unit_name: string | null;
	};

type InventoryRecord = {
	id: string;
	storeId: string;
	name: string;
	sku: string;
	barcode: string;
	location: string | null;
	categoryId: string;
	categoryLabel: string;
	unitLabel: string;
	status: "active" | "inactive";
	stockState: StockState;
	available: number;
	onHand: number;
	reserved: number;
	lowStockThreshold: number | null;
	outStockThreshold: number | null;
	imageUrl: string | null;
	imageKey: string;
	accent: string;
	updatedAt: string;
};

	const runtimeConfig = useRuntimeConfig();
	const { apiFetch } = useApiClient();
	const { can } = useAuthSession();
	const appToast = useAppToast();
	const { t, locale } = useI18n();

const statusOptions = computed<Array<{ id: InventoryStatus; label: string }>>(() => [
	{ id: "all", label: t("inventoryPage.all") },
	{ id: "active", label: t("inventoryPage.active") },
	{ id: "low", label: t("inventoryPage.lowStock") },
	{ id: "out", label: t("inventoryPage.outOfStock") },
	{ id: "negative", label: t("inventoryPage.negative") },
	{ id: "inactive", label: t("inventoryPage.inactive") },
]);

const sortOptions = computed<Array<{ id: SortKey; label: string }>>(() => [
	{ id: "updated", label: t("inventoryPage.updatedAt") },
	{ id: "name", label: t("inventoryPage.productName") },
	{ id: "available", label: t("inventoryPage.available") },
]);

const adjustmentModeOptions = computed<Array<{ id: AdjustmentMode; label: string; icon: string }>>(() => [
	{ id: "increment", label: t("inventoryPage.adjustmentIn"), icon: "i-heroicons-arrow-down-circle" },
	{ id: "decrement", label: t("inventoryPage.adjustmentOut"), icon: "i-heroicons-arrow-up-circle" },
	{ id: "set", label: t("inventoryPage.adjustmentSet"), icon: "i-heroicons-pencil-square" },
]);

const accentPalette = [
	"linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
	"linear-gradient(135deg, #d9f99d 0%, #65a30d 100%)",
	"linear-gradient(135deg, #bfdbfe 0%, #2563eb 100%)",
	"linear-gradient(135deg, #fecdd3 0%, #e11d48 100%)",
	"linear-gradient(135deg, #fde68a 0%, #d97706 100%)",
	"linear-gradient(135deg, #ddd6fe 0%, #7c3aed 100%)",
];

const searchQuery = ref("");
const activeCategory = ref("all");
const activeStatus = ref<InventoryStatus>("all");
const activeSort = ref<SortKey>("updated");
const selectedProductId = ref("");
const detailOpen = ref(false);
const searchInputRef = ref<{ input?: HTMLInputElement } | null>(null);
const scannerVideoRef = ref<HTMLVideoElement | null>(null);

	const balances = ref<InventoryRecord[]>([]);
	const balancesPending = ref(true);
	const balancesError = ref<string | null>(null);
const movements = ref<ApiInventoryMovement[]>([]);
const movementsPending = ref(false);
const movementsError = ref<string | null>(null);
const cameraScannerOpen = ref(false);
const cameraScannerStarting = ref(false);
const cameraScannerError = ref<string | null>(null);
	const adjustmentMode = ref<AdjustmentMode>("increment");
	const adjustmentQty = ref("");
	const adjustmentNote = ref("");
	const adjustmentQtyInputRef = ref<HTMLInputElement | null>(null);
const adjustmentSubmitting = ref(false);
const adjustmentBadgeIso = useState("inventory-adjustment-badge-iso", () => new Date().toISOString());
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50, 100];
	const balancesTotal = ref(0);
	const balancesTotalPages = ref(1);
	const inventoryStats = ref<ApiInventoryList["stats"]>({
		total: 0,
		ready: 0,
		low: 0,
		out: 0,
		negative: 0,
		totalAvailableQty: 0,
	});
	const inventoryCategories = ref<ApiInventoryList["categories"]>([]);

	let cameraScannerControls: { stop?: () => void } | null = null;
	let scannerBuffer = "";
	let scannerBufferTimer: ReturnType<typeof setTimeout> | null = null;
	let searchDebounceTimer: ReturnType<typeof setTimeout> | null = null;
	let balanceLoadSequence = 0;
	let lastScannerKeyAt = 0;
	let pendingScan: { code: string; source: "scanner" | "camera" } | null = null;

	const canAdjustInventory = computed(() => can("inventory.adjust"));
// Balances are derived from products and filtered on the server, so an empty
// list without filters means the store has no products to track yet.
const hasActiveInventoryFilters = computed(() => (
	Boolean(searchQuery.value.trim())
	|| activeCategory.value !== "all"
	|| activeStatus.value !== "all"
));
const canCreateProduct = computed(() => can("products.create"));

function clearInventoryFilters() {
	searchQuery.value = "";
	activeCategory.value = "all";
	activeStatus.value = "all";
}
	const canUpdateProduct = computed(() => can("products.update"));

const categoryOptions = computed(() => [
	{ id: "all", label: t("inventoryPage.all") },
	...inventoryCategories.value.map((category) => ({ id: category.id, label: category.label })),
]);

const filteredBalances = computed(() => balances.value);

const selectedBalance = computed(() =>
	balances.value.find((item) => item.id === selectedProductId.value)
	?? filteredBalances.value[0]
	?? balances.value[0],
);

const categoryCounts = computed(() =>
	categoryOptions.value.reduce<Record<string, number>>((result, category) => {
		result[category.id] = category.id === "all"
			? inventoryStats.value.total
			: inventoryCategories.value.find((item) => item.id === category.id)?.count || 0;
		return result;
	}, {}),
);

const totalSkuCount = computed(() => inventoryStats.value.total);
const readyCount = computed(() => inventoryStats.value.ready);
const lowCount = computed(() => inventoryStats.value.low);
const outCount = computed(() => inventoryStats.value.out);
const negativeCount = computed(() => inventoryStats.value.negative);
const totalAvailableQty = computed(() => inventoryStats.value.totalAvailableQty);
const totalItems = computed(() => balancesTotal.value);
const totalPages = computed(() => balancesTotalPages.value);
const paginatedBalances = computed(() => balances.value);
const pageLabel = computed(() => t("inventoryPage.pageLabel", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? t("inventoryPage.noData")
		: t("inventoryPage.pageSummary", { start: pageStart.value, end: pageEnd.value, count: totalItems.value })
));

watch(balances, (value) => {
	if (!value.length) {
		selectedProductId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((item) => item.id === selectedProductId.value)) {
		selectedProductId.value = value[0].id;
	}
}, { immediate: true });

	watch([detailOpen, selectedProductId], ([open]) => {
		if (!open) return;
		adjustmentMode.value = "increment";
		adjustmentQty.value = "";
		adjustmentNote.value = "";
		adjustmentBadgeIso.value = new Date().toISOString();
		if (!selectedBalance.value) return;
		void loadMovements(selectedBalance.value.storeId, selectedBalance.value.id);
	}, { immediate: false });

watch(searchQuery, () => {
	currentPage.value = 1;
	if (searchDebounceTimer) clearTimeout(searchDebounceTimer);
	searchDebounceTimer = setTimeout(() => {
		void loadBalances();
	}, pendingScan ? 0 : 250);
});

watch([activeCategory, activeStatus, activeSort], () => {
	currentPage.value = 1;
	void loadBalances();
});

function formatDate(value: string) {
	return formatAppDateTime(value, locale.value as "th" | "lo" | "en");
}

function formatQty(value: number) {
	return new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH").format(value);
}

function getInitials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "ST";
}

function getAccent(seed: string) {
	const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
	return accentPalette[total % accentPalette.length] as string;
}

function resolveImageUrl(imageUrl: string | null) {
	if (!imageUrl) return null;
	const normalized = imageUrl.trim();
	if (!normalized) return null;
	if (/^(https?:\/\/|data:|blob:)/i.test(normalized) || normalized.startsWith("//")) return normalized;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = normalized.startsWith("/") ? normalized : `/${normalized}`;
	return `${base}${path}`;
}

function getStockState(item: ApiInventoryBalance): StockState {
	if (!item.active) return "inactive";
	if (item.available_base < 0) return "negative";
	if (item.available_base <= 0) return "out";
	if (item.low_stock_threshold !== null && item.low_stock_threshold > 0 && item.available_base <= item.low_stock_threshold) {
		return "low";
	}
	return "ready";
}

function mapBalance(item: ApiInventoryBalance): InventoryRecord {
	const categoryId = item.category_id || "uncategorized";
	return {
		id: item.product_id,
		storeId: item.store_id,
		name: item.name,
		sku: item.sku,
		barcode: item.barcode || "-",
		location: item.location?.trim() ? item.location.trim() : null,
		categoryId,
		categoryLabel: item.category_name || t("inventoryPage.uncategorized"),
		unitLabel: item.unit_name || t("inventoryPage.baseUnit"),
		status: item.active ? "active" : "inactive",
		stockState: getStockState(item),
		available: Number(item.available_base || 0),
		onHand: Number(item.on_hand_base || 0),
		reserved: Number(item.reserved_base || 0),
		lowStockThreshold: item.low_stock_threshold ?? null,
		outStockThreshold: item.out_stock_threshold ?? null,
		imageUrl: resolveImageUrl(item.image_url),
		imageKey: getInitials(item.name),
		accent: getAccent(item.product_id),
		updatedAt: formatDate(item.updated_at),
	};
}

function getStockTone(state: StockState) {
	if (state === "ready") return "success";
	if (state === "low") return "warning";
	if (state === "out" || state === "negative") return "error";
	return "neutral";
}

function getStockLabel(item: InventoryRecord) {
	if (item.stockState === "inactive") return t("inventoryPage.inactive");
	if (item.stockState === "negative") return t("inventoryPage.negativeStock");
	if (item.stockState === "out") return t("inventoryPage.outOfStock");
	if (item.stockState === "low") return t("inventoryPage.belowThreshold", { count: item.lowStockThreshold ?? 0 });
	return t("inventoryPage.readyForSale");
}

function getMovementTone(type: string) {
	if (type.includes("_IN")) return "success";
	if (type.includes("_OUT")) return "warning";
	if (type.includes("_SET")) return "neutral";
	return "neutral";
}

function getMovementLabel(type: string) {
	if (type === "ADJUSTMENT_IN") return t("inventoryPage.adjustmentIn");
	if (type === "ADJUSTMENT_OUT") return t("inventoryPage.adjustmentOut");
	if (type === "ADJUSTMENT_SET") return t("inventoryPage.adjustmentSet");
	return type;
}

function getMovementQtyLabel(value: number) {
	if (value > 0) return `+${formatQty(value)}`;
	return formatQty(value);
}

async function loadBalances() {
	const loadSequence = ++balanceLoadSequence;
	balancesPending.value = true;
	balancesError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiInventoryList>>("/inventory", {
			query: {
				page: currentPage.value,
				limit: pageSize.value,
				query: searchQuery.value.trim() || undefined,
				category_id: activeCategory.value === "all" ? undefined : activeCategory.value,
				status: activeStatus.value,
				sort: activeSort.value,
			},
		});
		if (loadSequence !== balanceLoadSequence) return;
		balances.value = response.data.items.map(mapBalance);
		balancesTotal.value = response.data.total;
		balancesTotalPages.value = Math.max(1, response.data.totalPages);
		inventoryStats.value = response.data.stats;
		inventoryCategories.value = response.data.categories;

		if (currentPage.value > balancesTotalPages.value) {
			currentPage.value = balancesTotalPages.value;
			void loadBalances();
			return;
		}

		if (!selectedProductId.value && balances.value.length) {
			selectedProductId.value = balances.value[0].id;
		}

		if (pendingScan) {
			const scan = pendingScan;
			pendingScan = null;
			const normalized = scan.code.toLowerCase();
			const matched = balances.value.find((item) => (
				item.barcode.toLowerCase() === normalized || item.sku.toLowerCase() === normalized
			));

			if (matched) openDetail(matched.id);
			toastInfo(
				matched
					? t("inventoryPage.scanFound", { source: scan.source === "camera" ? t("inventoryPage.cameraScan") : t("inventoryPage.scan"), code: scan.code, name: matched.name })
					: t("inventoryPage.scanNotFound", { source: scan.source === "camera" ? t("inventoryPage.cameraScan") : t("inventoryPage.scan"), code: scan.code }),
			);
		}
	} catch (error) {
		if (loadSequence !== balanceLoadSequence) return;
		pendingScan = null;
		balances.value = [];
		balancesTotal.value = 0;
		balancesTotalPages.value = 1;
		balancesError.value = resolveApiErrorMessage(error, t("inventoryPage.loadFailed"));
	} finally {
		if (loadSequence === balanceLoadSequence) balancesPending.value = false;
	}
}

async function loadMovements(storeId: string, productId: string) {
	movementsPending.value = true;
	movementsError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiInventoryMovement[]>>("/inventory/movements", {
			query: {
				store_id: storeId,
				product_id: productId,
				limit: 12,
			},
		});
		movements.value = response.data;
	} catch (error) {
		movements.value = [];
		movementsError.value = resolveApiErrorMessage(error, t("inventoryPage.loadMovementsFailed"));
	} finally {
		movementsPending.value = false;
	}
}

	function toastInfo(message: string, timeout = 2200) {
		appToast.info({ title: message, timeout });
	}

	function toastSuccess(message: string, timeout = 2200) {
		appToast.success({ title: message, timeout });
	}

	function toastError(message: string, timeout = 3200) {
		appToast.error({ title: message, timeout });
	}

function focusSearchInput() {
	const input = searchInputRef.value?.input;
	input?.focus();
	input?.select();
}

	function openDetail(productId: string) {
		selectedProductId.value = productId;
		adjustmentMode.value = "increment";
		adjustmentQty.value = "";
		adjustmentNote.value = "";
		adjustmentBadgeIso.value = new Date().toISOString();
		detailOpen.value = true;
	}

	function closeDetail() {
		detailOpen.value = false;
		adjustmentMode.value = "increment";
		adjustmentQty.value = "";
		adjustmentNote.value = "";
	}

	function openSelectedProductLocationEditor() {
		if (!selectedBalance.value) return;
		if (!canUpdateProduct.value) {
			toastError(t("inventoryPage.locationPermissionDenied"));
			return;
		}
		detailOpen.value = false;
		navigateTo(`/products?edit_product_id=${encodeURIComponent(selectedBalance.value.id)}&focus=location`);
	}

	function formatIntegerWithCommas(value: string) {
		const digits = value.replace(/\D/g, "");
		if (!digits) return "";
		const normalized = digits.replace(/^0+(?=\d)/, "");
		return normalized.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
	}

	function caretIndexFromDigitCount(value: string, digitCount: number) {
		if (digitCount <= 0) return 0;
		let seen = 0;
		for (let i = 0; i < value.length; i += 1) {
			if (/\d/.test(value[i] || "")) {
				seen += 1;
				if (seen >= digitCount) return i + 1;
			}
		}
		return value.length;
	}

	function handleAdjustmentQtyInput(event: Event) {
		const input = event.target as HTMLInputElement | null;
		if (!input) return;

		const rawValue = input.value || "";
		const selectionStart = input.selectionStart ?? rawValue.length;
		const digitsBeforeCaret = rawValue.slice(0, selectionStart).replace(/\D/g, "").length;
		const nextFormatted = formatIntegerWithCommas(rawValue);

		if (adjustmentQty.value === nextFormatted) return;
		adjustmentQty.value = nextFormatted;

		nextTick(() => {
			const el = adjustmentQtyInputRef.value;
			if (!el) return;
			const nextCaret = caretIndexFromDigitCount(nextFormatted, digitsBeforeCaret);
			el.setSelectionRange(nextCaret, nextCaret);
		});
	}

function selectFromScan(code: string, source: "scanner" | "camera") {
	const normalized = code.trim();
	if (!normalized) return;

	pendingScan = { code: normalized, source };
	currentPage.value = 1;
	if (searchQuery.value === normalized) {
		void loadBalances();
	} else {
		searchQuery.value = normalized;
	}

	nextTick(() => {
		focusSearchInput();
	});
}

function flushScannerBuffer() {
	if (scannerBuffer.length < 3) {
		scannerBuffer = "";
		return;
	}

	selectFromScan(scannerBuffer, "scanner");
	scannerBuffer = "";
}

function resetScannerBufferTimer() {
	if (scannerBufferTimer) {
		clearTimeout(scannerBufferTimer);
	}

	scannerBufferTimer = setTimeout(() => {
		flushScannerBuffer();
	}, 90);
}

function handleGlobalScannerKeydown(event: KeyboardEvent) {
	const target = event.target as HTMLElement | null;
	const isEditable = target instanceof HTMLInputElement ||
		target instanceof HTMLTextAreaElement ||
		Boolean(target?.isContentEditable);

	if (isEditable || event.metaKey || event.ctrlKey || event.altKey) {
		return;
	}

	if (event.key === "Enter") {
		if (scannerBuffer.length >= 3) {
			event.preventDefault();
			flushScannerBuffer();
		}
		return;
	}

	if (event.key.length !== 1) return;

	const now = Date.now();
	if (now - lastScannerKeyAt > 80) {
		scannerBuffer = "";
	}

	lastScannerKeyAt = now;
	scannerBuffer += event.key;
	resetScannerBufferTimer();
}

function submitSearchInput() {
	const normalized = searchQuery.value.trim();
	if (!normalized) return;
	selectFromScan(normalized, "scanner");
}

function scrollInventoryListToTop() {
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
	void loadBalances();
	nextTick(() => {
		scrollInventoryListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
	void loadBalances();
	nextTick(() => {
		scrollInventoryListToTop();
	});
}

function stopCameraScanner() {
	cameraScannerControls?.stop?.();
	cameraScannerControls = null;
	if (scannerVideoRef.value) {
		scannerVideoRef.value.srcObject = null;
	}
	cameraScannerOpen.value = false;
	cameraScannerStarting.value = false;
	cameraScannerError.value = null;
}

async function openCameraScanner() {
	cameraScannerOpen.value = true;
	cameraScannerStarting.value = true;
	cameraScannerError.value = null;

	await nextTick();

	try {
		const videoElement = scannerVideoRef.value;
		if (!videoElement) {
			cameraScannerStarting.value = false;
			cameraScannerError.value = t("inventoryPage.cameraPreviewUnavailable");
			return;
		}

		stopCameraScanner();
		cameraScannerOpen.value = true;
		cameraScannerStarting.value = true;

		const { BrowserMultiFormatReader } = await import("@zxing/browser");
		const reader = new BrowserMultiFormatReader();
		const controls = await reader.decodeFromConstraints(
			{
				video: {
					facingMode: { ideal: "environment" },
				},
			},
			videoElement,
			(result, error, activeControls) => {
				if (result) {
					const text = typeof result.getText === "function"
						? result.getText()
						: String((result as { text?: string }).text || "");

					if (text) {
						selectFromScan(text, "camera");
						activeControls?.stop?.();
						cameraScannerControls = null;
						cameraScannerOpen.value = false;
						cameraScannerStarting.value = false;
					}
					return;
				}

				if (error && error.name !== "NotFoundException") {
					cameraScannerError.value = t("inventoryPage.cameraReadFailed");
				}
			},
		);

		cameraScannerControls = controls;
		cameraScannerStarting.value = false;
	} catch (error) {
		cameraScannerStarting.value = false;
		cameraScannerError.value = error instanceof Error
			? error.message
			: t("inventoryPage.cameraOpenFailed");
	}
}

	async function submitAdjustment() {
		if (!selectedBalance.value || adjustmentSubmitting.value) return;

		const qty = Number(String(adjustmentQty.value).replace(/\D/g, ""));
		if (!Number.isFinite(qty) || (adjustmentMode.value === "set" ? qty < 0 : qty <= 0)) {
			toastError(t("inventoryPage.invalidQuantity"));
			return;
		}

		adjustmentSubmitting.value = true;
		try {
			const response = await apiFetch<ApiEnvelope<{ balance: ApiInventoryBalance; movement: ApiInventoryMovement }>>("/inventory/adjustments", {
				method: "POST",
				body: {
					store_id: selectedBalance.value.storeId,
					product_id: selectedBalance.value.id,
					mode: adjustmentMode.value,
					qty_base: qty,
					note: adjustmentNote.value.trim() || null,
				},
			});

			// Update list immediately (avoid stale values while waiting for refetch).
			const nextRecord = mapBalance(response.data.balance);
			balances.value = balances.value.map((item) => item.id === nextRecord.id ? nextRecord : item);
			if (detailOpen.value && selectedBalance.value?.id === nextRecord.id) {
				movements.value = [response.data.movement, ...movements.value].slice(0, 12);
			}

			toastSuccess(t("inventoryPage.adjustmentSaved"));
			adjustmentQty.value = "";
			adjustmentNote.value = "";
			// Still refresh from API for correctness (sorting/filtering may change).
			void loadBalances();
			if (selectedBalance.value) {
				void loadMovements(selectedBalance.value.storeId, selectedBalance.value.id);
			}
		} catch (error) {
			toastError(resolveApiErrorMessage(error, t("inventoryPage.adjustmentSaveFailed")));
		} finally {
			adjustmentSubmitting.value = false;
		}
	}

onMounted(() => {
	loadBalances();
	window.addEventListener("keydown", handleGlobalScannerKeydown);
});

	onBeforeUnmount(() => {
		stopCameraScanner();
		if (scannerBufferTimer) {
			clearTimeout(scannerBufferTimer);
		}
		if (searchDebounceTimer) {
			clearTimeout(searchDebounceTimer);
		}
		window.removeEventListener("keydown", handleGlobalScannerKeydown);
	});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['stock']"
		:sidebar-eyebrow="t('inventoryPage.title')"
		:sidebar-title="t('inventoryPage.title')"
		sidebar-compact-title="STK"
		:sidebar-description="t('inventoryPage.sidebarDescription')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title=""
					compact
					:description="t('inventoryPage.headerDescription')"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								ref="searchInputRef"
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								:placeholder="t('inventoryPage.searchPlaceholder')"
								color="neutral"
								class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:pr-12 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
								@keydown.enter.prevent="submitSearchInput"
							/>
							<AppButton
								v-if="searchQuery"
								color="neutral"
								variant="ghost"
								size="xs"
								icon="i-heroicons-x-mark-20-solid"
								class="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-md"
								:aria-label="t('inventoryPage.clearSearch')"
								:title="t('inventoryPage.clearSearch')"
								@click="searchQuery = ''"
							/>
						</div>

						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-clock-20-solid"
							class="justify-center rounded-md"
							:aria-label="t('inventoryPage.inventoryHistory')"
							:title="t('inventoryPage.inventoryHistory')"
							@click="navigateTo('/inventory/history')"
						>
							<span class="hidden sm:inline">{{ t('inventoryPage.history') }}</span>
						</AppButton>

						<AppButton
							color="primary"
							variant="soft"
							size="md"
							icon="i-heroicons-qr-code-20-solid"
							class="justify-center rounded-md"
							:aria-label="t('inventoryPage.scanBarcode')"
							:title="t('inventoryPage.scanBarcode')"
							@click="openCameraScanner"
						>
							<span class="hidden sm:inline">{{ t('inventoryPage.scanBarcode') }}</span>
						</AppButton>

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="justify-center rounded-md"
								:aria-label="t('inventoryPage.reload')"
								:title="t('inventoryPage.reload')"
								:loading="balancesPending"
								:disabled="balancesPending"
								:spin-icon-on-loading="true"
								@click="loadBalances"
							>
								<span class="hidden sm:inline">{{ t('inventoryPage.reload') }}</span>
							</AppButton>
					</div>
				</AppPageHeader>

				<UCard
					class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md"
					:ui="{ body: 'p-1.5 sm:p-2 lg:p-2.5' }"
				>
					<div class="grid grid-cols-4 gap-1.5 p-0">
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('inventoryPage.all') }}</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ totalSkuCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('inventoryPage.low') }}</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ lowCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('inventoryPage.out') }}</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ outCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">{{ t('inventoryPage.negative') }}</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ negativeCount }}</p>
						</div>
					</div>
				</UCard>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ t('inventoryPage.stockFilters') }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ t('inventoryPage.itemCount', { count: totalItems }) }}
							</div>
						</div>

						<div class="grid gap-2 px-4 py-3">
							<div class="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)] md:items-end">
								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500" for="inventory-category-select">
										{{ t('inventoryPage.category') }}
									</label>
									<div class="relative">
										<select
											id="inventory-category-select"
											v-model="activeCategory"
											class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="category in categoryOptions" :key="category.id" :value="category.id">
												{{ category.label }} ({{ categoryCounts[category.id] }})
											</option>
										</select>
										<UIcon
											name="i-heroicons-chevron-up-down"
											class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
										/>
									</div>
								</div>

								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500" for="inventory-sort-select">
										{{ t('inventoryPage.sort') }}
									</label>
									<div class="relative">
										<select
											id="inventory-sort-select"
											v-model="activeSort"
											class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="sort in sortOptions" :key="sort.id" :value="sort.id">
												{{ sort.label }}
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
									v-for="status in statusOptions"
									:key="status.id"
									:color="activeStatus === status.id ? 'primary' : 'neutral'"
									:variant="activeStatus === status.id ? 'solid' : 'soft'"
									size="md"
									class="whitespace-nowrap rounded-md"
									@click="activeStatus = status.id"
								>
									{{ status.label }}
								</AppButton>
							</div>
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ t('inventoryPage.title') }}</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('inventoryPage.listDescription') }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ pageSummaryText }}
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="balancesPending" class="min-h-[280px]">
								<AppInlineLoadingBar container-class="bg-neutral-100" />
							</div>
							<div v-else-if="balancesError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm text-stone-600">{{ balancesError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" :label="t('inventoryPage.tryAgain')" @click="loadBalances" />
								</div>
							</div>
							<div v-else-if="!filteredBalances.length" class="flex h-full min-h-[55vh] flex-col items-center justify-center px-4 text-center">
								<span class="flex size-11 items-center justify-center rounded-md border border-neutral-200 bg-white text-primary-600 shadow-sm">
									<UIcon :name="hasActiveInventoryFilters ? 'i-heroicons-magnifying-glass' : 'i-heroicons-cube'" class="size-5" />
								</span>
								<p class="mt-3 font-semibold text-stone-900">
									{{ hasActiveInventoryFilters ? t('inventoryPage.noResults') : t('inventoryPage.emptyCatalog') }}
								</p>
								<p class="mt-1 max-w-md text-sm leading-6 text-stone-500">
									{{ hasActiveInventoryFilters
										? t('inventoryPage.noResultsHint')
										: (canCreateProduct ? t('inventoryPage.emptyCatalogHint') : t('inventoryPage.emptyCatalogHintReadOnly')) }}
								</p>
								<AppButton
									v-if="hasActiveInventoryFilters"
									class="mt-4 rounded-md"
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-x-mark-20-solid"
									@click="clearInventoryFilters"
								>
									{{ t('inventoryPage.clearFilters') }}
								</AppButton>
								<AppButton
									v-else-if="canCreateProduct"
									class="mt-4 rounded-md"
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-plus-20-solid"
									@click="navigateTo('/products')"
								>
									{{ t('inventoryPage.emptyCatalogAction') }}
								</AppButton>
							</div>

							<table v-else class="min-w-[1100px] w-full border-separate border-spacing-0">
								<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
									<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.product') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.category') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.available') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.onHand') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.reserved') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.status') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.updated') }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('inventoryPage.action') }}</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="item in paginatedBalances"
										:key="item.id"
										class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
										:class="detailOpen && selectedProductId === item.id ? 'bg-primary-50' : 'bg-white'"
										@click="openDetail(item.id)"
									>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<div class="flex items-start gap-3">
												<div class="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md text-base font-semibold text-white" :style="{ background: item.accent }">
													<img v-if="item.imageUrl" :src="item.imageUrl" :alt="item.name" class="h-full w-full object-cover">
													<UIcon v-else name="i-heroicons-cube" class="h-5 w-5 text-white/95" />
												</div>
										<div class="min-w-0">
													<div class="flex flex-wrap items-center gap-2">
														<p class="truncate font-semibold text-stone-950">{{ item.name }}</p>
														<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
													</div>
													<p class="mt-1 truncate text-xs text-stone-500">
														{{ item.sku }} · {{ item.barcode }}<span v-if="item.location"> · {{ item.location }}</span>
													</p>
												</div>
											</div>
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
											{{ item.categoryLabel }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 font-semibold text-stone-950 tabular-nums">
											{{ formatQty(item.available) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 tabular-nums">
											{{ formatQty(item.onHand) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 tabular-nums">
											{{ formatQty(item.reserved) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="item.status === 'active' ? 'info' : 'neutral'" variant="soft" :label="item.status === 'active' ? t('inventoryPage.active') : t('inventoryPage.inactive')" />
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
											{{ item.updatedAt }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-right-20-solid"
												@click.stop="openDetail(item.id)"
											>
												{{ t('inventoryPage.manage') }}
											</AppButton>
										</td>
									</tr>
								</tbody>
							</table>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
								<div class="flex items-center justify-between gap-3 md:min-w-0 md:flex-1">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
										<span class="sm:hidden">{{ pageSummaryText }}</span>
										<span class="hidden sm:inline">{{ pageLabel }} • {{ pageSummaryText }}</span>
									</div>
									<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 sm:hidden">
										{{ pageLabel }}
									</div>
								</div>

								<div class="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end md:flex-nowrap md:justify-end">
									<div class="flex items-center gap-2">
										<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('inventoryPage.perPage') }}</label>
										<select
											:value="pageSize"
											class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
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
											:disabled="currentPage <= 1 || balancesPending"
											:aria-label="t('inventoryPage.previousPage')"
											:title="t('inventoryPage.previousPage')"
											@click="goToPage(currentPage - 1)"
										>
											<span class="hidden sm:inline">{{ t('inventoryPage.previous') }}</span>
										</AppButton>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											class="rounded-md"
											trailing-icon="i-heroicons-chevron-right-20-solid"
											:disabled="currentPage >= totalPages || balancesPending"
											:aria-label="t('inventoryPage.nextPage')"
											:title="t('inventoryPage.nextPage')"
											@click="goToPage(currentPage + 1)"
										>
											<span class="hidden sm:inline">{{ t('inventoryPage.next') }}</span>
										</AppButton>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<AppResponsivePanel
					v-if="selectedBalance"
					v-model="detailOpen"
					:title="t('inventoryPage.stockDetails')"
					:description="t('inventoryPage.stockDetailsDescription')"
					desktop-width="680px"
					:show-handle="false"
					close-button-size="md"
					compact-header
					full-bleed-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@close="closeDetail"
				>
					<template #default>
						<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
							<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-3">
									<div class="flex items-start gap-3">
										<div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md text-2xl font-semibold text-white" :style="{ background: selectedBalance.accent }">
											<img
												v-if="selectedBalance.imageUrl"
												:src="selectedBalance.imageUrl"
												:alt="selectedBalance.name"
												class="h-full w-full object-cover"
											>
											<UIcon v-else name="i-heroicons-cube" class="h-7 w-7 text-white/95" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-start justify-between gap-2">
												<div class="min-w-0">
													<h3 class="truncate text-lg font-semibold text-stone-950">{{ selectedBalance.name }}</h3>
													<p class="mt-1 truncate text-sm text-stone-500">
														{{ selectedBalance.sku }} · {{ selectedBalance.barcode }}<span v-if="selectedBalance.location"> · {{ selectedBalance.location }}</span>
													</p>
												</div>
												<UBadge :color="getStockTone(selectedBalance.stockState)" variant="soft" :label="getStockLabel(selectedBalance)" />
											</div>

											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge color="neutral" variant="soft" :label="selectedBalance.categoryLabel" />
												<UBadge color="neutral" variant="soft" :label="selectedBalance.unitLabel" />
											</div>
										</div>
									</div>
								</div>

								<div class="grid grid-cols-3 gap-2">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">{{ t('inventoryPage.available') }}</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.available) }}</p>
									</div>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">{{ t('inventoryPage.onHand') }}</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.onHand) }}</p>
									</div>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">{{ t('inventoryPage.reserved') }}</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.reserved) }}</p>
									</div>
								</div>

								<section class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-start justify-between gap-3">
										<div>
											<h3 class="text-sm font-semibold text-stone-900">{{ t('inventoryPage.adjustStock') }}</h3>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('inventoryPage.adjustStockDescription') }}</p>
										</div>
										<UBadge color="neutral" variant="soft" :label="formatDate(adjustmentBadgeIso)" />
									</div>

										<div class="mt-3 flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-stone-700">
											<UIcon name="i-heroicons-map-pin-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
											<span class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('inventoryPage.productLocation') }}</span>
											<UBadge color="neutral" variant="soft" class="max-w-full">
												<span class="truncate">{{ selectedBalance.location || t('inventoryPage.notSet') }}</span>
											</UBadge>
											<AppButton
												v-if="canUpdateProduct"
												color="neutral"
												variant="soft"
												size="xs"
												class="ml-auto rounded-md"
												icon="i-heroicons-pencil-square-20-solid"
												:label="selectedBalance.location ? t('inventoryPage.edit') : t('inventoryPage.set')"
												@click="openSelectedProductLocationEditor"
											/>
										</div>

									<div class="mt-4 grid gap-2 sm:grid-cols-3">
										<AppButton
											v-for="mode in adjustmentModeOptions"
											:key="mode.id"
											:color="adjustmentMode === mode.id ? 'primary' : 'neutral'"
											:variant="adjustmentMode === mode.id ? 'soft' : 'ghost'"
											size="md"
											class="justify-center rounded-md"
											:icon="mode.icon"
											@click="adjustmentMode = mode.id"
										>
											{{ mode.label }}
										</AppButton>
									</div>

									<div class="mt-4 grid gap-3">
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('inventoryPage.quantityBaseUnit') }}</label>
												<input
													v-model="adjustmentQty"
													ref="adjustmentQtyInputRef"
													type="text"
													inputmode="numeric"
													pattern="[0-9,]*"
													class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
													:placeholder="t('inventoryPage.quantityPlaceholder')"
													@input="handleAdjustmentQtyInput"
												>
											</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('inventoryPage.note') }}</label>
											<textarea
												v-model="adjustmentNote"
												rows="3"
												class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												:placeholder="t('inventoryPage.notePlaceholder')"
											/>
										</div>
										<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" class="justify-center rounded-md" :loading="adjustmentSubmitting" :disabled="!canAdjustInventory" :spin-icon-on-loading="true" @click="submitAdjustment">
											{{ t('inventoryPage.saveAdjustment') }}
										</AppButton>
									</div>
								</section>

								<section class="space-y-3">
									<div class="flex items-center justify-between gap-3">
										<h3 class="text-sm font-semibold text-stone-900">{{ t('inventoryPage.movementHistory') }}</h3>
										<div class="flex items-center gap-2">
											<UBadge color="neutral" variant="soft" :label="t('inventoryPage.itemCount', { count: movements.length })" />
											<AppButton
												color="neutral"
												variant="soft"
												size="xs"
												icon="i-heroicons-arrow-top-right-on-square-20-solid"
												:label="t('inventoryPage.viewAll')"
												@click="navigateTo(`/inventory/history?product_id=${encodeURIComponent(selectedBalance.id)}`)"
											/>
										</div>
									</div>

									<UCard
										v-if="movementsPending"
										class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
									>
										<div class="py-8 text-center">
											<p class="text-sm font-semibold text-stone-900">{{ t('inventoryPage.loadingHistory') }}</p>
										</div>
									</UCard>

									<UCard
										v-else-if="movementsError"
										class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"
									>
										<div class="py-6 text-center">
											<p class="text-sm font-semibold text-stone-900">{{ t('inventoryPage.loadMovementsFailed') }}</p>
											<p class="mt-2 text-xs text-stone-500">{{ movementsError }}</p>
										</div>
									</UCard>

									<UCard
										v-else-if="movements.length === 0"
										class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
									>
										<div class="py-6 text-center">
											<p class="text-sm font-semibold text-stone-900">{{ t('inventoryPage.noMovementHistory') }}</p>
											<p class="mt-2 text-xs text-stone-500">{{ t('inventoryPage.noMovementHistoryHint') }}</p>
										</div>
									</UCard>

									<div v-else class="space-y-2">
										<div
											v-for="movement in movements"
											:key="movement.id"
											class="rounded-md border border-neutral-200 bg-white p-3"
										>
											<div class="flex items-start justify-between gap-3">
												<div>
													<div class="flex flex-wrap items-center gap-2">
														<UBadge :color="getMovementTone(movement.type)" variant="soft" :label="getMovementLabel(movement.type)" />
														<p class="text-xs text-stone-500">{{ formatDate(movement.created_at) }}</p>
													</div>
													<p class="mt-2 text-sm font-medium text-stone-900">{{ movement.note || t('inventoryPage.noNote') }}</p>
													<p class="mt-1 text-xs text-stone-500">
														{{ t('inventoryPage.by') }} {{ movement.created_by_name || (movement.created_by ? t('inventoryPage.userNotFound') : t('inventoryPage.system')) }} · {{ movement.product_sku }} · {{ movement.unit_name || t('inventoryPage.baseUnit') }}
													</p>
												</div>
												<p class="text-sm font-semibold tabular-nums text-stone-900">{{ getMovementQtyLabel(movement.qty_base) }}</p>
											</div>
										</div>
									</div>
								</section>

							</div>

							<div
								class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
								:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
							>
								<div class="grid w-full grid-cols-1 gap-2">
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDetail">{{ t('inventoryPage.close') }}</AppButton>
								</div>
							</div>
						</div>
					</template>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="cameraScannerOpen"
					:title="t('inventoryPage.cameraScannerTitle')"
					:description="t('inventoryPage.cameraScannerDescription')"
					desktop-width="680px"
					mobile-max-height="88vh"
					fill-mobile-height
					close-button-size="md"
					compact-header
					full-bleed-header
					backdrop-z-class="z-[220]"
					panel-z-class="z-[230]"
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@close="stopCameraScanner"
				>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
							<div class="overflow-hidden rounded-md bg-stone-950 ring-1 ring-stone-900/10">
								<div class="relative aspect-[4/3] w-full bg-stone-950">
									<video
										ref="scannerVideoRef"
										class="h-full w-full object-cover"
										muted
										playsinline
										autoplay
									/>
									<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
										<div class="h-32 w-full max-w-sm rounded-md border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
									</div>
								</div>
							</div>
						</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="min-w-0">
									<p v-if="cameraScannerStarting" class="text-sm text-stone-600">
										{{ t('inventoryPage.cameraStarting') }}
									</p>
									<p v-else-if="cameraScannerError" class="text-sm text-rose-600">
										{{ cameraScannerError }}
									</p>
									<p v-else class="text-sm text-stone-600">
										{{ t('inventoryPage.cameraInstructions') }}
									</p>
								</div>

								<div class="flex shrink-0 gap-2">
									<AppButton
										v-if="cameraScannerError"
										color="primary"
										variant="soft"
										size="md"
										class="rounded-md"
										:label="t('inventoryPage.tryOpenAgain')"
										@click="openCameraScanner"
									/>
									<AppButton
										color="neutral"
										variant="soft"
										size="md"
										class="rounded-md"
										:label="t('inventoryPage.close')"
										@click="stopCameraScanner"
									/>
								</div>
							</div>
						</div>
					</div>
				</AppResponsivePanel>

				</div>
			</template>
		</AppSidebarShell>
	</template>
