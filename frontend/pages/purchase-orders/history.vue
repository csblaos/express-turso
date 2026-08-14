<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { getCurrencySymbol, formatMoneyWithSymbol } from "~/utils/currency";
import { formatAppDateTime } from "~/utils/date-format";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiPurchaseOrderListItem = {
	id: string;
	store_id: string;
	po_number: string;
	supplier_name: string | null;
	supplier_contact: string | null;
	purchase_currency: string;
	exchange_rate: number;
	shipping_cost: number;
	other_cost: number;
	status: string;
	ordered_at: string | null;
	expected_at: string | null;
	received_at: string | null;
	note: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string | null;
	payment_status: string;
	due_date: string | null;
	item_count: number;
	total_qty_ordered: number;
	total_qty_received: number;
	total_estimated_base: number;
};

type ApiPurchaseOrderDetailItem = {
	id: string;
	purchase_order_id: string;
	product_id: string;
	product_name: string | null;
	product_sku: string | null;
	unit_name: string | null;
	qty_ordered: number;
	qty_received: number;
	unit_cost_purchase: number;
	unit_cost_base: number;
	landed_cost_per_unit: number;
	unit_id: string | null;
	multiplier_to_base: number;
	qty_base_ordered: number;
	qty_base_received: number;
};

type ApiPurchaseOrderDetailPayment = {
	id: string;
	purchase_order_id: string;
	store_id: string;
	entry_type: string;
	estimated_amount_base: number;
	amount_base: number;
	variance_base: number;
	paid_at: string;
	reference: string | null;
	note: string | null;
	reversed_payment_id: string | null;
	created_by: string | null;
	created_at: string;
};

type ApiPurchaseOrderDetail = {
	order: ApiPurchaseOrderListItem;
	items: ApiPurchaseOrderDetailItem[];
	payments: ApiPurchaseOrderDetailPayment[];
};

const { apiFetch } = useApiClient();
const { currentStoreId, hydrateAuthState } = useAuthSession();
const { t, locale } = useI18n();

type StoreRecord = {
	id: string;
	name: string;
	currency?: string;
};

const searchQuery = ref("");
const statusFilter = ref("all");
const paymentFilter = ref("all");
const fromDate = ref("");
const toDate = ref("");
const orders = ref<ApiPurchaseOrderListItem[]>([]);
const stores = ref<StoreRecord[]>([]);
const ordersPending = ref(true);
const ordersError = ref<string | null>(null);
const detailOpen = ref(false);
const detailPending = ref(false);
const detailError = ref<string | null>(null);
const selectedOrderId = ref("");
const selectedOrderDetail = ref<ApiPurchaseOrderDetail | null>(null);
const detailRequests = new Set<string>();

