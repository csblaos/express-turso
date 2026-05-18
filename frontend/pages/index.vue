<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ServiceMode = "หน้าร้าน" | "รับกลับ" | "เดลิเวอรี";
type QuickView = "all" | "bestseller" | "promo" | "low-stock" | "ready";
type StockState = "ready" | "low" | "inactive";

type Category = {
	id: string;
	label: string;
};

type Product = {
	id: string;
	name: string;
	category: string;
	sku: string;
	barcode: string;
	price: number;
	compareAt?: number;
	unitLabel: string;
	stock: number;
	soldToday: number;
	stockState: StockState;
	tag?: string;
	hasVariants?: boolean;
	thumbnail: string;
	accent: string;
};

type CartEntry = {
	productId: string;
	qty: number;
};

const categories: Category[] = [
	{ id: "all", label: "ทั้งหมด" },
	{ id: "coffee", label: "กาแฟ" },
	{ id: "tea", label: "ชา" },
	{ id: "bakery", label: "เบเกอรี" },
	{ id: "snack", label: "ของทานเล่น" },
	{ id: "retail", label: "รีเทล" },
];

const quickViews: Array<{ id: QuickView; label: string }> = [
	{ id: "all", label: "ทั้งหมด" },
	{ id: "bestseller", label: "ขายดี" },
	{ id: "promo", label: "โปรโมชัน" },
	{ id: "low-stock", label: "สต็อกต่ำ" },
	{ id: "ready", label: "พร้อมขาย" },
];

const serviceModes: ServiceMode[] = ["หน้าร้าน", "รับกลับ", "เดลิเวอรี"];

