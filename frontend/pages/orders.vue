<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatMoneyWithSymbol } from "~/utils/currency";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDateTime } from "~/utils/date-format";

type OrderStatus = "open" | "ready_to_pay" | "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
type OrderType = "quick-sale" | "dine-in";
type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";
type DatePreset = "all" | "today" | "yesterday" | "this-week" | "last-week" | "custom";

type OrderLine = {
	id: string;
	name: string;
	sku: string;
	qty: number;
	price: number;
	note?: string;
	lineStatus?: string;
	isGift?: boolean;
	roundNo?: number;
	dispatchMode?: "kitchen" | "direct";
	cancelReason?: string;
};

type OrderRecord = {
	id: string;
	orderNumber: string;
	customerName: string;
	hasCustomer: boolean;
	orderType: OrderType;
	orderNo: string;
	queueNo?: string;
	fulfillmentStatus?: string;
	// When the customer actually took the goods, and who handed them over. The
	// POS queue tab only covers today, so this is the durable record.
	collectedAt?: string;
	collectedBy?: string;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentMethod?: "cash" | "qr_transfer" | "credit_card" | string;
	total: number;
	subtotal: number;
	discount: number;
	vatAmount: number;
	amountTendered: number;
	changeAmount: number;
	itemCount: number;
	createdAt: string;
	updatedAt: string;
	cashier: string;
	tableLabel?: string;
	phone?: string;
	note?: string;
	lines: OrderLine[];
};

const searchQuery = ref("");
// Scanning a printed bill puts its reference straight into the search box, which
// the list already filters on — no separate lookup path to keep in step.
const scannerOpen = ref(false);
function applyScannedCode(code: string) {
	const value = String(code || "").trim();
	if (!value) return;
	searchQuery.value = value;
	currentPage.value = 1;
}
const activeStatus = ref<"all" | OrderStatus>("all");
const activeOrderType = ref<"all" | OrderType>("all");
const activePaymentStatus = ref<"all" | PaymentStatus>("all");
const activePaymentMethod = ref<"all" | "cash" | "qr_transfer" | "credit_card">("all");
const initialOrderDate = toLocalDateInput(new Date());
const dateFrom = ref(initialOrderDate);
const dateTo = ref(initialOrderDate);
const activeDatePreset = ref<DatePreset>("today");
const activeView = ref<"all" | "attention" | "open-tables" | "open-queue" | "completed">("all");
const detailOpen = ref(false);
const printPreviewOpen = ref(false);
const selectedOrderId = ref("");
const ordersPending = ref(false);
const ordersLoadedOnce = ref(false);
const ordersError = ref<string | null>(null);
const storeCurrency = ref("LAK");
const queueEnabled = ref(false);
const businessDayStartMinutes = ref(0);
const receiptStore = ref({
	name: "", logo: "", address: "", phone: "", showName: true, showLogo: true, showAddress: true, showPhone: true,
	showTendered: true, showChange: true, showPaymentMethod: true,
});
const currentPage = ref(1);
const pageSize = ref(20);
const { apiFetch } = useApiClient();
const runtimeConfig = useRuntimeConfig();
const receiptLogoUrl = computed(() => {
	const value = receiptStore.value.logo;
	if (!value) return "";
	if (/^(https?:\/\/|data:|blob:)/i.test(value)) return value;
	return `${String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "")}/${value.replace(/^\//, "")}`;
});
const { t, locale, loadLocaleMessages } = useI18n();
// The printed bill follows the shop's receipt language, not the cashier's
// interface language. Empty means follow the interface, as before.
const receiptLanguage = ref("");
const receiptShowPoweredBy = ref(true);
const receiptLocale = computed(() => receiptLanguage.value || locale.value);
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
const { locale: appLocale, intlLocale } = useAppLocale();
const { currentStoreId, currentAccess } = useAuthSession();
const effectiveStoreId = computed(() => currentStoreId.value?.trim() || currentAccess.value?.store_id?.trim() || "");
let ordersRequestSequence = 0;
const ordersInitialLoading = computed(() => ordersPending.value && !ordersLoadedOnce.value);
const ordersRefreshing = computed(() => ordersPending.value && ordersLoadedOnce.value);


const orders = ref<OrderRecord[]>([]);

type ApiOrder = Record<string, unknown> & { lines?: Array<Record<string, unknown>> };

function localDateBoundary(value: string, endExclusive = false) {
	const [ year, month, day ] = value.split("-").map(Number);
	return new Date(year, month - 1, day + (endExclusive ? 1 : 0), 0, businessDayStartMinutes.value, 0, endExclusive ? -1 : 0).toISOString();
}

function businessDate(value: string) {
	const date = new Date(value);
	date.setMinutes(date.getMinutes() - businessDayStartMinutes.value);
	return toLocalDateInput(date);
}

const orderBusinessPeriodText = computed(() => {
	if (!dateFrom.value || !dateTo.value) return "";
	return t("businessPeriod.range", { from: formatAppDateTime(localDateBoundary(dateFrom.value), appLocale.value), to: formatAppDateTime(localDateBoundary(dateTo.value, true), appLocale.value) });
});

function formatQueueNumber(value: string) {
	return value.replace(/^Q/i, "").padStart(3, "0");
}