const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const appLocale = computed(() => locale.value as "th" | "lo" | "en");
const numberFormatter = computed(() => new Intl.NumberFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH"));
const appToast = useAppToast();
const historyText = computed(() => {
	const copy = locale.value === "lo"
		? {
			search: "ຄົ້ນຫາເລກ PO, ຜູ້ສະໜອງ, ຜູ້ຕິດຕໍ່ ຫຼື ໝາຍເຫດ", loadFailed: "ໂຫຼດປະຫວັດ PO ບໍ່ສຳເລັດ", detailLoadFailed: "ໂຫຼດລາຍລະອຽດ PO ບໍ່ສຳເລັດ", detailItems: "ລາຍການສິນຄ້າ", detailSummary: "ສະຫຼຸບຂໍ້ມູນຫຼັກ", copyContact: "ຄັດລອກຂໍ້ມູນຕິດຕໍ່ຜູ້ສະໜອງ", copy: "ຄັດລອກ", expectedAt: "ຄາດຮັບ", totalCost: "ຕົ້ນທຶນລວມ", note: "ໝາຍເຫດ", paymentSummary: "ສະຫຼຸບຊຳລະເງິນ", estimatedShort: "ປະມານ", actualPaid: "ຊຳລະຈິງ", variance: "ສ່ວນຕ່າງ", itemCount: "{count} ລາຍການ", paymentCount: "{count} ລາຍການຊຳລະ", lastPaid: "ຊຳລະລ່າສຸດ {date}", noPaymentEntry: "ຍັງບໍ່ມີລາຍການຊຳລະ", clearSearch: "ລ້າງຄຳຄົ້ນ", reload: "ໂຫຼດໃໝ່", filters: "ຕົວກອງ", period: "ຊ່ວງເວລາ", today: "ມື້ນີ້", thisWeek: "ອາທິດນີ້", lastWeek: "ອາທິດກ່ອນ", thisMonth: "ເດືອນນີ້", lastMonth: "ເດືອນກ່ອນ", clear: "ລ້າງ", apply: "ໃຊ້ຕົວກອງ", poStatus: "ສະຖານະ PO", paymentStatus: "ສະຖານະການຊຳລະ", fromDate: "ຈາກວັນທີ", toDate: "ເຖິງວັນທີ", history: "ປະຫວັດ PO", historyDescription: "ລຽງຈາກລາຍການຫຼ້າສຸດ ແລະ ຄົ້ນຫາ/ກອງໄດ້ຈາກດ້ານເທິງ", items: "ລາຍການ", retry: "ລອງໃໝ່", empty: "ຍັງບໍ່ມີປະຫວັດ PO", emptyHint: "ລອງປ່ຽນຕົວກອງ ຫຼື ຊ່ວງເວລາ", time: "ເວລາ", supplier: "ຜູ້ສະໜອງ", status: "ສະຖານະ", paid: "ຊຳລະ", quantity: "ຈຳນວນ", received: "ຮັບແລ້ວ", value: "ມູນຄ່າ", updated: "ອັບເດດ", perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ຖັດໄປ", unknownSupplier: "ບໍ່ລະບຸຜູ້ສະໜອງ", allPayments: "ທຸກການຊຳລະ", unpaid: "ຍັງບໍ່ຊຳລະ", partial: "ຊຳລະບາງສ່ວນ", paidStatus: "ຊຳລະແລ້ວ", details: "ລາຍລະອຽດ PO", detailsDescription: "ເບິ່ງສິນຄ້າ, ຕົ້ນທຶນ ແລະ ການຊຳລະ", mainSummary: "ສະຫຼຸບຂໍ້ມູນຫຼັກ", expected: "ຄາດວ່າຈະຮັບ", totalCost: "ຕົ້ນທຶນລວມ", note: "ໝາຍເຫດ", products: "ລາຍການສິນຄ້າ", payments: "ສະຫຼຸບການຊຳລະ", loading: "ກຳລັງໂຫຼດ", estimated: "ປະມານ", actual: "ຊຳລະຈິງ", variance: "ສ່ວນຕ່າງ", copy: "ຄັດລອກ", copyContact: "ຄັດລອກຂໍ້ມູນຕິດຕໍ່ຜູ້ສະໜອງ", baseUnit: "ໜ່ວຍຫຼັກ", ordered: "ສັ່ງ", remaining: "ຄົງເຫຼືອ", lines: "ແຖວ", paymentItems: "ລາຍການຊຳລະ", latestPayment: "ຊຳລະຫຼ້າສຸດ", reference: "ອ້າງອີງ", noPayment: "ຍັງບໍ່ມີລາຍການຊຳລະ", close: "ປິດ", startDate: "ເລືອກວັນເລີ່ມ", endDate: "ເລືອກວັນສິ້ນສຸດ", pickDate: "ແຕະວັນທີທີ່ຕ້ອງການເລືອກ",
		}
		: locale.value === "en"
			? {
				search: "Search PO number, supplier, contact, or note", loadFailed: "Could not load the PO history", detailLoadFailed: "Could not load the PO details", detailItems: "Items", detailSummary: "Key details", copyContact: "Copy supplier contact", copy: "Copy", expectedAt: "Expected", totalCost: "Total cost", note: "Note", paymentSummary: "Payment summary", estimatedShort: "Estimated", actualPaid: "Actually paid", variance: "Variance", itemCount: "{count} items", paymentCount: "{count} payments", lastPaid: "Last paid {date}", noPaymentEntry: "No payment entries yet", clearSearch: "Clear search", reload: "Reload", filters: "Filters", period: "Period", today: "Today", thisWeek: "This week", lastWeek: "Last week", thisMonth: "This month", lastMonth: "Last month", clear: "Clear", apply: "Apply filters", poStatus: "PO status", paymentStatus: "Payment status", fromDate: "From date", toDate: "To date", history: "PO history", historyDescription: "Latest records first. Search or filter above.", items: "items", retry: "Try again", empty: "No PO history yet", emptyHint: "Try changing the filters or date range.", time: "Time", supplier: "Supplier", status: "Status", paid: "Payment", quantity: "Quantity", received: "Received", value: "Value", updated: "Updated", perPage: "Per page", previous: "Previous", next: "Next", unknownSupplier: "Supplier not specified", allPayments: "All payments", unpaid: "Unpaid", partial: "Partial", paidStatus: "Paid", details: "PO details", detailsDescription: "View products, costs, and payments.", mainSummary: "Main summary", expected: "Expected", totalCost: "Total cost", note: "Note", products: "Products", payments: "Payment summary", loading: "Loading", estimated: "Estimated", actual: "Actual paid", variance: "Variance", copy: "Copy", copyContact: "Copy supplier contact", baseUnit: "base unit", ordered: "Ordered", remaining: "Remaining", lines: "lines", paymentItems: "payment entries", latestPayment: "Latest payment", reference: "Reference", noPayment: "No payment entry yet", close: "Close", startDate: "Select start date", endDate: "Select end date", pickDate: "Tap a date to select it",
			}
			: {
				search: "ค้นหาเลข PO, supplier, contact หรือหมายเหตุ", loadFailed: "โหลดประวัติ PO ไม่สำเร็จ", detailLoadFailed: "โหลดรายละเอียด PO ไม่สำเร็จ", detailItems: "รายการสินค้า", detailSummary: "สรุปข้อมูลหลัก", copyContact: "คัดลอกข้อมูลติดต่อ supplier", copy: "คัดลอก", expectedAt: "คาดรับ", totalCost: "ต้นทุนรวม", note: "หมายเหตุ", paymentSummary: "สรุปชำระเงิน", estimatedShort: "ประมาณ", actualPaid: "ชำระจริง", variance: "ส่วนต่าง", itemCount: "{count} รายการ", paymentCount: "{count} รายการชำระ", lastPaid: "ชำระล่าสุด {date}", noPaymentEntry: "ยังไม่มีรายการชำระ", clearSearch: "ล้างคำค้น", reload: "รีโหลด", filters: "ตัวกรอง", period: "ช่วงเวลา", today: "วันนี้", thisWeek: "สัปดาห์นี้", lastWeek: "สัปดาห์ที่แล้ว", thisMonth: "เดือนนี้", lastMonth: "เดือนที่แล้ว", clear: "ล้าง", apply: "ใช้ตัวกรอง", poStatus: "สถานะ PO", paymentStatus: "สถานะชำระเงิน", fromDate: "จากวันที่", toDate: "ถึงวันที่", history: "รายการประวัติ PO", historyDescription: "เรียงจากรายการล่าสุด และรองรับค้นหา/กรองจากด้านบน", items: "รายการ", retry: "ลองใหม่", empty: "ยังไม่มีประวัติ PO", emptyHint: "ลองเปลี่ยนตัวกรองหรือช่วงเวลา", time: "เวลา", supplier: "Supplier", status: "สถานะ", paid: "ชำระ", quantity: "จำนวน", received: "รับแล้ว", value: "มูลค่า", updated: "อัปเดต", perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป", unknownSupplier: "ไม่ระบุ supplier", allPayments: "ทุกการชำระ", unpaid: "Unpaid", partial: "Partial", paidStatus: "Paid", details: "รายละเอียด PO", detailsDescription: "ดูสินค้า ต้นทุน และการชำระเงิน", mainSummary: "สรุปข้อมูลหลัก", expected: "คาดรับ", totalCost: "ต้นทุนรวม", note: "หมายเหตุ", products: "รายการสินค้า", payments: "สรุปชำระเงิน", loading: "กำลังโหลด", estimated: "ประมาณ", actual: "ชำระจริง", variance: "ส่วนต่าง", copy: "คัดลอก", copyContact: "คัดลอก contact supplier", baseUnit: "base unit", ordered: "สั่ง", remaining: "คงเหลือ", lines: "lines", paymentItems: "รายการชำระ", latestPayment: "ชำระล่าสุด", reference: "Reference", noPayment: "{{ historyText.noPaymentEntry }}", close: "ปิด", startDate: "เลือกเริ่มวันที่", endDate: "เลือกสิ้นวันที่", pickDate: "แตะวันที่ที่ต้องการเลือก",
			};
	return copy;
});

const filteredOrders = computed(() => orders.value.filter((order) => {
	const query = searchQuery.value.trim().toLowerCase();
	const matchesQuery = !query
		|| [order.po_number, order.supplier_name, order.supplier_contact, order.note]
			.filter(Boolean)
			.some((value) => String(value).toLowerCase().includes(query));
	const matchesStatus = statusFilter.value === "all" || order.status === statusFilter.value;
	const matchesPayment = paymentFilter.value === "all" || order.payment_status === paymentFilter.value;
	const createdAt = new Date(order.created_at);
	const afterFrom = !fromDate.value || createdAt >= new Date(`${fromDate.value}T00:00:00`);
	const beforeTo = !toDate.value || createdAt <= new Date(`${toDate.value}T23:59:59.999`);
	return matchesQuery && matchesStatus && matchesPayment && afterFrom && beforeTo;
}));

const totalItems = computed(() => filteredOrders.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const paginatedOrders = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredOrders.value.slice(startIndex, startIndex + pageSize.value);
});
const pageLabel = computed(() => t("purchaseOrdersPage.pageLabel", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? t("purchaseOrdersPage.noData")
		: t("purchaseOrdersPage.pageSummary", { start: pageStart.value, end: pageEnd.value, count: totalItems.value })
));
const storeCurrency = computed(() => {
	return stores.value.find((store) => store.id === currentStoreId.value)?.currency?.trim()?.toUpperCase()
		|| stores.value[0]?.currency?.trim()?.toUpperCase()
		|| "LAK";
});
const selectedOrder = computed(() =>
	orders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);