const products: Product[] = [
	{
		id: "iced-latte",
		name: "ลาเต้เย็น",
		category: "coffee",
		sku: "CF-LAT-16",
		barcode: "8851234500011",
		price: 95,
		compareAt: 110,
		unitLabel: "แก้ว 16 oz",
		stock: 28,
		soldToday: 17,
		stockState: "ready",
		tag: "ขายดี",
		hasVariants: true,
		thumbnail: "LT",
		accent: "linear-gradient(135deg, #fed7aa 0%, #ea580c 100%)",
	},
	{
		id: "americano",
		name: "อเมริกาโน่",
		category: "coffee",
		sku: "CF-AMR-16",
		barcode: "8851234500012",
		price: 80,
		unitLabel: "แก้ว 16 oz",
		stock: 19,
		soldToday: 12,
		stockState: "ready",
		thumbnail: "AM",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #78716c 100%)",
	},
	{
		id: "matcha-cloud",
		name: "มัทฉะคลาวด์",
		category: "tea",
		sku: "TE-MAT-16",
		barcode: "8851234500013",
		price: 120,
		compareAt: 135,
		unitLabel: "แก้ว 16 oz",
		stock: 9,
		soldToday: 8,
		stockState: "low",
		tag: "โปร",
		thumbnail: "MC",
		accent: "linear-gradient(135deg, #d9f99d 0%, #65a30d 100%)",
	},
	{
		id: "thai-milk-tea",
		name: "ชาไทยนมสด",
		category: "tea",
		sku: "TE-THM-16",
		barcode: "8851234500014",
		price: 90,
		unitLabel: "แก้ว 16 oz",
		stock: 24,
		soldToday: 10,
		stockState: "ready",
		thumbnail: "TT",
		accent: "linear-gradient(135deg, #fdba74 0%, #f97316 100%)",
	},
	{
		id: "croffle",
		name: "ครอฟเฟิลเนยสด",
		category: "bakery",
		sku: "BK-CRF-01",
		barcode: "8851234500015",
		price: 85,
		unitLabel: "ชิ้น",
		stock: 6,
		soldToday: 11,
		stockState: "low",
		thumbnail: "CR",
		accent: "linear-gradient(135deg, #fde68a 0%, #d97706 100%)",
	},
	{
		id: "burnt-cheesecake",
		name: "ชีสเค้กหน้าไหม้",
		category: "bakery",
		sku: "BK-CHS-02",
		barcode: "8851234500016",
		price: 125,
		unitLabel: "ชิ้น",
		stock: 4,
		soldToday: 5,
		stockState: "low",
		tag: "ลิมิเต็ด",
		thumbnail: "BC",
		accent: "linear-gradient(135deg, #fecdd3 0%, #e11d48 100%)",
	},
	{
		id: "garlic-fries",
		name: "เฟรนช์ฟรายกระเทียม",
		category: "snack",
		sku: "SN-FRY-01",
		barcode: "8851234500017",
		price: 79,
		unitLabel: "ถาด",
		stock: 15,
		soldToday: 7,
		stockState: "ready",
		thumbnail: "GF",
		accent: "linear-gradient(135deg, #fde68a 0%, #ca8a04 100%)",
	},
	{
		id: "sparkling-yuzu",
		name: "ยูซุโซดา",
		category: "tea",
		sku: "TE-YUZ-16",
		barcode: "8851234500018",
		price: 105,
		unitLabel: "แก้ว 16 oz",
		stock: 18,
		soldToday: 9,
		stockState: "ready",
		thumbnail: "YZ",
		accent: "linear-gradient(135deg, #fef08a 0%, #eab308 100%)",
	},
	{
		id: "beans-250",
		name: "เมล็ดกาแฟคั่ว 250 กรัม",
		category: "retail",
		sku: "RT-BNS-250",
		barcode: "8851234500019",
		price: 240,
		unitLabel: "ถุง",
		stock: 12,
		soldToday: 3,
		stockState: "ready",
		thumbnail: "BN",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #92400e 100%)",
	},
	{
		id: "oat-milk",
		name: "นมโอ๊ตสำหรับเพิ่ม",
		category: "retail",
		sku: "RT-OAT-01",
		barcode: "8851234500020",
		price: 25,
		unitLabel: "เพิ่มต่อแก้ว",
		stock: 0,
		soldToday: 6,
		stockState: "inactive",
		tag: "ปิดขาย",
		thumbnail: "OM",
		accent: "linear-gradient(135deg, #e7e5e4 0%, #a8a29e 100%)",
	},
	{
		id: "avocado-toast",
		name: "อโวคาโดโทสต์",
		category: "snack",
		sku: "SN-AVO-02",
		barcode: "8851234500021",
		price: 160,
		compareAt: 185,
		unitLabel: "จาน",
		stock: 8,
		soldToday: 4,
		stockState: "low",
		hasVariants: true,
		tag: "มีตัวเลือก",
		thumbnail: "AT",
		accent: "linear-gradient(135deg, #bbf7d0 0%, #059669 100%)",
	},
	{
		id: "black-tea",
		name: "ชาดำเย็น",
		category: "tea",
		sku: "TE-BLK-16",
		barcode: "8851234500022",
		price: 70,
		unitLabel: "แก้ว 16 oz",
		stock: 21,
		soldToday: 5,
		stockState: "ready",
		thumbnail: "BT",
		accent: "linear-gradient(135deg, #fed7aa 0%, #c2410c 100%)",
	},
];

const searchQuery = ref("");
const activeCategory = ref("all");
const activeQuickView = ref<QuickView>("all");
const activeMode = ref<ServiceMode>("หน้าร้าน");
const currentTicket = ref("A-102");
const selectedCustomer = ref("ลูกค้าทั่วไป");
const orderNote = ref("ไม่ใส่น้ำตาลในรายการชา");
const mobileTicketOpen = ref(false);
const scanToast = ref("");
const cart = ref<CartEntry[]>([
	{ productId: "iced-latte", qty: 2 },
	{ productId: "croffle", qty: 1 },
	{ productId: "sparkling-yuzu", qty: 1 },
]);