function mapApiOrder(order: ApiOrder): OrderRecord {
	const serviceMode = String(order.service_mode || "walk-in");
	const orderType: OrderType = serviceMode === "dine-in" ? "dine-in" : "quick-sale";
	const queueNumber = order.queue_no ? String(order.queue_no) : "";
	const customerName = String(order.customer_name || "").trim();
	const tableLabel = order.restaurant_table_name
			? [ order.restaurant_zone_name, order.restaurant_table_name ].filter(Boolean).join(" · ")
			: undefined;
	return {
		id: String(order.id), orderNumber: queueNumber ? formatQueueNumber(queueNumber) : String(order.order_no), orderNo: String(order.order_no), queueNo: queueNumber || undefined,
		customerName: customerName || t("orders.generalCustomer"), hasCustomer: Boolean(customerName), orderType,
		status: String(order.status || "completed") as OrderStatus, paymentStatus: String(order.payment_status || "paid") as PaymentStatus,
		paymentMethod: String(order.payment_method || "cash"), total: Number(order.total || 0), subtotal: Number(order.subtotal || 0),
		discount: Number(order.discount || 0), vatAmount: Number(order.vat_amount || 0),
		amountTendered: Number(order.amount_tendered || 0), changeAmount: Number(order.change_amount || 0), itemCount: Number(order.item_count || 0),
		createdAt: String(order.created_at), updatedAt: String(order.updated_at || order.closed_at || order.paid_at || order.created_at), cashier: String(order.cashier_name || t("orders.user")),
		phone: order.customer_phone ? String(order.customer_phone) : undefined, note: order.note ? String(order.note) : undefined, tableLabel,
		fulfillmentStatus: order.fulfillment_status ? String(order.fulfillment_status) : undefined,
		collectedAt: order.collected_at ? String(order.collected_at) : undefined,
		collectedBy: order.collected_by_name ? String(order.collected_by_name) : undefined,
		lines: (order.lines || []).map((line) => ({
			id: String(line.id), name: String(line.name), sku: String(line.sku), qty: Number(line.qty), price: Number(line.price_base_at_sale),
			note: line.note ? String(line.note) : undefined, lineStatus: line.line_status ? String(line.line_status) : undefined,
			isGift: Boolean(Number(line.is_gift)), roundNo: line.round_no ? Number(line.round_no) : undefined,
			dispatchMode: line.dispatch_mode === "direct" ? "direct" : line.dispatch_mode === "kitchen" ? "kitchen" : undefined,
			cancelReason: line.cancel_reason ? String(line.cancel_reason) : undefined,
		})),
	};
}

async function loadOrders() {
	if (!effectiveStoreId.value) return;
	const requestSequence = ++ordersRequestSequence;
	ordersPending.value = true; ordersError.value = null;
	try {
		const storeResponse = await apiFetch<{ data: Record<string, unknown> }>(`/stores/${encodeURIComponent(effectiveStoreId.value)}`);
		businessDayStartMinutes.value = Math.min(1439, Math.max(0, Number(storeResponse.data.business_day_start_minutes || 0)));
		if (!["all", "custom"].includes(activeDatePreset.value)) applyDatePreset(activeDatePreset.value);
		const params = new URLSearchParams({ store_id: effectiveStoreId.value });
		if (dateFrom.value) params.set("from", localDateBoundary(dateFrom.value));
		if (dateTo.value) params.set("to", localDateBoundary(dateTo.value, true));
		const response = await apiFetch<{ data: ApiOrder[] }>(`/pos/orders?${params.toString()}`);
		if (requestSequence !== ordersRequestSequence) return;
		orders.value = response.data.map(mapApiOrder);
		queueEnabled.value = Number(storeResponse.data.pickup_queue_enabled || 0) !== 0;
		const store = storeResponse.data;
		receiptStore.value = {
			name: String(store.name || "O KhaiDee+"),
			logo: String(store.logo_url || ""),
			address: String(store.address || ""),
			phone: String(store.phone_number || ""),
			showName: Number(store.receipt_show_store_name ?? 1) !== 0,
			showLogo: Number(store.pdf_show_logo ?? 1) !== 0,
			showAddress: Number(store.receipt_show_store_address ?? 1) !== 0,
			showPhone: Number(store.receipt_show_store_phone ?? 1) !== 0,
			showTendered: Number(store.receipt_show_tendered ?? 1) !== 0,
			showChange: Number(store.receipt_show_change ?? 1) !== 0,
			showPaymentMethod: Number(store.receipt_show_payment_method ?? 1) !== 0,
	};
		receiptLanguage.value = String(store.receipt_language || "");
		receiptShowPoweredBy.value = Number(store.receipt_show_powered_by ?? 1) !== 0;
		const currency = response.data[0]?.payment_currency;
		if (currency) storeCurrency.value = String(currency);
	} catch (error) {
		if (requestSequence === ordersRequestSequence) {
			if (!ordersLoadedOnce.value) orders.value = [];
			ordersError.value = resolveApiErrorMessage(error, t("orders.loadError"));
		}
	}
	finally { if (requestSequence === ordersRequestSequence) { ordersLoadedOnce.value = true; ordersPending.value = false; } }
}

watch(effectiveStoreId, () => { void loadOrders(); }, { immediate: true });
watch([ dateFrom, dateTo ], () => { void loadOrders(); }, { flush: "post" });

const filteredOrders = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return orders.value.filter((order) => {
		const matchesQuery = !query || [
			order.orderNumber,
			order.orderNo,
			order.customerName,
			order.cashier,
			order.phone || "",
			order.tableLabel || "",
		].some((value) => value.toLowerCase().includes(query));

		const matchesStatus = activeStatus.value === "all" || order.status === activeStatus.value;
		const matchesOrderType = activeOrderType.value === "all" || order.orderType === activeOrderType.value;
		const matchesPayment = activePaymentStatus.value === "all" || order.paymentStatus === activePaymentStatus.value;
		const matchesPaymentMethod = activePaymentMethod.value === "all" || order.paymentMethod === activePaymentMethod.value;
		const createdDay = businessDate(order.createdAt);
		const matchesDate = (!dateFrom.value || createdDay >= dateFrom.value) && (!dateTo.value || createdDay <= dateTo.value);

		const isOpenTable = order.orderType === "dine-in" && ["open", "ready_to_pay"].includes(order.status);
		const isWaitingQueue = order.orderType === "quick-sale" && Boolean(order.queueNo) && order.fulfillmentStatus === "waiting_pickup";
		const matchesView =
			activeView.value === "all"
			|| (activeView.value === "attention" && (["pending", "confirmed", "preparing", "ready"].includes(order.status) || ["partial", "refunded"].includes(order.paymentStatus)))
			|| (activeView.value === "open-tables" && isOpenTable)
			|| (activeView.value === "open-queue" && isWaitingQueue)
			|| (activeView.value === "completed" && ["completed", "cancelled"].includes(order.status));

		return matchesQuery && matchesStatus && matchesOrderType && matchesPayment && matchesPaymentMethod && matchesDate && matchesView;
	});
});

const totalPages = computed(() => Math.max(1, Math.ceil(filteredOrders.value.length / pageSize.value)));
const paginatedOrders = computed(() => filteredOrders.value.slice((currentPage.value - 1) * pageSize.value, currentPage.value * pageSize.value));
const pageStart = computed(() => filteredOrders.value.length ? (currentPage.value - 1) * pageSize.value + 1 : 0);
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, filteredOrders.value.length));

