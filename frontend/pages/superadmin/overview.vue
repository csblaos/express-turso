<script setup lang="ts">
import type { EChartsCoreOption } from "echarts/core";
import { appNavItems } from "~/utils/app-nav";

type Comparison = { value: number | null; available: boolean };
type Dashboard = {
	period: { date_from: string; date_to: string };
	generated_at: string;
	summary: {
		revenue: number; bill_count: number; average_bill: number; discount: number;
		cancelled_refunded_count: number; active_store_count: number;
		comparison: { revenue: Comparison; bill_count: Comparison; average_bill: Comparison };
	};
	sales_series: Array<{ label: string; revenue: number; bill_count: number }>;
	payment_mix: Array<{ method: string; amount: number; bill_count: number; percent: number }>;
	stores: Array<{ id: string; name: string; currency: string; revenue: number; bill_count: number; average_bill: number; discount: number }>;
	top_products: Array<{ id: string; name: string; sku: string; store_name: string; quantity: number; revenue: number }>;
	promotions: Array<{ id: string; name: string; type: string; bill_count: number; applications: number; discount_amount: number; gift_quantity: number; gift_cost: number }>;
	store_options: Array<{ id: string; name: string; currency: string }>;
};

const { apiFetch } = useApiClient();
const { locale } = useI18n();
const copy = computed(() => locale.value === "lo" ? {
	title: "ພາບລວມທຸລະກິດ", hint: "ລວມຍອດຂາຍ ແລະ ອໍເດີຂອງທຸກຮ້ານ", allStores: "ທຸກຮ້ານ",
	today: "ມື້ນີ້", sevenDays: "7 ມື້", thirtyDays: "30 ມື້", thisMonth: "ເດືອນນີ້", custom: "ກຳນົດເອງ", apply: "ນຳໃຊ້", reload: "ໂຫຼດໃໝ່",
	revenue: "ຍອດຂາຍສຸດທິ", orders: "ຈຳນວນອໍເດີ", average: "ສະເລ່ຍຕໍ່ອໍເດີ", activeStores: "ຮ້ານທີ່ມີຍອດຂາຍ",
	cancelled: "ຍົກເລີກ/ຄືນເງິນ", discount: "ສ່ວນຫຼຸດ", salesTrend: "ແນວໂນ້ມຍອດຂາຍ", paymentMix: "ສັດສ່ວນການຊຳລະ",
	storeComparison: "ປຽບທຽບຮ້ານ", store: "ຮ້ານ", noData: "ຍັງບໍ່ມີຂໍ້ມູນໃນຊ່ວງນີ້", previous: "ທຽບຊ່ວງກ່ອນ", view: "ເບິ່ງຮ້ານ",
	overviewTab: "ພາບລວມ", productsTab: "ສິນຄ້າ", promotionsTab: "ໂປຣໂມຊັນ", topProducts: "ສິນຄ້າຂາຍດີ", quantity: "ຈຳນວນ", promotionUsage: "ຜົນການໃຊ້ໂປຣໂມຊັນ", bills: "ບິນ", applications: "ຄັ້ງທີ່ໃຊ້", giftCost: "ຕົ້ນທຶນຂອງແຖມ",
} : locale.value === "en" ? {
	title: "Business overview", hint: "Combined sales and orders across all stores", allStores: "All stores",
	today: "Today", sevenDays: "7 days", thirtyDays: "30 days", thisMonth: "This month", custom: "Custom", apply: "Apply", reload: "Reload",
	revenue: "Net sales", orders: "Orders", average: "Average order", activeStores: "Stores with sales", cancelled: "Cancelled/refunded", discount: "Discount",
	salesTrend: "Sales trend", paymentMix: "Payment mix", storeComparison: "Store comparison", store: "Store", noData: "No data for this period", previous: "vs previous period", view: "View store",
	overviewTab: "Overview", productsTab: "Products", promotionsTab: "Promotions", topProducts: "Top products", quantity: "Quantity", promotionUsage: "Promotion performance", bills: "Bills", applications: "Applications", giftCost: "Gift cost",
} : {
	title: "ภาพรวมธุรกิจ", hint: "รวมยอดขายและออเดอร์ของทุกร้าน", allStores: "ทุกร้าน",
	today: "วันนี้", sevenDays: "7 วัน", thirtyDays: "30 วัน", thisMonth: "เดือนนี้", custom: "กำหนดเอง", apply: "ใช้ตัวกรอง", reload: "โหลดใหม่",
	revenue: "ยอดขายสุทธิ", orders: "จำนวนออเดอร์", average: "เฉลี่ยต่อออเดอร์", activeStores: "ร้านที่มียอดขาย", cancelled: "ยกเลิก/คืนเงิน", discount: "ส่วนลด",
	salesTrend: "แนวโน้มยอดขาย", paymentMix: "สัดส่วนการชำระ", storeComparison: "เปรียบเทียบร้าน", store: "ร้าน", noData: "ยังไม่มีข้อมูลในช่วงนี้", previous: "เทียบช่วงก่อน", view: "ดูร้าน",
	overviewTab: "ภาพรวม", productsTab: "สินค้า", promotionsTab: "โปรโมชัน", topProducts: "สินค้าขายดี", quantity: "จำนวน", promotionUsage: "ผลการใช้โปรโมชัน", bills: "บิล", applications: "ครั้งที่ใช้", giftCost: "ต้นทุนของแถม",
});