let scanIndex = 0;
let scanToastTimer: ReturnType<typeof setTimeout> | null = null;

const numberFormatter = new Intl.NumberFormat("th-TH", {
	style: "currency",
	currency: "THB",
	maximumFractionDigits: 0,
});

const productMap = computed(() =>
	Object.fromEntries(products.map((product) => [product.id, product])),
);

const categoryCounts = computed(() =>
	categories.reduce<Record<string, number>>((result, category) => {
		result[category.id] = category.id === "all"
			? products.length
			: products.filter((product) => product.category === category.id).length;
		return result;
	}, {}),
);

const filteredProducts = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return products.filter((product) => {
		const categoryMatch =
			activeCategory.value === "all" || product.category === activeCategory.value;
		const quickViewMatch =
			activeQuickView.value === "all" ||
			(activeQuickView.value === "bestseller" && product.soldToday >= 10) ||
			(activeQuickView.value === "promo" && Boolean(product.compareAt)) ||
			(activeQuickView.value === "low-stock" && product.stockState === "low") ||
			(activeQuickView.value === "ready" && product.stockState === "ready");
		const textMatch =
			query.length === 0 ||
			product.name.toLowerCase().includes(query) ||
			product.sku.toLowerCase().includes(query) ||
			product.barcode.includes(query) ||
			product.tag?.toLowerCase().includes(query);

		return categoryMatch && quickViewMatch && textMatch;
	});
});

const cartItems = computed(() =>
	cart.value
		.map((entry) => {
			const product = productMap.value[entry.productId];

			if (!product) {
				return null;
			}

			return {
				...product,
				qty: entry.qty,
				lineTotal: product.price * entry.qty,
			};
		})
		.filter((item): item is NonNullable<typeof item> => item !== null),
);

const itemCount = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.qty, 0),
);

const subtotal = computed(() =>
	cartItems.value.reduce((sum, item) => sum + item.lineTotal, 0),
);

const discount = computed(() =>
	cartItems.value.reduce(
		(sum, item) => sum + ((item.compareAt ?? item.price) - item.price) * item.qty,
		0,
	),
);

const tax = computed(() => Math.round(subtotal.value * 0.07));
const serviceCharge = computed(() => (activeMode.value === "หน้าร้าน" ? 15 : 0));
const total = computed(() => subtotal.value + tax.value + serviceCharge.value);

function formatMoney(value: number) {
	return numberFormatter.format(value);
}

function addToCart(product: Product) {
	if (product.stockState === "inactive") {
		return;
	}

	const existing = cart.value.find((entry) => entry.productId === product.id);

	if (existing) {
		existing.qty += 1;
		return;
	}

	cart.value.unshift({ productId: product.id, qty: 1 });
}

function increaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (entry) {
		entry.qty += 1;
	}
}

function decreaseQty(productId: string) {
	const entry = cart.value.find((item) => item.productId === productId);

	if (!entry) {
		return;
	}

	if (entry.qty === 1) {
		cart.value = cart.value.filter((item) => item.productId !== productId);
		return;
	}

	entry.qty -= 1;
}

function clearCart() {
	cart.value = [];
}

function getStockTone(state: StockState) {
	if (state === "ready") {
		return "success";
	}

	if (state === "low") {
		return "warning";
	}

	return "neutral";
}

function getStockLabel(product: Product) {
	if (product.stockState === "ready") {
		return `คงเหลือ ${product.stock}`;
	}

	if (product.stockState === "low") {
		return `ใกล้หมด ${product.stock}`;
	}

	return "ปิดขาย";
}

function triggerScanToast(message: string) {
	scanToast.value = message;

	if (scanToastTimer) {
		clearTimeout(scanToastTimer);
	}

	scanToastTimer = setTimeout(() => {
		scanToast.value = "";
	}, 2400);
}

