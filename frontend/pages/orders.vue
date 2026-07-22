<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatMoneyWithSymbol } from "~/utils/currency";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
type FulfillmentType = "walk-in" | "pickup" | "delivery";
type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

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
	channel: FulfillmentType;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	paymentMethod?: "cash" | "qr_transfer" | "credit_card" | string;
	total: number;
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
const activeStatus = ref<"all" | OrderStatus>("all");
const activeChannel = ref<"all" | FulfillmentType>("all");
const activePaymentStatus = ref<"all" | PaymentStatus>("all");
const activePaymentMethod = ref<"all" | "cash" | "qr_transfer" | "credit_card">("all");
const dateFrom = ref("");
const dateTo = ref("");
const activeView = ref<"all" | "attention" | "completed">("all");
const detailOpen = ref(false);
const selectedOrderId = ref("");
const ordersPending = ref(false);
const ordersError = ref<string | null>(null);
const storeCurrency = ref("LAK");
const { apiFetch } = useApiClient();
const { t } = useI18n();
const { intlLocale } = useAppLocale();
const { currentStoreId, currentAccess } = useAuthSession();
const effectiveStoreId = computed(() => currentStoreId.value?.trim() || currentAccess.value?.store_id?.trim() || "");


const orders = ref<OrderRecord[]>([
	{
		id: "1",
		orderNumber: "A-102",
		customerName: "ลูกค้าทั่วไป",
		channel: "walk-in",
		status: "preparing",
		paymentStatus: "paid",
		total: 422,
		itemCount: 4,
		createdAt: "2026-05-06T09:20:00.000Z",
		updatedAt: "2026-05-06T09:29:00.000Z",
		cashier: "Lina Punk",
		tableLabel: "โต๊ะ 6",
		note: "ไม่ใส่น้ำตาลในรายการชา",
		lines: [
			{ id: "1", name: "ลาเต้เย็น", sku: "CF-LAT-16", qty: 2, price: 95 },
			{ id: "2", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
			{ id: "3", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 1, price: 105 },
			{ id: "4", name: "Service", sku: "SV-0001", qty: 1, price: 42 },
		],
	},
	{
		id: "2",
		orderNumber: "D-214",
		customerName: "Mina Phone",
		channel: "delivery",
		status: "confirmed",
		paymentStatus: "paid",
		total: 560,
		itemCount: 5,
		createdAt: "2026-05-06T08:54:00.000Z",
		updatedAt: "2026-05-06T09:10:00.000Z",
		cashier: "Noy Chan",
		phone: "020 55 221 889",
		note: "โทรก่อนถึง",
		lines: [
			{ id: "1", name: "ชาไทยนมสด", sku: "TE-THM-16", qty: 2, price: 90 },
			{ id: "2", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 2, price: 105 },
			{ id: "3", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
		],
	},
	{
		id: "3",
		orderNumber: "P-078",
		customerName: "Anya Dee",
		channel: "pickup",
		status: "ready",
		paymentStatus: "partial",
		total: 280,
		itemCount: 3,
		createdAt: "2026-05-06T07:42:00.000Z",
		updatedAt: "2026-05-06T08:01:00.000Z",
		cashier: "Ked Phone",
		phone: "020 77 339 221",
		lines: [
			{ id: "1", name: "อเมริกาโน่", sku: "CF-AMR-16", qty: 2, price: 80 },
			{ id: "2", name: "ชามัทฉะคลาวด์", sku: "TE-MAT-16", qty: 1, price: 120 },
		],
	},
	{
		id: "4",
		orderNumber: "A-101",
		customerName: "ลูกค้าทั่วไป",
		channel: "walk-in",
		status: "completed",
		paymentStatus: "paid",
		total: 180,
		itemCount: 2,
		createdAt: "2026-05-06T06:55:00.000Z",
		updatedAt: "2026-05-06T07:04:00.000Z",
		cashier: "Ann Dee",
		lines: [
			{ id: "1", name: "ลาเต้เย็น", sku: "CF-LAT-16", qty: 1, price: 95 },
			{ id: "2", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
		],
	},
	{
		id: "5",
		orderNumber: "D-213",
		customerName: "Khamla Sip",
		channel: "delivery",
		status: "cancelled",
		paymentStatus: "refunded",
		total: 210,
		itemCount: 2,
		createdAt: "2026-05-06T05:15:00.000Z",
		updatedAt: "2026-05-06T05:26:00.000Z",
		cashier: "Lina Punk",
		note: "ลูกค้ายกเลิกก่อนจัดส่ง",
		lines: [
			{ id: "1", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 2, price: 105 },
		],
	},
]);

type ApiOrder = Record<string, unknown> & { lines?: Array<Record<string, unknown>> };

function mapApiOrder(order: ApiOrder): OrderRecord {
	const serviceMode = String(order.service_mode || "walk-in");
	const channel = serviceMode === "dine-in" ? "walk-in" : serviceMode === "pickup" ? "pickup" : String(order.channel || serviceMode || "walk-in");
	const tableLabel = order.queue_no
		? `คิว ${String(order.queue_no)}`
		: order.restaurant_table_name
			? [ order.restaurant_zone_name, order.restaurant_table_name ].filter(Boolean).join(" · ")
			: undefined;
	return {
		id: String(order.id), orderNumber: String(order.order_no), customerName: String(order.customer_name || t("orders.generalCustomer")),
		channel: channel as FulfillmentType,
		status: String(order.status || "completed") as OrderStatus, paymentStatus: String(order.payment_status || "paid") as PaymentStatus,
		paymentMethod: String(order.payment_method || "cash"), total: Number(order.total || 0), itemCount: Number(order.item_count || 0),
		createdAt: String(order.created_at), updatedAt: String(order.created_at), cashier: String(order.cashier_name || t("orders.user")),
		phone: order.customer_phone ? String(order.customer_phone) : undefined, note: order.note ? String(order.note) : undefined, tableLabel,
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
	ordersPending.value = true; ordersError.value = null;
	try {
		const response = await apiFetch<{ data: ApiOrder[] }>(`/pos/orders?store_id=${encodeURIComponent(effectiveStoreId.value)}`);
		orders.value = response.data.map(mapApiOrder);
		const currency = response.data[0]?.payment_currency;
		if (currency) storeCurrency.value = String(currency);
	} catch (error) { orders.value = []; ordersError.value = resolveApiErrorMessage(error, t("orders.loadError")); }
	finally { ordersPending.value = false; }
}

watch(effectiveStoreId, () => { void loadOrders(); }, { immediate: true });

const filteredOrders = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return orders.value.filter((order) => {
		const matchesQuery = !query || [
			order.orderNumber,
			order.customerName,
			order.cashier,
			order.phone || "",
		].some((value) => value.toLowerCase().includes(query));

		const matchesStatus = activeStatus.value === "all" || order.status === activeStatus.value;
		const matchesChannel = activeChannel.value === "all" || order.channel === activeChannel.value;
		const matchesPayment = activePaymentStatus.value === "all" || order.paymentStatus === activePaymentStatus.value;
		const matchesPaymentMethod = activePaymentMethod.value === "all" || order.paymentMethod === activePaymentMethod.value;
		const createdDay = order.createdAt.slice(0, 10);
		const matchesDate = (!dateFrom.value || createdDay >= dateFrom.value) && (!dateTo.value || createdDay <= dateTo.value);

		const matchesView =
			activeView.value === "all"
			|| (activeView.value === "attention" && ["pending", "confirmed", "preparing", "ready"].includes(order.status))
			|| (activeView.value === "completed" && ["completed", "cancelled"].includes(order.status));

		return matchesQuery && matchesStatus && matchesChannel && matchesPayment && matchesPaymentMethod && matchesDate && matchesView;
	});
});

const selectedOrder = computed(() =>
	filteredOrders.value.find((order) => order.id === selectedOrderId.value)
	?? filteredOrders.value[0]
	?? null,
);

const totalOrders = computed(() => orders.value.length);
const openOrders = computed(() => orders.value.filter((order) => ["pending", "confirmed", "preparing", "ready"].includes(order.status)).length);
const deliveryOrders = computed(() => orders.value.filter((order) => order.channel === "delivery").length);
const avgTicket = computed(() => {
	if (!orders.value.length) return 0;
	return Math.round(orders.value.reduce((sum, order) => sum + order.total, 0) / orders.value.length);
});

watch(filteredOrders, (value) => {
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = value[0].id;
	}
}, { immediate: true });

function formatDate(value: string) {
	try {
		return new Intl.DateTimeFormat(intlLocale.value, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
	} catch {
		return value;
	}
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

function statusColor(status: OrderStatus) {
	if (status === "completed") return "success";
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

function channelLabel(channel: FulfillmentType) {
	if (channel === "walk-in") return t("orders.walkIn");
	if (channel === "pickup") return t("orders.pickup");
	return t("orders.delivery");
}

function statusLabel(status: OrderStatus) {
	if (status === "pending") return t("orders.pending");
	if (status === "confirmed") return t("orders.confirmed");
	if (status === "preparing") return t("orders.preparing");
	if (status === "ready") return t("orders.ready");
	if (status === "completed") return t("orders.completed");
	return t("orders.cancelled");
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
					<div class="pt-0.5 sm:pt-1">
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
					</div>
				</AppPageHeader>

				<div class="grid grid-cols-2 gap-3 lg:grid-cols-4 lg:pr-1">
					<div class="rounded-md border border-neutral-200 bg-white p-3">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ $t('orders.totalOrders') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ totalOrders }}</p>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-3">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ $t('orders.openQueue') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ openOrders }}</p>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-3">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ $t('orders.delivery') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ deliveryOrders }}</p>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-3">
						<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ $t('orders.averageBill') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ formatMoney(avgTicket) }}</p>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
						<div>
							<p class="text-sm font-semibold text-stone-950">{{ $t('orders.filters') }}</p>
						</div>
						<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
							{{ filteredOrders.length }} {{ $t('common.items') }}
						</div>
					</div>

					<div class="grid gap-2 px-4 py-3">
						<div class="grid grid-cols-2 gap-2 md:grid-cols-3 lg:grid-cols-6 md:items-end">
							<select v-model="activeStatus" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allStatuses') }}</option>
								<option value="pending">{{ $t('orders.pending') }}</option>
								<option value="confirmed">{{ $t('orders.confirmed') }}</option>
								<option value="preparing">{{ $t('orders.preparing') }}</option>
								<option value="ready">{{ $t('orders.ready') }}</option>
								<option value="completed">{{ $t('orders.completed') }}</option>
								<option value="cancelled">{{ $t('orders.cancelled') }}</option>
							</select>

							<select v-model="activeChannel" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option value="all">{{ $t('orders.allChannels') }}</option>
								<option value="walk-in">{{ $t('orders.walkIn') }}</option>
								<option value="pickup">{{ $t('orders.pickup') }}</option>
								<option value="delivery">{{ $t('orders.delivery') }}</option>
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
							<input v-model="dateFrom" type="date" :aria-label="$t('orders.fromDate')" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							<input v-model="dateTo" type="date" :aria-label="$t('orders.toDate')" class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
						</div>

						<div class="flex flex-wrap gap-2 overflow-x-auto pb-1 md:justify-end">
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'all' ? 'primary' : 'neutral'" :variant="activeView === 'all' ? 'solid' : 'soft'" :label="$t('common.all')" @click="activeView = 'all'" />
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'attention' ? 'primary' : 'neutral'" :variant="activeView === 'attention' ? 'solid' : 'soft'" :label="$t('orders.attention')" @click="activeView = 'attention'" />
							<AppButton size="md" class="rounded-md whitespace-nowrap" :color="activeView === 'completed' ? 'primary' : 'neutral'" :variant="activeView === 'completed' ? 'solid' : 'soft'" :label="$t('orders.completedCancelled')" @click="activeView = 'completed'" />
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">Orders list</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ $t('orders.listHint') }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ filteredOrders.length }} {{ $t('common.items') }}
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="ordersPending" class="flex min-h-[280px] items-center justify-center text-sm text-stone-500">{{ $t('common.loading') }}</div>
							<div v-else-if="!filteredOrders.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-md bg-white text-stone-400 ring-1 ring-neutral-200">
										<UIcon name="i-heroicons-receipt-percent" class="h-6 w-6" />
									</div>
									<div>
										<p class="text-sm font-medium text-stone-900">{{ $t('orders.empty') }}</p>
										<p class="mt-1 text-sm text-stone-500">{{ $t('orders.emptyHint') }}</p>
									</div>
								</div>
							</div>

							<div v-else>
								<div class="overflow-x-auto">
									<table class="min-w-[1120px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.time') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.title') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('common.status') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.channel') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.payment') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.quantityTotal') }}</th>
												<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ $t('orders.updated') }}</th>
											</tr>
										</thead>
										<tbody>
											<tr
												v-for="order in filteredOrders"
												:key="order.id"
												class="cursor-pointer bg-white transition hover:bg-primary-50"
												:class="selectedOrderId === order.id ? 'bg-primary-50' : ''"
												@click="openDetail(order.id)"
											>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
													{{ formatDate(order.createdAt) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
													<p class="text-sm font-semibold text-stone-950">{{ order.orderNumber }}</p>
													<p class="mt-1 text-sm text-stone-500">{{ order.customerName }}</p>
													<p v-if="order.note" class="mt-1 text-xs text-stone-400">{{ order.note }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
													<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
													<p>{{ channelLabel(order.channel) }}</p>
													<p class="mt-1 text-xs text-stone-400">
														{{ order.cashier }}
														<span v-if="order.phone">· {{ order.phone }}</span>
														<span v-if="order.tableLabel">· {{ order.tableLabel }}</span>
													</p>
												</td>
											<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
												<UBadge :color="paymentColor(order.paymentStatus)" variant="soft" :label="paymentLabel(order.paymentStatus)" />
												<p class="mt-1 text-xs text-stone-400">{{ paymentMethodLabel(order.paymentMethod || '') }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
													<p class="text-sm font-semibold text-stone-900">{{ order.itemCount }} {{ $t('common.items') }}</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatMoney(order.total) }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
													{{ formatDate(order.updatedAt) }}
												</td>
											</tr>
										</tbody>
									</table>
								</div>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="flex items-center justify-between gap-2 text-xs text-stone-500 sm:text-sm">
								<div>{{ openOrders }} {{ $t('orders.openQueue') }}</div>
								<div>{{ deliveryOrders }} {{ $t('orders.delivery') }} • {{ $t('orders.averageBill') }} {{ formatMoney(avgTicket) }}</div>
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
											<UBadge color="neutral" variant="soft" :label="channelLabel(selectedOrder.channel)" />
											<UBadge color="neutral" variant="soft" :label="selectedOrder.cashier" />
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">{{ $t('orders.summary') }}</h3>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.channel') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ channelLabel(selectedOrder.channel) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ $t('orders.createdAt') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrder.createdAt) }}</dd>
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

								<div class="mt-4 space-y-3">
									<div
										v-for="line in selectedOrder.lines"
										:key="line.id"
										class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ line.name }}</p>
												<p class="mt-1 text-xs text-stone-500">{{ line.sku }} · {{ line.qty }} x {{ formatMoney(line.price) }}</p>
												<div v-if="line.isGift || line.roundNo || line.lineStatus === 'cancelled'" class="mt-2 flex flex-wrap gap-1"><UBadge v-if="line.isGift" color="success" variant="soft" label="สินค้าฟรี" /><UBadge v-if="line.roundNo" color="neutral" variant="soft" :label="line.dispatchMode === 'direct' ? `ขายตรงรอบ ${line.roundNo}` : `ครัวรอบ ${line.roundNo}`" /><UBadge v-if="line.lineStatus === 'cancelled'" color="error" variant="soft" label="ยกเลิกแล้ว" /></div>
												<p v-if="line.note" class="mt-2 text-xs text-stone-400">{{ line.note }}</p>
												<p v-if="line.cancelReason" class="mt-1 text-xs text-red-500">เหตุผล: {{ line.cancelReason }}</p>
											</div>
											<p class="text-sm font-semibold text-stone-900">{{ formatMoney(line.qty * line.price) }}</p>
										</div>
									</div>
								</div>
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
								<AppButton color="neutral" variant="soft" size="md" :block="true">{{ $t('orders.print') }}</AppButton>
								<AppButton color="primary" variant="solid" size="md" :block="true">{{ $t('orders.updateStatus') }}</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