const preset = ref("7d");
const activeTab = ref<"overview" | "products" | "promotions">("overview");
const selectedStoreId = ref("");
const dateFrom = ref("");
const dateTo = ref("");
const loading = ref(true);
const error = ref("");
const dashboard = ref<Dashboard | null>(null);

function query() {
	const params = new URLSearchParams({ preset: preset.value, timezone_offset: "420" });
	if (selectedStoreId.value) params.set("store_id", selectedStoreId.value);
	if (preset.value === "custom") {
		params.set("date_from", dateFrom.value);
		params.set("date_to", dateTo.value);
	}
	return params.toString();
}

async function loadDashboard() {
	if (preset.value === "custom" && (!dateFrom.value || !dateTo.value)) return;
	loading.value = true;
	error.value = "";
	try {
		const response = await apiFetch<{ data: Dashboard }>(`/superadmin/overview?${query()}`);
		dashboard.value = response.data;
	} catch (cause: any) {
		error.value = String(cause?.data?.message || cause?.message || "Unable to load overview");
	} finally {
		loading.value = false;
	}
}

function money(value: number) {
	return new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "th" ? "th-TH" : "en-US", {
		style: "currency", currency: "LAK", maximumFractionDigits: 0,
	}).format(value);
}
function number(value: number) { return new Intl.NumberFormat().format(value); }
function comparisonText(item?: Comparison) {
	if (!item?.available || item.value === null) return "—";
	return `${item.value >= 0 ? "+" : ""}${item.value.toFixed(1)}%`;
}
function comparisonTone(item?: Comparison) {
	if (!item?.available || item.value === null) return "text-stone-400";
	return item.value >= 0 ? "text-emerald-600" : "text-rose-600";
}
function paymentLabel(method: string) {
	const labels: Record<string, string> = { cash: locale.value === "lo" ? "ເງິນສົດ" : locale.value === "th" ? "เงินสด" : "Cash", qr: "QR", card: locale.value === "lo" ? "ບັດ" : locale.value === "th" ? "บัตร" : "Card", other: locale.value === "lo" ? "ອື່ນໆ" : locale.value === "th" ? "อื่น ๆ" : "Other" };
	return labels[method] || method;
}
function selectStore(storeId: string) {
	selectedStoreId.value = storeId;
	void loadDashboard();
}

const cards = computed(() => dashboard.value ? [
	{ label: copy.value.revenue, value: money(dashboard.value.summary.revenue), comparison: dashboard.value.summary.comparison.revenue },
	{ label: copy.value.orders, value: number(dashboard.value.summary.bill_count), comparison: dashboard.value.summary.comparison.bill_count },
	{ label: copy.value.average, value: money(dashboard.value.summary.average_bill), comparison: dashboard.value.summary.comparison.average_bill },
	{ label: copy.value.activeStores, value: `${dashboard.value.summary.active_store_count} / ${dashboard.value.store_options.length}` },
	{ label: copy.value.cancelled, value: number(dashboard.value.summary.cancelled_refunded_count) },
	{ label: copy.value.discount, value: money(dashboard.value.summary.discount) },
] : []);