const selectedOrder = computed(() =>
	filteredOrders.value.find((order) => order.id === selectedOrderId.value)
	?? filteredOrders.value[0]
	?? null,
);

const dateScopedOrders = computed(() => orders.value.filter((order) => {
	const createdDay = businessDate(order.createdAt);
	return (!dateFrom.value || createdDay >= dateFrom.value) && (!dateTo.value || createdDay <= dateTo.value);
}));
const totalOrders = computed(() => dateScopedOrders.value.length);
const openTables = computed(() => dateScopedOrders.value.filter((order) => order.orderType === "dine-in" && ["open", "ready_to_pay"].includes(order.status)).length);
const openQueue = computed(() => dateScopedOrders.value.filter((order) => order.orderType === "quick-sale" && order.queueNo && order.fulfillmentStatus === "waiting_pickup").length);
const attentionCount = computed(() => dateScopedOrders.value.filter((order) => ["pending", "confirmed", "preparing", "ready"].includes(order.status) || ["partial", "refunded"].includes(order.paymentStatus)).length);
const completedPaidOrders = computed(() => dateScopedOrders.value.filter((order) => order.status === "completed" && order.paymentStatus === "paid"));
const netSales = computed(() => completedPaidOrders.value.reduce((sum, order) => sum + order.total, 0));
const avgTicket = computed(() => completedPaidOrders.value.length ? Math.round(netSales.value / completedPaidOrders.value.length) : 0);
const activeFilterCount = computed(() => [
	Boolean(searchQuery.value.trim()),
	activeStatus.value !== "all",
	activeOrderType.value !== "all",
	activePaymentStatus.value !== "all",
	activePaymentMethod.value !== "all",
	activeDatePreset.value !== "all",
	activeView.value !== "all",
].filter(Boolean).length);

function clearFilters() {
	searchQuery.value = "";
	activeStatus.value = "all";
	activeOrderType.value = "all";
	activePaymentStatus.value = "all";
	activePaymentMethod.value = "all";
	activeView.value = "all";
	applyDatePreset("all");
}

watch(filteredOrders, (value) => {
	currentPage.value = Math.min(currentPage.value, Math.max(1, Math.ceil(value.length / pageSize.value)));
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = value[0].id;
	}
}, { immediate: true });

watch([ searchQuery, activeStatus, activeOrderType, activePaymentStatus, activePaymentMethod, dateFrom, dateTo, activeView, pageSize ], () => { currentPage.value = 1; });

function formatDate(value: string) {
	try {
		return formatAppDateTime(value, appLocale.value);
	} catch {
		return value;
	}
}