const selectedOrderPaymentSummary = computed(() => {
	if (!selectedOrderDetail.value?.payments.length) return null;
	const relevantPayments = selectedOrderDetail.value.payments.filter((payment) => payment.entry_type === "payment");
	if (!relevantPayments.length) return null;
	const estimatedAmountBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.estimated_amount_base || 0), 0);
	const actualAmountBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.amount_base || 0), 0);
	const varianceBase = relevantPayments.reduce((sum, payment) => sum + Number(payment.variance_base || 0), 0);
	return {
		count: relevantPayments.length,
		estimatedAmountBase,
		actualAmountBase,
		varianceBase,
		paidAt: relevantPayments[0]?.paid_at || null,
		reference: relevantPayments[0]?.reference || null,
		note: relevantPayments[0]?.note || null,
	};
});

const typeOptions = computed<Array<{ id: typeof statusFilter.value; label: string }>>(() => [
	{ id: "all", label: t("purchaseOrdersPage.allStatuses") },
	{ id: "draft", label: t("purchaseOrdersPage.draft") },
	{ id: "ordered", label: t("purchaseOrdersPage.ordered") },
	{ id: "shipped", label: t("purchaseOrdersPage.shipped") },
	{ id: "arrived", label: t("purchaseOrdersPage.arrived") },
	{ id: "received", label: t("purchaseOrdersPage.received") },
	{ id: "cancelled", label: t("purchaseOrdersPage.cancelled") },
]);

