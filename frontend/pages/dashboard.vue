<script setup lang="ts">
import { currencyDecimals, formatMoneyWithSymbol } from "~/utils/currency";
import { formatAppDate, formatAppDateTime } from "~/utils/date-format";
import { appNavItems } from "~/utils/app-nav";

type Preset = "today" | "yesterday";
type Comparison = { value: number | null; available: boolean };
type DailyDashboard = {
	currency: string;
	generated_at: string;
	period: { from: string; to: string; date_from: string; date_to: string };
	summary: { revenue: number; bill_count: number; average_bill: number; discount: number; cancelled_refunded_count: number; cancelled_refunded_amount: number; comparison: Record<string, Comparison> };
	operational_signals: { restock_sku_count: number; out_of_stock_count: number; negative_stock_count: number };
	payment_mix: Array<{ method: string; amount: number; bill_count: number; percent: number }>;
	payment_currencies: Array<{ currency: string; is_base: boolean; bill_count: number; amount_base: number; tendered_base: number; change_base: number; amount_foreign: number | null; exchange_rate: number; percent: number }>;
	promotion_summary: { promotion_bill_count: number; applications: number; discount_amount: number; gift_quantity: number };
	promotion_performance: Array<{ promotion_id: string; name: string; type: string; bill_count: number; applications: number; discount_amount: number; gift_quantity: number }>;
	top_products: Array<{ id: string; name: string; sku: string; quantity: number; revenue: number; percent: number }>;
	low_stock: Array<{ id: string; name: string; sku: string; available_base: number; threshold: number }>;
};

const { apiFetch } = useApiClient();
const { currentStoreId, can } = useAuthSession();
const { locale } = useI18n();
const preset = ref<Preset>("today");
const dashboard = ref<DailyDashboard | null>(null);
const loading = ref(false);
const errorMessage = ref("");
let requestVersion = 0;