function toLocalDateInput(date: Date) {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function startOfLocalWeek(value: Date) {
	const date = new Date(value.getFullYear(), value.getMonth(), value.getDate());
	const mondayOffset = (date.getDay() + 6) % 7;
	date.setDate(date.getDate() - mondayOffset);
	return date;
}

function applyDatePreset(preset: DatePreset) {
	activeDatePreset.value = preset;
	if (preset === "custom") return;
	if (preset === "all") { dateFrom.value = ""; dateTo.value = ""; return; }
	const today = new Date(Date.now() - businessDayStartMinutes.value * 60_000);
	if (preset === "today") { dateFrom.value = toLocalDateInput(today); dateTo.value = dateFrom.value; return; }
	if (preset === "yesterday") {
		const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
		dateFrom.value = toLocalDateInput(yesterday); dateTo.value = dateFrom.value; return;
	}
	const thisMonday = startOfLocalWeek(today);
	if (preset === "this-week") { dateFrom.value = toLocalDateInput(thisMonday); dateTo.value = toLocalDateInput(today); return; }
	const lastMonday = new Date(thisMonday); lastMonday.setDate(lastMonday.getDate() - 7);
	const lastSunday = new Date(thisMonday); lastSunday.setDate(lastSunday.getDate() - 1);
	dateFrom.value = toLocalDateInput(lastMonday); dateTo.value = toLocalDateInput(lastSunday);
}

function formatMoney(value: number) {
	return formatMoneyWithSymbol(value || 0, storeCurrency.value, { locale: intlLocale.value, maximumFractionDigits: 0 });
}

function paymentMethodLabel(method: string) {
	if (method === "cash") return t("pos.cash");
	if (method === "qr_transfer") return t("pos.qr");
	if (method === "credit_card") return t("pos.card");
	return method || "-";
}

// On the bill itself the method follows the receipt language, not the language
// the staff happen to be browsing in.
function receiptPaymentMethodLabel(method: string) {
	if (method === "cash") return pt("pos.cash");
	if (method === "qr_transfer") return pt("pos.qr");
	if (method === "credit_card") return pt("pos.card");
	return method || "-";
}

function statusColor(status: OrderStatus) {
	if (status === "completed") return "success";
	if (status === "open") return "info";
	if (status === "ready_to_pay") return "warning";
	if (status === "ready") return "info";
	if (status === "cancelled") return "error";
	if (status === "preparing") return "warning";
	return "neutral";
}

function paymentColor(status: PaymentStatus) {
	if (status === "paid") return "success";
	if (status === "partial") return "warning";
	if (status === "refunded") return "error";
	return "neutral";
}

function orderTypeLabel(orderType: OrderType) {
	return orderType === "dine-in" ? t("orders.dineIn") : t("orders.quickSale");
}

function statusLabel(status: OrderStatus) {
	if (status === "open") return t("orders.open");
	if (status === "ready_to_pay") return t("orders.readyToPay");
	if (status === "pending") return t("orders.pending");
	if (status === "confirmed") return t("orders.confirmed");
	if (status === "preparing") return t("orders.preparing");
	if (status === "ready") return t("orders.ready");
	if (status === "completed") return t("orders.completed");
	if (status === "cancelled") return t("orders.cancelled");
	return status;
}

function paymentLabel(status: PaymentStatus) {
	if (status === "unpaid") return t("orders.unpaid");
	if (status === "partial") return t("orders.partial");
	if (status === "paid") return t("orders.paid");
	return t("orders.refunded");
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	detailOpen.value = true;
}

function closeDetail() {
	detailOpen.value = false;
}

function openPrintPreview() {
	if (!selectedOrder.value || (selectedOrder.value.status === "cancelled" && selectedOrder.value.paymentStatus !== "paid" && selectedOrder.value.itemCount === 0)) return;
	printPreviewOpen.value = true;
}

function canPrintOrder(order: OrderRecord) {
	return !(order.status === "cancelled" && order.paymentStatus !== "paid" && order.itemCount === 0);
}

function confirmPrintReceipt() {
	printPreviewOpen.value = false;
	nextTick(() => window.print());
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['orders']"
		sidebar-eyebrow="Orders"
		:sidebar-title="$t('orders.title')"
		sidebar-compact-title="ORD"
		:sidebar-description="$t('orders.description')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<div v-if="ordersError" class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{{ ordersError }}</div>
				<AppPageHeader
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<div class="flex items-center gap-2 pt-0.5 sm:pt-1">
						<div class="relative w-full min-w-0">
							<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
							<input
								v-model="searchQuery"
								type="text"
								:placeholder="$t('orders.search')"
								class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-11 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
							>
							<button
								v-if="searchQuery"
								type="button"
								class="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
								@click="searchQuery = ''"
							>
								<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
							</button>
						</div>
						<!-- Bills print a CODE128 of the order number, so scanning one is the
						     quickest way back to it instead of typing the reference. -->
						<AppButton
							color="primary"
							variant="soft"
							size="md"
							class="shrink-0 justify-center rounded-md"
							icon="i-heroicons-qr-code-20-solid"
							:aria-label="$t('barcodeScanner.scanBill')"
							:title="$t('barcodeScanner.scanBill')"
							@click="scannerOpen = true"
						>
							<span class="hidden sm:inline">{{ $t('barcodeScanner.scanBill') }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="grid grid-cols-3 gap-2 px-3 sm:gap-3 sm:px-0 lg:grid-cols-4 lg:pr-1">
					<div class="min-w-0 rounded-md border border-neutral-200 bg-white p-2.5 sm:p-3">
						<p class="text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-stone-400 sm:text-[11px] sm:tracking-[0.18em]">{{ $t('orders.totalOrders') }}</p>
						<p class="mt-1 text-lg font-semibold text-stone-950 sm:text-xl">{{ totalOrders }}</p>
					</div>
					<div class="min-w-0 rounded-md border border-neutral-200 bg-white p-2.5 sm:p-3">
						<p class="text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-stone-400 sm:text-[11px] sm:tracking-[0.18em]">{{ $t('orders.openTables') }}</p>
						<p class="mt-1 text-lg font-semibold text-stone-950 sm:text-xl">{{ openTables }}</p>
					</div>
					<div class="min-w-0 rounded-md border border-neutral-200 bg-white p-2.5 sm:p-3">
						<p class="text-[9px] font-semibold uppercase leading-tight tracking-[0.06em] text-stone-400 sm:text-[11px] sm:tracking-[0.18em]">{{ queueEnabled ? $t('orders.openQueue') : $t('orders.averageBill') }}</p>
						<p class="mt-1 truncate text-lg font-semibold text-stone-950 sm:text-xl">{{ queueEnabled ? openQueue : formatMoney(avgTicket) }}</p>
					</div>
					<div class="col-span-3 min-w-0 rounded-md border border-neutral-200 bg-white p-3 lg:col-span-1">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ $t('orders.netSales') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ formatMoney(netSales) }}</p>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
						<div>
							<p class="text-sm font-semibold text-stone-950">{{ $t('orders.filters') }}</p>
						</div>
						<div class="flex items-center gap-2">
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">{{ filteredOrders.length }} {{ $t('common.items') }}</div>
							<AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="ordersPending" :label="$t('orders.refresh')" @click="loadOrders" />
						</div>
					</div>

					<div class="grid gap-2 px-4 py-3">
						<div class="grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-6 md:items-end">
							<select v-model="activeStatus" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allStatuses') }}</option>
								<option value="open">{{ $t('orders.open') }}</option>
								<option value="ready_to_pay">{{ $t('orders.readyToPay') }}</option>
								<option value="pending">{{ $t('orders.pending') }}</option>
								<option value="confirmed">{{ $t('orders.confirmed') }}</option>
								<option value="preparing">{{ $t('orders.preparing') }}</option>
								<option value="ready">{{ $t('orders.ready') }}</option>
								<option value="completed">{{ $t('orders.completed') }}</option>
								<option value="cancelled">{{ $t('orders.cancelled') }}</option>
							</select>

							<select v-model="activeOrderType" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allOrderTypes') }}</option>
								<option value="quick-sale">{{ $t('orders.quickSale') }}</option>
								<option value="dine-in">{{ $t('orders.dineIn') }}</option>
							</select>

							<select v-model="activePaymentStatus" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allPayments') }}</option>
								<option value="unpaid">{{ $t('orders.unpaid') }}</option>
								<option value="partial">{{ $t('orders.partial') }}</option>
								<option value="paid">{{ $t('orders.paid') }}</option>
								<option value="refunded">{{ $t('orders.refunded') }}</option>
								</select>
							<select v-model="activePaymentMethod" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allMethods') }}</option><option value="cash">{{ $t('pos.cash') }}</option><option value="qr_transfer">{{ $t('pos.qr') }}</option><option value="credit_card">{{ $t('pos.card') }}</option>
							</select>
							<AppDateRangePicker
								v-model:from="dateFrom"
								v-model:to="dateTo"
								class="col-span-2"
								:from-label="$t('orders.fromDate')"
								:to-label="$t('orders.toDate')"
								@update:from="activeDatePreset = 'custom'"
								@update:to="activeDatePreset = 'custom'"
							/>
						</div>

						<div class="flex items-center justify-between gap-3">
							<p class="shrink-0 text-xs font-semibold text-stone-500">{{ $t('orders.dateRange') }}</p>
							<span v-if="activeDatePreset === 'custom'" class="rounded-md bg-primary-50 px-2 py-1 text-[11px] font-semibold text-primary-700">{{ $t('orders.customDate') }}</span>
						</div>
						<div class="flex gap-2 overflow-x-auto pb-1">
							<AppButton v-for="preset in ([
								{ value: 'all', label: $t('orders.allDates') },
								{ value: 'today', label: $t('orders.today') },
								{ value: 'yesterday', label: $t('orders.yesterday') },
								{ value: 'this-week', label: $t('orders.thisWeek') },
								{ value: 'last-week', label: $t('orders.lastWeek') },
							] as const)" :key="preset.value" size="sm" class="shrink-0 whitespace-nowrap rounded-md" :color="activeDatePreset === preset.value ? 'primary' : 'neutral'" :variant="activeDatePreset === preset.value ? 'solid' : 'soft'" :label="preset.label" @click="applyDatePreset(preset.value)" />
						</div>
						<div v-if="orderBusinessPeriodText" class="flex items-start gap-2 rounded-md bg-sky-50 px-3 py-2 text-xs text-sky-800">
							<UIcon name="i-lucide-clock-3" class="mt-0.5 size-4 shrink-0" />
							<span class="leading-5">{{ orderBusinessPeriodText }}</span>
						</div>

						<div class="flex items-center justify-between gap-3">
							<p class="text-xs font-semibold text-stone-500">{{ $t('orders.quickViews') }}</p>
							<AppButton v-if="activeFilterCount" size="xs" color="neutral" variant="ghost" icon="i-heroicons-x-mark-20-solid" :label="`${$t('orders.clearFilters')} (${activeFilterCount})`" @click="clearFilters" />
						</div>
						<div class="flex flex-nowrap justify-start gap-2 overflow-x-auto pb-1">
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'all' ? 'primary' : 'neutral'" :variant="activeView === 'all' ? 'solid' : 'soft'" :label="`${$t('orders.totalOrders')} ${totalOrders}`" @click="activeView = 'all'" />
							<AppButton v-if="attentionCount" size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'attention' ? 'primary' : 'neutral'" :variant="activeView === 'attention' ? 'solid' : 'soft'" :label="`${$t('orders.attention')} ${attentionCount}`" @click="activeView = 'attention'" />
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'open-tables' ? 'primary' : 'neutral'" :variant="activeView === 'open-tables' ? 'solid' : 'soft'" :label="`${$t('orders.openTables')} ${openTables}`" @click="activeView = 'open-tables'" />
							<AppButton v-if="queueEnabled" size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'open-queue' ? 'primary' : 'neutral'" :variant="activeView === 'open-queue' ? 'solid' : 'soft'" :label="`${$t('orders.waitingPickupQueue')} ${openQueue}`" @click="activeView = 'open-queue'" />
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'completed' ? 'primary' : 'neutral'" :variant="activeView === 'completed' ? 'solid' : 'soft'" :label="$t('orders.completedCancelled')" @click="activeView = 'completed'" />
						</div>
					</div>
				</div>

				<div class="relative overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<AppInlineLoadingBar v-if="ordersRefreshing" class="pointer-events-none absolute inset-x-0 top-0 z-20" minimal container-class="bg-transparent" />
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ $t('orders.list') }}</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ $t('orders.listHint') }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ filteredOrders.length }} {{ $t('common.items') }}
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-x-auto">
								<div class="overflow-x-auto">
									<table class="min-w-[1080px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.time') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.title') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('common.status') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.orderType') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.cashier') }}</th>
									<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.payment') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.quantityTotal') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.actions') }}</th>
											</tr>
										</thead>
										<tbody>
											<!-- Shaped per column and rendered inside the real table, so the
											     skeleton can never drift out of step with the header again. -->
											<template v-if="ordersInitialLoading">
												<tr v-for="index in 7" :key="`skeleton-${index}`" class="animate-pulse bg-white dark:bg-transparent" aria-hidden="true">
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-4 w-24 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-4 w-28 rounded bg-neutral-100 dark:bg-white/10" /><div class="mt-2 h-3 w-20 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-5 w-16 rounded-full bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-4 w-20 rounded bg-neutral-100 dark:bg-white/10" /><div class="mt-2 h-3 w-24 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-4 w-24 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-5 w-16 rounded-full bg-neutral-100 dark:bg-white/10" /><div class="mt-2 h-3 w-20 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="h-4 w-16 rounded bg-neutral-100 dark:bg-white/10" /><div class="mt-2 h-4 w-24 rounded bg-neutral-100 dark:bg-white/10" /></td>
													<td class="border-b border-[#f1ede6] px-4 py-3 align-top dark:border-[#342d26]"><div class="ms-auto h-8 w-24 rounded-md bg-neutral-100 dark:bg-white/10" /></td>
												</tr>
											</template>
											<tr v-else-if="!filteredOrders.length">
												<td colspan="8" class="border-b border-[#f1ede6] px-4 dark:border-[#342d26]">
													<div class="flex min-h-[280px] items-center justify-center text-center">
								<div class="space-y-3">
												<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white text-stone-400 ring-1 ring-neutral-200">
													<UIcon name="i-heroicons-receipt-percent" class="h-6 w-6" />
												</div>
												<div>
													<p class="text-sm font-medium text-stone-900">{{ $t('orders.empty') }}</p>
													<p class="mt-1 text-sm text-stone-500">{{ $t('orders.emptyHint') }}</p>
												</div>
												<AppButton
													v-if="activeFilterCount > 0"
													class="rounded-md"
													color="neutral"
													variant="soft"
													size="md"
													icon="i-heroicons-x-mark-20-solid"
													@click="clearFilters"
												>
													{{ $t('orders.clearFilters') }}
												</AppButton>
								</div>
													</div>
												</td>
											</tr>
											<template v-else>
											<tr
											v-for="order in paginatedOrders"
												:key="order.id"
								class="cursor-pointer bg-white transition hover:bg-primary-50"
								:class="[selectedOrderId === order.id ? 'bg-primary-50' : '', order.status === 'cancelled' ? 'bg-red-50/35 text-stone-500' : '']"
												@click="openDetail(order.id)"
											>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
													{{ formatDate(order.createdAt) }}
												</td>
											<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
												<p class="text-sm font-semibold text-stone-950">{{ order.orderNumber }}</p>
												<p v-if="order.queueNo" class="mt-1 font-mono text-xs text-stone-400">{{ order.orderNo }}</p>
											<p v-if="order.hasCustomer" class="mt-1 text-sm text-stone-500">{{ order.customerName }}</p>
													<p v-if="order.note" class="mt-1 text-xs text-stone-400">{{ order.note }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
													<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
												<p class="font-medium text-stone-800">{{ orderTypeLabel(order.orderType) }}</p>
										<p v-if="order.phone || order.tableLabel" class="mt-1 text-xs text-stone-400">
											<span v-if="order.phone">{{ order.phone }}</span>
											<span v-if="order.tableLabel">{{ order.phone ? ' · ' : '' }}{{ order.tableLabel }}</span>

													</p>
												</td>
										<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm">
											<p class="font-medium text-stone-800">{{ order.cashier }}</p>
										</td>
											<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
												<UBadge :color="paymentColor(order.paymentStatus)" variant="soft" :label="paymentLabel(order.paymentStatus)" />
												<p class="mt-1 text-xs text-stone-400">{{ paymentMethodLabel(order.paymentMethod || '') }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
													<p class="text-sm font-semibold text-stone-900">{{ order.itemCount }} {{ $t('common.items') }}</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatMoney(order.total) }}</p>
												</td>
											<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-right">
												<AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-eye-20-solid" :label="$t('orders.viewDetails')" @click.stop="openDetail(order.id)" />
												</td>
											</tr>
											</template>
										</tbody>
									</table>
								</div>
						</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 py-3 backdrop-blur-sm">
							<div class="flex flex-wrap items-center justify-between gap-3 text-xs text-stone-500 sm:text-sm">
								<div>{{ $t('orders.pageSummary', { start: pageStart, end: pageEnd, total: filteredOrders.length }) }}</div>
								<div class="flex items-center gap-2">
									<select v-model.number="pageSize" :aria-label="$t('orders.pageSize')" class="rounded-md border border-neutral-200 bg-white px-2 py-1.5 text-sm">
										<option :value="20">20</option><option :value="50">50</option><option :value="100">100</option>
									</select>
									<AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-chevron-left-20-solid" :disabled="currentPage <= 1" @click="currentPage--" />
									<span class="min-w-16 text-center">{{ currentPage }} / {{ totalPages }}</span>
									<AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-chevron-right-20-solid" :disabled="currentPage >= totalPages" @click="currentPage++" />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<AppResponsivePanel
				v-if="selectedOrder"
				v-model="detailOpen"
				:title="$t('orders.details')"
				:description="$t('orders.description')"
				desktop-width="680px"
				:show-handle="false"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				@close="closeDetail"
			>
				<template #default>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-5 py-5">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-3">
								<div class="flex items-start gap-3">
									<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
										<UIcon name="i-heroicons-receipt-percent" class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedOrder.orderNumber }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrder.customerName }}</p>
											</div>
											<UBadge :color="statusColor(selectedOrder.status)" variant="soft" :label="statusLabel(selectedOrder.status)" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="paymentColor(selectedOrder.paymentStatus)" variant="soft" :label="paymentLabel(selectedOrder.paymentStatus)" />
											<UBadge color="neutral" variant="soft" :label="paymentMethodLabel(selectedOrder.paymentMethod || '')" />
											<UBadge color="neutral" variant="soft" :label="orderTypeLabel(selectedOrder.orderType)" />
											<UBadge color="neutral" variant="soft" :label="selectedOrder.cashier" />
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">{{ $t('orders.summary') }}</h3>
								<div v-if="selectedOrder.status === 'cancelled' && selectedOrder.orderType === 'dine-in'" class="mt-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{{ $t('orders.cancelledTableHint') }}</div>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.orderType') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ orderTypeLabel(selectedOrder.orderType) }}</dd>
									</div>
									<div v-if="selectedOrder.queueNo" class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.queueNumber') }}</dt><dd class="text-right font-semibold text-stone-900">{{ formatQueueNumber(selectedOrder.queueNo) }}</dd>
									</div>
									<div v-if="selectedOrder.tableLabel" class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.table') }}</dt><dd class="text-right font-medium text-stone-900">{{ selectedOrder.tableLabel }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.createdAt') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrder.createdAt) }}</dd>
									</div>
									<!-- Only orders that went through the queue have a collection step;
									     a dine-in or counter sale would just show an empty row. Shown
									     even when nothing has been collected, because "still waiting"
									     is the answer staff are looking for. -->
									<div v-if="queueEnabled && selectedOrder.queueNo" class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.collectedAt') }}</dt>
										<dd v-if="selectedOrder.collectedAt" class="text-right">
											<span class="block font-medium text-stone-900">{{ formatDate(selectedOrder.collectedAt) }}</span>
											<span v-if="selectedOrder.collectedBy" class="block text-xs text-stone-500">{{ $t('orders.collectedBy', { name: selectedOrder.collectedBy }) }}</span>
										</dd>
										<dd v-else class="text-right font-medium text-amber-700">{{ $t('orders.notCollected') }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.quantity') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedOrder.itemCount }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4">
										<dt class="text-stone-500">{{ $t('common.total') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrder.total) }}</dd>
									</div>
								</dl>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-center justify-between gap-2">
									<h3 class="text-sm font-semibold text-stone-950">{{ $t('orders.orderItems') }}</h3>
									<UBadge color="neutral" variant="soft" :label="`${selectedOrder.lines.length} ${$t('common.items')}`" />
								</div>

								<div class="mt-4 overflow-hidden rounded-md border border-neutral-200 bg-white">
									<div
										v-for="line in selectedOrder.lines"
										:key="line.id"
										class="border-b border-neutral-100 px-4 py-3 last:border-b-0"
										:class="line.lineStatus === 'cancelled' ? 'bg-red-50/60 opacity-75' : ''"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900" :class="line.lineStatus === 'cancelled' ? 'line-through text-stone-500' : ''">{{ line.name }}</p>
												<p class="mt-1 font-mono text-[11px] text-stone-400">{{ line.sku }}</p>
												<p class="mt-1 text-xs text-stone-500">{{ formatMoney(line.price) }} × {{ line.qty }}</p>
												<div v-if="line.isGift || line.roundNo || line.lineStatus === 'cancelled'" class="mt-2 flex flex-wrap gap-1"><UBadge v-if="line.isGift" color="success" variant="soft" :label="t('orders.giftItem')" /><UBadge v-if="line.roundNo" color="neutral" variant="soft" :label="line.dispatchMode === 'direct' ? t('orders.directRound', { round: line.roundNo }) : t('orders.kitchenRound', { round: line.roundNo })" /><UBadge v-if="line.lineStatus === 'cancelled'" color="error" variant="soft" :label="t('orders.lineCancelled')" /></div>
												<p v-if="line.note" class="mt-2 text-xs text-stone-400">{{ line.note }}</p>
												<p v-if="line.cancelReason" class="mt-1 text-xs text-red-500">{{ t('posPanels.reason') }}: {{ line.cancelReason }}</p>
											</div>
											<p class="shrink-0 font-mono text-sm font-semibold tabular-nums text-stone-900" :class="line.lineStatus === 'cancelled' ? 'line-through text-stone-400' : ''">{{ formatMoney(line.qty * line.price) }}</p>
										</div>
									</div>
								</div>

								<dl class="mt-4 space-y-2 border-t border-dashed border-neutral-300 pt-4 text-sm">
									<div class="flex justify-between gap-4 text-stone-600"><dt>{{ $t('orders.subtotal') }}</dt><dd class="font-mono tabular-nums">{{ formatMoney(selectedOrder.subtotal) }}</dd></div>
									<div v-if="selectedOrder.discount" class="flex justify-between gap-4 text-stone-600"><dt>{{ $t('orders.discount') }}</dt><dd class="font-mono tabular-nums text-emerald-700">−{{ formatMoney(selectedOrder.discount) }}</dd></div>
									<div v-if="selectedOrder.vatAmount" class="flex justify-between gap-4 text-stone-600"><dt>{{ $t('orders.vat') }}</dt><dd class="font-mono tabular-nums">{{ formatMoney(selectedOrder.vatAmount) }}</dd></div>
									<div class="flex justify-between gap-4 border-t border-neutral-200 pt-3 text-base font-bold text-stone-950"><dt>{{ $t('orders.netTotal') }}</dt><dd class="font-mono tabular-nums">{{ formatMoney(selectedOrder.total) }}</dd></div>
								</dl>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">{{ $t('orders.notesContact') }}</h3>
								<div class="mt-4 space-y-3 text-sm text-stone-600">
									<div class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
										<p class="text-xs text-stone-400">{{ $t('orders.customer') }}</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.customerName }}</p>
									</div>
									<div class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
										<p class="text-xs text-stone-400">{{ $t('orders.phone') }}</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.phone || "-" }}</p>
									</div>
									<div class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
										<p class="text-xs text-stone-400">{{ $t('orders.note') }}</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.note || "-" }}</p>
									</div>
								</div>
							</div>
						</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" icon="i-heroicons-printer" :disabled="!canPrintOrder(selectedOrder)" :title="!canPrintOrder(selectedOrder) ? $t('orders.printUnavailable') : undefined" @click="openPrintPreview">{{ $t('orders.print') }}</AppButton>
								<AppButton color="primary" variant="solid" size="md" :block="true">{{ $t('orders.updateStatus') }}</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-if="selectedOrder"
				v-model="printPreviewOpen"
				:title="$t('posPanels.printPreview')"
				:description="$t('posPanels.receipt')"
				desktop-width="520px"
				desktop-placement="center"
				mobile-max-height="92vh"
			>
				<div class="flex min-h-0 flex-col gap-3">
					<div class="scrollbar-soft max-h-[calc(100vh-260px)] overflow-y-auto rounded-md border border-neutral-200 bg-neutral-50 p-4">
						<div class="receipt-preview-sheet mx-auto w-[80mm] max-w-full rounded-sm border border-neutral-200 bg-white px-[5mm] py-[6mm] text-[12px] leading-snug text-stone-900 shadow-sm">
							<div class="text-center">
								<img v-if="receiptStore.showLogo && receiptLogoUrl" :src="receiptLogoUrl" :alt="receiptStore.name" class="mx-auto mb-2 h-12 w-12 object-contain">
								<p v-if="receiptStore.showName" class="text-[13px] font-bold text-stone-950">{{ receiptStore.name }}</p>
								<p v-if="receiptStore.showAddress && receiptStore.address" class="mt-0.5 text-[11px] text-stone-500">{{ receiptStore.address }}</p>
								<p v-if="receiptStore.showPhone && receiptStore.phone" class="mt-0.5 text-[11px] text-stone-500">{{ receiptStore.phone }}</p>
								<p class="mt-1 text-[11px] text-stone-500">{{ selectedOrder.orderNo }}</p>
							</div>
							<div class="my-3 border-t border-dashed border-neutral-300" />
							<div class="space-y-2">
								<div v-for="line in selectedOrder.lines.filter((item) => item.lineStatus !== 'cancelled')" :key="line.id" class="flex justify-between gap-3">
									<div class="min-w-0"><p class="font-medium text-stone-900">{{ line.name }}</p><p class="text-[11px] text-stone-500">× {{ line.qty }}</p></div>
									<span class="shrink-0 font-mono tabular-nums">{{ formatMoney(line.qty * line.price) }}</span>
								</div>
							</div>
							<div class="my-3 border-t border-dashed border-neutral-300" />
							<div class="space-y-2">
								<div class="flex justify-between gap-3"><span>{{ pt('orders.subtotal') }}</span><span class="font-mono tabular-nums">{{ formatMoney(selectedOrder.subtotal) }}</span></div>
								<div v-if="selectedOrder.discount" class="flex justify-between gap-3"><span>{{ pt('orders.discount') }}</span><span class="font-mono tabular-nums">−{{ formatMoney(selectedOrder.discount) }}</span></div>
								<div v-if="selectedOrder.vatAmount" class="flex justify-between gap-3"><span>{{ pt('orders.vat') }}</span><span class="font-mono tabular-nums">{{ formatMoney(selectedOrder.vatAmount) }}</span></div>
								<div class="flex justify-between gap-3 border-t border-neutral-200 pt-2 text-[13px] font-bold"><span>{{ pt('orders.netTotal') }}</span><span class="font-mono tabular-nums">{{ formatMoney(selectedOrder.total) }}</span></div>
								<div v-if="receiptStore.showPaymentMethod" class="flex justify-between gap-3 text-stone-600"><span>{{ pt('posPanels.paymentMethod') }}</span><span>{{ receiptPaymentMethodLabel(selectedOrder.paymentMethod || '') }}</span></div>
								<div v-if="selectedOrder.paymentMethod === 'cash' && receiptStore.showTendered" class="flex justify-between gap-3 text-stone-600"><span>{{ pt('posPanels.cashReceived') }}</span><span class="font-mono tabular-nums">{{ formatMoney(selectedOrder.amountTendered) }}</span></div>
								<div v-if="selectedOrder.paymentMethod === 'cash' && receiptStore.showChange" class="flex justify-between gap-3 text-stone-600"><span>{{ pt('pos.change') }}</span><span class="font-mono tabular-nums">{{ formatMoney(selectedOrder.changeAmount) }}</span></div>
							</div>
							<div class="mt-4 border-t border-dashed border-neutral-300 pt-3 text-center">
								<div v-if="queueEnabled && selectedOrder.queueNo" class="mb-3"><p class="text-[11px] text-stone-500">{{ pt('posPanels.queue') }}</p><p class="text-lg font-bold text-stone-950">{{ formatQueueNumber(selectedOrder.queueNo) }}</p></div>
								<p class="text-[11px] text-stone-500">{{ pt('posPanels.thankYou') }}</p><p v-if="receiptShowPoweredBy" class="mt-1 text-[10px] text-stone-400">Powered by O KhaiDee+</p>
							</div>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-2"><AppButton color="neutral" variant="soft" block @click="printPreviewOpen = false">{{ $t('common.cancel') }}</AppButton><AppButton color="primary" block icon="i-heroicons-printer" @click="confirmPrintReceipt">{{ $t('orders.print') }}</AppButton></div>
				</div>
			</AppResponsivePanel>

			<div v-if="selectedOrder" class="orders-print-root">
				<div class="orders-print-sheet">
					<img v-if="receiptStore.showLogo && receiptLogoUrl" :src="receiptLogoUrl" :alt="receiptStore.name" class="orders-print-logo"><h1 v-if="receiptStore.showName">{{ receiptStore.name }}</h1><p v-if="receiptStore.showAddress && receiptStore.address">{{ receiptStore.address }}</p><p v-if="receiptStore.showPhone && receiptStore.phone">{{ receiptStore.phone }}</p><p>{{ selectedOrder.orderNo }}</p><hr>
					<div v-for="line in selectedOrder.lines.filter((item) => item.lineStatus !== 'cancelled')" :key="line.id" class="orders-print-line"><span>{{ line.name }} × {{ line.qty }}</span><span>{{ formatMoney(line.qty * line.price) }}</span></div><hr>
					<div class="orders-print-line"><span>{{ pt('orders.subtotal') }}</span><span>{{ formatMoney(selectedOrder.subtotal) }}</span></div><div v-if="selectedOrder.discount" class="orders-print-line"><span>{{ pt('orders.discount') }}</span><span>−{{ formatMoney(selectedOrder.discount) }}</span></div><div v-if="selectedOrder.vatAmount" class="orders-print-line"><span>{{ pt('orders.vat') }}</span><span>{{ formatMoney(selectedOrder.vatAmount) }}</span></div><div class="orders-print-total"><strong>{{ pt('orders.netTotal') }}</strong><strong>{{ formatMoney(selectedOrder.total) }}</strong></div>
					<div v-if="receiptStore.showPaymentMethod" class="orders-print-line"><span>{{ pt('posPanels.paymentMethod') }}</span><span>{{ receiptPaymentMethodLabel(selectedOrder.paymentMethod || '') }}</span></div><div v-if="selectedOrder.paymentMethod === 'cash' && receiptStore.showTendered" class="orders-print-line"><span>{{ pt('posPanels.cashReceived') }}</span><span>{{ formatMoney(selectedOrder.amountTendered) }}</span></div><div v-if="selectedOrder.paymentMethod === 'cash' && receiptStore.showChange" class="orders-print-line"><span>{{ pt('pos.change') }}</span><span>{{ formatMoney(selectedOrder.changeAmount) }}</span></div>
					<div v-if="queueEnabled && selectedOrder.queueNo" class="orders-print-queue"><span>{{ pt('posPanels.queue') }}</span><strong>{{ formatQueueNumber(selectedOrder.queueNo) }}</strong></div><p>{{ pt('posPanels.thankYou') }}</p><p v-if="receiptShowPoweredBy" class="orders-print-powered">Powered by O KhaiDee+</p>
				</div>
			</div>
		</template>
	</AppSidebarShell>

	<AppBarcodeScanner v-model="scannerOpen" :hint="$t('barcodeScanner.billHint')" @detected="applyScannedCode" />
