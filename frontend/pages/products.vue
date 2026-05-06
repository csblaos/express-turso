<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type StockState = "ready" | "low" | "inactive";
type ProductStatus = "all" | "active" | "inactive";
type SortKey = "updated" | "name" | "price";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiProduct = {
	id: string;
	store_id: string;
	sku: string;
	name: string;
	barcode: string | null;
	base_unit_id: string;
	price_base: number;
	cost_base: number;
	active: number;
	created_at: string;
	image_url: string | null;
	category_id: string | null;
	out_stock_threshold: number | null;
	low_stock_threshold: number | null;
	model_id: string | null;
	variant_label: string | null;
	variant_options_json: string | null;
	variant_sort_order: number;
	allow_base_unit_sale: number;
};

type ApiProductCategory = {
	id: string;
	name: string;
};

type ApiUnit = {
	id: string;
	code: string;
	name_th: string;
};

type ProductRecord = {
	id: string;
	name: string;
	categoryId: string;
	categoryLabel: string;
	sku: string;
	barcode: string;
	price: number;
	cost: number;
	unitLabel: string;
	stockState: StockState;
	status: "active" | "inactive";
	variantCount: number;
	saleUnits: string[];
	imageKey: string;
	imageUrl: string | null;
	accent: string;
	updatedAt: string;
	updatedBy: string;
	lowStockThreshold: number | null;
	tag?: string;
};

const route = useRoute();
const runtimeConfig = useRuntimeConfig();
const { apiFetch } = useApiClient();
const { logout, can } = useAuthSession();

const navItems = appNavItems;

const statusOptions: Array<{ id: ProductStatus; label: string }> = [
	{ id: "all", label: "ทุกสถานะ" },
	{ id: "active", label: "พร้อมขาย" },
	{ id: "inactive", label: "ปิดขาย" },
];

const sortOptions: Array<{ id: SortKey; label: string }> = [
	{ id: "updated", label: "ล่าสุด" },
	{ id: "name", label: "ชื่อสินค้า" },
	{ id: "price", label: "ราคาขาย" },
];

const accentPalette = [
	"linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
	"linear-gradient(135deg, #e7e5e4 0%, #78716c 100%)",
	"linear-gradient(135deg, #d9f99d 0%, #65a30d 100%)",
	"linear-gradient(135deg, #fdba74 0%, #f97316 100%)",
	"linear-gradient(135deg, #fecdd3 0%, #e11d48 100%)",
	"linear-gradient(135deg, #bfdbfe 0%, #2563eb 100%)",
];

const searchQuery = ref("");
const activeCategory = ref("all");
const activeStatus = ref<ProductStatus>("all");
const activeSort = ref<SortKey>("updated");
const selectedProductId = ref("");
const productDetailOpen = ref(false);
const mobileSidebarOpen = ref(false);
const mobileSearchOpen = ref(false);
const sidebarCollapsed = useState<boolean>("app-sidebar-collapsed", () => true);
const logoutConfirmOpen = ref(false);
const scanToast = ref("");
const searchInputRef = ref<{ input?: HTMLInputElement } | null>(null);
const products = ref<ProductRecord[]>([]);
const productsPending = ref(true);
const productsError = ref<string | null>(null);
const cameraScannerOpen = ref(false);
const cameraScannerStarting = ref(false);
const cameraScannerError = ref<string | null>(null);
const scannerVideoRef = ref<HTMLVideoElement | null>(null);

let scanToastTimer: ReturnType<typeof setTimeout> | null = null;
let cameraScannerControls: { stop?: () => void } | null = null;
let scannerBuffer = "";
let scannerBufferTimer: ReturnType<typeof setTimeout> | null = null;
let lastScannerKeyAt = 0;

const canCreateProduct = computed(() => can("products.create"));
const canUpdateProduct = computed(() => can("products.update"));
const canUpdateProductCost = computed(() => can("products.update_cost"));
const canDeactivateProduct = computed(() => can("products.deactivate"));

const numberFormatter = new Intl.NumberFormat("th-TH", {
	style: "currency",
	currency: "THB",
	maximumFractionDigits: 0,
});

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});

