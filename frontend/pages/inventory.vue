<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

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
	created_at: string;
	unit_name: string | null;
};

type InventoryRecord = {
	id: string;
	storeId: string;
	name: string;
	sku: string;
	barcode: string;
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

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const { apiFetch } = useApiClient();
const { logout, can } = useAuthSession();

const navItems = appNavItems;

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
const mobileSidebarOpen = ref(false);
const mobileSearchOpen = ref(false);
const sidebarCollapsed = useState<boolean>("app-sidebar-collapsed", () => true);
const logoutConfirmOpen = ref(false);
const searchInputRef = ref<{ input?: HTMLInputElement } | null>(null);
const scannerVideoRef = ref<HTMLVideoElement | null>(null);

const scanToast = ref("");
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
const adjustmentSubmitting = ref(false);

let scanToastTimer: ReturnType<typeof setTimeout> | null = null;
let cameraScannerControls: { stop?: () => void } | null = null;
let scannerBuffer = "";
let scannerBufferTimer: ReturnType<typeof setTimeout> | null = null;
let lastScannerKeyAt = 0;

const canAdjustInventory = computed(() => can("inventory.adjust"));

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
		const matchesQuery = !query || [item.name, item.sku, item.barcode].some((value) => value.toLowerCase().includes(query));
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

watch(filteredBalances, (value) => {
	if (!value.length) return;
	if (!value.some((item) => item.id === selectedProductId.value)) {
		selectedProductId.value = value[0].id;
	}
}, { immediate: true });

watch([detailOpen, selectedProductId], ([open]) => {
	if (!open || !selectedBalance.value) return;
	void loadMovements(selectedBalance.value.storeId, selectedBalance.value.id);
}, { immediate: false });

function isNavActive(path: string) {
	return path === "/" ? route.path === "/" : route.path.startsWith(path);
}

function openLogoutConfirm() {
	logoutConfirmOpen.value = true;
}

async function confirmLogout() {
	logoutConfirmOpen.value = false;
	await logout();
	return navigateTo("/login");
}

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
	if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
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
	if (state === "ready") return "green";
	if (state === "low") return "orange";
	if (state === "out" || state === "negative") return "red";
	return "gray";
}

function getStockLabel(item: InventoryRecord) {
	if (item.stockState === "inactive") return "ปิดใช้งาน";
	if (item.stockState === "negative") return "สต็อกติดลบ";
	if (item.stockState === "out") return "หมดสต็อก";
	if (item.stockState === "low") return `ต่ำกว่าเกณฑ์ ${item.lowStockThreshold ?? 0}`;
	return "พร้อมขาย";
}

function getMovementTone(type: string) {
	if (type.includes("_IN")) return "green";
	if (type.includes("_OUT")) return "orange";
	if (type.includes("_SET")) return "gray";
	return "gray";
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
		balancesError.value = error instanceof Error ? error.message : "โหลดข้อมูลสต็อกไม่สำเร็จ";
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
		movementsError.value = error instanceof Error ? error.message : "โหลดประวัติการปรับสต็อกไม่สำเร็จ";
	} finally {
		movementsPending.value = false;
	}
}

function triggerToast(message: string) {
	scanToast.value = message;
	if (scanToastTimer) {
		clearTimeout(scanToastTimer);
	}
	scanToastTimer = setTimeout(() => {
		scanToast.value = "";
	}, 2200);
}

function focusSearchInput() {
	const input = searchInputRef.value?.input;
	input?.focus();
	input?.select();
}

function openDetail(productId: string) {
	selectedProductId.value = productId;
	detailOpen.value = true;
}

function closeDetail() {
	detailOpen.value = false;
}