const copy = computed(() => locale.value === "lo" ? {
	eyebrow: "ສະຫຼຸບວຽກປະຈຳວັນ", title: "ໜ້າຫຼັກ", today: "ມື້ນີ້", yesterday: "ມື້ວານ", reload: "ໂຫຼດໃໝ່", export: "ສົ່ງອອກ CSV", updated: "ອັບເດດ", businessPeriod: "ຊ່ວງວັນເຮັດວຽກ", sales: "ຍອດຂາຍ", bills: "ຈຳນວນບິນ", average: "ຍອດສະເລ່ຍຕໍ່ບິນ", discount: "ສ່ວນຫຼຸດ", compared: "ທຽບກັບມື້ວານ", noComparison: "ຍັງບໍ່ມີຂໍ້ມູນທຽບ", attention: "ລາຍການທີ່ຕ້ອງເບິ່ງ", attentionClear: "ສະຕັອກປົກກະຕິ", restock: "ໃກ້ໝົດ", out: "ໝົດສະຕັອກ", negative: "ສະຕັອກຕິດລົບ", cancelledRefunded: "ຍົກເລີກ / ຄືນເງິນ", giftItems: "ຂອງແຖມ", products: "ລາຍການ", stock: "ເບິ່ງສະຕັອກ", stockList: "ສິນຄ້າໃກ້ໝົດ", stockNormal: "ສະຕັອກຢູ່ໃນລະດັບປົກກະຕິ", available: "ເຫຼືອ", payment: "ການຮັບຊຳລະ", cashNet: "ເງິນສົດຮັບສຸດທິ", cashNetHint: "ຍອດຮັບຊຳລະ ບໍ່ແມ່ນຍອດເງິນໃນລິ້ນຊັກ", received: "ຮັບມາ", change: "ເງິນທອນ", salesValue: "ຍອດຂາຍ", promotions: "ໂປຣໂມຊັນທີ່ໃຊ້", topProducts: "ສິນຄ້າຂາຍດີ", none: "ບໍ່ມີ", loadFailed: "ໂຫຼດໜ້າຫຼັກບໍ່ສຳເລັດ", tryAgain: "ລອງໃໝ່", cash: "ເງິນສົດ", qr: "QR / ໂອນ", card: "ບັດ", other: "ອື່ນໆ", uses: "ຄັ້ງ", billsUsed: "ບິນ",
} : locale.value === "th" ? {
	eyebrow: "สรุปงานประจำวัน", title: "แดชบอร์ด", today: "วันนี้", yesterday: "เมื่อวาน", reload: "โหลดใหม่", export: "ส่งออก CSV", updated: "อัปเดต", businessPeriod: "ช่วงวันทำการ", sales: "ยอดขาย", bills: "จำนวนบิล", average: "ยอดเฉลี่ยต่อบิล", discount: "ส่วนลด", compared: "เทียบกับวันก่อน", noComparison: "ยังไม่มีข้อมูลเปรียบเทียบ", attention: "รายการที่ต้องดู", attentionClear: "สต็อกปกติ", restock: "ใกล้หมด", out: "หมดสต็อก", negative: "สต็อกติดลบ", cancelledRefunded: "ยกเลิก / คืนเงิน", giftItems: "ของแถม", products: "รายการ", stock: "ดูสต็อก", stockList: "สินค้าใกล้หมด", stockNormal: "สต็อกอยู่ในระดับปกติ", available: "คงเหลือ", payment: "การรับชำระ", cashNet: "เงินสดรับสุทธิ", cashNetHint: "ยอดรับชำระ ไม่ใช่ยอดเงินในลิ้นชัก", received: "รับมา", change: "เงินทอน", salesValue: "ยอดขาย", promotions: "โปรโมชันที่ใช้", topProducts: "สินค้าขายดี", none: "ไม่มี", loadFailed: "โหลดแดชบอร์ดไม่สำเร็จ", tryAgain: "ลองใหม่", cash: "เงินสด", qr: "QR / โอน", card: "บัตร", other: "อื่น ๆ", uses: "ครั้ง", billsUsed: "บิล",
} : {
	eyebrow: "Daily work summary", title: "Dashboard", today: "Today", yesterday: "Yesterday", reload: "Reload", export: "Export CSV", updated: "Updated", businessPeriod: "Business day period", sales: "Sales", bills: "Bills", average: "Average bill", discount: "Discount", compared: "Compared with previous day", noComparison: "No comparison yet", attention: "Needs attention", attentionClear: "Stock is normal", restock: "Low stock", out: "Out of stock", negative: "Negative stock", cancelledRefunded: "Cancelled / refunded", giftItems: "free items", products: "products", stock: "View stock", stockList: "Products to restock", stockNormal: "Stock is in a normal range", available: "Available", payment: "Payments", cashNet: "Net cash received", cashNetHint: "Payment total, not a physical cash-drawer balance", received: "Received", change: "Change", salesValue: "Sales", promotions: "Promotions used", topProducts: "Top products", none: "None", loadFailed: "Unable to load dashboard", tryAgain: "Try again", cash: "Cash", qr: "QR / transfer", card: "Card", other: "Other", uses: "uses", billsUsed: "bills",
});

const appLocale = computed(() => locale.value === "lo" ? "lo" : locale.value === "th" ? "th" : "en");
const money = (value: number) => formatMoneyWithSymbol(value, dashboard.value?.currency || "LAK", { locale: appLocale.value === "lo" ? "lo-LA" : appLocale.value === "th" ? "th-TH" : "en-US", maximumFractionDigits: 0 });
const number = (value: number) => new Intl.NumberFormat(appLocale.value === "lo" ? "lo-LA" : appLocale.value === "th" ? "th-TH" : "en-US", { maximumFractionDigits: 2 }).format(value);
const periodText = computed(() => dashboard.value ? formatAppDate(dashboard.value.period.date_from, appLocale.value) : "");
const dateTime = (value: string, endExclusive = false) => formatAppDateTime(new Date(new Date(value).getTime() - (endExclusive ? 60_000 : 0)), appLocale.value);
const businessPeriodText = computed(() => dashboard.value ? `${dateTime(dashboard.value.period.from)} – ${dateTime(dashboard.value.period.to, true)}` : "–");
const updatedAtText = computed(() => dashboard.value?.generated_at
	? new Intl.DateTimeFormat(appLocale.value === "lo" ? "lo-LA" : appLocale.value === "th" ? "th-TH" : "en-US", { hour: "2-digit", minute: "2-digit" }).format(new Date(dashboard.value.generated_at))
	: "–");
