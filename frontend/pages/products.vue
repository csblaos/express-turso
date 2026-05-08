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

const runtimeConfig = useRuntimeConfig();
const { apiFetch } = useApiClient();
const { can } = useAuthSession();

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
const mobileSearchOpen = ref(false);
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

function getCategoryLabel(categoryId: string) {
	return categoryOptions.value.find((category) => category.id === categoryId)?.label ?? "ไม่ระบุหมวด";
}

function getStockTone(state: StockState) {
	if (state === "ready") return "success";
	if (state === "low") return "warning";
	return "neutral";
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
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['products']"
		sidebar-eyebrow="Products"
		sidebar-title="สินค้า"
		sidebar-compact-title="PRD"
		sidebar-description="จัดการ SKU, barcode, ราคา และสถานะขาย"
	>
		<template #default="{ openSidebar }">
			<section class="min-w-0 flex-1 px-0 py-3 sm:py-4 lg:min-h-0 lg:overflow-hidden">
				<div class="space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-3">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md lg:sticky lg:top-0 lg:z-20">
								<div class="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
										<div class="grid min-w-0 gap-2 lg:grid-cols-[minmax(0,1fr)]">
											<div class="grid grid-cols-4 gap-2 lg:hidden">
												<AppButton
													color="neutral"
													variant="soft"
													size="md"
													class="justify-center rounded-md"
													icon="i-heroicons-bars-3-20-solid"
													aria-label="เปิดเมนู"
													title="เปิดเมนู"
													@click="openSidebar"
												/>

												<AppButton
													color="neutral"
													variant="soft"
													size="md"
													class="justify-center rounded-md"
													icon="i-heroicons-magnifying-glass-20-solid"
													:aria-label="mobileSearchOpen ? 'ซ่อนการค้นหา' : 'เปิดการค้นหา'"
													:title="mobileSearchOpen ? 'ซ่อนการค้นหา' : 'เปิดการค้นหา'"
													@click="toggleMobileSearch"
												/>

												<AppButton
													color="primary"
													variant="soft"
													size="md"
													icon="i-heroicons-qr-code-20-solid"
													class="justify-center rounded-md"
													aria-label="สแกนบาร์โค้ด"
													title="สแกนบาร์โค้ด"
													@click="openCameraScanner"
												/>

											<AppButton
												color="primary"
												variant="solid"
												size="md"
													icon="i-heroicons-plus-20-solid"
													class="justify-center rounded-md"
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

												<div class="relative hidden min-w-0 lg:block">
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
										</div>

										<AppButton
											color="primary"
											variant="soft"
											size="md"
											icon="i-heroicons-qr-code-20-solid"
											class="hidden justify-center rounded-md px-4 lg:inline-flex"
											aria-label="สแกนบาร์โค้ด"
											title="สแกนบาร์โค้ด"
											@click="openCameraScanner"
										>
											<span class="hidden sm:inline">สแกนบาร์โค้ด</span>
										</AppButton>

										<AppButton
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-plus-20-solid"
											class="hidden justify-center rounded-md px-4 lg:inline-flex"
											aria-label="เพิ่มสินค้า"
											title="เพิ่มสินค้า"
											:disabled="!canCreateProduct"
										>
											<span class="hidden sm:inline">เพิ่มสินค้า</span>
										</AppButton>
									</div>
							</UCard>

					<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto lg:pr-1">
						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
									<div class="space-y-3">
										<div class="flex flex-wrap items-center gap-2">
											<UBadge color="neutral" variant="soft" :label="`${totalProducts} SKU`" />
											<UBadge color="success" variant="soft" :label="`พร้อมขาย ${activeProductsCount}`" />
											<UBadge color="warning" variant="soft" :label="`สต็อกต่ำ ${lowStockCount}`" />
											<UBadge color="neutral" variant="soft" :label="`ปิดขาย ${inactiveCount}`" />
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
																class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
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
													<AppButton
														v-for="category in categoryOptions"
														:key="category.id"
														:color="activeCategory === category.id ? 'primary' : 'neutral'"
														:variant="activeCategory === category.id ? 'soft' : 'ghost'"
															size="md"
														class="shrink-0 whitespace-nowrap snap-start"
														@click="activeCategory = category.id"
													>
														{{ category.label }}
														<span class="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-500">
															{{ categoryCounts[category.id] }}
														</span>
													</AppButton>
												</div>

												<div class="scrollbar-soft flex gap-2 overflow-x-auto pb-1">
													<AppButton
														v-for="status in statusOptions"
														:key="status.id"
														:color="activeStatus === status.id ? 'neutral' : 'neutral'"
														:variant="activeStatus === status.id ? 'solid' : 'soft'"
															size="md"
														:label="status.label"
														class="whitespace-nowrap"
														@click="activeStatus = status.id"
													/>
												</div>
											</div>

											<div class="flex flex-wrap items-start justify-start gap-2 xl:justify-end">
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="นำเข้า" :disabled="!canCreateProduct" />
												<AppButton
													v-for="sort in sortOptions"
													:key="sort.id"
													color="neutral"
													:variant="activeSort === sort.id ? 'solid' : 'soft'"
														size="md"
														class="rounded-md"
													:label="sort.label"
													@click="activeSort = sort.id"
												/>
											</div>
										</div>
									</div>
								</UCard>

						<div class="h-full min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
							<div class="flex h-full min-h-0 flex-col">
								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
									<div>
										<p class="text-sm font-semibold text-stone-950">Products list</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">คลิกสินค้าเพื่อเปิดรายละเอียด ดูราคา ต้นทุน และสถานะขาย</p>
									</div>
									<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
										{{ filteredProducts.length }} รายการ
									</div>
								</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
									<div v-if="productsPending" class="min-h-[280px]">
										<div class="overflow-hidden bg-neutral-100">
											<div class="products-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
										</div>
									</div>
									<div v-else-if="productsError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
										<div class="space-y-3">
											<p class="text-sm text-stone-600">{{ productsError }}</p>
											<AppButton color="primary" variant="soft" size="md" class="rounded-md" label="ลองใหม่" @click="loadProducts" />
										</div>
									</div>
									<div v-else-if="!filteredProducts.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
										<div class="space-y-3">
											<p class="text-sm font-medium text-stone-900">ไม่พบสินค้าที่ตรงกับคำค้น</p>
											<p class="text-sm text-stone-500">ลองค้นหาด้วยชื่อสินค้า, SKU หรือ barcode หรือเปลี่ยนตัวกรองด้านบน</p>
										</div>
									</div>
									<div v-else>
										<button
											v-for="product in filteredProducts"
											:key="product.id"
											type="button"
											class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
											:class="selectedProductId === product.id ? 'bg-primary-50' : 'bg-white'"
											@click="openProductDetail(product.id)"
										>
											<div class="flex items-start gap-3">
												<div class="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-md text-lg font-semibold text-white" :style="{ background: product.accent }">
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
																<UBadge v-if="product.tag" color="neutral" variant="soft" :label="product.tag" />
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
														<UBadge color="neutral" variant="soft" :label="getCategoryLabel(product.categoryId)" />
														<UBadge color="neutral" variant="soft" :label="product.unitLabel" />
														<UBadge color="neutral" variant="soft" :label="`${product.variantCount} variants`" />
													</div>

													<div class="mt-3 flex flex-wrap items-center justify-between gap-2">
														<p class="text-[11px] text-stone-500">
															อัปเดต {{ product.updatedAt }} โดย {{ product.updatedBy }}
														</p>
														<div class="flex flex-wrap gap-2">
															<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="ดู" @click.stop="openProductDetail(product.id)" />
															<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="แก้ไข" />
															<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="คัดลอก" />
														</div>
													</div>
												</div>
											</div>
										</button>
									</div>
								</div>

								<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
									<div class="flex items-center justify-between gap-2 text-xs text-stone-500 sm:text-sm">
										<div>{{ activeProductsCount }} พร้อมขาย • {{ inactiveCount }} ปิดขาย</div>
										<div>{{ lowStockCount }} สต็อกต่ำ • {{ namedCategoryCount }} หมวด</div>
									</div>
								</div>
							</div>
						</div>
							</div>
						</div>
			<AppResponsivePanel
				v-if="selectedProduct"
				v-model="productDetailOpen"
				title="ข้อมูลสินค้า"
				description="ดูราคา ต้นทุน หมวดสินค้า และจัดการสถานะการขาย"
				desktop-width="440px"
				:show-handle="false"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				@close="closeProductDetail"
			>
				<template #default>
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] text-stone-900">
						<div class="px-5 pt-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-3">
								<div class="flex items-start gap-3">
									<div class="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md text-2xl font-semibold text-white" :style="{ background: selectedProduct.accent }">
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
											<UBadge color="neutral" variant="soft" :label="getCategoryLabel(selectedProduct.categoryId)" />
											<UBadge color="neutral" variant="soft" :label="selectedProduct.unitLabel" />
											<UBadge color="neutral" variant="soft" :label="`${selectedProduct.variantCount} variants`" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="grid grid-cols-3 gap-2 px-5 py-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ราคาขาย</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.price) }}</p>
							</div>
							<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ต้นทุน</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.cost) }}</p>
							</div>
							<div class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3">
								<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ส่วนต่าง</p>
								<p class="mt-2 text-lg font-semibold text-stone-900">{{ formatMoney(selectedProduct.price - selectedProduct.cost) }}</p>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-5 pb-5">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-center justify-between gap-2">
									<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
									<UBadge color="neutral" variant="soft" :label="selectedProduct.updatedBy" />
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

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-center justify-between gap-2">
									<div>
										<h3 class="text-sm font-semibold text-stone-950">หน่วยขายและตัวเลือก</h3>
										<p class="mt-1 text-xs text-stone-500">หน่วยที่พร้อมใช้ใน POS และตัวเลือกสินค้านี้</p>
									</div>
									<UBadge color="neutral" variant="soft" :label="`${selectedProduct.variantCount} variants`" />
								</div>

								<div class="mt-4 flex flex-wrap gap-2">
									<UBadge
										v-for="unit in selectedProduct.saleUnits"
										:key="unit"
										color="neutral"
										variant="soft"
										:label="unit"
									/>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-start justify-between gap-3">
									<div>
										<h3 class="text-sm font-semibold text-stone-950">อัปเดตต้นทุน</h3>
										<p class="mt-1 text-xs leading-5 text-stone-500">
											แยกจากการแก้ข้อมูลทั่วไป เพื่อให้การเปลี่ยนต้นทุนดูย้อนหลังได้ง่าย
										</p>
									</div>
									<AppButton color="primary" variant="soft" size="xs" label="แก้ต้นทุน" :disabled="!canUpdateProductCost" />
								</div>

								<div class="mt-4 rounded-md bg-white px-3 py-3 ring-1 ring-neutral-200">
									<p class="text-[11px] uppercase tracking-[0.18em] text-stone-400">Latest audit</p>
									<div class="mt-2 flex items-start justify-between gap-3">
										<div>
											<p class="text-sm font-semibold text-stone-900">{{ selectedProduct.updatedAt }}</p>
											<p class="mt-1 text-sm text-stone-500">เหตุผลล่าสุด: ปรับต้นทุนวัตถุดิบตามรอบรับของเข้า</p>
										</div>
										<UBadge color="neutral" variant="soft" :label="selectedProduct.updatedBy" />
									</div>
								</div>
							</div>
						</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" :disabled="!canCreateProduct">คัดลอกสินค้า</AppButton>
								<AppButton
									color="neutral"
									:variant="selectedProduct.status === 'active' ? 'outline' : 'solid'"
									size="md"
									:block="true"
									:label="selectedProduct.status === 'active' ? 'ปิดขาย' : 'เปิดขาย'"
									:disabled="selectedProduct.status === 'active' ? !canDeactivateProduct : !canUpdateProduct"
									@click="toggleStatus(selectedProduct.id)"
								/>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

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
					<div class="w-full max-w-2xl rounded-none bg-[#fffefd] p-4 shadow-[0_18px_44px_rgba(31,28,24,0.18)] ring-1 ring-[#e7e4dd] sm:rounded-md sm:p-5">
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

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-x-mark-20-solid"
								class="rounded-md"
								aria-label="ปิดตัวสแกน"
								title="ปิดตัวสแกน"
								@click="stopCameraScanner"
							/>
						</div>

						<div class="mt-4 overflow-hidden rounded-md bg-stone-950 ring-1 ring-stone-900/10">
							<div class="relative aspect-[4/3] w-full bg-stone-950">
								<video
									ref="scannerVideoRef"
									class="h-full w-full object-cover"
									muted
									playsinline
								/>
								<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
									<div class="h-32 w-full max-w-sm rounded-md border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
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
					class="fixed bottom-6 left-1/2 z-50 w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-md bg-[rgba(28,25,23,0.92)] px-4 py-3 text-sm text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] ring-1 ring-white/10 backdrop-blur"
				>
					{{ scanToast }}
				</div>
			</Transition>
			</section>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
@keyframes products-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.products-loading-line {
	animation: products-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