function simulateScan() {
	const sellableProducts = products.filter((product) => product.stockState !== "inactive");
	const product = sellableProducts[scanIndex % sellableProducts.length];
	scanIndex += 1;
	searchQuery.value = product.barcode;
	addToCart(product);
	triggerScanToast(`สแกน ${product.barcode} เพิ่ม ${product.name} ลงบิลแล้ว`);
}

</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['pos']"
		sidebar-eyebrow="POS"
		sidebar-title="ขายหน้าร้าน"
		sidebar-compact-title="POS"
		sidebar-description="จุดขายหลักและบิลปัจจุบัน"
	>
		<template #default="{ openSidebar }">
			<div class="flex min-h-full w-full lg:h-full lg:min-h-0 lg:overflow-hidden">
				<section class="min-w-0 flex-1 px-0 py-3 pb-24 sm:py-4 lg:min-h-0 lg:pb-0">
						<div class="space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-3">
										<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md lg:sticky lg:top-0 lg:z-10">
											<div class="space-y-4">
												<div class="flex flex-wrap items-center gap-2">
													<UBadge color="primary" variant="soft" label="POS" />
													<UBadge color="neutral" variant="soft" :label="`บิล ${currentTicket}`" />
													<UBadge color="success" variant="soft" :label="`พร้อมขาย ${filteredProducts.length} รายการ`" />
												</div>

												<div class="grid gap-2 xl:grid-cols-[minmax(0,1fr)_auto_auto]">
													<div class="grid gap-2 sm:grid-cols-[auto_minmax(0,1fr)]">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="justify-center rounded-md lg:hidden"
															label="เมนู"
															@click="openSidebar"
														/>

														<div class="relative">
															<UInput
																v-model="searchQuery"
																size="lg"
																icon="i-heroicons-magnifying-glass-20-solid"
																placeholder="ค้นหาชื่อสินค้า, SKU หรือ barcode"
																color="neutral"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:pr-12 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
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
														variant="solid"
														size="md"
														icon="i-heroicons-qr-code-20-solid"
														class="justify-center rounded-md px-4"
														aria-label="สแกนบาร์โค้ด"
														title="สแกนบาร์โค้ด"
														@click="simulateScan"
													/>

													<div class="grid grid-cols-2 gap-2">
														<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="พักบิล" />
														<AppButton color="neutral" variant="outline" size="md" class="rounded-md" label="บิลที่พัก 4" />
													</div>
												</div>

												<div class="grid gap-3 border-t border-[#e7e4dd] pt-3 xl:grid-cols-[minmax(0,1fr)_auto]">
													<div class="space-y-2">
														<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
															<AppButton
																v-for="mode in serviceModes"
																:key="mode"
																:color="activeMode === mode ? 'neutral' : 'neutral'"
																:variant="activeMode === mode ? 'solid' : 'soft'"
																size="md"
																:label="mode"
																class="whitespace-nowrap rounded-md"
																@click="activeMode = mode"
															/>
														</div>

														<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
															<AppButton
																v-for="category in categories"
																:key="category.id"
																:color="activeCategory === category.id ? 'primary' : 'neutral'"
																:variant="activeCategory === category.id ? 'soft' : 'ghost'"
																size="md"
																class="whitespace-nowrap rounded-md"
																@click="activeCategory = category.id"
															>
																{{ category.label }}
																<span class="ml-2 rounded-full bg-white px-2 py-0.5 text-[11px] text-stone-500">
																	{{ categoryCounts[category.id] }}
																</span>
															</AppButton>
														</div>

														<div class="scrollbar-hidden md:scrollbar-soft flex gap-2 overflow-x-auto pb-1">
															<AppButton
																v-for="view in quickViews"
																:key="view.id"
																:color="activeQuickView === view.id ? 'neutral' : 'neutral'"
																:variant="activeQuickView === view.id ? 'solid' : 'soft'"
																size="md"
																:label="view.label"
																class="whitespace-nowrap rounded-md"
																@click="activeQuickView = view.id"
															/>
														</div>
													</div>

													<div class="flex flex-wrap items-start justify-start gap-2 xl:max-w-[280px] xl:justify-end">
														<UBadge color="neutral" variant="soft" :label="`พนักงาน Lina`" />
														<UBadge color="neutral" variant="soft" :label="`ลูกค้า ${selectedCustomer}`" />
														<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="เรียงตามขายดี" />
														<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="ฟิลเตอร์สาขา" />
													</div>
												</div>
											</div>
										</UCard>

								<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md lg:min-h-0 lg:overflow-hidden">
								<div class="space-y-4 p-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)]">
									<div class="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">
												Product list
											</p>
											<h2 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-900">
												รายการสินค้าพร้อมขาย
											</h2>
										</div>

										<p class="max-w-xl text-sm leading-6 text-stone-500">
											ลด card ให้แน่นขึ้นสำหรับ retail POS, ยังมีรูปช่วยจำสินค้า แต่ให้ข้อมูล operational สำคัญมาก่อน
										</p>
									</div>

									<div class="scrollbar-soft min-h-0 overflow-y-auto xl:pr-1">
									<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
										<article
											v-for="product in filteredProducts"
											:key="product.id"
											class="min-w-0 text-left"
										>
												<UCard
														class="h-full overflow-hidden rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200 transition hover:-translate-y-0.5 hover:shadow-md"
												:class="product.stockState === 'inactive' ? 'opacity-60' : 'cursor-pointer'"
												@click="product.stockState !== 'inactive' && addToCart(product)"
											>
													<div class="flex h-full flex-col gap-3">
														<div class="rounded-md px-3 py-2.5 text-white" :style="{ background: product.accent }">
														<div class="flex min-h-[74px] items-start justify-between gap-3">
															<div>
																<p class="text-[11px] uppercase tracking-[0.22em] text-white/80">
																	{{ product.category }}
																</p>
																<p class="mt-2.5 text-[1.75rem] font-semibold leading-none tracking-[-0.05em]">
																	{{ product.thumbnail }}
																</p>
															</div>
																<UBadge
																	v-if="product.tag"
																		color="neutral"
																	variant="soft"
																	:label="product.tag"
																	class="max-w-full bg-white/15 text-[10px] text-white ring-0"
																/>
															</div>
														</div>

														<div class="min-w-0 space-y-2.5">
															<div class="min-w-0">
																<h3 class="line-clamp-2 text-sm font-semibold leading-5 text-stone-900">
																		{{ product.name }}
																	</h3>
																	<p class="mt-1 truncate text-[11px] text-stone-500">
																		{{ product.sku }} . {{ product.barcode }}
																	</p>
															</div>

															<div class="flex flex-wrap gap-2">
																<UBadge
																	:color="getStockTone(product.stockState)"
																	variant="soft"
																	:label="getStockLabel(product)"
																/>
																<UBadge color="neutral" variant="soft" :label="product.unitLabel" />
																<UBadge
																	v-if="product.hasVariants"
																	color="neutral"
																variant="soft"
																label="มีตัวเลือก"
															/>
														</div>

															<p class="text-[11px] text-stone-500">
																ขายวันนี้ {{ product.soldToday }} รายการ
															</p>
													</div>

														<div class="mt-auto flex items-end justify-between gap-3">
															<div class="min-w-0">
																<p v-if="product.compareAt" class="text-sm text-stone-400 line-through">
																	{{ formatMoney(product.compareAt) }}
															</p>
															<p class="text-lg font-semibold text-stone-950 tabular-nums">
																{{ formatMoney(product.price) }}
															</p>
														</div>
															<AppButton
																	:color="product.stockState === 'inactive' ? 'neutral' : 'primary'"
																:variant="product.stockState === 'inactive' ? 'soft' : 'solid'"
																size="md"
																:icon="product.stockState === 'inactive' ? 'i-heroicons-lock-closed-16-solid' : 'i-heroicons-plus-16-solid'"
																:label="product.stockState === 'inactive' ? 'ปิดขาย' : 'เพิ่ม'"
																:disabled="product.stockState === 'inactive'"
																class="shrink-0 rounded-md"
																@click.stop="product.stockState !== 'inactive' && addToCart(product)"
															/>
														</div>
													</div>
												</UCard>
										</article>
									</div>

									<UCard
										v-if="filteredProducts.length === 0"
										class="border border-dashed border-neutral-200 bg-neutral-50 shadow-none"
									>
										<div class="py-8 text-center">
											<p class="text-lg font-semibold text-stone-900">ไม่พบสินค้าที่ตรงกับคำค้น</p>
											<p class="mt-2 text-sm text-stone-500">
												ลองค้นหาด้วยชื่อสินค้า, SKU หรือ barcode หรือเปลี่ยน quick filter ด้านบน
											</p>
										</div>
									</UCard>
									</div>
								</div>
							</div>
						</div>
					</section>

							<aside class="hidden w-[420px] xl:flex xl:min-h-0 xl:flex-col xl:px-4 xl:py-3">
								<div class="grid h-[calc(100dvh-1.5rem)] max-h-[calc(100dvh-1.5rem)] min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden rounded-md border border-neutral-200 bg-[#fbfbf8] p-4 text-stone-900 shadow-[0_8px_24px_rgba(31,28,24,0.06)]">
										<div class="flex items-start justify-between gap-3 border-b border-[#ece6dc] pb-3">
											<div class="min-w-0">
												<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Active ticket</p>
												<div class="mt-1 flex items-end gap-2">
													<h2 class="text-2xl font-semibold tracking-[-0.05em] text-stone-950">{{ currentTicket }}</h2>
													<p class="truncate pb-0.5 text-xs text-stone-500">{{ activeMode }} · {{ itemCount }} รายการ</p>
												</div>
											</div>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												icon="i-heroicons-trash"
												class="rounded-md"
												aria-label="ล้างบิล"
												title="ล้างบิล"
												@click="clearCart"
											/>
										</div>

											<div class="mt-4 grid min-h-0 overflow-hidden grid-rows-[auto_minmax(0,1fr)] gap-3">
												<div class="flex flex-wrap gap-2">
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="แนบลูกค้า" />
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="ส่วนลด" />
													<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="พักบิล" />
												</div>

												<div class="scrollbar-soft h-full min-h-0 overflow-y-auto pr-1">
													<div class="space-y-2 pb-1">
											<UCard
												v-for="item in cartItems"
												:key="item.id"
													class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200"
										>
											<div class="space-y-3">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<h3 class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</h3>
														<p class="mt-1 truncate text-[11px] text-stone-500">{{ item.unitLabel }} . {{ item.sku }}</p>
													</div>
													<p class="shrink-0 text-sm font-semibold text-stone-900 tabular-nums">
														{{ formatMoney(item.lineTotal) }}
													</p>
												</div>

												<div class="flex items-center justify-between gap-3">
													<div class="flex min-w-0 flex-wrap gap-1.5">
														<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
														<UBadge color="neutral" variant="soft" :label="item.unitLabel" />
														<UBadge v-if="item.hasVariants" color="neutral" variant="soft" label="ตัวเลือก" />
													</div>
													<div class="inline-flex shrink-0 items-center rounded-md bg-[#f3f2ee] p-0.5">
														<AppButton color="neutral" variant="ghost" size="xs" label="-" @click="decreaseQty(item.id)" />
														<span class="min-w-[2rem] text-center text-sm font-semibold text-stone-900 tabular-nums">
															{{ item.qty }}
														</span>
														<AppButton color="neutral" variant="ghost" size="xs" label="+" @click="increaseQty(item.id)" />
													</div>
												</div>
											</div>
										</UCard>

											<UCard
												v-if="cartItems.length === 0"
													class="border border-dashed border-neutral-200 bg-[#f3f2ee] text-stone-500 shadow-none"
											>
													<div class="py-8 text-sm leading-7">
														ยังไม่มีสินค้าในบิลนี้ ลองสแกนบาร์โค้ดหรือกดเพิ่มจากรายการสินค้าทางซ้าย
													</div>
												</UCard>
													</div>
												</div>
											</div>

											<div class="sticky bottom-0 z-10 border-t border-[#ece6dc] bg-[rgba(251,251,248,0.96)] px-1 pt-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur">
												<div class="space-y-3">
													<div class="grid grid-cols-2 gap-2 text-xs text-stone-500">
														<div class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
															<p>Subtotal</p>
															<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">{{ formatMoney(subtotal) }}</p>
														</div>
														<div class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
															<p>ส่วนลด</p>
															<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">-{{ formatMoney(discount) }}</p>
														</div>
														<div class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
															<p>VAT 7%</p>
															<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">{{ formatMoney(tax) }}</p>
														</div>
														<div class="rounded-md bg-white px-3 py-2 ring-1 ring-neutral-200">
															<p>Service</p>
															<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">{{ formatMoney(serviceCharge) }}</p>
														</div>
													</div>

													<div class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
														<div class="flex items-center justify-between gap-3">
															<div>
																<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">ยอดชำระ</p>
																<p class="mt-1 text-sm text-stone-500">{{ itemCount }} รายการ . {{ activeMode }}</p>
															</div>
															<p class="text-[1.7rem] font-semibold tracking-[-0.04em] text-stone-950 tabular-nums">
																{{ formatMoney(total) }}
															</p>
														</div>
													</div>

													<div class="grid grid-cols-2 gap-2">
														<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="เงินสด" />
														<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="QR / โอน" />
													</div>

													<AppButton color="primary" variant="solid" size="md" class="w-full rounded-md" label="รับชำระเงิน" />
												</div>
											</div>
								</div>
							</aside>
			</div>
		</template>
	</AppSidebarShell>

			<div class="fixed inset-x-0 bottom-0 z-30 border-t border-[#ece6dc] bg-[rgba(255,255,253,0.96)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur xl:hidden">
			<div class="flex items-center justify-between gap-4">
				<div>
					<p class="text-[11px] uppercase tracking-[0.22em] text-stone-400">บิลปัจจุบัน</p>
					<p class="mt-1 text-sm font-medium text-stone-600">{{ itemCount }} รายการ . {{ currentTicket }}</p>
				</div>
				<div class="flex items-center gap-3">
					<p class="text-right text-lg font-semibold text-stone-950 tabular-nums">{{ formatMoney(total) }}</p>
						<AppButton color="primary" variant="solid" size="md" class="rounded-md" label="ดูบิล" @click="mobileTicketOpen = true" />
				</div>
			</div>
		</div>

		<div
			v-if="mobileTicketOpen"
			class="fixed inset-0 z-50 flex items-end bg-black/45 p-3 xl:hidden"
			@click.self="mobileTicketOpen = false"
		>
			<UCard class="max-h-[88vh] w-full overflow-hidden rounded-none border-0 bg-white shadow-2xl ring-1 ring-black/5 sm:rounded-md">
				<template #header>
					<div class="flex items-center justify-between">
						<div>
							<p class="text-[11px] uppercase tracking-[0.22em] text-stone-400">บิลปัจจุบัน</p>
							<h2 class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-900">
								{{ currentTicket }}
							</h2>
						</div>
							<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="ปิด" @click="mobileTicketOpen = false" />
					</div>
				</template>

					<div class="scrollbar-soft max-h-[calc(88vh-240px)] space-y-3 overflow-y-auto">
						<UCard
							v-for="item in cartItems"
							:key="item.id"
							class="rounded-md border-0 bg-white ring-1 ring-neutral-200"
						>
							<div class="space-y-3">
								<div class="flex items-start justify-between gap-3">
									<div class="min-w-0">
										<h3 class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</h3>
										<p class="mt-1 truncate text-[11px] text-stone-500">{{ item.unitLabel }} . {{ item.sku }}</p>
									</div>
									<p class="shrink-0 text-sm font-semibold text-stone-900 tabular-nums">
										{{ formatMoney(item.lineTotal) }}
									</p>
								</div>

								<div class="flex items-center justify-between gap-3">
									<div class="flex min-w-0 flex-wrap gap-1.5">
										<UBadge :color="getStockTone(item.stockState)" variant="soft" :label="getStockLabel(item)" />
										<UBadge color="neutral" variant="soft" :label="item.unitLabel" />
									</div>
									<div class="inline-flex shrink-0 items-center rounded-md bg-[#f3f2ee] p-0.5">
										<AppButton color="neutral" variant="ghost" size="xs" label="-" @click="decreaseQty(item.id)" />
										<span class="min-w-[2rem] text-center text-sm font-semibold text-stone-900 tabular-nums">
											{{ item.qty }}
										</span>
										<AppButton color="neutral" variant="ghost" size="xs" label="+" @click="increaseQty(item.id)" />
									</div>
								</div>
							</div>
						</UCard>

					<UCard
						v-if="cartItems.length === 0"
						class="border border-dashed border-neutral-200 bg-[#f3f2ee] text-center text-stone-500 shadow-none"
					>
						<div class="py-8 text-sm">ยังไม่มีสินค้าในบิลนี้</div>
					</UCard>
				</div>

					<template #footer>
						<div class="space-y-3 border-t border-[#ece6dc] bg-[rgba(255,255,255,0.98)] pt-4 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur">
							<div class="grid grid-cols-2 gap-2 text-xs text-stone-500">
								<div class="rounded-md bg-[#fbfbf8] px-3 py-2 ring-1 ring-neutral-200">
									<p>Subtotal</p>
									<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">{{ formatMoney(subtotal) }}</p>
								</div>
								<div class="rounded-md bg-[#fbfbf8] px-3 py-2 ring-1 ring-neutral-200">
									<p>ส่วนลด</p>
									<p class="mt-1 text-sm font-semibold text-stone-900 tabular-nums">-{{ formatMoney(discount) }}</p>
								</div>
							</div>

							<div class="rounded-md bg-[#fbfbf8] px-4 py-3 ring-1 ring-neutral-200">
								<div class="flex items-center justify-between gap-3">
									<div>
										<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-stone-400">ยอดชำระ</p>
										<p class="mt-1 text-sm text-stone-500">{{ itemCount }} รายการ</p>
									</div>
									<p class="text-xl font-semibold tracking-[-0.03em] text-stone-950 tabular-nums">{{ formatMoney(total) }}</p>
								</div>
							</div>

							<div class="grid grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="เงินสด" />
								<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="QR / โอน" />
							</div>

							<div class="grid gap-2">
								<AppButton color="primary" variant="solid" size="md" class="rounded-md" label="รับชำระเงิน" />
								<AppButton color="neutral" variant="soft" size="md" class="rounded-md" label="พักบิล" />
							</div>
						</div>
					</template>
			</UCard>
		</div>

		<div
			v-if="scanToast"
			class="fixed right-3 top-3 z-[60] max-w-sm"
		>
			<UCard class="border-0 bg-white shadow-xl ring-1 ring-neutral-200">
				<p class="text-[11px] font-semibold uppercase tracking-[0.22em] text-[#97532c]">Barcode scanned</p>
				<p class="mt-1 text-sm text-stone-700">{{ scanToast }}</p>
			</UCard>
		</div>

</template>