</template>

<style scoped>
.receipt-preview-sheet{font-family:"Google Sans Lao","Avenir Next","Segoe UI",sans-serif}.orders-print-root{display:none}.orders-print-logo{display:block;width:48px;height:48px;object-fit:contain;margin:0 auto 8px}.orders-print-line,.orders-print-total{display:flex;justify-content:space-between;gap:12px;margin:7px 0}.orders-print-sheet h1,.orders-print-sheet>p{text-align:center}.orders-print-queue{border-top:1px dashed #000;margin-top:12px;padding-top:8px;text-align:center}.orders-print-queue span,.orders-print-queue strong{display:block}.orders-print-queue strong{font-size:20px}.orders-print-powered{font-size:10px;color:#555}

</style>

<style>
/* Unscoped on purpose — see the note in RestaurantPos.vue: a scoped "body *"
   rule cannot match, so the whole page printed instead of just the bill. */
@page { size: 80mm auto; margin: 0; }
@media print {
	html, body { width: 80mm; margin: 0; padding: 0; background: #fff; }
	body * { visibility: hidden !important; }
	.orders-print-root, .orders-print-root * { visibility: visible !important; }
	.orders-print-root {
		display: block !important;
		position: absolute;
		left: 0;
		top: 0;
		width: 80mm;
		background: #fff;
		color: #000;
		padding: 4mm;
	}
	.orders-print-sheet { width: 72mm; margin: 0 auto; font-family: "Google Sans Lao", "Avenir Next", "Segoe UI", sans-serif; font-size: 12px; }
	.orders-print-sheet h1 { font-size: 18px; }
	.orders-print-sheet hr { border: 0; border-top: 1px dashed #000; margin: 10px 0; }
}
</style>