const categoryOptions = computed(() => [
	{ id: "all", label: "ทั้งหมด" },
	...Array.from(
		new Map(
			products.value
				.filter((product) => product.categoryId !== "uncategorized")
				.map((product) => [product.categoryId, { id: product.categoryId, label: product.categoryLabel }]),
		).values(),
	),
]);

const filteredProducts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();
	let result = products.value.filter((product) => {
		const matchesQuery = !query || [product.name, product.sku, product.barcode].some((value) => value.toLowerCase().includes(query));
		const matchesCategory = activeCategory.value === "all" || product.categoryId === activeCategory.value;
		const matchesStatus = activeStatus.value === "all" || product.status === activeStatus.value;
		return matchesQuery && matchesCategory && matchesStatus;
	});

	if (activeSort.value === "name") {
		result = [...result].sort((a, b) => a.name.localeCompare(b.name, "th"));
	} else if (activeSort.value === "price") {
		result = [...result].sort((a, b) => b.price - a.price);
	} else {
		result = [...result].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt, "th"));
	}

	return result;
});

const selectedProduct = computed(() => {
	return filteredProducts.value.find((product) => product.id === selectedProductId.value)
		?? filteredProducts.value[0]
		?? products.value[0];
});

const categoryCounts = computed(() =>
	categoryOptions.value.reduce<Record<string, number>>((result, category) => {
		result[category.id] = category.id === "all"
			? products.value.length
			: products.value.filter((product) => product.categoryId === category.id).length;
		return result;
	}, {}),
);

const namedCategoryCount = computed(() =>
	Math.max(categoryOptions.value.filter((category) => category.id !== "all").length, 0),
);

const hasManyCategories = computed(() => categoryOptions.value.length > 5);

const totalProducts = computed(() => products.value.length);
const activeProductsCount = computed(() => products.value.filter((product) => product.status === "active").length);
const lowStockCount = computed(() => products.value.filter((product) => product.stockState === "low").length);
const inactiveCount = computed(() => products.value.filter((product) => product.status === "inactive").length);

watch(filteredProducts, (value) => {
	if (!value.length) return;
	if (!value.some((product) => product.id === selectedProductId.value)) {
		selectedProductId.value = value[0].id;
	}
}, { immediate: true });

function formatMoney(value: number) {
	return numberFormatter.format(value);
}

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

function getCategoryLabel(categoryId: string) {
	return categoryOptions.value.find((category) => category.id === categoryId)?.label ?? "ไม่ระบุหมวด";
}

function getStockTone(state: StockState) {
	if (state === "ready") return "green";
	if (state === "low") return "orange";
	return "gray";
}

function getStockLabel(product: ProductRecord) {
	if (product.status === "inactive") return "ปิดขาย";
	if (product.stockState === "low" && product.lowStockThreshold !== null) {
		return `เตือนต่ำ ${product.lowStockThreshold}`;
	}
	return "พร้อมขาย";
}

function getInitials(name: string) {
	return name
		.split(/\s+/)
		.filter(Boolean)
		.slice(0, 2)
		.map((part) => part[0]?.toUpperCase() ?? "")
		.join("") || "PD";
}

function getAccent(seed: string) {
	const total = Array.from(seed).reduce((sum, char) => sum + char.charCodeAt(0), 0);
	return accentPalette[total % accentPalette.length] as string;
}

function getVariantCount(raw: string | null) {
	if (!raw) return 0;
	try {
		const parsed = JSON.parse(raw) as unknown;
		if (Array.isArray(parsed)) return parsed.length;
		if (parsed && typeof parsed === "object") return Object.keys(parsed as Record<string, unknown>).length;
		return 1;
	} catch {
		return 1;
	}
}

