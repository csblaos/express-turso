<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

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

const statusOptions: Array<{ id: InventoryStatus; label: string }> = [
	{ id: "all", label: "ทั้งหมด" },
	{ id: "active", label: "พร้อมใช้งาน" },
	{ id: "low", label: "สต็อกต่ำ" },
	{ id: "out", label: "หมดสต็อก" },
	{ id: "negative", label: "ติดลบ" },
	{ id: "inactive", label: "ปิดใช้งาน" },
];

const sortOptions: Array<{ id: SortKey; label: string }> = [
	{ id: "updated", label: "อัปเดตล่าสุด" },
	{ id: "name", label: "ชื่อสินค้า" },
	{ id: "available", label: "คงเหลือ" },
];

const adjustmentModeOptions: Array<{ id: AdjustmentMode; label: string; icon: string }> = [
	{ id: "increment", label: "เพิ่มเข้า", icon: "i-heroicons-arrow-down-circle" },
	{ id: "decrement", label: "ตัดออก", icon: "i-heroicons-arrow-up-circle" },
	{ id: "set", label: "ตั้งค่าใหม่", icon: "i-heroicons-pencil-square" },
];

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
const pageSizeOptions = [10, 20, 50];

	let cameraScannerControls: { stop?: () => void } | null = null;
	let scannerBuffer = "";
	let scannerBufferTimer: ReturnType<typeof setTimeout> | null = null;
	let lastScannerKeyAt = 0;

	const canAdjustInventory = computed(() => can("inventory.adjust"));
	const canUpdateProduct = computed(() => can("products.update"));

const numberFormatter = new Intl.NumberFormat("th-TH");
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});

const categoryOptions = computed(() => [
	{ id: "all", label: "ทั้งหมด" },
	...Array.from(
		new Map(
			balances.value
				.filter((item) => item.categoryId !== "uncategorized")
				.map((item) => [item.categoryId, { id: item.categoryId, label: item.categoryLabel }]),
		).values(),
	),
]);

const filteredBalances = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();
	let result = balances.value.filter((item) => {
		const matchesQuery = !query || [item.name, item.sku, item.barcode, item.location || ""].some((value) => value.toLowerCase().includes(query));
		const matchesCategory = activeCategory.value === "all" || item.categoryId === activeCategory.value;
		const matchesStatus = activeStatus.value === "all"
			|| (activeStatus.value === "active" && item.status === "active")
			|| (activeStatus.value === "inactive" && item.status === "inactive")
			|| item.stockState === activeStatus.value;

		return matchesQuery && matchesCategory && matchesStatus;
	});

	if (activeSort.value === "name") {
		result = [...result].sort((a, b) => a.name.localeCompare(b.name, "th"));
	} else if (activeSort.value === "available") {
		result = [...result].sort((a, b) => a.available - b.available || a.name.localeCompare(b.name, "th"));
	} else {
		result = [...result].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt, "th"));
	}

	return result;
});

const selectedBalance = computed(() =>
	balances.value.find((item) => item.id === selectedProductId.value)
	?? filteredBalances.value[0]
	?? balances.value[0],
);

const categoryCounts = computed(() =>
	categoryOptions.value.reduce<Record<string, number>>((result, category) => {
		result[category.id] = category.id === "all"
			? balances.value.length
			: balances.value.filter((item) => item.categoryId === category.id).length;
		return result;
	}, {}),
);