const canViewStock = computed(() => can("inventory.view"));
const canViewOrders = computed(() => can("orders.view"));
const needsStockAttention = computed(() => !!dashboard.value && (dashboard.value.operational_signals.restock_sku_count > 0 || dashboard.value.operational_signals.out_of_stock_count > 0 || dashboard.value.operational_signals.negative_stock_count > 0));
const cancelledRefundedText = computed(() => dashboard.value ? `${copy.value.cancelledRefunded} ${number(dashboard.value.summary.cancelled_refunded_count)} ${copy.value.billsUsed}` : "");
const paymentLabel = (method: string) => method === "cash" ? copy.value.cash : [ "qr", "qr_transfer", "transfer", "bank_transfer" ].includes(method) ? copy.value.qr : [ "card", "credit_card" ].includes(method) ? copy.value.card : copy.value.other;
const foreignCurrencyRows = computed(() => (dashboard.value?.payment_currencies || []).filter((item) => !item.is_base && item.amount_foreign !== null));
const foreignMoney = (value: number, currency: string) => formatMoneyWithSymbol(value, currency, { locale: appLocale.value === "lo" ? "lo-LA" : appLocale.value === "th" ? "th-TH" : "en-US", maximumFractionDigits: currencyDecimals(currency), minimumFractionDigits: currencyDecimals(currency) });
function delta(key: string) { const value = dashboard.value?.summary.comparison?.[key]; return !value?.available || value.value === null ? null : { text: `${value.value > 0 ? "+" : ""}${value.value.toFixed(1)}%`, positive: value.value >= 0 }; }

async function loadDashboard() {
	if (!currentStoreId.value) return;
	const version = ++requestVersion;
	loading.value = true; errorMessage.value = "";
	try {
		const params = new URLSearchParams({ store_id: currentStoreId.value, preset: preset.value, timezone_offset: String(-new Date().getTimezoneOffset()) });
		const response = await apiFetch<{ data: DailyDashboard }>(`/reports/daily-dashboard?${params}`);
		if (version === requestVersion) dashboard.value = response.data;
	} catch { if (version === requestVersion) errorMessage.value = copy.value.loadFailed; }
	finally { if (version === requestVersion) loading.value = false; }
}