function toggleMobileSearch() {
	mobileSearchOpen.value = !mobileSearchOpen.value;
	if (mobileSearchOpen.value) {
		nextTick(() => {
			focusSearchInput();
		});
	}
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

	triggerToast(
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
			throw new Error("ไม่พบพื้นที่แสดงภาพจากกล้อง");
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

	const qty = Number(adjustmentQty.value);
	if (!Number.isFinite(qty) || (adjustmentMode.value === "set" ? qty < 0 : qty <= 0)) {
		triggerToast("ระบุจำนวนสต็อกให้ถูกต้องก่อนบันทึก");
		return;
	}

	adjustmentSubmitting.value = true;
	try {
		await apiFetch<ApiEnvelope<unknown>>("/inventory/adjustments", {
			method: "POST",
			body: {
				store_id: selectedBalance.value.storeId,
				product_id: selectedBalance.value.id,
				mode: adjustmentMode.value,
				qty_base: qty,
				note: adjustmentNote.value.trim() || null,
				created_by: "Lina",
			},
		});

		triggerToast("บันทึกการปรับสต็อกแล้ว");
		adjustmentQty.value = "";
		adjustmentNote.value = "";
		await loadBalances();
		if (selectedBalance.value) {
			await loadMovements(selectedBalance.value.storeId, selectedBalance.value.id);
		}
	} catch (error) {
		triggerToast(error instanceof Error ? error.message : "บันทึกการปรับสต็อกไม่สำเร็จ");
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
	if (scanToastTimer) {
		clearTimeout(scanToastTimer);
	}
	window.removeEventListener("keydown", handleGlobalScannerKeydown);
});
</script>

<template>
	<main class="min-h-screen w-full bg-transparent lg:h-screen lg:overflow-hidden">
		<div class="flex min-h-screen w-full lg:h-screen lg:overflow-hidden">
			<div
				v-if="mobileSidebarOpen"
				class="fixed inset-0 z-40 bg-black/45 lg:hidden"
				@click="mobileSidebarOpen = false"
			/>

			<aside
				class="fixed inset-y-0 left-0 z-50 flex bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] transition-[width,transform] duration-200 ease-out lg:relative lg:h-screen lg:overflow-hidden lg:shadow-none"
				:class="[
					sidebarCollapsed ? 'w-[84px]' : 'w-[280px]',
					mobileSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
				]"
			>
				<div class="scrollbar-soft flex w-full flex-col gap-4 overflow-y-auto p-3">
					<div class="flex items-center justify-between">
						<div class="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#f8e9de] text-lg font-semibold text-[#97532c]">
							P
						</div>

						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							class="lg:hidden"
							label="ปิด"
							@click="mobileSidebarOpen = false"
						/>
					</div>

					<div class="hidden px-3 lg:block">
						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							class="items-center rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 shadow-sm transition-colors hover:bg-white hover:text-stone-900"
							:class="sidebarCollapsed ? 'h-11 w-11 justify-center px-0' : 'flex w-full justify-between px-3 py-2.5'"
							:icon="sidebarCollapsed ? 'i-heroicons-chevron-double-right-20-solid' : 'i-heroicons-chevron-double-left-20-solid'"
							:title="sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'"
							:aria-label="sidebarCollapsed ? 'ขยายเมนู' : 'ย่อเมนู'"
							@click="sidebarCollapsed = !sidebarCollapsed"
						/>
					</div>

					<nav class="flex flex-1 flex-col gap-2">
						<NuxtLink
							v-for="item in navItems"
							:key="item.id"
							:to="item.to"
							class="flex items-center rounded-2xl px-3 py-3 text-left"
							:title="item.label"
							:aria-label="item.label"
							:class="[
								sidebarCollapsed ? 'gap-0' : 'gap-3',
								isNavActive(item.to)
									? (sidebarCollapsed
										? 'text-[#97532c]'
										: 'bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]')
									: 'text-stone-500 hover:bg-[#f7f5f1] hover:text-stone-900'
							]"
						>
							<div
								class="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl text-sm font-semibold"
								:class="isNavActive(item.to)
									? 'bg-white text-[#97532c] ring-1 ring-[#efd7c6]'
									: 'bg-[#f7f5f1] text-stone-600 ring-1 ring-[#e7e4dd]'"
							>
								<UIcon :name="item.icon" class="h-5 w-5" />
							</div>
							<div
								class="min-w-0 overflow-hidden transition-[width,opacity] duration-150 ease-out"
								:class="sidebarCollapsed ? 'w-0 opacity-0' : 'flex-1 opacity-100'"
								aria-hidden="true"
							>
								<p class="truncate text-sm font-medium whitespace-nowrap">{{ item.label }}</p>
							</div>
						</NuxtLink>
					</nav>

					<div class="px-3 pt-1">
						<UButton
							color="gray"
							variant="ghost"
							size="sm"
							icon="i-heroicons-arrow-left-on-rectangle"
							class="items-center rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] text-stone-600 shadow-sm transition-colors hover:bg-white hover:text-stone-900"
							:class="sidebarCollapsed ? 'h-11 w-11 justify-center px-0' : 'flex h-11 w-full justify-start gap-3 px-3 py-2.5'"
							:title="sidebarCollapsed ? 'ออกจากระบบ' : undefined"
							:aria-label="'ออกจากระบบ'"
							@click="openLogoutConfirm"
						>
							<span
								class="min-w-0 overflow-hidden text-sm font-medium whitespace-nowrap transition-[width,opacity] duration-150 ease-out"
								:class="sidebarCollapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'"
								aria-hidden="true"
							>
								ออกจากระบบ
							</span>
						</UButton>
					</div>
				</div>
			</aside>

			<div class="min-w-0 flex-1 lg:min-h-0 lg:overflow-hidden">
				<div class="flex min-h-screen w-full lg:h-screen lg:min-h-0 lg:overflow-hidden">
					<section class="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:min-h-0 lg:overflow-hidden lg:px-5">
						<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
							<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
								<div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto]">
									<div class="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)]">
										<div class="grid grid-cols-4 gap-2 lg:hidden">
											<UButton
												color="gray"
												variant="soft"
												size="lg"
												class="justify-center"
												icon="i-heroicons-bars-3-20-solid"
												aria-label="เปิดเมนู"
												title="เปิดเมนู"
												@click="mobileSidebarOpen = true"
											/>
											<UButton
												color="gray"
												variant="soft"
												size="lg"
												class="justify-center"
												icon="i-heroicons-magnifying-glass-20-solid"
												:aria-label="mobileSearchOpen ? 'ซ่อนการค้นหา' : 'เปิดการค้นหา'"
												:title="mobileSearchOpen ? 'ซ่อนการค้นหา' : 'เปิดการค้นหา'"
												@click="toggleMobileSearch"
											/>
											<UButton
												color="orange"
												variant="soft"
												size="lg"
												icon="i-heroicons-qr-code-20-solid"
												class="justify-center"
												aria-label="สแกนบาร์โค้ด"
												title="สแกนบาร์โค้ด"
												@click="openCameraScanner"
											/>
											<UButton
												color="orange"
												variant="solid"
												size="lg"
												icon="i-heroicons-arrow-path-rounded-square-20-solid"
												class="justify-center"
												aria-label="รีโหลดสต็อก"
												title="รีโหลดสต็อก"
												@click="loadBalances"
											/>
										</div>

										<div v-if="mobileSearchOpen" class="relative min-w-0 lg:hidden">
											<UInput
												ref="searchInputRef"
												v-model="searchQuery"
												size="lg"
												icon="i-heroicons-magnifying-glass-20-solid"
												placeholder="ค้นหาชื่อสินค้า, SKU หรือ barcode"
												color="gray"
												class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:pr-12 [&_input]:shadow-sm"
												@keydown.enter.prevent="submitSearchInput"
											/>
											<UButton
												v-if="searchQuery"
												color="gray"
												variant="ghost"
												size="xs"
												icon="i-heroicons-x-mark-20-solid"
												class="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full"
												aria-label="ล้างคำค้น"
												title="ล้างคำค้น"
												@click="searchQuery = ''"
											/>
										</div>

										<div class="relative hidden min-w-0 lg:block">
											<UInput
												ref="searchInputRef"
												v-model="searchQuery"
												size="lg"
												icon="i-heroicons-magnifying-glass-20-solid"
												placeholder="ค้นหาชื่อสินค้า, SKU หรือ barcode"
												color="gray"
												class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:pr-12 [&_input]:shadow-sm"
												@keydown.enter.prevent="submitSearchInput"
											/>
											<UButton
												v-if="searchQuery"
												color="gray"
												variant="ghost"
												size="xs"
												icon="i-heroicons-x-mark-20-solid"
												class="absolute right-3 top-1/2 z-10 -translate-y-1/2 rounded-full"
												aria-label="ล้างคำค้น"
												title="ล้างคำค้น"
												@click="searchQuery = ''"
											/>
										</div>
									</div>

									<div class="hidden gap-2 lg:flex">
										<UButton
											color="orange"
											variant="soft"
											size="lg"
											icon="i-heroicons-qr-code-20-solid"
											class="justify-center px-4"
											aria-label="สแกนบาร์โค้ด"
											title="สแกนบาร์โค้ด"
											@click="openCameraScanner"
										>
											<span class="hidden sm:inline">สแกนบาร์โค้ด</span>
										</UButton>
										<UButton
											color="gray"
											variant="soft"
											size="lg"
											icon="i-heroicons-arrow-path-20-solid"
											class="justify-center px-4"
											aria-label="รีโหลดสต็อก"
											title="รีโหลดสต็อก"
											@click="loadBalances"
										>
											<span class="hidden sm:inline">รีโหลด</span>
										</UButton>
									</div>
								</div>
							</UCard>

							<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto lg:pr-1">
								<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
									<div class="space-y-3">
										<div class="flex flex-wrap items-center gap-2">
											<UBadge color="gray" variant="soft" :label="`${totalSkuCount} SKU`" />
											<UBadge color="green" variant="soft" :label="`พร้อมขาย ${readyCount}`" />
											<UBadge color="orange" variant="soft" :label="`ต่ำ ${lowCount}`" />
											<UBadge color="red" variant="soft" :label="`หมด ${outCount}`" />
											<UBadge color="red" variant="soft" :label="`ติดลบ ${negativeCount}`" />
										</div>

										<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
											<div class="space-y-2">
												<div class="md:hidden">
													<div class="relative">
														<select
															v-model="activeCategory"
															class="w-full appearance-none rounded-2xl border border-[#e7e4dd] bg-[#fffefd] px-4 py-3 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
														>
															<option
																v-for="category in categoryOptions"
																:key="category.id"
																:value="category.id"
															>
																{{ category.label }} ({{ categoryCounts[category.id] }})
															</option>
														</select>
														<UIcon
															name="i-heroicons-chevron-up-down"
															class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
														/>
													</div>
												</div>

												<div class="category-rail scrollbar-soft hidden gap-2 overflow-x-auto pb-1 md:flex">
													<UButton
														v-for="category in categoryOptions"
														:key="category.id"
														:color="activeCategory === category.id ? 'orange' : 'gray'"
														:variant="activeCategory === category.id ? 'soft' : 'ghost'"
														size="sm"
														class="shrink-0 whitespace-nowrap snap-start"
														@click="activeCategory = category.id"
													>
														{{ category.label }}
														<span class="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-500">
															{{ categoryCounts[category.id] }}
														</span>
													</UButton>
												</div>

												<div class="scrollbar-soft flex gap-2 overflow-x-auto pb-1">
													<UButton
														v-for="status in statusOptions"
														:key="status.id"
														color="gray"
														:variant="activeStatus === status.id ? 'solid' : 'soft'"
														size="sm"
														:label="status.label"
														class="whitespace-nowrap"
														@click="activeStatus = status.id"
													/>
												</div>
											</div>

											<div class="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
												<UButton
													v-for="sort in sortOptions"
													:key="sort.id"
													color="gray"
													:variant="activeSort === sort.id ? 'solid' : 'soft'"
													size="sm"
													:label="sort.label"
													@click="activeSort = sort.id"
												/>
											</div>
										</div>
									</div>
								</UCard>

								<div class="rounded-2xl bg-white shadow-lg ring-1 ring-[#e7e4dd]">
									<div class="space-y-4 p-4">
										<div class="flex items-end justify-between gap-2">
											<h1 class="text-xl font-semibold tracking-[-0.03em] text-stone-900">
												รายการสต็อก
											</h1>
											<p class="hidden text-sm text-stone-500 sm:block">
												คลิกสินค้าเพื่อเปิด drawer ดูยอดและปรับสต็อก
											</p>
										</div>

										<div class="space-y-3">
											<UCard
												v-if="balancesPending"
												class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
											>
												<div class="py-10 text-center">
													<p class="text-lg font-semibold text-stone-900">กำลังโหลดข้อมูลสต็อก</p>
													<p class="mt-2 text-sm text-stone-500">กำลังดึงยอดคงเหลือจาก Express API</p>
												</div>
											</UCard>

											<UCard
												v-else-if="balancesError"
												class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"
											>
												<div class="py-8 text-center">
													<p class="text-lg font-semibold text-stone-900">โหลดสต็อกไม่สำเร็จ</p>
													<p class="mt-2 text-sm text-stone-500">{{ balancesError }}</p>
													<div class="mt-4">
														<UButton color="orange" variant="soft" size="sm" label="ลองใหม่" @click="loadBalances" />
													</div>
												</div>
											</UCard>

											<template v-else>
												<button
													v-for="item in filteredBalances"
													:key="item.id"
													type="button"
													class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-3 text-left transition hover:border-[#d9d5cd] hover:shadow-sm"
													:class="selectedProductId === item.id ? 'ring-2 ring-[#f3c7a7]' : ''"
													@click="openDetail(item.id)"
												>
													<div class="flex items-start gap-3">
														<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-semibold text-white" :style="{ background: item.accent }">
															<img
																v-if="item.imageUrl"
																:src="item.imageUrl"
																:alt="item.name"
																class="h-full w-full object-cover"
															>
															<UIcon v-else name="i-heroicons-cube" class="h-6 w-6 text-white/95" />
														</div>

														<div class="min-w-0 flex-1">
															<div class="flex flex-wrap items-start justify-between gap-2">
																<div class="min-w-0">
																	<div class="flex flex-wrap items-center gap-2">
																		<h3 class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</h3>
																		<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
																	</div>
																	<p class="mt-1 truncate text-[11px] text-stone-500">{{ item.sku }} · {{ item.barcode }}</p>
																</div>

																<div class="text-right">
																	<p class="text-sm font-semibold text-stone-900 tabular-nums">คงเหลือ {{ formatQty(item.available) }}</p>
																	<p class="mt-1 text-[11px] text-stone-500">จอง {{ formatQty(item.reserved) }} · ในคลัง {{ formatQty(item.onHand) }}</p>
																</div>
															</div>

															<div class="mt-3 flex flex-wrap items-center gap-2">
																<UBadge color="gray" variant="soft" :label="item.categoryLabel" />
																<UBadge color="gray" variant="soft" :label="item.unitLabel" />
																<UBadge color="gray" variant="soft" :label="item.status === 'active' ? 'พร้อมใช้' : 'ปิดใช้งาน'" />
															</div>

															<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
																<p class="text-[11px] text-stone-500">อัปเดต {{ item.updatedAt }}</p>
																<UButton color="gray" variant="soft" size="xs" label="ดูสต็อก" @click.stop="openDetail(item.id)" />
															</div>
														</div>
													</div>
												</button>
											</template>

											<UCard
												v-if="!balancesPending && !balancesError && filteredBalances.length === 0"
												class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
											>
												<div class="py-8 text-center">
													<p class="text-lg font-semibold text-stone-900">ไม่พบสินค้าที่ตรงกับคำค้น</p>
													<p class="mt-2 text-sm text-stone-500">ลองค้นหาด้วยชื่อสินค้า, SKU หรือ barcode หรือเปลี่ยนตัวกรองด้านบน</p>
												</div>
											</UCard>
										</div>
									</div>
								</div>
							</div>
						</div>
					</section>
				</div>
			</div>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
			>
				<div
					v-if="detailOpen"
					class="fixed inset-0 z-[58] bg-[rgba(28,25,23,0.42)] backdrop-blur-[2px]"
					@click="closeDetail"
				/>
			</Transition>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="translate-y-full opacity-0 lg:translate-y-0 lg:translate-x-full"
				enter-to-class="translate-y-0 opacity-100 lg:translate-x-0"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="translate-y-0 opacity-100 lg:translate-x-0"
				leave-to-class="translate-y-full opacity-0 lg:translate-y-0 lg:translate-x-full"
			>
				<div
					v-if="detailOpen && selectedBalance"
					class="fixed inset-x-0 bottom-0 z-[59] max-h-[88vh] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-[28px]"
				>
					<div class="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)] p-4 text-stone-900">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Stock detail</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">ข้อมูลสต็อก</h2>
								</div>
								<UButton
									color="gray"
									variant="soft"
									size="xs"
									icon="i-heroicons-x-mark-20-solid"
									aria-label="ปิดรายละเอียดสต็อก"
									title="ปิดรายละเอียดสต็อก"
									@click="closeDetail"
								/>
							</div>

							<div class="mt-4 rounded-[24px] bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start gap-3">
									<div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-semibold text-white" :style="{ background: selectedBalance.accent }">
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
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedBalance.sku }} · {{ selectedBalance.barcode }}</p>
											</div>
											<UBadge :color="getStockTone(selectedBalance.stockState)" variant="soft" :label="getStockLabel(selectedBalance)" />
										</div>
										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge color="gray" variant="soft" :label="selectedBalance.categoryLabel" />
											<UBadge color="gray" variant="soft" :label="selectedBalance.unitLabel" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="grid grid-cols-3 gap-2 border-b border-[#e7e4dd] py-4">
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">คงเหลือ</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.available) }}</p>
							</div>
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ในคลัง</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.onHand) }}</p>
							</div>
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">จอง</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatQty(selectedBalance.reserved) }}</p>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto py-4 pr-1">
							<section class="rounded-3xl bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h3 class="text-sm font-semibold text-stone-900">ปรับสต็อก</h3>
										<p class="mt-1 text-xs leading-5 text-stone-500">แยก flow ปรับสต็อกออกจากข้อมูลสินค้า เพื่อให้ตรวจสอบย้อนหลังได้ง่าย</p>
									</div>
									<UBadge color="gray" variant="soft" :label="formatDate(new Date().toISOString())" />
								</div>

								<div class="mt-4 grid gap-2 sm:grid-cols-3">
									<UButton
										v-for="mode in adjustmentModeOptions"
										:key="mode.id"
										:color="adjustmentMode === mode.id ? 'orange' : 'gray'"
										:variant="adjustmentMode === mode.id ? 'soft' : 'ghost'"
										size="sm"
										class="justify-center"
										:icon="mode.icon"
										@click="adjustmentMode = mode.id"
									>
										{{ mode.label }}
									</UButton>
								</div>

								<div class="mt-4 grid gap-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน (หน่วยฐาน)</label>
										<input
											v-model="adjustmentQty"
											type="number"
											min="0"
											step="1"
											class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
											placeholder="ระบุจำนวน"
										>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">หมายเหตุ</label>
										<textarea
											v-model="adjustmentNote"
											rows="3"
											class="w-full resize-none rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
											placeholder="เช่น รับของเข้า, นับใหม่, ของเสีย"
										/>
									</div>
									<UButton
										color="orange"
										variant="solid"
										size="lg"
										class="justify-center"
										:loading="adjustmentSubmitting"
										:disabled="!canAdjustInventory"
										@click="submitAdjustment"
									>
										บันทึกการปรับสต็อก
									</UButton>
								</div>
							</section>

							<section class="space-y-3">
								<div class="flex items-center justify-between gap-3">
									<h3 class="text-sm font-semibold text-stone-900">ประวัติการเคลื่อนไหว</h3>
									<UBadge color="gray" variant="soft" :label="`${movements.length} รายการ`" />
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
										class="rounded-2xl border border-[#e7e4dd] bg-white p-3"
									>
										<div class="flex items-start justify-between gap-3">
											<div>
												<div class="flex flex-wrap items-center gap-2">
													<UBadge :color="getMovementTone(movement.type)" variant="soft" :label="getMovementLabel(movement.type)" />
													<p class="text-xs text-stone-500">{{ formatDate(movement.created_at) }}</p>
												</div>
												<p class="mt-2 text-sm font-medium text-stone-900">{{ movement.note || "ไม่มีหมายเหตุ" }}</p>
												<p class="mt-1 text-xs text-stone-500">
													โดย {{ movement.created_by || "ระบบ" }} · {{ movement.product_sku }} · {{ movement.unit_name || "หน่วยฐาน" }}
												</p>
											</div>
											<p class="text-sm font-semibold tabular-nums text-stone-900">{{ getMovementQtyLabel(movement.qty_base) }}</p>
										</div>
									</div>
								</div>
							</section>
						</div>
					</div>
				</div>
			</Transition>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
			>
				<div
					v-if="cameraScannerOpen"
					class="fixed inset-0 z-[70] bg-[rgba(28,25,23,0.68)] px-4 py-6 backdrop-blur-sm sm:px-6"
				>
					<div class="mx-auto flex h-full w-full max-w-2xl flex-col rounded-[28px] bg-[#fffefd] p-4 shadow-2xl ring-1 ring-[#e7e4dd]">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.2em] text-stone-400">Camera scanner</p>
								<h3 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">
									สแกนบาร์โค้ดจากกล้อง
								</h3>
								<p class="mt-1 text-sm text-stone-500">เหมาะกับ mobile, tablet และ desktop ที่ไม่ต่อ scanner gun</p>
							</div>
							<UButton
								color="gray"
								variant="soft"
								size="xs"
								icon="i-heroicons-x-mark-20-solid"
								aria-label="ปิดกล้องสแกน"
								title="ปิดกล้องสแกน"
								@click="stopCameraScanner"
							/>
						</div>

						<div class="mt-4 flex min-h-0 flex-1 flex-col gap-4">
							<div class="relative flex-1 overflow-hidden rounded-[24px] bg-[#1f1c18]">
								<video ref="scannerVideoRef" class="h-full w-full object-cover" autoplay muted playsinline />
								<div class="pointer-events-none absolute inset-x-6 top-1/2 h-40 -translate-y-1/2 rounded-[28px] border border-dashed border-white/65" />
							</div>

							<div class="rounded-2xl bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<p v-if="cameraScannerStarting" class="text-sm text-stone-500">กำลังเปิดกล้อง…</p>
								<p v-else-if="cameraScannerError" class="text-sm text-rose-500">{{ cameraScannerError }}</p>
								<p v-else class="text-sm text-stone-500">
									เล็งกล้องไปที่ barcode ให้เต็มกรอบ ระบบจะเติมค่าในช่องค้นหาและเปิดรายละเอียดสินค้าให้อัตโนมัติ
								</p>
							</div>
						</div>
					</div>
				</div>
			</Transition>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="translate-y-3 opacity-0"
				enter-to-class="translate-y-0 opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="translate-y-0 opacity-100"
				leave-to-class="translate-y-3 opacity-0"
			>
				<div
					v-if="scanToast"
					class="fixed bottom-4 left-1/2 z-[80] w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 rounded-2xl bg-[#1f1c18] px-4 py-3 text-sm font-medium text-white shadow-xl"
				>
					{{ scanToast }}
				</div>
			</Transition>

			<LogoutConfirmModal
				:open="logoutConfirmOpen"
				@close="logoutConfirmOpen = false"
				@confirm="confirmLogout"
			/>
		</div>
	</main>
</template>