const salesOption = computed<EChartsCoreOption>(() => ({
	color: [ "#10b981", "#3b82f6" ],
	tooltip: { trigger: "axis" },
	legend: { bottom: 0, data: [ copy.value.revenue, copy.value.orders ] },
	grid: { left: 10, right: 18, top: 24, bottom: 48, containLabel: true },
	xAxis: { type: "category", data: dashboard.value?.sales_series.map((item) => item.label) || [] },
	yAxis: [
		{ type: "value", axisLabel: { formatter: (value: number) => Intl.NumberFormat("en", { notation: "compact" }).format(value) }, splitLine: { lineStyle: { color: "#f5f5f4" } } },
		{ type: "value", minInterval: 1, splitLine: { show: false } },
	],
	series: [
		{ name: copy.value.revenue, type: "line", smooth: true, areaStyle: { color: "rgba(16,185,129,.14)" }, data: dashboard.value?.sales_series.map((item) => item.revenue) || [] },
		{ name: copy.value.orders, type: "bar", yAxisIndex: 1, barMaxWidth: 18, itemStyle: { color: "rgba(59,130,246,.35)", borderRadius: [ 4, 4, 0, 0 ] }, data: dashboard.value?.sales_series.map((item) => item.bill_count) || [] },
	],
}));
const paymentOption = computed<EChartsCoreOption>(() => ({
	color: [ "#10b981", "#3b82f6", "#8b5cf6", "#f59e0b", "#a8a29e" ],
	tooltip: { trigger: "item", formatter: (item: any) => `${item.name}<br/>${money(item.value)} · ${item.percent}%` },
	legend: { bottom: 0, type: "scroll" },
	series: [ { type: "pie", radius: [ "48%", "72%" ], center: [ "50%", "43%" ], padAngle: 2, itemStyle: { borderRadius: 5, borderColor: "#fff", borderWidth: 2 }, label: { show: false }, data: dashboard.value?.payment_mix.map((item) => ({ name: paymentLabel(item.method), value: item.amount })) || [] } ],
}));
const productOption = computed<EChartsCoreOption>(() => {
	const rows = [ ...(dashboard.value?.top_products || []) ].reverse();
	return {
		color: [ "#10b981" ], tooltip: { trigger: "axis", axisPointer: { type: "shadow" } },
		grid: { left: 8, right: 24, top: 10, bottom: 20, containLabel: true },
		xAxis: { type: "value", axisLabel: { formatter: (value: number) => Intl.NumberFormat("en", { notation: "compact" }).format(value) }, splitLine: { lineStyle: { color: "#f5f5f4" } } },
		yAxis: { type: "category", data: rows.map((item) => item.name), axisLabel: { width: 140, overflow: "truncate" } },
		series: [ { type: "bar", barMaxWidth: 18, itemStyle: { borderRadius: [ 0, 5, 5, 0 ] }, data: rows.map((item) => item.revenue) } ],
	};
});
const promotionOption = computed<EChartsCoreOption>(() => ({
	color: [ "#10b981", "#f59e0b" ], tooltip: { trigger: "axis", axisPointer: { type: "shadow" } }, legend: { bottom: 0 },
	grid: { left: 8, right: 18, top: 24, bottom: 48, containLabel: true },
	xAxis: { type: "category", data: dashboard.value?.promotions.map((item) => item.name) || [], axisLabel: { width: 110, overflow: "truncate" } },
	yAxis: { type: "value", minInterval: 1, splitLine: { lineStyle: { color: "#f5f5f4" } } },
	series: [
		{ name: copy.value.bills, type: "bar", barMaxWidth: 22, data: dashboard.value?.promotions.map((item) => item.bill_count) || [] },
		{ name: copy.value.applications, type: "bar", barMaxWidth: 22, data: dashboard.value?.promotions.map((item) => item.applications) || [] },
	],
}));