const totalSkuCount = computed(() => balances.value.length);
const readyCount = computed(() => balances.value.filter((item) => item.stockState === "ready").length);
const lowCount = computed(() => balances.value.filter((item) => item.stockState === "low").length);
const outCount = computed(() => balances.value.filter((item) => item.stockState === "out").length);
const negativeCount = computed(() => balances.value.filter((item) => item.stockState === "negative").length);
const totalAvailableQty = computed(() => balances.value.reduce((sum, item) => sum + item.available, 0));
const totalItems = computed(() => filteredBalances.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const paginatedBalances = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredBalances.value.slice(startIndex, startIndex + pageSize.value);
});
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalItems.value} รายการ`
));

watch([filteredBalances, pageSize], ([value]) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
	if (!value.length) {
		selectedProductId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((item) => item.id === selectedProductId.value)) {
		selectedProductId.value = paginatedBalances.value[0]?.id || value[0].id;
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

watch([searchQuery, activeCategory, activeStatus, activeSort], () => {
	currentPage.value = 1;
});

watch(pageSize, () => {
	currentPage.value = 1;
});

function formatDate(value: string) {
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function formatQty(value: number) {
	return numberFormatter.format(value);
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
		categoryLabel: item.category_name || "ไม่ระบุหมวด",
		unitLabel: item.unit_name || "หน่วยหลัก",
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
	if (item.stockState === "inactive") return "ปิดใช้งาน";
	if (item.stockState === "negative") return "สต็อกติดลบ";
	if (item.stockState === "out") return "หมดสต็อก";
	if (item.stockState === "low") return `ต่ำกว่าเกณฑ์ ${item.lowStockThreshold ?? 0}`;
	return "พร้อมขาย";
}

function getMovementTone(type: string) {
	if (type.includes("_IN")) return "success";
	if (type.includes("_OUT")) return "warning";
	if (type.includes("_SET")) return "neutral";
	return "neutral";
}

function getMovementLabel(type: string) {
	if (type === "ADJUSTMENT_IN") return "เพิ่มเข้า";
	if (type === "ADJUSTMENT_OUT") return "ตัดออก";
	if (type === "ADJUSTMENT_SET") return "ตั้งค่าใหม่";
	return type;
}

function getMovementQtyLabel(value: number) {
	if (value > 0) return `+${formatQty(value)}`;
	return formatQty(value);
}

async function loadBalances() {
	balancesPending.value = true;
	balancesError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiInventoryBalance[]>>("/inventory");
		balances.value = response.data.map(mapBalance);
		if (!selectedProductId.value && balances.value.length) {
			selectedProductId.value = balances.value[0].id;
		}
	} catch (error) {
		balances.value = [];
		balancesError.value = resolveApiErrorMessage(error, "โหลดข้อมูลสต็อกไม่สำเร็จ");
	} finally {
		balancesPending.value = false;
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
		movementsError.value = resolveApiErrorMessage(error, "โหลดประวัติการปรับสต็อกไม่สำเร็จ");
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
			toastError("คุณไม่มีสิทธิ์แก้ไขตำแหน่งสินค้า");
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

	searchQuery.value = normalized;
	const lower = normalized.toLowerCase();
	const matched = balances.value.find((item) =>
		item.barcode.toLowerCase() === lower || item.sku.toLowerCase() === lower,
	) ?? filteredBalances.value[0];

	if (matched) {
		openDetail(matched.id);
	}

		toastInfo(
			matched
				? `${source === "camera" ? "สแกนกล้อง" : "สแกน"} ${normalized} พบ ${matched.name}`
				: `${source === "camera" ? "สแกนกล้อง" : "สแกน"} ${normalized} แต่ไม่พบสินค้า`,
		);

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
	nextTick(() => {
		scrollInventoryListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
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
			cameraScannerError.value = "ไม่พบพื้นที่แสดงภาพจากกล้อง";
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
					cameraScannerError.value = "กล้องเปิดได้ แต่ยังอ่านบาร์โค้ดไม่สำเร็จ ลองขยับกล้องหรือเปลี่ยนระยะ";
				}
			},
		);

		cameraScannerControls = controls;
		cameraScannerStarting.value = false;
	} catch (error) {
		cameraScannerStarting.value = false;
		cameraScannerError.value = error instanceof Error
			? error.message
			: "ไม่สามารถเปิดกล้องสแกนบาร์โค้ดได้";
	}
}

	async function submitAdjustment() {
		if (!selectedBalance.value || adjustmentSubmitting.value) return;

		const qty = Number(String(adjustmentQty.value).replace(/\D/g, ""));
		if (!Number.isFinite(qty) || (adjustmentMode.value === "set" ? qty < 0 : qty <= 0)) {
			toastError("ระบุจำนวนสต็อกให้ถูกต้องก่อนบันทึก");
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

			toastSuccess("บันทึกการปรับสต็อกแล้ว");
			adjustmentQty.value = "";
			adjustmentNote.value = "";
			// Still refresh from API for correctness (sorting/filtering may change).
			void loadBalances();
			if (selectedBalance.value) {
				void loadMovements(selectedBalance.value.storeId, selectedBalance.value.id);
			}
		} catch (error) {
			toastError(resolveApiErrorMessage(error, "บันทึกการปรับสต็อกไม่สำเร็จ"));
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
		window.removeEventListener("keydown", handleGlobalScannerKeydown);
	});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['stock']"
		sidebar-eyebrow="Inventory"
		sidebar-title="สต็อก"
		sidebar-compact-title="STK"
		sidebar-description="ตรวจยอดคงเหลือและปรับสต็อก"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title="สต็อก"
					description="ตรวจยอดคงเหลือและปรับสต็อก พร้อมดูประวัติการเคลื่อนไหว"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								ref="searchInputRef"
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								placeholder="ค้นหาชื่อสินค้า, SKU หรือ barcode"
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
								aria-label="ล้างคำค้น"
								title="ล้างคำค้น"
								@click="searchQuery = ''"
							/>
						</div>

						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-clock-20-solid"
							class="justify-center rounded-md"
							aria-label="ประวัติสต็อก"
							title="ประวัติสต็อก"
							@click="navigateTo('/inventory/history')"
						>
							<span class="hidden sm:inline">ประวัติ</span>
						</AppButton>

						<AppButton
							color="primary"
							variant="soft"
							size="md"
							icon="i-heroicons-qr-code-20-solid"
							class="justify-center rounded-md"
							aria-label="สแกนบาร์โค้ด"
							title="สแกนบาร์โค้ด"
							@click="openCameraScanner"
						>
							<span class="hidden sm:inline">สแกนบาร์โค้ด</span>
						</AppButton>

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="justify-center rounded-md"
								aria-label="รีโหลดสต็อก"
								title="รีโหลดสต็อก"
								:loading="balancesPending"
								:disabled="balancesPending"
								:spin-icon-on-loading="true"
								@click="loadBalances"
							>
								<span class="hidden sm:inline">รีโหลด</span>
							</AppButton>
					</div>
				</AppPageHeader>

				<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
					<div class="grid grid-cols-4 gap-2 p-0">
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ทั้งหมด</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ totalSkuCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ต่ำ</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ lowCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">หมด</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ outCount }}</p>
						</div>
						<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ติดลบ</p>
							<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ negativeCount }}</p>
						</div>
					</div>
				</UCard>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">ตัวกรองสต็อก</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ totalItems }} รายการ
							</div>
						</div>

						<div class="grid gap-2 px-4 py-3">
							<div class="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)] md:items-end">
								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500" for="inventory-category-select">
										หมวดสินค้า
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
										เรียงลำดับ
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
								<p class="text-sm font-semibold text-stone-950">Inventory</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">คลิกสินค้าเพื่อเปิดรายละเอียด ดูยอดคงเหลือ ปรับสต็อก และประวัติการเคลื่อนไหว</p>
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
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" label="ลองใหม่" @click="loadBalances" />
								</div>
							</div>
							<div v-else-if="!filteredBalances.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm font-medium text-stone-900">ไม่พบสินค้าที่ตรงกับคำค้น</p>
									<p class="text-sm text-stone-500">ลองค้นหาด้วยชื่อสินค้า, SKU หรือ barcode หรือเปลี่ยนตัวกรองด้านบน</p>
								</div>
							</div>

							<table v-else class="min-w-[1100px] w-full border-separate border-spacing-0">
								<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
									<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
										<th class="border-b border-[#ece6dc] px-4 py-3">สินค้า</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">หมวด</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">คงเหลือ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">ในคลัง</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">จอง</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">สถานะ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">อัปเดต</th>
										<th class="border-b border-[#ece6dc] px-4 py-3 text-right">Action</th>
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
											<UBadge :color="item.status === 'active' ? 'info' : 'neutral'" variant="soft" :label="item.status === 'active' ? 'พร้อมใช้งาน' : 'ปิดใช้งาน'" />
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
												จัดการ
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
										<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">ต่อหน้า</label>
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
											aria-label="หน้าก่อนหน้า"
											title="หน้าก่อนหน้า"
											@click="goToPage(currentPage - 1)"
										>
											<span class="hidden sm:inline">ก่อนหน้า</span>
										</AppButton>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											class="rounded-md"
											trailing-icon="i-heroicons-chevron-right-20-solid"
											:disabled="currentPage >= totalPages || balancesPending"
											aria-label="หน้าถัดไป"
											title="หน้าถัดไป"
											@click="goToPage(currentPage + 1)"
										>
											<span class="hidden sm:inline">ถัดไป</span>
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
					title="ข้อมูลสต็อก"
					description="ดูยอดคงเหลือ ปรับสต็อก และตรวจประวัติการเคลื่อนไหว"
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
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">คงเหลือ</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.available) }}</p>
									</div>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ในคลัง</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.onHand) }}</p>
									</div>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
										<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">จอง</p>
										<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.reserved) }}</p>
									</div>
								</div>

								<section class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-start justify-between gap-3">
										<div>
											<h3 class="text-sm font-semibold text-stone-900">ปรับสต็อก</h3>
											<p class="mt-1 text-xs leading-5 text-stone-500">แยก flow ปรับสต็อกออกจากข้อมูลสินค้า เพื่อให้ตรวจสอบย้อนหลังได้ง่าย</p>
										</div>
										<UBadge color="neutral" variant="soft" :label="formatDate(adjustmentBadgeIso)" />
									</div>

										<div class="mt-3 flex items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm text-stone-700">
											<UIcon name="i-heroicons-map-pin-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
											<span class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ตำแหน่งสินค้า</span>
											<UBadge color="neutral" variant="soft" class="max-w-full">
												<span class="truncate">{{ selectedBalance.location || "ยังไม่ตั้งค่า" }}</span>
											</UBadge>
											<AppButton
												v-if="canUpdateProduct"
												color="neutral"
												variant="soft"
												size="xs"
												class="ml-auto rounded-md"
												icon="i-heroicons-pencil-square-20-solid"
												:label="selectedBalance.location ? 'แก้ไข' : 'ตั้งค่า'"
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
												<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน (หน่วยฐาน)</label>
												<input
													v-model="adjustmentQty"
													ref="adjustmentQtyInputRef"
													type="text"
													inputmode="numeric"
													pattern="[0-9,]*"
													class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
													placeholder="ระบุจำนวน"
													@input="handleAdjustmentQtyInput"
												>
											</div>
										<div>
											<label class="mb-2 block text-xs font-medium text-stone-500">หมายเหตุ</label>
											<textarea
												v-model="adjustmentNote"
												rows="3"
												class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												placeholder="เช่น รับของเข้า, นับใหม่, ของเสีย"
											/>
										</div>
										<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" class="justify-center rounded-md" :loading="adjustmentSubmitting" :disabled="!canAdjustInventory" :spin-icon-on-loading="true" @click="submitAdjustment">
											บันทึกการปรับสต็อก
										</AppButton>
									</div>
								</section>

								<section class="space-y-3">
									<div class="flex items-center justify-between gap-3">
										<h3 class="text-sm font-semibold text-stone-900">ประวัติการเคลื่อนไหว</h3>
										<div class="flex items-center gap-2">
											<UBadge color="neutral" variant="soft" :label="`${movements.length} รายการ`" />
											<AppButton
												color="neutral"
												variant="soft"
												size="xs"
												icon="i-heroicons-arrow-top-right-on-square-20-solid"
												label="ดูทั้งหมด"
												@click="navigateTo(`/inventory/history?product_id=${encodeURIComponent(selectedBalance.id)}`)"
											/>
										</div>
									</div>

									<UCard
										v-if="movementsPending"
										class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
									>
										<div class="py-8 text-center">
											<p class="text-sm font-semibold text-stone-900">กำลังโหลดประวัติสต็อก</p>
										</div>
									</UCard>

									<UCard
										v-else-if="movementsError"
										class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"
									>
										<div class="py-6 text-center">
											<p class="text-sm font-semibold text-stone-900">โหลด movement ไม่สำเร็จ</p>
											<p class="mt-2 text-xs text-stone-500">{{ movementsError }}</p>
										</div>
									</UCard>

									<UCard
										v-else-if="movements.length === 0"
										class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
									>
										<div class="py-6 text-center">
											<p class="text-sm font-semibold text-stone-900">ยังไม่มีประวัติการปรับสต็อก</p>
											<p class="mt-2 text-xs text-stone-500">เมื่อบันทึกการปรับสต็อก รายการล่าสุดจะมาแสดงที่นี่</p>
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
													<p class="mt-2 text-sm font-medium text-stone-900">{{ movement.note || "ไม่มีหมายเหตุ" }}</p>
													<p class="mt-1 text-xs text-stone-500">
														โดย {{ movement.created_by_name || (movement.created_by ? "ไม่พบชื่อผู้ใช้" : "ระบบ") }} · {{ movement.product_sku }} · {{ movement.unit_name || "หน่วยฐาน" }}
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
									<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDetail">ปิด</AppButton>
								</div>
							</div>
						</div>
					</template>
				</AppResponsivePanel>

				<AppResponsivePanel
					v-model="cameraScannerOpen"
					title="สแกนบาร์โค้ดด้วยกล้อง"
					description="ใช้ได้บน mobile, tablet และ desktop ที่มีกล้องเมื่อไม่มี scanner device"
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
										กำลังเปิดกล้องและเริ่มตัวอ่านบาร์โค้ด...
									</p>
									<p v-else-if="cameraScannerError" class="text-sm text-rose-600">
										{{ cameraScannerError }}
									</p>
									<p v-else class="text-sm text-stone-600">
										จัดบาร์โค้ดให้อยู่ในกรอบ ระบบจะเติมค่าในช่องค้นหาและเปิดรายละเอียดสินค้าให้อัตโนมัติ
									</p>
								</div>

								<div class="flex shrink-0 gap-2">
									<AppButton
										v-if="cameraScannerError"
										color="primary"
										variant="soft"
										size="md"
										class="rounded-md"
										label="ลองเปิดใหม่"
										@click="openCameraScanner"
									/>
									<AppButton
										color="neutral"
										variant="soft"
										size="md"
										class="rounded-md"
										label="ปิด"
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