function formatApiDate(value: string) {
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function resolveImageUrl(imageUrl: string | null) {
	if (!imageUrl) return null;
	if (/^https?:\/\//i.test(imageUrl)) return imageUrl;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	const path = imageUrl.startsWith("/") ? imageUrl : `/${imageUrl}`;
	return `${base}${path}`;
}

function mapApiProduct(
	product: ApiProduct,
	categoryMap: Record<string, string>,
	unitMap: Record<string, string>,
): ProductRecord {
	const status = product.active ? "active" : "inactive";
	const variantCount = getVariantCount(product.variant_options_json);
	const unitLabel = unitMap[product.base_unit_id] || product.base_unit_id || "หน่วยหลัก";
	const categoryId = product.category_id || "uncategorized";
	const categoryLabel = categoryMap[categoryId] || "ไม่ระบุหมวด";
	const lowStockThreshold = product.low_stock_threshold ?? null;
	const stockState: StockState = status === "inactive"
		? "inactive"
		: lowStockThreshold !== null && lowStockThreshold > 0
			? "low"
			: "ready";

	return {
		id: product.id,
		name: product.name,
		categoryId,
		categoryLabel,
		sku: product.sku,
		barcode: product.barcode || "-",
		price: product.price_base,
		cost: product.cost_base,
		unitLabel,
		stockState,
		status,
		variantCount,
		saleUnits: [unitLabel],
		imageKey: getInitials(product.name),
		imageUrl: resolveImageUrl(product.image_url),
		accent: getAccent(product.id),
		updatedAt: formatApiDate(product.created_at),
		updatedBy: "API",
		lowStockThreshold,
		tag: status === "inactive" ? "ปิดขาย" : variantCount > 0 ? "มีตัวเลือก" : undefined,
	};
}

async function loadProducts() {
	productsPending.value = true;
	productsError.value = null;

	try {
		const [productsResult, categoriesResult, unitsResult] = await Promise.allSettled([
			apiFetch<ApiEnvelope<ApiProduct[]>>("/products"),
			apiFetch<ApiEnvelope<ApiProductCategory[]>>("/product-categories"),
			apiFetch<ApiEnvelope<ApiUnit[]>>("/units"),
		]);

		if (productsResult.status !== "fulfilled") {
			throw productsResult.reason;
		}

		const categoryMap = categoriesResult.status === "fulfilled"
			? Object.fromEntries(categoriesResult.value.data.map((category) => [category.id, category.name]))
			: {};

		const unitMap = unitsResult.status === "fulfilled"
			? Object.fromEntries(unitsResult.value.data.map((unit) => [unit.id, unit.name_th || unit.code]))
			: {};

		products.value = productsResult.value.data.map((product) => mapApiProduct(product, categoryMap, unitMap));
		if (products.value.length) {
			selectedProductId.value = products.value[0].id;
		}
	} catch (error) {
		productsError.value = error instanceof Error ? error.message : "โหลดรายการสินค้าไม่สำเร็จ";
		products.value = [];
	} finally {
		productsPending.value = false;
	}
}

function toggleStatus(productId: string) {
	products.value = products.value.map((product) => {
		if (product.id !== productId) return product;
		const nextStatus = product.status === "active" ? "inactive" : "active";
		return {
			...product,
			status: nextStatus,
			stockState: nextStatus === "inactive"
				? "inactive"
				: product.lowStockThreshold !== null && product.lowStockThreshold > 0
					? "low"
					: "ready",
			updatedAt: formatApiDate(new Date().toISOString()),
			updatedBy: "Local preview",
			tag: nextStatus === "inactive" ? "ปิดขาย" : product.variantCount > 0 ? "มีตัวเลือก" : undefined,
		};
	});
}

function openProductDetail(productId: string) {
	selectedProductId.value = productId;
	productDetailOpen.value = true;
}

function closeProductDetail() {
	productDetailOpen.value = false;
}

function triggerScanToast(message: string) {
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

function toggleMobileSearch() {
	mobileSearchOpen.value = !mobileSearchOpen.value;
	if (mobileSearchOpen.value) {
		nextTick(() => {
			focusSearchInput();
		});
	}
}

function selectProductFromScan(code: string, source: "scanner" | "camera") {
	const normalized = code.trim();
	if (!normalized) return;

	searchQuery.value = normalized;
	const lower = normalized.toLowerCase();
	const matchedProduct = products.value.find((product) =>
		product.barcode.toLowerCase() === lower || product.sku.toLowerCase() === lower,
	) ?? filteredProducts.value[0];

	if (matchedProduct) {
		selectedProductId.value = matchedProduct.id;
		productDetailOpen.value = true;
	}

	triggerScanToast(
		matchedProduct
			? `${source === "camera" ? "สแกนกล้อง" : "สแกน"} ${normalized} พบ ${matchedProduct.name}`
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

	selectProductFromScan(scannerBuffer, "scanner");
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

	if (event.key.length !== 1) {
		return;
	}

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
	selectProductFromScan(normalized, "scanner");
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
						selectProductFromScan(text, "camera");
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

onMounted(() => {
	loadProducts();
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
								class="flex shrink-0 items-center justify-center rounded-2xl text-sm font-semibold"
								:class="[
									'h-11 w-11',
									isNavActive(item.to)
										? 'bg-white text-[#97532c] ring-1 ring-[#efd7c6]'
										: 'bg-[#f7f5f1] text-stone-600 ring-1 ring-[#e7e4dd]'
								]"
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
					<section class="min-w-0 flex-1 px-3 py-3 sm:px-4 sm:py-4 lg:min-h-0 lg:px-5 lg:overflow-hidden">
						<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
							<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
								<div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
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
													icon="i-heroicons-plus-20-solid"
													class="justify-center"
													aria-label="เพิ่มสินค้า"
													title="เพิ่มสินค้า"
													:disabled="!canCreateProduct"
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

										<UButton
											color="orange"
											variant="soft"
											size="lg"
											icon="i-heroicons-qr-code-20-solid"
											class="hidden justify-center px-4 lg:inline-flex"
											aria-label="สแกนบาร์โค้ด"
											title="สแกนบาร์โค้ด"
											@click="openCameraScanner"
										>
											<span class="hidden sm:inline">สแกนบาร์โค้ด</span>
										</UButton>

										<UButton
											color="orange"
											variant="solid"
											size="lg"
											icon="i-heroicons-plus-20-solid"
											class="hidden justify-center px-4 lg:inline-flex"
											aria-label="เพิ่มสินค้า"
											title="เพิ่มสินค้า"
											:disabled="!canCreateProduct"
										>
											<span class="hidden sm:inline">เพิ่มสินค้า</span>
										</UButton>
									</div>
							</UCard>

							<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto lg:pr-1">
								<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
									<div class="space-y-3">
										<div class="flex flex-wrap items-center gap-2">
											<UBadge color="gray" variant="soft" :label="`${totalProducts} SKU`" />
											<UBadge color="green" variant="soft" :label="`พร้อมขาย ${activeProductsCount}`" />
											<UBadge color="orange" variant="soft" :label="`สต็อกต่ำ ${lowStockCount}`" />
											<UBadge color="gray" variant="soft" :label="`ปิดขาย ${inactiveCount}`" />
										</div>

										<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto]">
											<div class="space-y-2">
												<div class="md:hidden">
													<label class="mb-1 block text-[11px] font-medium text-stone-500" for="product-category-select">
														เลือกหมวดสินค้า
													</label>
													<div class="relative">
														<select
															id="product-category-select"
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
														:color="activeStatus === status.id ? 'gray' : 'gray'"
														:variant="activeStatus === status.id ? 'solid' : 'soft'"
														size="sm"
														:label="status.label"
														class="whitespace-nowrap"
														@click="activeStatus = status.id"
													/>
												</div>
											</div>

											<div class="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
												<UButton color="gray" variant="soft" size="sm" label="นำเข้า" :disabled="!canCreateProduct" />
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
										<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
											<div>
												<h1 class="text-xl font-semibold tracking-[-0.03em] text-stone-900">
													รายการสินค้า
												</h1>
											</div>

										<p class="hidden max-w-xl text-sm leading-6 text-stone-500 sm:block">
											คลิกสินค้าเพื่อเปิดรายละเอียดแบบ slide-over โดยไม่บังพื้นที่หลักของรายการ
										</p>
									</div>

										<div class="space-y-3">
											<UCard
												v-if="productsPending"
												class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
											>
												<div class="py-10 text-center">
													<p class="text-lg font-semibold text-stone-900">กำลังโหลดรายการสินค้า</p>
													<p class="mt-2 text-sm text-stone-500">
														กำลังดึงข้อมูลจาก Express API
													</p>
												</div>
											</UCard>

											<UCard
												v-else-if="productsError"
												class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none"
											>
												<div class="py-8 text-center">
													<p class="text-lg font-semibold text-stone-900">โหลดสินค้าไม่สำเร็จ</p>
													<p class="mt-2 text-sm text-stone-500">
														{{ productsError }}
													</p>
													<div class="mt-4">
														<UButton color="orange" variant="soft" size="sm" label="ลองใหม่" @click="loadProducts" />
													</div>
												</div>
											</UCard>

											<template v-else>
												<button
													v-for="product in filteredProducts"
													:key="product.id"
													type="button"
													class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-3 text-left transition hover:border-[#d9d5cd] hover:shadow-sm"
													:class="selectedProductId === product.id ? 'ring-2 ring-[#f3c7a7]' : ''"
													@click="openProductDetail(product.id)"
												>
													<div class="flex items-start gap-3">
														<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-lg font-semibold text-white" :style="{ background: product.accent }">
															<img
																v-if="product.imageUrl"
																:src="product.imageUrl"
																:alt="product.name"
																class="h-full w-full object-cover"
															>
															<UIcon v-else name="i-heroicons-cube" class="h-6 w-6 text-white/95" />
														</div>

														<div class="min-w-0 flex-1">
															<div class="flex flex-wrap items-start justify-between gap-2">
																<div class="min-w-0">
																	<div class="flex flex-wrap items-center gap-2">
																		<h3 class="truncate text-sm font-semibold text-stone-900">{{ product.name }}</h3>
																		<UBadge v-if="product.tag" color="gray" variant="soft" :label="product.tag" />
																	</div>
																	<p class="mt-1 truncate text-[11px] text-stone-500">
																		{{ product.sku }} · {{ product.barcode }}
																	</p>
																</div>

																<div class="text-right">
																	<p class="text-sm font-semibold text-stone-900 tabular-nums">{{ formatMoney(product.price) }}</p>
																	<p class="mt-1 text-[11px] text-stone-500">ทุน {{ formatMoney(product.cost) }}</p>
																</div>
															</div>

															<div class="mt-3 flex flex-wrap items-center gap-2">
																<UBadge :color="getStockTone(product.stockState)" variant="soft" :label="getStockLabel(product)" />
																<UBadge color="gray" variant="soft" :label="getCategoryLabel(product.categoryId)" />
																<UBadge color="gray" variant="soft" :label="product.unitLabel" />
																<UBadge color="gray" variant="soft" :label="`${product.variantCount} variants`" />
															</div>

															<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
																<p class="text-[11px] text-stone-500">
																	อัปเดต {{ product.updatedAt }} โดย {{ product.updatedBy }}
																</p>
																<div class="flex flex-wrap gap-2">
																	<UButton color="gray" variant="soft" size="xs" label="ดู" @click.stop="openProductDetail(product.id)" />
																	<UButton color="gray" variant="soft" size="xs" label="แก้ไข" />
																	<UButton color="gray" variant="soft" size="xs" label="คัดลอก" />
																</div>
															</div>
														</div>
													</div>
												</button>
											</template>

											<UCard
												v-if="!productsPending && !productsError && filteredProducts.length === 0"
												class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none"
											>
												<div class="py-8 text-center">
													<p class="text-lg font-semibold text-stone-900">ไม่พบสินค้าที่ตรงกับคำค้น</p>
													<p class="mt-2 text-sm text-stone-500">
														ลองค้นหาด้วยชื่อสินค้า, SKU หรือ barcode หรือเปลี่ยนตัวกรองด้านบน
													</p>
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
					v-if="productDetailOpen"
					class="fixed inset-0 z-[58] bg-[rgba(28,25,23,0.42)] backdrop-blur-[2px]"
					@click="closeProductDetail"
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
					v-if="productDetailOpen && selectedProduct"
					class="fixed inset-x-0 bottom-0 z-[59] max-h-[88vh] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[440px] lg:rounded-none lg:rounded-l-[28px]"
				>
					<div class="grid h-full min-h-0 grid-rows-[auto_auto_minmax(0,1fr)_auto] p-4 text-stone-900">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Product detail</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">
										ข้อมูลสินค้า
									</h2>
								</div>
								<div class="flex items-center gap-2">
									<UButton color="gray" variant="soft" size="xs" label="แก้ไข" />
									<UButton
										color="gray"
										variant="soft"
										size="xs"
										icon="i-heroicons-x-mark-20-solid"
										aria-label="ปิดรายละเอียดสินค้า"
										title="ปิดรายละเอียดสินค้า"
										@click="closeProductDetail"
									/>
								</div>
							</div>

							<div class="mt-4 rounded-[24px] bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start gap-3">
									<div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl text-2xl font-semibold text-white" :style="{ background: selectedProduct.accent }">
										<img
											v-if="selectedProduct.imageUrl"
											:src="selectedProduct.imageUrl"
											:alt="selectedProduct.name"
											class="h-full w-full object-cover"
										>
										<UIcon v-else name="i-heroicons-cube" class="h-7 w-7 text-white/95" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-lg font-semibold text-stone-950">{{ selectedProduct.name }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedProduct.sku }} · {{ selectedProduct.barcode }}</p>
											</div>
											<UBadge
												:color="getStockTone(selectedProduct.stockState)"
												variant="soft"
												:label="getStockLabel(selectedProduct)"
											/>
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge color="gray" variant="soft" :label="getCategoryLabel(selectedProduct.categoryId)" />
											<UBadge color="gray" variant="soft" :label="selectedProduct.unitLabel" />
											<UBadge color="gray" variant="soft" :label="`${selectedProduct.variantCount} variants`" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="grid grid-cols-3 gap-2 border-b border-[#e7e4dd] py-4">
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ราคาขาย</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.price) }}</p>
							</div>
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ต้นทุน</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.cost) }}</p>
							</div>
							<div class="rounded-2xl bg-[#fbfbf8] px-3 py-3 ring-1 ring-[#e7e4dd]">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ส่วนต่าง</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.price - selectedProduct.cost) }}</p>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto py-4 pr-1">
							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-center justify-between gap-2">
									<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
									<UBadge color="gray" variant="soft" :label="selectedProduct.updatedBy" />
								</div>

								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">หมวดสินค้า</dt>
										<dd class="text-right font-medium text-stone-900">{{ getCategoryLabel(selectedProduct.categoryId) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">หน่วยหลัก</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedProduct.unitLabel }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">จำนวนหน่วยขาย</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedProduct.saleUnits.length }} แบบ</dd>
									</div>
									<div class="flex items-start justify-between gap-4">
										<dt class="text-stone-500">อัปเดตล่าสุด</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedProduct.updatedAt }}</dd>
									</div>
								</dl>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-center justify-between gap-2">
									<div>
										<h3 class="text-sm font-semibold text-stone-950">หน่วยขายและตัวเลือก</h3>
										<p class="mt-1 text-xs text-stone-500">หน่วยที่พร้อมใช้ใน POS และตัวเลือกสินค้านี้</p>
									</div>
									<UBadge color="gray" variant="soft" :label="`${selectedProduct.variantCount} variants`" />
								</div>

								<div class="mt-4 flex flex-wrap gap-2">
									<UBadge
										v-for="unit in selectedProduct.saleUnits"
										:key="unit"
										color="gray"
										variant="soft"
										:label="unit"
									/>
								</div>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h3 class="text-sm font-semibold text-stone-950">อัปเดตต้นทุน</h3>
										<p class="mt-1 text-xs leading-5 text-stone-500">
											แยกจากการแก้ข้อมูลทั่วไป เพื่อให้การเปลี่ยนต้นทุนดูย้อนหลังได้ง่าย
										</p>
									</div>
									<UButton color="orange" variant="soft" size="xs" label="แก้ต้นทุน" :disabled="!canUpdateProductCost" />
								</div>

								<div class="mt-4 rounded-2xl bg-white px-3 py-3 ring-1 ring-[#e7e4dd]">
									<p class="text-[11px] uppercase tracking-[0.18em] text-stone-400">Latest audit</p>
									<div class="mt-2 flex items-start justify-between gap-3">
										<div>
											<p class="text-sm font-semibold text-stone-900">{{ selectedProduct.updatedAt }}</p>
											<p class="mt-1 text-sm text-stone-500">เหตุผลล่าสุด: ปรับต้นทุนวัตถุดิบตามรอบรับของเข้า</p>
										</div>
										<UBadge color="gray" variant="soft" :label="selectedProduct.updatedBy" />
									</div>
								</div>
							</div>
						</div>

						<div class="border-t border-[#e7e4dd] pt-4">
							<div class="grid grid-cols-2 gap-2">
								<UButton color="gray" variant="soft" size="lg" label="คัดลอกสินค้า" :disabled="!canCreateProduct" />
								<UButton
									color="gray"
									:variant="selectedProduct.status === 'active' ? 'outline' : 'solid'"
									size="lg"
									:label="selectedProduct.status === 'active' ? 'ปิดขาย' : 'เปิดขาย'"
									:disabled="selectedProduct.status === 'active' ? !canDeactivateProduct : !canUpdateProduct"
									@click="toggleStatus(selectedProduct.id)"
								/>
							</div>
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
					class="fixed inset-0 z-[70] flex items-end justify-center bg-[rgba(28,25,23,0.58)] p-3 backdrop-blur-sm sm:items-center sm:p-6"
				>
					<div class="w-full max-w-2xl rounded-[28px] bg-[#fffefd] p-4 shadow-2xl ring-1 ring-[#e7e4dd] sm:p-5">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
									Barcode scan
								</p>
								<h2 class="mt-2 text-lg font-semibold tracking-[-0.03em] text-stone-950">
									สแกนบาร์โค้ดด้วยกล้อง
								</h2>
								<p class="mt-1 text-sm text-stone-500">
									ใช้ได้บน mobile, tablet และ desktop ที่มีกล้องเมื่อไม่มี scanner device
								</p>
							</div>

							<UButton
								color="gray"
								variant="soft"
								size="sm"
								icon="i-heroicons-x-mark-20-solid"
								aria-label="ปิดตัวสแกน"
								title="ปิดตัวสแกน"
								@click="stopCameraScanner"
							/>
						</div>

						<div class="mt-4 overflow-hidden rounded-[24px] bg-stone-950 ring-1 ring-stone-900/10">
							<div class="relative aspect-[4/3] w-full bg-stone-950">
								<video
									ref="scannerVideoRef"
									class="h-full w-full object-cover"
									muted
									playsinline
								/>
								<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
									<div class="h-32 w-full max-w-sm rounded-[28px] border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
								</div>
							</div>
						</div>

						<div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
							<div class="min-w-0">
								<p v-if="cameraScannerStarting" class="text-sm text-stone-600">
									กำลังเปิดกล้องและเริ่มตัวอ่านบาร์โค้ด...
								</p>
								<p v-else-if="cameraScannerError" class="text-sm text-rose-600">
									{{ cameraScannerError }}
								</p>
								<p v-else class="text-sm text-stone-600">
									จัดบาร์โค้ดให้อยู่ในกรอบ ระบบจะเติมค่าในช่องค้นหาและเลือกสินค้าให้อัตโนมัติ
								</p>
							</div>

							<div class="flex shrink-0 gap-2">
								<UButton
									v-if="cameraScannerError"
									color="orange"
									variant="soft"
									size="sm"
									label="ลองเปิดใหม่"
									@click="openCameraScanner"
								/>
								<UButton
									color="gray"
									variant="soft"
									size="sm"
									label="ปิด"
									@click="stopCameraScanner"
								/>
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
					class="fixed bottom-6 left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl bg-[rgba(28,25,23,0.92)] px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
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