onMounted(loadDashboard);
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['superadmin']" sidebar-eyebrow="Super Admin" sidebar-title="Super Admin" sidebar-compact-title="SUP" :sidebar-description="copy.hint">
		<template #default="{ openSidebar }">
			<div class="min-w-0 space-y-3 pb-6">
				<AppPageHeader class="hidden md:block" :title-badge="false" compact @menu="openSidebar">
					<template #actions>
						<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="loading" @click="loadDashboard">{{ copy.reload }}</AppButton>
					</template>
				</AppPageHeader>

				<section class="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
					<div class="flex flex-col gap-3 xl:flex-row xl:items-end xl:justify-between">
						<div><h1 class="text-lg font-semibold text-stone-950">{{ copy.title }}</h1><p class="mt-1 text-sm text-stone-500">{{ copy.hint }}</p></div>
						<div class="grid gap-2 sm:grid-cols-2 xl:grid-cols-[160px_150px_auto_auto_auto]">
							<select v-model="selectedStoreId" class="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm" @change="loadDashboard">
								<option value="">{{ copy.allStores }}</option>
								<option v-for="store in dashboard?.store_options || []" :key="store.id" :value="store.id">{{ store.name }}</option>
							</select>
							<select v-model="preset" class="rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm" @change="preset !== 'custom' && loadDashboard()">
								<option value="today">{{ copy.today }}</option><option value="7d">{{ copy.sevenDays }}</option><option value="30d">{{ copy.thirtyDays }}</option><option value="this_month">{{ copy.thisMonth }}</option><option value="custom">{{ copy.custom }}</option>
							</select>
							<input v-if="preset === 'custom'" v-model="dateFrom" type="date" class="rounded-md border border-neutral-200 px-3 py-2 text-sm">
							<input v-if="preset === 'custom'" v-model="dateTo" type="date" class="rounded-md border border-neutral-200 px-3 py-2 text-sm">
							<AppButton v-if="preset === 'custom'" size="md" @click="loadDashboard">{{ copy.apply }}</AppButton>
						</div>
					</div>
				</section>

				<div v-if="loading" class="min-h-[420px] rounded-md border border-neutral-200 bg-white"><AppInlineLoadingBar container-class="bg-neutral-100" /></div>
				<div v-else-if="error" class="rounded-md border border-rose-200 bg-rose-50 p-5 text-center text-sm text-rose-700">{{ error }}</div>
				<template v-else-if="dashboard">
					<div class="flex gap-1 overflow-x-auto rounded-md border border-neutral-200 bg-white p-1.5 shadow-sm">
						<AppButton size="sm" :variant="activeTab === 'overview' ? 'solid' : 'ghost'" @click="activeTab = 'overview'">{{ copy.overviewTab }}</AppButton>
						<AppButton size="sm" :variant="activeTab === 'products' ? 'solid' : 'ghost'" @click="activeTab = 'products'">{{ copy.productsTab }}</AppButton>
						<AppButton size="sm" :variant="activeTab === 'promotions' ? 'solid' : 'ghost'" @click="activeTab = 'promotions'">{{ copy.promotionsTab }}</AppButton>
					</div>

					<template v-if="activeTab === 'overview'">
						<div class="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
							<div v-for="card in cards" :key="card.label" class="rounded-md border border-neutral-200 bg-white p-4 shadow-sm">
								<p class="text-xs font-medium text-stone-500">{{ card.label }}</p><strong class="mt-2 block text-xl tabular-nums text-stone-950">{{ card.value }}</strong>
								<p v-if="card.comparison" class="mt-1 text-xs" :class="comparisonTone(card.comparison)">{{ comparisonText(card.comparison) }} {{ copy.previous }}</p>
							</div>
						</div>

						<div class="grid min-w-0 gap-3 xl:grid-cols-[1.4fr_.6fr]">
							<UCard><h2 class="font-semibold">{{ copy.salesTrend }}</h2><ReportsReportChart :option="salesOption" :empty="!dashboard.sales_series.some((item) => item.revenue)" /></UCard>
							<UCard><h2 class="font-semibold">{{ copy.paymentMix }}</h2><ReportsReportChart :option="paymentOption" :empty="!dashboard.payment_mix.length" /></UCard>
						</div>

						<UCard>
							<div class="flex items-center justify-between"><div><h2 class="font-semibold">{{ copy.storeComparison }}</h2><p class="mt-1 text-xs text-stone-500">{{ dashboard.period.date_from }} – {{ dashboard.period.date_to }}</p></div><span class="rounded-md bg-neutral-100 px-2.5 py-1 text-xs text-stone-500">{{ dashboard.stores.length }} {{ copy.store }}</span></div>
							<div v-if="dashboard.stores.length" class="mt-4 overflow-x-auto">
								<table class="w-full min-w-[760px] text-sm">
									<thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{ copy.store }}</th><th class="p-3 text-right">{{ copy.revenue }}</th><th class="p-3 text-right">{{ copy.orders }}</th><th class="p-3 text-right">{{ copy.average }}</th><th class="p-3 text-right">{{ copy.discount }}</th><th class="p-3 text-right"></th></tr></thead>
									<tbody><tr v-for="store in dashboard.stores" :key="store.id" class="border-t border-stone-100"><td class="p-3 font-semibold">{{ store.name }}</td><td class="p-3 text-right tabular-nums">{{ money(store.revenue) }}</td><td class="p-3 text-right tabular-nums">{{ number(store.bill_count) }}</td><td class="p-3 text-right tabular-nums">{{ money(store.average_bill) }}</td><td class="p-3 text-right tabular-nums">{{ money(store.discount) }}</td><td class="p-3 text-right"><AppButton size="xs" color="neutral" variant="soft" @click="selectStore(store.id)">{{ copy.view }}</AppButton></td></tr></tbody>
								</table>
							</div>
							<p v-else class="py-12 text-center text-sm text-stone-500">{{ copy.noData }}</p>
						</UCard>
					</template>

					<template v-else-if="activeTab === 'products'">
						<UCard><h2 class="font-semibold">{{ copy.topProducts }}</h2><ReportsReportChart :option="productOption" :empty="!dashboard.top_products.length" /></UCard>
						<UCard>
							<div v-if="dashboard.top_products.length" class="overflow-x-auto"><table class="w-full min-w-[680px] text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{ copy.productsTab }}</th><th class="p-3">{{ copy.store }}</th><th class="p-3 text-right">{{ copy.quantity }}</th><th class="p-3 text-right">{{ copy.revenue }}</th></tr></thead><tbody><tr v-for="product in dashboard.top_products" :key="product.id" class="border-t border-stone-100"><td class="p-3"><p class="font-semibold">{{ product.name }}</p><p class="text-xs text-stone-500">{{ product.sku }}</p></td><td class="p-3">{{ product.store_name }}</td><td class="p-3 text-right">{{ number(product.quantity) }}</td><td class="p-3 text-right font-semibold">{{ money(product.revenue) }}</td></tr></tbody></table></div>
							<p v-else class="py-12 text-center text-sm text-stone-500">{{ copy.noData }}</p>
						</UCard>
					</template>

					<template v-else>
						<UCard><h2 class="font-semibold">{{ copy.promotionUsage }}</h2><ReportsReportChart :option="promotionOption" :empty="!dashboard.promotions.length" /></UCard>
						<UCard>
							<div v-if="dashboard.promotions.length" class="overflow-x-auto"><table class="w-full min-w-[760px] text-sm"><thead class="bg-stone-50 text-left text-xs text-stone-500"><tr><th class="p-3">{{ copy.promotionsTab }}</th><th class="p-3 text-right">{{ copy.bills }}</th><th class="p-3 text-right">{{ copy.applications }}</th><th class="p-3 text-right">{{ copy.discount }}</th><th class="p-3 text-right">{{ copy.giftCost }}</th></tr></thead><tbody><tr v-for="promotion in dashboard.promotions" :key="promotion.id" class="border-t border-stone-100"><td class="p-3 font-semibold">{{ promotion.name }}</td><td class="p-3 text-right">{{ number(promotion.bill_count) }}</td><td class="p-3 text-right">{{ number(promotion.applications) }}</td><td class="p-3 text-right">{{ money(promotion.discount_amount) }}</td><td class="p-3 text-right">{{ money(promotion.gift_cost) }}</td></tr></tbody></table></div>
							<p v-else class="py-12 text-center text-sm text-stone-500">{{ copy.noData }}</p>
						</UCard>
					</template>
				</template>
			</div>
		</template>
	</AppSidebarShell>
</template>