const paymentOptions = computed<Array<{ id: typeof paymentFilter.value; label: string }>>(() => [
	{ id: "all", label: historyText.value.allPayments },
	{ id: "unpaid", label: historyText.value.unpaid },
	{ id: "partial", label: historyText.value.partial },
	{ id: "paid", label: historyText.value.paidStatus },
]);

type DatePresetId = "today" | "this_week" | "last_week" | "this_month" | "last_month";

function pad2(value: number) {
	return String(value).padStart(2, "0");
}

function toDateInputValue(date: Date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function applyPreset(presetId: DatePresetId) {
	const now = new Date();
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (presetId === "today") {
		const value = toDateInputValue(today);
		fromDate.value = value;
		toDate.value = value;
		return;
	}

	if (presetId === "this_week" || presetId === "last_week") {
		const day = today.getDay();
		const diffToMonday = (day + 6) % 7;
		const thisMonday = new Date(today);
		thisMonday.setDate(thisMonday.getDate() - diffToMonday);

		if (presetId === "this_week") {
			fromDate.value = toDateInputValue(thisMonday);
			toDate.value = toDateInputValue(today);
			return;
		}

		const lastMonday = new Date(thisMonday);
		lastMonday.setDate(lastMonday.getDate() - 7);
		const lastSunday = new Date(thisMonday);
		lastSunday.setDate(lastSunday.getDate() - 1);
		fromDate.value = toDateInputValue(lastMonday);
		toDate.value = toDateInputValue(lastSunday);
		return;
	}

	if (presetId === "this_month") {
		const first = new Date(today.getFullYear(), today.getMonth(), 1);
		fromDate.value = toDateInputValue(first);
		toDate.value = toDateInputValue(today);
		return;
	}

	const firstLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
	const lastLastMonth = new Date(today.getFullYear(), today.getMonth(), 0);
	fromDate.value = toDateInputValue(firstLastMonth);
	toDate.value = toDateInputValue(lastLastMonth);
}

// Filters are live, so clearing them repaints the table immediately. The list
// itself is refetched too, in case rows changed while the page sat open.
function clearFilters() {
	searchQuery.value = "";
	statusFilter.value = "all";
	paymentFilter.value = "all";
	fromDate.value = "";
	toDate.value = "";
	currentPage.value = 1;
	void loadHistory();
}

function formatDate(value: string | null) {
	if (!value) return "-";
	return formatAppDateTime(value, appLocale.value);
}

function formatMoney(value: number) {
	return formatMoneyWithSymbol(value, storeCurrency.value);
}

function showToast(message: string) {
	appToast.info({ title: message });
}

async function copyToClipboard(text: string, toastTitle: string) {
	const value = String(text || "").trim();
	if (!value) return;
	try {
		await navigator.clipboard.writeText(value);
		showToast(toastTitle);
	} catch {
		showToast(t("toastMessages.copyFailed"));
	}
}

async function copySupplierContact() {
	if (!selectedOrderDetail.value?.order.supplier_contact) return;
	await copyToClipboard(selectedOrderDetail.value.order.supplier_contact, t("toastMessages.copiedSupplierContact"));
}

function statusColor(status: string) {
	if (status === "received") return "success";
	if (status === "shipped") return "info";
	if (status === "ordered") return "primary";
	if (status === "arrived") return "warning";
	if (status === "cancelled") return "error";
	return "neutral";
}

// The same seven keys the filter dropdown on this page already uses, and the same
// body the main PO page has. This copy was left in Thai, so the status badges only
// read correctly for Thai users.
function statusLabel(status: string) {
	if (status === "draft") return t("purchaseOrdersPage.draft");
	if (status === "ordered") return t("purchaseOrdersPage.ordered");
	if (status === "shipped") return t("purchaseOrdersPage.shipped");
	if (status === "arrived") return t("purchaseOrdersPage.arrived");
	if (status === "partial") return t("purchaseOrdersPage.partial");
	if (status === "received") return t("purchaseOrdersPage.received");
	if (status === "cancelled") return t("purchaseOrdersPage.cancelled");
	return status;
}

// The badges were rendering the raw database value ("unpaid"/"paid"), which is
// neither Lao nor Thai. The filter dropdown already carries the translations, so
// reuse them rather than adding a second set that could drift.
function paymentStatusLabel(status: string) {
	if (status === "paid") return historyText.value.paidStatus;
	if (status === "partial") return historyText.value.partial;
	return historyText.value.unpaid;
}

function paymentStatusColor(status: string) {
	if (status === "paid") return "success";
	if (status === "partial") return "warning";
	return "neutral";
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	detailOpen.value = true;
	const cached = selectedOrderDetail.value?.order.id === orderId ? selectedOrderDetail.value : null;
	if (cached) {
		detailError.value = null;
		detailPending.value = false;
		return;
	}
	void loadOrderDetail(orderId);
}

function closeDetail() {
	detailOpen.value = false;
	selectedOrderId.value = "";
	selectedOrderDetail.value = null;
	detailError.value = null;
}

async function loadOrderDetail(id: string) {
	if (detailRequests.has(id)) return;
	detailRequests.add(id);
	detailPending.value = true;
	detailError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${id}`);
		selectedOrderDetail.value = response.data;
	} catch (error) {
		detailError.value = resolveApiErrorMessage(error, historyText.value.detailLoadFailed);
	} finally {
		detailPending.value = false;
		detailRequests.delete(id);
	}
}

function goToPage(page: number) {
	const normalizedPage = Math.min(Math.max(page, 1), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
}

function updatePageSize(value: string) {
	const normalizedSize = Number(value);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
}

async function loadHistory() {
	ordersPending.value = true;
	ordersError.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderListItem[]>>("/purchase-orders", {
			query: currentStoreId.value ? { store_id: currentStoreId.value } : undefined,
		});
		orders.value = response.data;
	} catch (error) {
		orders.value = [];
		ordersError.value = resolveApiErrorMessage(error, historyText.value.loadFailed);
	} finally {
		ordersPending.value = false;
	}
}

async function loadStores() {
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
		stores.value = response.data;
	} catch {
		stores.value = [];
	}
}

watch([searchQuery, statusFilter, paymentFilter, fromDate, toDate], () => {
	currentPage.value = 1;
});

watch(filteredOrders, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
}, { immediate: true });

onMounted(() => {
	hydrateAuthState();
	void Promise.all([loadHistory(), loadStores()]);
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['purchase']"
		sidebar-eyebrow="Purchase"
		:sidebar-title="t('purchaseOrdersPage.historyTitle')"
		sidebar-compact-title="PO HIS"
		:sidebar-description="t('purchaseOrdersPage.historySidebarDescription')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-2 pb-2 lg:gap-3">
				<AppPageHeader
					compact
					title=""
					:description="t('purchaseOrdersPage.historyHeaderDescription')"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								:placeholder="historyText.search"
								color="neutral"
								class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:pr-12 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
								@keydown.enter.prevent="loadHistory"
							/>
							<AppButton
								v-if="searchQuery"
								color="neutral"
								variant="ghost"
								size="xs"
								icon="i-heroicons-x-mark-20-solid"
								class="absolute right-2.5 top-1/2 z-10 -translate-y-1/2 rounded-md"
								:aria-label="historyText.clearSearch"
								:title="historyText.clearSearch"
								@click="searchQuery = ''"
							/>
						</div>

						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="justify-center rounded-md"
							:loading="ordersPending"
							:spin-icon-on-loading="true"
							:aria-label="historyText.reload"
							:title="historyText.reload"
							@click="loadHistory"
						>
							<span class="hidden sm:inline">{{ historyText.reload }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ historyText.filters }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ pageSummaryText }}
							</div>
						</div>

						<div class="grid gap-2 px-4 py-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.period }}</span>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('today')">{{ historyText.today }}</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_week')">{{ historyText.thisWeek }}</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_week')">{{ historyText.lastWeek }}</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_month')">{{ historyText.thisMonth }}</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_month')">{{ historyText.lastMonth }}</AppButton>
								</div>
								<div class="flex items-center gap-2">
									<AppButton
										color="neutral"
										variant="ghost"
										size="xs"
										class="rounded-md"
										:disabled="ordersPending"
										@click="clearFilters"
									>
										{{ historyText.clear }}
									</AppButton>
									
								</div>
							</div>

							<div class="grid grid-cols-2 gap-2 md:grid-cols-3 md:items-end">
								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ historyText.poStatus }}</label>
									<div class="relative">
										<select
											v-model="statusFilter"
											class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="option in typeOptions" :key="option.id" :value="option.id">
												{{ option.label }}
											</option>
										</select>
										<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
									</div>
								</div>

								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ historyText.paymentStatus }}</label>
									<div class="relative">
										<select
											v-model="paymentFilter"
											class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="option in paymentOptions" :key="option.id" :value="option.id">
												{{ option.label }}
											</option>
										</select>
										<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
									</div>
								</div>

								<AppDateRangePicker
									v-model:from="fromDate"
									v-model:to="toDate"
									class="col-span-2 md:col-span-1"
									:from-label="historyText.fromDate"
									:to-label="historyText.toDate"
									:start-title="historyText.startDate"
									:end-title="historyText.endDate"
									:pick-hint="historyText.pickDate"
									:today-label="historyText.today"
									:clear-label="historyText.clear"
									:close-label="historyText.close"
								/>
							</div>
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ historyText.history }}</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ historyText.historyDescription }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ totalItems }} {{ historyText.items }}
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="ordersPending" class="min-h-[280px]">
								<AppInlineLoadingBar container-class="bg-neutral-100" />
							</div>
							<div v-else-if="ordersError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm text-stone-600">{{ ordersError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadHistory">{{ historyText.retry }}</AppButton>
								</div>
							</div>
							<div v-else-if="!filteredOrders.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm font-medium text-stone-900">{{ historyText.empty }}</p>
									<p class="text-sm text-stone-500">{{ historyText.emptyHint }}</p>
								</div>
							</div>

							<table v-else class="min-w-[1120px] w-full border-separate border-spacing-0">
								<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
									<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.time }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">PO</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.supplier }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.status }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.paid }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.quantity }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.received }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.value }}</th>
										<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ historyText.updated }}</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="order in paginatedOrders"
										:key="order.id"
										class="cursor-pointer bg-white text-sm text-stone-700 transition hover:bg-primary-50"
										@click="openDetail(order.id)"
									>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
											{{ formatDate(order.created_at) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<p class="font-semibold text-stone-950">{{ order.po_number }}</p>
											<p class="mt-1 text-xs text-stone-400">{{ order.purchase_currency }} · {{ order.created_by || "-" }}</p>
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<p class="font-medium text-stone-900">{{ order.supplier_name || historyText.unknownSupplier }}</p>
											<p v-if="order.supplier_contact" class="mt-1 text-xs text-stone-500">{{ order.supplier_contact }}</p>
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="paymentStatusColor(order.payment_status)" variant="soft" :label="paymentStatusLabel(order.payment_status)" />
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-right font-semibold text-stone-950 tabular-nums">
											{{ numberFormatter.format(order.total_qty_ordered) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-right font-semibold text-stone-950 tabular-nums">
											{{ numberFormatter.format(order.total_qty_received) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-right font-semibold text-stone-950 tabular-nums">
											{{ formatMoney(order.total_estimated_base) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
											{{ formatDate(order.updated_at || order.created_at) }}
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
										<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.perPage }}</label>
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
											:disabled="currentPage <= 1 || ordersPending"
											:aria-label="historyText.previous"
											:title="historyText.previous"
											@click="goToPage(currentPage - 1)"
										>
											<span class="hidden sm:inline">{{ historyText.previous }}</span>
										</AppButton>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											class="rounded-md"
											icon="i-heroicons-chevron-right-20-solid"
											:disabled="currentPage >= totalPages || ordersPending"
											:aria-label="historyText.next"
											:title="historyText.next"
											@click="goToPage(currentPage + 1)"
										>
											<span class="hidden sm:inline">{{ historyText.next }}</span>
										</AppButton>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				:title="historyText.details"
				:description="historyText.detailsDescription"
				desktop-width="680px"
				close-button-size="md"
				compact-header
				full-bleed-header
				content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
				@close="closeDetail"
			>
				<template #default>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
							<template v-if="detailPending">
								<div class="relative rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-start gap-3">
										<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
											<UIcon name="i-heroicons-clipboard-document-list" class="h-5 w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div class="min-w-0">
													<h3 class="truncate text-base font-semibold text-stone-950">
														{{ selectedOrder?.po_number || "PO-XXXX" }}
													</h3>
													<p class="mt-1 truncate text-sm text-stone-500">
														{{ selectedOrder?.supplier_name || historyText.unknownSupplier }}
													</p>
												</div>
												<div class="flex shrink-0 flex-wrap items-center gap-2">
													<UBadge :color="statusColor(selectedOrder?.status || 'draft')" variant="soft" :label="statusLabel(selectedOrder?.status || 'draft')" />
												</div>
											</div>
											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge :color="paymentStatusColor(selectedOrder?.payment_status || 'unpaid')" variant="soft" :label="paymentStatusLabel(selectedOrder?.payment_status || 'unpaid')" />
												<UBadge color="neutral" variant="soft" :label="getCurrencySymbol(selectedOrder?.purchase_currency || storeCurrency) || (selectedOrder?.purchase_currency || storeCurrency)" />
												<UBadge color="neutral" variant="soft" :label="historyText.itemCount.replace('{count}', String(selectedOrder?.item_count || 0))" />
											</div>
											<div class="pointer-events-none absolute inset-x-0 bottom-0">
												<AppInlineLoadingBar minimal container-class="bg-transparent" />
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">{{ historyText.mainSummary }}</h3>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ historyText.supplier }}</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ historyText.expected }}</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">{{ historyText.totalCost }}</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">{{ historyText.note }}</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">-</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">{{ historyText.detailItems }}</h3>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[72px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ historyText.payments }}</h3>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[64px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>
							</template>

							<div v-else-if="detailError" class="rounded-md border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
								<div class="space-y-3 py-10 text-center">
									<p class="text-sm text-stone-600">{{ detailError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="selectedOrderId && loadOrderDetail(selectedOrderId)">{{ historyText.retry }}</AppButton>
								</div>
							</div>

							<template v-else-if="selectedOrderDetail">
								<div class="relative rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-start gap-3">
										<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
											<UIcon name="i-heroicons-clipboard-document-list" class="h-5 w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex flex-wrap items-start justify-between gap-3">
												<div class="min-w-0">
													<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedOrderDetail.order.po_number }}</h3>
													<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrderDetail.order.supplier_name || historyText.unknownSupplier }}</p>
												</div>
												<div class="flex shrink-0 flex-wrap items-center gap-2">
													<UBadge :color="statusColor(selectedOrderDetail.order.status)" variant="soft" :label="statusLabel(selectedOrderDetail.order.status)" />
												</div>
											</div>
											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="paymentStatusLabel(selectedOrderDetail.order.payment_status)" />
												<UBadge color="neutral" variant="soft" :label="getCurrencySymbol(selectedOrderDetail.order.purchase_currency) || selectedOrderDetail.order.purchase_currency" />
												<UBadge color="neutral" variant="soft" :label="`${selectedOrderDetail.items.length} ${historyText.items}`" />
											</div>
											<div v-if="detailPending" class="pointer-events-none absolute inset-x-0 bottom-0">
												<AppInlineLoadingBar minimal container-class="bg-transparent" />
											</div>
										</div>
									</div>
								</div>

								<template v-if="detailPending">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<h3 class="text-sm font-semibold text-stone-950">{{ historyText.mainSummary }}</h3>
										<dl class="mt-4 space-y-3 text-sm">
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ historyText.supplier }}</dt>
												<dd class="text-right font-medium text-stone-900">-</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ historyText.expected }}</dt>
												<dd class="text-right font-medium text-stone-900">-</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ historyText.totalCost }}</dt>
												<dd class="text-right font-medium text-stone-900">-</dd>
											</div>
											<div class="flex items-start justify-between gap-4">
												<dt class="text-stone-500">{{ historyText.note }}</dt>
												<dd class="max-w-[220px] text-right font-medium text-stone-900">-</dd>
											</div>
										</dl>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ historyText.products }}</h3>
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="index in 2" :key="index" class="min-h-[72px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
										</div>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ historyText.payments }}</h3>
											<UBadge color="neutral" variant="soft" :label="historyText.loading" />
										</div>
										<div class="mt-4 grid gap-3 sm:grid-cols-3">
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.estimated }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">-</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.actual }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">-</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.variance }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">-</p>
											</div>
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="index in 2" :key="index" class="min-h-[64px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
										</div>
									</div>
								</template>
								<template v-else>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<h3 class="text-sm font-semibold text-stone-950">{{ historyText.detailSummary }}</h3>
										<dl class="mt-4 space-y-3 text-sm">
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">Supplier</dt>
												<dd class="text-right font-medium text-stone-900">
													{{ selectedOrderDetail.order.supplier_name || "-" }}
													<div v-if="selectedOrderDetail.order.supplier_contact" class="mt-2 flex items-center justify-end gap-2">
														<span class="text-xs font-normal text-stone-500">{{ selectedOrderDetail.order.supplier_contact }}</span>
														<AppButton
															color="neutral"
															variant="soft"
															size="xs"
															icon="i-heroicons-clipboard-document-20-solid"
															class="rounded-md"
															type="button"
															:title="historyText.copyContact"
															@click="copySupplierContact"
														>
															{{ historyText.copy }}
														</AppButton>
													</div>
												</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ historyText.expectedAt }}</dt>
												<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrderDetail.order.expected_at) }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">{{ historyText.totalCost }}</dt>
												<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrderDetail.order.total_estimated_base) }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4">
												<dt class="text-stone-500">{{ historyText.note }}</dt>
												<dd class="max-w-[220px] text-right font-medium text-stone-900">{{ selectedOrderDetail.order.note || "-" }}</dd>
											</div>
										</dl>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ historyText.detailItems }}</h3>
											<UBadge color="neutral" variant="soft" :label="`${selectedOrderDetail.items.length} lines`" />
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="item in selectedOrderDetail.items" :key="item.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-stone-900">{{ item.product_name || item.product_id }}</p>
														<p class="mt-1 text-xs text-stone-500">{{ item.product_sku || "-" }} · {{ item.unit_name || "base unit" }}</p>
													</div>
													<p class="text-sm font-semibold text-stone-900">{{ formatMoney(item.unit_cost_base) }}</p>
												</div>
												<div class="mt-3 flex flex-wrap gap-2">
													<UBadge color="neutral" variant="soft" :label="`${historyText.ordered} ${numberFormatter.format(item.qty_ordered)}`" />
													<UBadge color="neutral" variant="soft" :label="`${historyText.received} ${numberFormatter.format(item.qty_received)}`" />
													<UBadge color="neutral" variant="soft" :label="`${historyText.remaining} ${numberFormatter.format(Math.max(0, item.qty_ordered - item.qty_received))}`" />
												</div>
											</div>
										</div>
									</div>

									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">{{ historyText.paymentSummary }}</h3>
											<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="paymentStatusLabel(selectedOrderDetail.order.payment_status)" />
										</div>
										<div class="mt-4 grid gap-3 sm:grid-cols-3">
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.estimatedShort }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">{{ formatMoney(selectedOrderPaymentSummary?.estimatedAmountBase ?? selectedOrderDetail.order.total_estimated_base) }}</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.actualPaid }}</p>
												<p class="mt-2 text-base font-semibold text-stone-950">{{ formatMoney(selectedOrderPaymentSummary?.actualAmountBase ?? 0) }}</p>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
												<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ historyText.variance }}</p>
												<p
													class="mt-2 text-base font-semibold"
													:class="(selectedOrderPaymentSummary?.varianceBase || 0) === 0
														? 'text-stone-950'
														: (selectedOrderPaymentSummary?.varianceBase || 0) > 0
															? 'text-amber-600'
															: 'text-emerald-600'"
												>
													{{ formatMoney(Math.abs(selectedOrderPaymentSummary?.varianceBase || 0)) }}
												</p>
											</div>
										</div>
										<div v-if="selectedOrderPaymentSummary" class="mt-4 rounded-md border border-neutral-200 bg-white px-4 py-4">
											<div class="flex flex-wrap items-center gap-2">
												<UBadge color="neutral" variant="soft" :label="historyText.paymentCount.replace('{count}', String(selectedOrderPaymentSummary.count))" />
												<UBadge color="neutral" variant="soft" :label="historyText.lastPaid.replace('{date}', formatDate(selectedOrderPaymentSummary.paidAt))" />
												<UBadge v-if="selectedOrderPaymentSummary.reference" color="neutral" variant="soft" :label="selectedOrderPaymentSummary.reference" />
											</div>
											<p v-if="selectedOrderPaymentSummary.note" class="mt-3 text-sm leading-6 text-stone-600">
												{{ selectedOrderPaymentSummary.note }}
											</p>
										</div>
										<div v-if="selectedOrderDetail.payments.length" class="mt-4 space-y-3">
											<div v-for="payment in selectedOrderDetail.payments" :key="payment.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex flex-wrap items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-900">{{ payment.entry_type }}</p>
														<p class="mt-1 text-xs text-stone-500">{{ formatDate(payment.paid_at) }}</p>
														<div class="mt-2 flex flex-wrap gap-2">
															<UBadge color="neutral" variant="soft" :label="`${historyText.estimatedShort} ${formatMoney(payment.estimated_amount_base)}`" />
															<UBadge color="neutral" variant="soft" :label="`${historyText.actualPaid} ${formatMoney(payment.amount_base)}`" />
															<UBadge
																:color="payment.variance_base === 0 ? 'neutral' : payment.variance_base > 0 ? 'warning' : 'success'"
																variant="soft"
																:label="`${historyText.variance} ${formatMoney(Math.abs(payment.variance_base))}`"
															/>
														</div>
														<div v-if="payment.reference || payment.note" class="mt-3 space-y-1 text-xs text-stone-500">
															<p v-if="payment.reference">Reference: {{ payment.reference }}</p>
															<p v-if="payment.note">Note: {{ payment.note }}</p>
														</div>
													</div>
													<p class="text-sm font-semibold text-stone-900">{{ formatMoney(payment.amount_base) }}</p>
												</div>
											</div>
										</div>
										<div v-else class="mt-4 rounded-md bg-white px-4 py-4 text-sm text-stone-500 ring-1 ring-neutral-200">
											{{ historyText.noPaymentEntry }}
										</div>
									</div>
								</template>
							</template>
						</div>

						<div class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-1 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">{{ historyText.close }}</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<!--
			<AppResponsivePanel
				v-model="datePickerOpen"
				:title="datePickerField === 'from' ? historyText.startDate : historyText.endDate"
				:description="datePickerCurrentValue ? formatPickerDate(datePickerCurrentValue) : historyText.pickDate"
				desktop-width="420px"
				close-button-size="md"
				compact-header
				full-bleed-header
				content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
				@close="closeDatePicker"
			>
				<template #default>
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="min-h-0 overflow-y-auto px-0 py-2">
							<div class="rounded-none border border-neutral-200 bg-neutral-50 p-4 shadow-[0_8px_24px_rgba(31,28,24,0.04)] sm:rounded-md">
								<div class="flex items-center justify-between gap-2">
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" icon="i-heroicons-chevron-left-20-solid" @click="moveDatePickerMonth(-1)" />
									<div class="text-sm font-semibold text-stone-950">
										{{ datePickerMonthLabel }}
									</div>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" icon="i-heroicons-chevron-right-20-solid" @click="moveDatePickerMonth(1)" />
								</div>

								<div class="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
									<div v-for="label in weekdayLabels" :key="label" class="py-1">
										{{ label }}
									</div>
								</div>

								<div class="mt-2 space-y-1">
									<div v-for="week in datePickerCalendarWeeks" :key="week[0]?.date" class="grid grid-cols-7 gap-1">
										<button
											v-for="day in week"
											:key="day.date"
											type="button"
											class="flex h-11 items-center justify-center rounded-md text-sm font-medium transition"
											:class="day.isCurrentMonth
												? day.isSelected
													? 'bg-primary-600 text-white shadow-sm'
													: day.isInRange
														? 'bg-primary-50 text-primary-700'
														: day.isToday
															? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
															: 'bg-white text-stone-800 ring-1 ring-neutral-200 hover:border-primary-300 hover:bg-primary-50/50'
												: 'bg-transparent text-stone-300 ring-1 ring-transparent'"
											:disabled="!day.isCurrentMonth"
											@click="pickDate(day)"
										>
											{{ day.day }}
										</button>
									</div>
								</div>
							</div>
						</div>

						<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid grid-cols-3 gap-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-calendar-days-20-solid"
									class="w-full justify-center rounded-md text-center"
									@click="pickToday"
								>
									{{ historyText.today }}
								</AppButton>
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									class="w-full justify-center rounded-md text-center"
									@click="clearCurrentDate"
								>
									<span class="inline-flex items-center justify-center gap-1.5">
										<Eraser class="h-4 w-4 shrink-0" />
										<span>{{ historyText.clear }}</span>
									</span>
								</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-x-mark-20-solid"
									class="w-full justify-center rounded-md text-center"
									@click="closeDatePicker"
								>
									{{ historyText.close }}
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>
			-->
		</template>
	</AppSidebarShell>
</template>