function exportCsv() {
	if (!dashboard.value || !import.meta.client) return;
	const d = dashboard.value;
	const rows = [
		[ "period", `${d.period.from} – ${d.period.to}` ], [ copy.value.sales, d.summary.revenue ], [ copy.value.bills, d.summary.bill_count ], [ copy.value.cancelledRefunded, d.summary.cancelled_refunded_count, d.summary.cancelled_refunded_amount ], [ copy.value.average, d.summary.average_bill ], [ copy.value.discount, d.summary.discount ],
		...d.payment_mix.map(item => [ `${copy.value.payment}: ${paymentLabel(item.method)}`, item.amount, item.bill_count, `${item.percent.toFixed(1)}%` ]),
		...d.payment_currencies.filter(item => !item.is_base && item.amount_foreign !== null).map(item => [ `${copy.value.cashNet}: ${item.currency}`, `${item.amount_foreign} ${item.currency} = ${item.tendered_base} ${d.currency}`, `${copy.value.change} ${item.change_base} ${d.currency}`, `${copy.value.salesValue} ${item.amount_base} ${d.currency}` ]),
		...d.promotion_performance.map(item => [ `${copy.value.promotions}: ${item.name}`, item.discount_amount, item.applications, item.gift_quantity ? `${item.gift_quantity} ${copy.value.giftItems}` : "" ]),
		...d.top_products.map(item => [ `${copy.value.topProducts}: ${item.name}`, item.revenue, item.quantity ]),
	];
	const csv = [ [ "metric", "amount", "count", "share" ], ...rows ].map(row => row.map(value => `"${String(value ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
	const url = URL.createObjectURL(new Blob([ `\uFEFF${csv}` ], { type: "text/csv;charset=utf-8" }));
	const link = document.createElement("a"); link.href = url; link.download = `daily-summary-${d.period.date_from}.csv`; link.click(); URL.revokeObjectURL(url);
}

watch([ preset, currentStoreId ], () => void loadDashboard(), { immediate: true });
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['dashboard']" :sidebar-eyebrow="copy.eyebrow" :sidebar-title="copy.title" sidebar-compact-title="DASH" :sidebar-description="copy.eyebrow">
		<template #default="{ openSidebar }">
			<div class="grid w-full min-w-0 max-w-full gap-3 overflow-x-hidden pb-4">
				<AppPageHeader :title-badge="false" compact title="" body-class="px-3 py-2.5 sm:px-4 sm:py-3" @menu="openSidebar">
					<div class="flex min-h-10 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
						<div class="min-w-0">
							<div class="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
								<h1 class="text-base font-semibold tracking-[-0.02em] text-stone-950">{{ copy.title }}</h1>
							</div>
							<div class="mt-1 flex items-start gap-1.5 rounded-md bg-sky-50 px-2 py-1 text-xs text-sky-800">
								<UIcon name="i-lucide-clock-3" class="mt-0.5 size-3.5 shrink-0" />
								<p class="min-w-0 break-words leading-5"><span class="font-semibold">{{ copy.businessPeriod }}:</span> {{ businessPeriodText }}</p>
							</div>
						</div>
						<div class="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:shrink-0 sm:items-center">
							<span class="hidden whitespace-nowrap text-xs text-stone-400 lg:inline">{{ copy.updated }} {{ updatedAtText }}</span>
							<AppButton class="w-full sm:w-auto" icon="i-heroicons-arrow-down-tray-20-solid" color="neutral" variant="soft" size="md" :label="copy.export" :disabled="!dashboard" @click="exportCsv"/>
							<AppButton class="w-full sm:w-auto" icon="i-heroicons-arrow-path-20-solid" color="neutral" variant="soft" size="md" :label="copy.reload" :loading="loading" :spin-icon-on-loading="true" @click="loadDashboard"/>
						</div>
					</div>
				</AppPageHeader>
				<div class="grid min-w-0 grid-cols-2 gap-1 rounded-md border border-stone-200 bg-white p-2 sm:flex sm:gap-2"><AppButton class="justify-center" :color="preset === 'today' ? 'primary' : 'neutral'" :variant="preset === 'today' ? 'solid' : 'ghost'" :label="copy.today" @click="preset = 'today'"/><AppButton class="justify-center" :color="preset === 'yesterday' ? 'primary' : 'neutral'" :variant="preset === 'yesterday' ? 'solid' : 'ghost'" :label="copy.yesterday" @click="preset = 'yesterday'"/></div>
				<div v-if="!dashboard && loading" class="grid grid-cols-2 gap-3 lg:grid-cols-4"><div v-for="item in 4" :key="item" class="h-28 rounded-md border border-stone-200 bg-white p-3 shadow-sm"><USkeleton class="h-3 w-20 rounded-full"/><USkeleton class="mt-5 h-7 w-28 rounded-md"/></div></div>
				<div v-else-if="errorMessage" class="rounded-md border border-rose-200 bg-rose-50 p-8 text-center"><p class="font-semibold text-rose-900">{{ errorMessage }}</p><AppButton class="mt-4" :label="copy.tryAgain" @click="loadDashboard"/></div>
				<template v-else-if="dashboard">
					<div class="grid grid-cols-2 gap-3 lg:grid-cols-4"><div class="rounded-md border border-stone-200 bg-white p-3.5 shadow-sm"><p class="text-xs font-semibold text-stone-500">{{ copy.sales }}</p><p class="mt-1.5 text-xl font-semibold tabular-nums text-stone-950">{{ money(dashboard.summary.revenue) }}</p><p class="mt-1 text-xs text-stone-400">{{ delta('revenue') ? `${copy.compared} ` : copy.noComparison }}<span v-if="delta('revenue')" class="ms-1 font-medium" :class="delta('revenue')?.positive ? 'text-emerald-700' : 'text-rose-700'">{{ delta('revenue')?.text }}</span></p></div><div class="rounded-md border border-stone-200 bg-white p-3.5 shadow-sm"><p class="text-xs font-semibold text-stone-500">{{ copy.bills }}</p><p class="mt-1.5 text-xl font-semibold tabular-nums text-stone-950">{{ number(dashboard.summary.bill_count) }}</p><NuxtLink v-if="dashboard.summary.cancelled_refunded_count && canViewOrders" to="/orders" class="mt-1 block text-xs font-medium text-rose-700 hover:underline">{{ cancelledRefundedText }}</NuxtLink><p v-else class="mt-1 text-xs text-stone-400">{{ cancelledRefundedText }}</p></div><div class="rounded-md border border-stone-200 bg-white p-3.5 shadow-sm"><p class="text-xs font-semibold text-stone-500">{{ copy.average }}</p><p class="mt-1.5 text-xl font-semibold tabular-nums text-stone-950">{{ money(dashboard.summary.average_bill) }}</p><p class="mt-1 text-xs text-stone-400">{{ copy.sales }}</p></div><div class="rounded-md border border-stone-200 bg-white p-3.5 shadow-sm"><p class="text-xs font-semibold text-stone-500">{{ copy.discount }}</p><p class="mt-1.5 text-xl font-semibold tabular-nums text-stone-950">{{ money(dashboard.summary.discount) }}</p><p class="mt-1 text-xs text-stone-400">{{ dashboard.summary.cancelled_refunded_amount ? money(dashboard.summary.cancelled_refunded_amount) : copy.none }}</p></div></div>
					<div class="grid min-w-0 gap-3 xl:grid-cols-2"><UCard><h2 class="font-semibold">{{ copy.payment }}</h2><div v-if="dashboard.payment_mix.length" class="mt-4 space-y-3"><div v-for="item in dashboard.payment_mix" :key="item.method"><div class="flex justify-between gap-3 text-sm"><span class="font-medium text-stone-800">{{ paymentLabel(item.method) }}</span><span class="tabular-nums text-stone-700">{{ money(item.amount) }}</span></div><div class="mt-1.5 h-1.5 overflow-hidden rounded-full bg-stone-100"><div class="h-full rounded-full bg-emerald-500" :style="{ width: `${Math.min(100, item.percent)}%` }"/></div><p class="mt-1 text-xs text-stone-400">{{ number(item.bill_count) }} {{ copy.billsUsed }} · {{ item.percent.toFixed(1) }}%</p></div></div><div v-if="foreignCurrencyRows.length" class="mt-4 border-t border-stone-100 pt-3"><p class="text-sm font-semibold text-stone-900">{{ copy.cashNet }}</p><p class="mt-1 text-xs text-stone-500">{{ copy.cashNetHint }}</p><div v-for="item in foreignCurrencyRows" :key="item.currency" class="mt-3 rounded-md bg-amber-50/60 p-3"><p class="text-sm font-semibold tabular-nums text-stone-900">{{ copy.received }} {{ foreignMoney(item.amount_foreign || 0, item.currency) }} = {{ money(item.tendered_base) }}</p><p class="mt-1 text-xs text-amber-800"><span v-if="item.change_base">{{ copy.change }} {{ money(item.change_base) }} · </span>{{ copy.salesValue }} {{ money(item.amount_base) }}</p></div></div><p v-else class="py-10 text-center text-sm text-stone-500">{{ copy.none }}</p></UCard><UCard><h2 class="font-semibold">{{ copy.topProducts }}</h2><div v-if="dashboard.top_products.length" class="mt-3 divide-y divide-stone-100"><div v-for="item in dashboard.top_products" :key="item.id" class="flex items-center justify-between gap-3 py-2.5"><div class="min-w-0"><p class="truncate font-medium text-stone-900">{{ item.name }}</p><p class="text-xs text-stone-400">{{ number(item.quantity) }} {{ copy.products }}</p></div><p class="shrink-0 text-sm font-medium tabular-nums text-stone-800">{{ money(item.revenue) }}</p></div></div><p v-else class="py-10 text-center text-sm text-stone-500">{{ copy.none }}</p></UCard></div>
					<UCard><h2 class="font-semibold">{{ copy.promotions }}</h2><div v-if="dashboard.promotion_performance.length" class="mt-3 divide-y divide-stone-100"><div v-for="item in dashboard.promotion_performance" :key="item.promotion_id" class="flex items-center justify-between gap-3 py-2.5"><div class="min-w-0"><p class="truncate font-medium text-stone-900">{{ item.name }}</p><p class="text-xs text-stone-400">{{ number(item.applications) }} {{ copy.uses }} · {{ number(item.bill_count) }} {{ copy.billsUsed }}<span v-if="item.gift_quantity"> · {{ number(item.gift_quantity) }} {{ copy.giftItems }}</span></p></div><p class="shrink-0 text-sm font-medium tabular-nums" :class="item.discount_amount ? 'text-emerald-700' : item.gift_quantity ? 'text-amber-700' : 'text-stone-500'">{{ item.discount_amount ? money(item.discount_amount) : item.gift_quantity ? `${number(item.gift_quantity)} ${copy.giftItems}` : copy.none }}</p></div></div><p v-else class="py-10 text-center text-sm text-stone-500">{{ copy.none }}</p></UCard>
					<div class="grid min-w-0 gap-3 xl:grid-cols-[.8fr_1.2fr]"><UCard :class="needsStockAttention ? 'border-amber-200 bg-amber-50/30' : ''"><div class="flex items-center justify-between gap-3"><div><h2 class="font-semibold">{{ copy.attention }}</h2><p class="mt-1 text-xs text-stone-500">{{ needsStockAttention ? periodText : copy.attentionClear }}</p></div><UIcon :name="needsStockAttention ? 'i-heroicons-exclamation-triangle-20-solid' : 'i-heroicons-check-circle-20-solid'" class="size-5" :class="needsStockAttention ? 'text-amber-500' : 'text-emerald-500'"/></div><div v-if="needsStockAttention" class="mt-4 grid grid-cols-3 gap-2"><div class="rounded-md bg-amber-50 p-3"><p class="text-xs font-medium text-amber-700">{{ copy.restock }}</p><p class="mt-1 text-xl font-semibold tabular-nums text-amber-950">{{ number(dashboard.operational_signals.restock_sku_count) }}</p></div><div class="rounded-md bg-rose-50 p-3"><p class="text-xs font-medium text-rose-700">{{ copy.out }}</p><p class="mt-1 text-xl font-semibold tabular-nums text-rose-950">{{ number(dashboard.operational_signals.out_of_stock_count) }}</p></div><div class="rounded-md bg-stone-100 p-3"><p class="text-xs font-medium text-stone-600">{{ copy.negative }}</p><p class="mt-1 text-xl font-semibold tabular-nums text-stone-950">{{ number(dashboard.operational_signals.negative_stock_count) }}</p></div></div><AppButton v-if="canViewStock && needsStockAttention" class="mt-4" color="primary" variant="solid" size="sm" icon="i-heroicons-cube-20-solid" :label="copy.stock" to="/inventory"/></UCard><UCard><div class="flex items-center justify-between gap-3"><h2 class="font-semibold">{{ copy.stockList }}</h2><AppButton v-if="canViewStock && dashboard.low_stock.length" size="xs" color="primary" variant="soft" :label="copy.stock" to="/inventory"/></div><div v-if="dashboard.low_stock.length" class="mt-4 divide-y divide-stone-100"><div v-for="item in dashboard.low_stock" :key="item.id" class="flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0"><div class="min-w-0"><p class="truncate font-medium text-stone-900">{{ item.name }}</p><p class="text-xs text-stone-400">{{ item.sku }}</p></div><p class="shrink-0 text-sm tabular-nums text-amber-700">{{ copy.available }} <b>{{ number(item.available_base) }}</b> / {{ number(item.threshold) }}</p></div></div><p v-else class="py-5 text-center text-sm text-stone-500">{{ copy.stockNormal }}</p></UCard></div>
				</template>
			</div>
		</template>
	</AppSidebarShell>
</template>
