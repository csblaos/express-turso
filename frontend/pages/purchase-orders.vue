<script setup lang="ts">
import { getCurrencySymbol, formatMoneyWithSymbol } from "~/utils/currency";
import { appNavItems } from "~/utils/app-nav";

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
	other_cost_note: string | null;
	status: string;
	ordered_at: string | null;
	expected_at: string | null;
	shipped_at: string | null;
	received_at: string | null;
	tracking_info: string | null;
	cancelled_at: string | null;
	note: string | null;
	created_by: string | null;
	created_at: string;
	updated_at: string | null;
	updated_by: string | null;
	exchange_rate_initial: number;
	payment_status: string;
	paid_at: string | null;
	paid_by: string | null;
	payment_reference: string | null;
	payment_note: string | null;
	due_date: string | null;
	shipping_cost_original: number;
	shipping_cost_currency: string;
	other_cost_original: number;
	other_cost_currency: string;
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
	amount_base: number;
	paid_at: string;
	reference: string | null;
	note: string | null;
	reversed_payment_id: string | null;
	created_by: string | null;
	created_at: string;
};

type ReceiveLineForm = {
	itemId: string;
	productName: string;
	productSku: string | null;
	orderedQty: number;
	receivedQty: number;
	remainingQty: number;
	receiveQty: string;
};

type ApiPurchaseOrderDetail = {
	order: ApiPurchaseOrderListItem;
	items: ApiPurchaseOrderDetailItem[];
	payments: ApiPurchaseOrderDetailPayment[];
};

type ApiProduct = {
	id: string;
	store_id: string;
	sku: string;
	name: string;
	base_unit_id: string;
	cost_base: number;
};

type StoreRecord = {
	id: string;
	name: string;
	currency?: string;
};

type CreateLine = {
	id: string;
	productId: string;
	qtyOrdered: string;
	unitCost: string;
};

const { apiFetch } = useApiClient();
const { can, accessToken, currentUser, currentAccess, fetchMe, hydrateAuthState, currentStoreId, switchStore } = useAuthSession();
const appToast = useAppToast();
const route = useRoute();

const searchQuery = ref("");
const activeStatus = ref("all");
const activePaymentStatus = ref("all");

const orders = ref<ApiPurchaseOrderListItem[]>([]);
const ordersPending = ref(true);
const ordersError = ref<string | null>(null);

const products = ref<ApiProduct[]>([]);
const productsPending = ref(true);
const stores = ref<StoreRecord[]>([]);

const selectedOrderId = ref("");
const selectedOrderDetail = ref<ApiPurchaseOrderDetail | null>(null);
const purchaseOrderDetailCache = ref<Record<string, ApiPurchaseOrderDetail>>({});
const purchaseOrderDetailRequests = new Set<string>();
const detailPending = ref(false);
const detailError = ref<string | null>(null);

const detailOpen = ref(false);
const receiveOpen = ref(false);
const receiveSaving = ref(false);
const receiveMode = ref<"now" | "partial" | "later">("now");
const receiveLines = ref<ReceiveLineForm[]>([]);
const createOpen = ref(false);
const purchaseOrderEditLoading = ref(false);
const purchaseOrderFormMode = ref<"create" | "edit">("create");
const editingPurchaseOrderId = ref<string | null>(null);
const purchaseOrderEditTargetStatus = ref<string>("");
const submitting = ref(false);
const authPermissionReady = ref(false);
const canCreatePurchaseOrder = computed(() => can("purchase_orders.create"));
const canUpdatePurchaseOrder = computed(() => can("purchase_orders.update"));
const canReceivePurchaseOrder = computed(() => can("purchase_orders.receive"));
const purchaseOrderCostOnlyEdit = computed(() => purchaseOrderFormMode.value === "edit" && purchaseOrderEditTargetStatus.value !== "draft");

const createForm = reactive({
	storeId: "",
	supplierName: "",
	supplierContact: "",
	purchaseCurrency: "LAK",
	exchangeRate: "1",
	shippingCost: "0",
	otherCost: "0",
	otherCostNote: "",
	expectedAt: "",
	note: "",
	createdBy: "",
	items: [] as CreateLine[],
});

const numberFormatter = new Intl.NumberFormat("th-TH");
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

let reloadTimer: ReturnType<typeof setTimeout> | null = null;
const selectedOrder = computed(() =>
	orders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);

const totalOpenOrders = computed(() => orders.value.filter((order) => order.status !== "received" && order.status !== "cancelled").length);
const totalDraftOrders = computed(() => orders.value.filter((order) => order.status === "draft").length);
const totalPendingPayments = computed(() => orders.value.filter((order) => order.payment_status !== "paid").length);
const totalEstimated = computed(() => orders.value.reduce((sum, order) => sum + Number(order.total_estimated_base || 0), 0));
const totalPages = computed(() => Math.max(1, Math.ceil(orders.value.length / pageSize.value)));
const paginatedOrders = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return orders.value.slice(startIndex, startIndex + pageSize.value);
});
const effectiveStoreId = computed(() => (
	currentStoreId.value?.trim()
	|| createForm.storeId?.trim()
	|| products.value[0]?.store_id?.trim()
	|| orders.value[0]?.store_id?.trim()
	|| ""
));
const currentStoreName = computed(() => (
	stores.value.find((store) => store.id === effectiveStoreId.value)?.name
	|| "ยังไม่พบร้าน"
));
const storeCurrency = computed(() => (
	stores.value.find((store) => store.id === effectiveStoreId.value)?.currency?.trim()?.toUpperCase()
	|| "LAK"
));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	orders.value.length === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, orders.value.length));
const pageSummaryText = computed(() => (
	orders.value.length === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${orders.value.length} PO`
));

const validStoreIdSet = computed(() => new Set(stores.value.map((store) => store.id)));
const isHistoryRoute = computed(() => route.path.startsWith("/purchase-orders/history"));

watch([searchQuery, activeStatus, activePaymentStatus], () => {
	currentPage.value = 1;
	if (reloadTimer) clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		void loadOrders();
	}, 180);
});

watch(orders, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}

	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = "";
		detailOpen.value = false;
	}
}, { immediate: true });

watch(pageSize, () => {
	currentPage.value = 1;
});

onMounted(() => {
	void ensurePurchaseOrderAuthPermissionReady();
	void Promise.all([loadOrders(), loadProducts(), loadStores()]);
});

onBeforeUnmount(() => {
	if (reloadTimer) clearTimeout(reloadTimer);
});

function showToast(message: string) {
	appToast.info({ title: message });
}

async function ensurePurchaseOrderAuthPermissionReady() {
	hydrateAuthState();
	if (!accessToken.value) {
		authPermissionReady.value = true;
		return;
	}
	if (currentUser.value && currentAccess.value) {
		authPermissionReady.value = true;
		return;
	}
	try {
		await fetchMe();
	} catch {
		// permission resolution will fall back to hydrated state
	} finally {
		authPermissionReady.value = true;
	}
}

function formatMoney(value: number, currency = "THB") {
	return formatMoneyWithSymbol(value || 0, currency, { locale: "th-TH", maximumFractionDigits: 0 });
}

function formatPurchaseMoney(value: number, currency: string) {
	return formatMoneyWithSymbol(value || 0, currency || "LAK", { locale: "th-TH", maximumFractionDigits: 0 });
}

function formatPurchaseAmount(baseAmount: number, exchangeRate: number, currency: string) {
	const normalizedExchangeRate = Number(exchangeRate) > 0 ? Number(exchangeRate) : 1;
	const originalAmount = baseAmount / normalizedExchangeRate;
	return formatPurchaseMoney(originalAmount, currency);
}

function formatDate(value?: string | null) {
	if (!value) return "-";
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function toDatetimeLocalInput(value?: string | null) {
	if (!value) return "";
	const date = new Date(value);
	if (Number.isNaN(date.getTime())) return "";
	const timezoneOffset = date.getTimezoneOffset() * 60000;
	return new Date(date.getTime() - timezoneOffset).toISOString().slice(0, 16);
}

function statusColor(status: string) {
	if (status === "received") return "success";
	if (status === "ordered" || status === "shipped") return "info";
	if (status === "cancelled") return "error";
	return "warning";
}

function paymentStatusColor(status: string) {
	if (status === "paid") return "success";
	if (status === "partial") return "warning";
	return "neutral";
}

function productLabel(productId: string) {
	const product = products.value.find((item) => item.id === productId);
	return product ? `${product.name} · ${product.sku}` : "เลือกสินค้า";
}

function unitCostPlaceholder(productId: string) {
	void productId;
	return "กรอกราคาจริงจาก supplier";
}

function addLine() {
	createForm.items.push({
		id: crypto.randomUUID(),
		productId: "",
		qtyOrdered: "1",
		unitCost: "",
	});
}

function removeLine(lineId: string) {
	createForm.items = createForm.items.filter((line) => line.id !== lineId);
}

function resetPurchaseOrderForm() {
	createForm.storeId = effectiveStoreId.value;
	createForm.supplierName = "";
	createForm.supplierContact = "";
	createForm.purchaseCurrency = "LAK";
	createForm.exchangeRate = "1";
	createForm.shippingCost = "0";
	createForm.otherCost = "0";
	createForm.otherCostNote = "";
	createForm.expectedAt = "";
	createForm.note = "";
	createForm.createdBy = currentUser.value?.id || "";
	createForm.items = [];
	addLine();
}

function openCreateDrawer() {
	purchaseOrderFormMode.value = "create";
	editingPurchaseOrderId.value = null;
	purchaseOrderEditTargetStatus.value = "";
	purchaseOrderEditLoading.value = false;
	resetPurchaseOrderForm();
	createOpen.value = true;
	detailOpen.value = false;
}

function closeCreateDrawer() {
	createOpen.value = false;
	if (purchaseOrderFormMode.value === "edit" && selectedOrderId.value) {
		detailOpen.value = true;
	}
	purchaseOrderFormMode.value = "create";
	editingPurchaseOrderId.value = null;
	purchaseOrderEditTargetStatus.value = "";
	purchaseOrderEditLoading.value = false;
}

function hydratePurchaseOrderForm(detail: ApiPurchaseOrderDetail) {
	const exchangeRate = Number(detail.order.exchange_rate || 1) || 1;
	createForm.storeId = detail.order.store_id;
	createForm.supplierName = detail.order.supplier_name || "";
	createForm.supplierContact = detail.order.supplier_contact || "";
	createForm.purchaseCurrency = detail.order.purchase_currency || "LAK";
	createForm.exchangeRate = String(detail.order.exchange_rate_initial || exchangeRate || 1);
	createForm.shippingCost = String(detail.order.shipping_cost_original ?? (detail.order.shipping_cost / exchangeRate) ?? 0);
	createForm.otherCost = String(detail.order.other_cost_original ?? (detail.order.other_cost / exchangeRate) ?? 0);
	createForm.otherCostNote = detail.order.other_cost_note || "";
	createForm.expectedAt = toDatetimeLocalInput(detail.order.expected_at);
	createForm.note = detail.order.note || "";
	createForm.createdBy = detail.order.created_by || currentUser.value?.id || "";
	createForm.items = detail.items.map((item) => ({
		id: crypto.randomUUID(),
		productId: item.product_id,
		qtyOrdered: String(item.qty_ordered),
		unitCost: String(item.unit_cost_purchase),
	}));
	if (!createForm.items.length) {
		addLine();
	}
}

async function openEditDrawer(orderId?: string) {
	const targetOrderId = orderId
		|| selectedOrderDetail.value?.order.id
		|| selectedOrderId.value
		|| selectedOrder.value?.id
		|| "";
	if (!targetOrderId) return;

	const targetOrder = selectedOrderDetail.value?.order
		?? selectedOrder.value
		?? purchaseOrderDetailCache.value[targetOrderId]?.order
		?? null;
	if (!targetOrder || targetOrder.status === "received" || targetOrder.status === "cancelled") return;

	purchaseOrderFormMode.value = "edit";
	editingPurchaseOrderId.value = targetOrder.id;
	purchaseOrderEditTargetStatus.value = targetOrder.status;
	detailOpen.value = false;
	purchaseOrderEditLoading.value = true;
	await nextTick();
	createOpen.value = true;

	const cachedDetail = purchaseOrderDetailCache.value[targetOrderId];
	if (cachedDetail) {
		selectedOrderDetail.value = cachedDetail;
		hydratePurchaseOrderForm(cachedDetail);
		purchaseOrderEditLoading.value = false;
		return;
	}

	void loadOrderDetail(targetOrderId)
		.then(() => {
			if (purchaseOrderFormMode.value !== "edit" || editingPurchaseOrderId.value !== targetOrderId || !selectedOrderDetail.value) return;
			hydratePurchaseOrderForm(selectedOrderDetail.value);
		})
		.finally(() => {
			if (editingPurchaseOrderId.value === targetOrderId) {
				purchaseOrderEditLoading.value = false;
			}
		});
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	createOpen.value = false;
	detailOpen.value = true;
	const cachedDetail = purchaseOrderDetailCache.value[orderId];
	if (cachedDetail) {
		selectedOrderDetail.value = cachedDetail;
		detailError.value = null;
		detailPending.value = false;
	}
	void loadOrderDetail(orderId);
}

function closeDetail() {
	detailOpen.value = false;
	selectedOrderId.value = "";
	selectedOrderDetail.value = null;
	receiveOpen.value = false;
	receiveMode.value = "now";
	receiveLines.value = [];
	receiveSaving.value = false;
}

function openReceiveFlow() {
	if (!selectedOrderDetail.value || selectedOrderDetail.value.order.status === "received" || selectedOrderDetail.value.order.status === "cancelled") return;
	receiveMode.value = "now";
	receiveLines.value = selectedOrderDetail.value.items.map((item) => {
		const orderedQty = Number(item.qty_ordered || 0);
		const receivedQty = Number(item.qty_received || 0);
		const remainingQty = Math.max(0, orderedQty - receivedQty);
		return {
			itemId: item.id,
			productName: item.product_name || item.product_sku || "ไม่ระบุสินค้า",
			productSku: item.product_sku || null,
			orderedQty,
			receivedQty,
			remainingQty,
			receiveQty: String(remainingQty),
		};
	});
	receiveOpen.value = true;
}

function fillAllReceiveNow() {
	receiveLines.value = receiveLines.value.map((line) => ({
		...line,
		receiveQty: String(line.remainingQty),
	}));
}

function selectReceiveMode(mode: typeof receiveMode.value) {
	receiveMode.value = mode;
	if (mode === "now") {
		fillAllReceiveNow();
		return;
	}
	if (mode === "partial") {
		receiveLines.value = receiveLines.value.map((line) => ({
			...line,
			receiveQty: String(Math.max(0, Math.min(Number(line.receiveQty || 0), line.remainingQty))),
		}));
	}
}

async function confirmReceiveAllNow() {
	selectReceiveMode("now");
	await nextTick();
	await confirmReceiveSelectedOrder();
}

async function confirmReceiveSelectedOrder() {
	if (!selectedOrderDetail.value) return;
	if (receiveMode.value === "later") {
		receiveOpen.value = false;
		showToast("ยังไม่รับเข้าสต็อกตอนนี้");
		return;
	}
	if (receiveMode.value === "now") {
		fillAllReceiveNow();
		await nextTick();
	}
	const payloadItems = receiveLines.value
		.map((line) => ({
			item_id: line.itemId,
			qty_received: Number(line.receiveQty || 0),
		}))
		.filter((line) => Number.isFinite(line.qty_received) && line.qty_received > 0);
	if (!payloadItems.length) {
		showToast("กรอกจำนวนรับอย่างน้อย 1 รายการ");
		return;
	}
	receiveSaving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${selectedOrderDetail.value.order.id}/receive`, {
			method: "POST",
			body: { items: payloadItems },
		});
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[response.data.order.id] = response.data;
		showToast("รับสินค้าเข้าสต็อกแล้ว");
		receiveOpen.value = false;
		await loadOrders();
	} catch (err) {
		showToast(err instanceof Error ? err.message : "รับสินค้าไม่สำเร็จ");
	} finally {
		receiveSaving.value = false;
	}
}

function goToPage(page: number) {
	currentPage.value = Math.min(Math.max(page, 1), totalPages.value);
}

function updatePageSize(value: string) {
	const normalizedSize = Number(value);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
}

async function loadOrders() {
	ordersPending.value = true;
	ordersError.value = null;

	try {
		const params = new URLSearchParams();
		if (searchQuery.value.trim()) params.set("query", searchQuery.value.trim());
		if (activeStatus.value !== "all") params.set("status", activeStatus.value);
		if (activePaymentStatus.value !== "all") params.set("payment_status", activePaymentStatus.value);

		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderListItem[]>>(
			`/purchase-orders${params.toString() ? `?${params.toString()}` : ""}`,
		);
		orders.value = response.data;
		void prefetchOrderDetails(response.data.slice(0, 2).map((order) => order.id));
	} catch (err) {
		ordersError.value = err instanceof Error ? err.message : "โหลด purchase orders ไม่สำเร็จ";
	} finally {
		ordersPending.value = false;
	}
}

async function loadProducts() {
	productsPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<ApiProduct[]>>("/products");
		products.value = response.data;
		if (!createForm.storeId) {
			createForm.storeId = response.data[0]?.store_id || "";
		}
	} finally {
		productsPending.value = false;
	}
}

async function loadStores() {
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
		stores.value = response.data;
		await syncActiveStoreSelection(response.data);
	} catch {
		stores.value = [];
	}
}

async function syncActiveStoreSelection(storeRecords: StoreRecord[]) {
	const availableStoreId = storeRecords.find((store) => store.id === currentStoreId.value)?.id
		|| storeRecords[0]?.id
		|| "";

	if (!availableStoreId) return;

	if (currentStoreId.value !== availableStoreId) {
		try {
			await switchStore(availableStoreId);
		} catch {
			currentStoreId.value = availableStoreId;
		}
	}

	createForm.storeId = availableStoreId;
}

async function loadOrderDetail(id: string) {
	if (purchaseOrderDetailRequests.has(id)) return;
	purchaseOrderDetailRequests.add(id);
	detailPending.value = true;
	detailError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${id}`);
		selectedOrderDetail.value = response.data;
		purchaseOrderDetailCache.value[id] = response.data;
	} catch (err) {
		detailError.value = err instanceof Error ? err.message : "โหลดรายละเอียด PO ไม่สำเร็จ";
	} finally {
		detailPending.value = false;
		purchaseOrderDetailRequests.delete(id);
	}
}

async function prefetchOrderDetails(orderIds: string[]) {
	const uniqueOrderIds = Array.from(new Set(orderIds)).filter((id) => !!id && !purchaseOrderDetailCache.value[id] && !purchaseOrderDetailRequests.has(id));
	if (!uniqueOrderIds.length) return;

	const tasks = uniqueOrderIds.map(async (id) => {
		purchaseOrderDetailRequests.add(id);
		try {
			const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${id}`);
			purchaseOrderDetailCache.value[id] = response.data;
		} catch {
			// Ignore prefetch errors; the user can still open and retry normally.
		} finally {
			purchaseOrderDetailRequests.delete(id);
		}
	});

	await Promise.allSettled(tasks);
}

function buildPurchaseOrderPayload(status: "draft" | "ordered", includeCreator = true) {
	return {
		store_id: createForm.storeId,
		supplier_name: createForm.supplierName || null,
		supplier_contact: createForm.supplierContact || null,
		purchase_currency: createForm.purchaseCurrency,
		exchange_rate: Number(createForm.exchangeRate || 1),
		exchange_rate_initial: Number(createForm.exchangeRate || 1),
		shipping_cost: Number(createForm.shippingCost || 0),
		shipping_cost_original: Number(createForm.shippingCost || 0),
		shipping_cost_currency: createForm.purchaseCurrency,
		other_cost: Number(createForm.otherCost || 0),
		other_cost_original: Number(createForm.otherCost || 0),
		other_cost_currency: createForm.purchaseCurrency,
		other_cost_note: createForm.otherCostNote || null,
		expected_at: createForm.expectedAt ? new Date(createForm.expectedAt).toISOString() : null,
		note: createForm.note || null,
		status,
		...(includeCreator
			? {
					created_by: currentUser.value?.id || createForm.createdBy || null,
				}
			: {}),
		items: createForm.items.map((line) => ({
			product_id: line.productId,
			qty_ordered: Number(line.qtyOrdered),
			unit_cost_purchase: Number(line.unitCost || 0),
		})),
	};
}

async function submitCreate(status: "draft" | "ordered") {
	if (!createForm.storeId || !validStoreIdSet.value.has(createForm.storeId)) {
		showToast("ยังไม่มี store_id สำหรับสร้าง PO");
		return;
	}

	if (!createForm.items.length || createForm.items.some((line) => !line.productId || !line.qtyOrdered)) {
		showToast("กรอกสินค้าและจำนวนให้ครบ");
		return;
	}

	if (currentStoreId.value !== createForm.storeId) {
		try {
			await switchStore(createForm.storeId);
		} catch {
			currentStoreId.value = createForm.storeId;
		}
	}

	submitting.value = true;
	try {
		const payload = buildPurchaseOrderPayload(status);
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>("/purchase-orders", {
			method: "POST",
			body: payload,
		});

		showToast(status === "draft" ? "บันทึก Draft แล้ว" : "สร้าง Purchase Order แล้ว");
		createOpen.value = false;
		await loadOrders();
		openDetail(response.data.order.id);
	} catch (err) {
		showToast(err instanceof Error ? err.message : (status === "draft" ? "บันทึก Draft ไม่สำเร็จ" : "สร้าง PO ไม่สำเร็จ"));
	} finally {
		submitting.value = false;
	}
}

async function submitEditPurchaseOrder() {
	if (!editingPurchaseOrderId.value) return;
	if (!createForm.storeId || !validStoreIdSet.value.has(createForm.storeId)) {
		showToast("ยังไม่มี store_id สำหรับแก้ไข PO");
		return;
	}

	if (!createForm.items.length || createForm.items.some((line) => !line.productId || !line.qtyOrdered)) {
		showToast("กรอกสินค้าและจำนวนให้ครบ");
		return;
	}

	if (currentStoreId.value !== createForm.storeId) {
		try {
			await switchStore(createForm.storeId);
		} catch {
			currentStoreId.value = createForm.storeId;
		}
	}

	submitting.value = true;
	try {
		const payload = {
			...buildPurchaseOrderPayload("draft", false),
			updated_by: currentUser.value?.id || null,
		};
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${editingPurchaseOrderId.value}`, {
			method: "PATCH",
			body: payload,
		});

		showToast("บันทึกการแก้ไข PO แล้ว");
		createOpen.value = false;
		purchaseOrderFormMode.value = "create";
		editingPurchaseOrderId.value = null;
		purchaseOrderEditLoading.value = false;
		await loadOrders();
		openDetail(response.data.order.id);
	} catch (err) {
		showToast(err instanceof Error ? err.message : "บันทึกการแก้ไข PO ไม่สำเร็จ");
	} finally {
		submitting.value = false;
		purchaseOrderEditLoading.value = false;
	}
}
</script>

<template>
	<NuxtPage v-if="isHistoryRoute" />
	<AppSidebarShell
		v-else
		:nav-items="appNavItems"
		:active-ids="['purchase']"
		sidebar-eyebrow="Purchase"
		sidebar-title="สั่งซื้อ"
		sidebar-compact-title="PO"
		sidebar-description="จัดการ purchase orders, supplier, สถานะรับของ และต้นทุนก่อนเข้าสต็อก"
	>
			<template #default="{ openSidebar }">
				<div class="grid gap-3 pb-3 lg:gap-4">
					<AppPageHeader
						title="สั่งซื้อ"
						description="จัดการ Purchase Orders, supplier, สถานะรับของ และการชำระเงิน"
						@menu="openSidebar"
					>
						<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-2 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto_auto] lg:justify-end">
							<div class="relative min-w-0">
								<UInput
									v-model="searchQuery"
									size="lg"
									icon="i-heroicons-magnifying-glass-20-solid"
									placeholder="ค้นหาเลข PO, supplier หรือ contact"
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

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-clock-20-solid"
								class="justify-center rounded-md"
								aria-label="ประวัติ PO"
								title="ประวัติ PO"
								@click="navigateTo('/purchase-orders/history')"
							>
								<span class="hidden sm:inline">ประวัติ</span>
							</AppButton>

							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="justify-center rounded-md"
								:loading="ordersPending"
								:disabled="ordersPending"
								:spin-icon-on-loading="true"
								aria-label="รีโหลด"
								title="รีโหลด"
								@click="loadOrders"
							>
								<span class="hidden sm:inline">รีโหลด</span>
							</AppButton>

									<AppButton
										color="primary"
										variant="soft"
										size="md"
										icon="i-heroicons-plus-20-solid"
										class="justify-center rounded-md"
										:disabled="!authPermissionReady || !canCreatePurchaseOrder"
										aria-label="สร้าง PO"
										title="สร้าง PO"
										@click="openCreateDrawer"
									>
								<span class="hidden sm:inline">สร้าง PO</span>
							</AppButton>
						</div>
					</AppPageHeader>

					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-4 gap-2 p-0">
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">เปิดอยู่</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalOpenOrders) }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">Draft</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalDraftOrders) }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">ค้างชำระ</p>
								<p class="mt-1 text-base font-semibold text-stone-950 tabular-nums">{{ numberFormatter.format(totalPendingPayments) }}</p>
							</div>
							<div class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-center">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-500">มูลค่าประมาณ</p>
								<p class="mt-1 truncate text-base font-semibold text-stone-950 tabular-nums">{{ formatMoney(totalEstimated, storeCurrency) }}</p>
							</div>
						</div>
					</UCard>

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">ตัวกรอง</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ numberFormatter.format(orders.length) }} รายการ
								</div>
							</div>

								<div class="grid gap-2 px-4 py-3">
									<div class="grid gap-2 md:grid-cols-2 md:items-end">
										<div class="min-w-0">
											<label class="mb-1 block text-[11px] font-medium text-stone-500">สถานะ PO</label>
											<div class="relative">
												<select
													v-model="activeStatus"
													class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												>
													<option value="all">ทุกสถานะ</option>
													<option value="draft">Draft</option>
													<option value="ordered">Ordered</option>
													<option value="shipped">Shipped</option>
													<option value="received">Received</option>
													<option value="cancelled">Cancelled</option>
												</select>
												<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
											</div>
										</div>

										<div class="min-w-0">
											<label class="mb-1 block text-[11px] font-medium text-stone-500">สถานะชำระเงิน</label>
											<div class="relative">
												<select
													v-model="activePaymentStatus"
													class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												>
													<option value="all">ทุกการชำระ</option>
													<option value="unpaid">Unpaid</option>
													<option value="partial">Partial</option>
													<option value="paid">Paid</option>
												</select>
												<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
											</div>
										</div>
									</div>
								</div>

								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-y border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Purchase orders</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">เลือก PO เพื่อดูรายการสินค้า, payment และต้นทุนรวมแบบละเอียด</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ numberFormatter.format(orders.length) }} รายการ
								</div>
							</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
									<div v-if="ordersPending" class="min-h-[280px]">
										<AppInlineLoadingBar container-class="bg-neutral-100" />
									</div>
									<div v-else-if="ordersError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
										<div class="space-y-3">
											<p class="text-sm text-stone-600">{{ ordersError }}</p>
											<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadOrders">ลองใหม่</AppButton>
										</div>
									</div>
									<div v-else-if="!orders.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
										ยังไม่มี purchase order
									</div>
									<table v-else class="min-w-[1120px] w-full border-separate border-spacing-0">
										<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
											<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
												<th class="border-b border-[#ece6dc] px-4 py-3">PO</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">Supplier</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">สถานะ</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">ชำระ</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">รายการ</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">สั่งรวม</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">คาดรับ</th>
												<th class="border-b border-[#ece6dc] px-4 py-3">มูลค่า</th>
												<th class="border-b border-[#ece6dc] px-4 py-3 text-right">Action</th>
											</tr>
										</thead>
										<tbody>
											<tr
												v-for="order in paginatedOrders"
												:key="order.id"
												class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
												:class="selectedOrderId === order.id ? 'bg-primary-50' : 'bg-white'"
												@pointerenter="prefetchOrderDetails([order.id])"
												@click="openDetail(order.id)"
											>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<p class="font-semibold text-stone-950">{{ order.po_number }}</p>
													<p class="mt-1 text-xs text-stone-400">สร้างเมื่อ {{ formatDate(order.created_at) }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<p class="font-medium text-stone-900">{{ order.supplier_name || "ไม่ระบุ supplier" }}</p>
													<p v-if="order.supplier_contact" class="mt-1 text-xs text-stone-500">{{ order.supplier_contact }}</p>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<UBadge :color="statusColor(order.status)" variant="soft" :label="order.status" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<UBadge :color="paymentStatusColor(order.payment_status)" variant="soft" :label="order.payment_status" />
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-900 tabular-nums">
													{{ numberFormatter.format(order.item_count) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-900 tabular-nums">
													{{ numberFormatter.format(order.total_qty_ordered) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
													{{ formatDate(order.expected_at) }}
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4">
													<div class="text-right">
														<p class="font-semibold text-stone-950 tabular-nums">
															{{ formatPurchaseAmount(order.total_estimated_base, order.exchange_rate, order.purchase_currency) }}
														</p>
														<p class="mt-1 text-xs text-stone-500">
															{{ formatMoney(order.total_estimated_base, storeCurrency) }} แปลงเป็น base
														</p>
													</div>
												</td>
												<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
													<AppButton
														color="neutral"
														variant="soft"
														size="md"
														class="rounded-md"
														icon="i-heroicons-chevron-right-20-solid"
														@click.stop="prefetchOrderDetails([order.id]); openDetail(order.id)"
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
												:disabled="currentPage <= 1 || ordersPending"
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
												icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || ordersPending"
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
					</div>

					<AppResponsivePanel
						v-model="detailOpen"
						title="รายละเอียด PO"
					description="ดูสรุป, รายการสินค้า และ payment ของ purchase order นี้"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
					@close="closeDetail"
				>
					<template #default>
						<div class="flex h-full min-h-0 flex-col">
							<div class="scrollbar-soft min-h-0 flex-1 space-y-3 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
							<div v-if="selectedOrder" class="relative rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-start gap-3">
								<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
									<UIcon name="i-heroicons-clipboard-document-list" class="h-5 w-5" />
								</div>
								<div class="min-w-0 flex-1">
									<div class="flex flex-wrap items-start justify-between gap-3">
										<div class="min-w-0">
											<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedOrder.po_number }}</h3>
											<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrder.supplier_name || "ไม่ระบุ supplier" }}</p>
										</div>
										<div class="flex shrink-0 flex-wrap items-center gap-2">
											<UBadge :color="statusColor(selectedOrder.status)" variant="soft" :label="selectedOrder.status" />
											<AppButton
												v-if="selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled'"
												color="neutral"
												variant="soft"
												size="sm"
												icon="i-heroicons-pencil-square-20-solid"
												class="rounded-md"
												:disabled="!authPermissionReady || !canUpdatePurchaseOrder"
												@click="openEditDrawer(selectedOrder.id)"
											>
												{{ selectedOrder.status === 'draft' ? 'แก้ไข' : 'แก้ไขต้นทุน' }}
											</AppButton>
										</div>
									</div>
									<div class="mt-3 flex flex-wrap gap-2">
										<UBadge :color="paymentStatusColor(selectedOrder.payment_status)" variant="soft" :label="selectedOrder.payment_status" />
										<UBadge color="neutral" variant="soft" :label="getCurrencySymbol(selectedOrder.purchase_currency) || selectedOrder.purchase_currency" />
										<UBadge color="neutral" variant="soft" :label="`${selectedOrder.item_count} รายการ`" />
									</div>
									<div class="mt-4 flex flex-wrap gap-2">
										<AppButton
											v-if="selectedOrder.status !== 'draft' && selectedOrder.status !== 'received' && selectedOrder.status !== 'cancelled'"
											color="primary"
											variant="soft"
											size="md"
											icon="i-heroicons-arrow-down-tray-20-solid"
											class="rounded-md"
											:disabled="!canReceivePurchaseOrder"
											@click="openReceiveFlow"
										>
											รับของเข้าสต็อก
										</AppButton>
									</div>
									<div v-if="detailPending" class="pointer-events-none absolute inset-x-0 bottom-0">
										<AppInlineLoadingBar minimal container-class="bg-transparent" />
									</div>
								</div>
							</div>
						</div>

							<template v-if="detailPending">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">Supplier</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">คาดรับ</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">ต้นทุนรวม</dt>
											<dd class="text-right font-medium text-stone-900">-</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">หมายเหตุ</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">-</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">รายการสินค้า</h3>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[72px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">Payments</h3>
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="index in 2" :key="index" class="min-h-[64px] rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200" />
									</div>
								</div>
							</template>
							<UCard v-else-if="detailError" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
								<div class="space-y-3 py-10 text-center">
									<p class="text-sm text-stone-600">{{ detailError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="selectedOrderId && loadOrderDetail(selectedOrderId)">ลองใหม่</AppButton>
								</div>
							</UCard>
							<template v-else-if="selectedOrderDetail">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
									<dl class="mt-4 space-y-3 text-sm">
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">Supplier</dt>
											<dd class="text-right font-medium text-stone-900">{{ selectedOrderDetail.order.supplier_name || "-" }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">คาดรับ</dt>
											<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrderDetail.order.expected_at) }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
											<dt class="text-stone-500">ต้นทุนรวม</dt>
											<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrderDetail.order.total_estimated_base, storeCurrency) }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">หมายเหตุ</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">{{ selectedOrderDetail.order.note || "-" }}</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">รายการสินค้า</h3>
										<UBadge color="neutral" variant="soft" :label="`${selectedOrderDetail.items.length} lines`" />
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="item in selectedOrderDetail.items" :key="item.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ item.product_name || item.product_id }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ item.product_sku || "-" }} · {{ item.unit_name || "base unit" }}</p>
												</div>
												<p class="text-sm font-semibold text-stone-900">{{ formatMoney(item.unit_cost_base, storeCurrency) }}</p>
											</div>
											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge color="neutral" variant="soft" :label="`สั่ง ${numberFormatter.format(item.qty_ordered)}`" />
												<UBadge color="neutral" variant="soft" :label="`รับแล้ว ${numberFormatter.format(item.qty_received)}`" />
												<UBadge color="neutral" variant="soft" :label="`คงเหลือ ${numberFormatter.format(Math.max(0, item.qty_ordered - item.qty_received))}`" />
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">Payments</h3>
										<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="selectedOrderDetail.order.payment_status" />
									</div>
									<div v-if="selectedOrderDetail.payments.length" class="mt-4 space-y-3">
										<div v-for="payment in selectedOrderDetail.payments" :key="payment.id" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-900">{{ payment.entry_type }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ formatDate(payment.paid_at) }}</p>
												</div>
												<p class="text-sm font-semibold text-stone-900">{{ formatMoney(payment.amount_base, storeCurrency) }}</p>
											</div>
										</div>
									</div>
									<div v-else class="mt-4 rounded-md bg-white px-4 py-4 text-sm text-stone-500 ring-1 ring-neutral-200">
										ยังไม่มี payment entry
									</div>
								</div>
								</template>
							</div>
						</div>
					</template>
					</AppResponsivePanel>

					<AppResponsivePanel
						v-model="receiveOpen"
						title="รับสินค้าเข้าสต็อก"
						description="รับครบตอนนี้หรือรับบางส่วนแล้วกลับมารับต่อภายหลังได้"
						desktop-width="680px"
						close-button-size="md"
						compact-header
						full-bleed-header
						content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
						@close="receiveOpen = false"
					>
						<template #default>
							<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
								<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-1 sm:py-2">
									<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex items-center gap-2">
													<UIcon name="i-heroicons-clipboard-document-check-20-solid" class="h-4 w-4 text-primary-600" />
													<h3 class="text-sm font-semibold text-stone-950">เลือกวิธีรับสินค้า</h3>
												</div>
												<p class="mt-1 text-xs leading-5 text-stone-600">
													เลือกแบบที่ตรงกับสถานการณ์ตอนนี้ แล้วค่อยกดยืนยันเพียงครั้งเดียว
												</p>
											</div>
											<UBadge
												color="neutral"
												variant="soft"
												:label="receiveMode === 'now' ? 'รับครบ' : receiveMode === 'partial' ? 'รับบางส่วน' : 'ยังไม่รับ'"
											/>
										</div>
										<div class="mt-4 grid gap-2 md:grid-cols-3">
											<button
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'now'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('now')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">รับเข้าสต็อกตอนนี้</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">รับครบทั้งหมดและอัปเดต stock ทันที</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'now' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
											<button
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'partial'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('partial')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">รับบางส่วน</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">รับแค่จำนวนที่มาถึง แล้วกลับมารับต่อภายหลัง</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'partial' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
											<button
												type="button"
												class="group rounded-md border px-4 py-3 text-left transition"
												:class="receiveMode === 'later'
													? 'border-primary-300 bg-primary-50 ring-1 ring-primary-200'
													: 'border-neutral-200 bg-white hover:border-primary-200 hover:bg-primary-50/50'"
												@click="selectReceiveMode('later')"
											>
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="text-sm font-semibold text-stone-950">ยังไม่รับตอนนี้</p>
														<p class="mt-1 text-xs leading-5 text-stone-600">เก็บ PO ไว้ก่อน ยังไม่ตัด stock ตอนนี้</p>
													</div>
													<div
														class="mt-0.5 h-4 w-4 shrink-0 rounded-full border"
														:class="receiveMode === 'later' ? 'border-primary-600 bg-primary-600' : 'border-neutral-300 bg-white'"
													/>
												</div>
											</button>
										</div>
										<div class="mt-3 rounded-md border border-dashed border-neutral-200 bg-white px-4 py-3 text-xs leading-5 text-stone-600">
											<span v-if="receiveMode === 'now'">ระบบจะรับจำนวนที่ค้างทั้งหมดเข้าสต็อกทันที</span>
											<span v-else-if="receiveMode === 'partial'">กรอกจำนวนรับจริงในแต่ละรายการ แล้วระบบจะรับเข้า stock ตามจำนวนที่ใส่</span>
											<span v-else>PO จะยังไม่ตัด stock ตอนนี้ คุณกลับมารับภายหลังได้จาก modal เดิม</span>
										</div>
									</div>

									<div v-if="selectedOrderDetail" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<h3 class="text-sm font-semibold text-stone-950">รายละเอียด PO</h3>
										<dl class="mt-4 space-y-3 text-sm">
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">เลข PO</dt>
												<dd class="text-right font-medium text-stone-900">{{ selectedOrderDetail.order.po_number }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
												<dt class="text-stone-500">Supplier</dt>
												<dd class="text-right font-medium text-stone-900">{{ selectedOrderDetail.order.supplier_name || "ไม่ระบุ supplier" }}</dd>
											</div>
											<div class="flex items-start justify-between gap-4">
												<dt class="text-stone-500">รายการ / หน่วย</dt>
												<dd class="text-right font-medium text-stone-900">
													{{ numberFormatter.format(selectedOrderDetail.items.length) }} รายการ · {{ numberFormatter.format(selectedOrderDetail.order.total_qty_ordered) }} หน่วย
												</dd>
											</div>
										</dl>
									</div>

									<div v-if="receiveLines.length && receiveMode === 'partial'" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">รับเข้าสต็อกทีละรายการ</h3>
											<UBadge color="neutral" variant="soft" :label="`${receiveLines.length} lines`" />
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="line in receiveLines" :key="line.itemId" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-stone-900">{{ line.productName }}</p>
														<p v-if="line.productSku" class="mt-1 text-xs text-stone-500">{{ line.productSku }}</p>
														<p class="mt-1 text-xs text-stone-500">
															สั่ง {{ numberFormatter.format(line.orderedQty) }} · รับแล้ว {{ numberFormatter.format(line.receivedQty) }} · เหลือ {{ numberFormatter.format(line.remainingQty) }}
														</p>
													</div>
												</div>
												<div class="mt-3">
													<label class="mb-2 block text-xs font-medium text-stone-500">รับจำนวน</label>
													<UInput
														v-model="line.receiveQty"
														type="number"
														min="0"
														step="1"
														size="lg"
														color="neutral"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>
											</div>
										</div>
									</div>
									<div v-else-if="receiveLines.length" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
										<div class="flex items-center justify-between gap-2">
											<h3 class="text-sm font-semibold text-stone-950">รายการสินค้า</h3>
											<UBadge color="neutral" variant="soft" :label="`${receiveLines.length} lines`" />
										</div>
										<div class="mt-4 space-y-3">
											<div v-for="line in receiveLines" :key="line.itemId" class="rounded-md bg-white px-4 py-3 ring-1 ring-neutral-200">
												<div class="flex items-start justify-between gap-3">
													<div class="min-w-0">
														<p class="truncate text-sm font-semibold text-stone-900">{{ line.productName }}</p>
														<p v-if="line.productSku" class="mt-1 text-xs text-stone-500">{{ line.productSku }}</p>
														<p class="mt-1 text-xs text-stone-500">
															สั่ง {{ numberFormatter.format(line.orderedQty) }} · รับแล้ว {{ numberFormatter.format(line.receivedQty) }} · เหลือ {{ numberFormatter.format(line.remainingQty) }}
														</p>
													</div>
												</div>
											</div>
										</div>
									</div>
								</div>

								<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
									<div class="grid w-full grid-cols-2 gap-2">
										<AppButton color="neutral" variant="soft" size="md" :block="true" @click="receiveOpen = false">ยกเลิก</AppButton>
										<AppButton
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-arrow-down-tray-20-solid"
											:loading="receiveSaving"
											:spin-icon-on-loading="true"
											:disabled="receiveSaving || !selectedOrderDetail || (receiveMode === 'partial' && !receiveLines.length)"
											:block="true"
											@click="confirmReceiveSelectedOrder"
										>
											{{ receiveMode === 'now' ? 'ยืนยันรับเข้าสต็อก' : receiveMode === 'partial' ? 'ยืนยันรับบางส่วน' : 'ยืนยันเพื่อปิด' }}
										</AppButton>
									</div>
								</div>
							</div>
						</template>
					</AppResponsivePanel>

					<AppResponsivePanel
						v-model="createOpen"
						:title="purchaseOrderFormMode === 'edit'
							? (purchaseOrderCostOnlyEdit ? 'แก้ไขต้นทุน PO' : 'แก้ไข PO')
							: 'สร้าง PO ใหม่'"
						:description="purchaseOrderFormMode === 'edit'
							? (purchaseOrderCostOnlyEdit
								? 'ปรับ rate, shipping และค่าใช้จ่ายอื่นของ PO ที่สั่งแล้ว'
								: 'ปรับ supplier, รายการสินค้า และต้นทุนของ draft PO นี้')
							: 'ระบุ supplier, กำหนดรายการสินค้า และต้นทุนต่อหน่วย'"
						desktop-width="680px"
						close-button-size="md"
						compact-header
						full-bleed-header
						content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
						@close="closeCreateDrawer"
					>
						<template #default>
							<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
								<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-1 sm:py-2">
									<div class="flex items-center gap-2 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-stone-700">
										<UIcon name="i-heroicons-building-storefront-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
										<span class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">ร้าน</span>
										<UBadge color="neutral" variant="soft" class="max-w-full">
											<span class="truncate">{{ currentStoreName }}</span>
										</UBadge>
									</div>
									<div v-if="purchaseOrderFormMode === 'edit' && purchaseOrderEditLoading" class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
										<AppInlineLoadingBar minimal container-class="bg-transparent" />
									</div>
									<div v-if="purchaseOrderCostOnlyEdit" class="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900">
										สถานะนี้แก้ได้เฉพาะ <span class="font-medium">rate / shipping / other cost</span> และหมายเหตุเท่านั้น
									</div>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">ข้อมูล PO</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">กรอก supplier, สกุลเงิน และวันคาดรับของ</p>
												</div>
												<UBadge color="neutral" variant="soft" :label="createForm.purchaseCurrency" />
											</div>

											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Supplier</label>
													<UInput
														v-model="createForm.supplierName"
														type="text"
														size="lg"
														color="neutral"
														placeholder="ชื่อ supplier"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Supplier contact</label>
													<UInput
														v-model="createForm.supplierContact"
														type="text"
														size="lg"
														color="neutral"
														placeholder="เบอร์โทร/ช่องทางติดต่อ"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
											</div>

											<div class="grid gap-4 sm:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Currency</label>
													<div class="relative">
														<select
															v-model="createForm.purchaseCurrency"
															class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
															:disabled="purchaseOrderCostOnlyEdit"
														>
															<option value="LAK">LAK</option>
															<option value="THB">THB</option>
															<option value="USD">USD</option>
														</select>
														<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
													</div>
												</div>
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">Expected at</label>
													<UInput
														v-model="createForm.expectedAt"
														type="datetime-local"
														size="lg"
														color="neutral"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
														:disabled="purchaseOrderCostOnlyEdit"
													/>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">อัตราแลกเปลี่ยนและค่าใช้จ่ายเพิ่มเติม</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">
														{{ purchaseOrderCostOnlyEdit ? "แก้ rate / shipping / ค่าใช้จ่ายอื่นได้ก่อนรับของ" : "กรอก rate แบบประมาณได้ แล้วค่อยปรับตอน settle จริง" }}
													</p>
												</div>
												<UBadge color="neutral" variant="soft" label="Optional" />
											</div>

											<div class="grid gap-4 md:grid-cols-2">
												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">อัตราแลกเปลี่ยน (ประมาณ)</label>
													<UInput
														v-model="createForm.exchangeRate"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="เช่น 1 หรือ 21500"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
													<p class="mt-1 text-xs leading-5 text-stone-500">ถ้ายังไม่รู้ rate ตอนสร้าง PO ให้ปล่อยค่าเดิมไว้ได้</p>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ค่าขนส่ง (ประมาณ)</label>
													<UInput
														v-model="createForm.shippingCost"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
													<p class="mt-1 text-xs leading-5 text-stone-500">กรอกตอนรู้ค่าขนส่งจริงหลังของมาถึงลาวได้</p>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">ค่าใช้จ่ายอื่น (ประมาณ)</label>
													<UInput
														v-model="createForm.otherCost"
														type="text"
														inputmode="decimal"
														pattern="[0-9.,-]*"
														size="lg"
														color="neutral"
														placeholder="0"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>

												<div>
													<label class="mb-2 block text-xs font-medium text-stone-500">หมายเหตุค่าใช้จ่ายอื่น</label>
													<UInput
														v-model="createForm.otherCostNote"
														type="text"
														size="lg"
														color="neutral"
														placeholder="เช่น fee, customs, handling"
														class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
													/>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-950">รายการสินค้า</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">ใส่เฉพาะสินค้าที่จะเข้าสต็อก</p>
													<p class="mt-1 text-xs leading-5 text-stone-500">กรอกต้นทุนจริงจาก Lazada / Taobao / Supplier ในแต่ละรายการ</p>
												</div>
												<AppButton
													v-if="!purchaseOrderCostOnlyEdit"
													color="neutral"
													variant="soft"
													size="md"
													class="rounded-md"
													icon="i-heroicons-plus-20-solid"
													label="เพิ่มรายการ"
													@click="addLine"
												/>
											</div>

											<div class="space-y-3">
												<div v-for="line in createForm.items" :key="line.id" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
													<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto]">
														<div>
															<label class="mb-2 block text-xs font-medium text-stone-500">สินค้า</label>
															<div class="relative">
														<select
															v-model="line.productId"
															class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
															:disabled="purchaseOrderCostOnlyEdit"
														>
																	<option value="" disabled>{{ productsPending ? "กำลังโหลดสินค้า..." : "เลือกสินค้า" }}</option>
																	<option v-for="product in products" :key="product.id" :value="product.id">{{ productLabel(product.id) }}</option>
																</select>
																<UIcon name="i-heroicons-chevron-up-down" class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
															</div>
														</div>
														<div>
															<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน</label>
																<UInput
																v-model="line.qtyOrdered"
																type="number"
																min="1"
																step="1"
																size="lg"
																color="neutral"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
																:disabled="purchaseOrderCostOnlyEdit"
															/>
														</div>
														<div>
															<label class="mb-2 block text-xs font-medium text-stone-500">ต้นทุนจริง/หน่วย</label>
															<UInput
																v-model="line.unitCost"
																type="number"
																min="0"
																step="0.01"
																size="lg"
																color="neutral"
																:placeholder="unitCostPlaceholder(line.productId)"
																class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
																:disabled="purchaseOrderCostOnlyEdit"
															/>
														</div>
														<div v-if="!purchaseOrderCostOnlyEdit" class="flex items-end self-end pb-[2px]">
															<AppButton color="neutral" variant="soft" size="md" class="h-[42px] rounded-md" icon="i-heroicons-trash-20-solid" aria-label="ลบรายการ" title="ลบรายการ" @click="removeLine(line.id)" />
														</div>
													</div>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
										<div class="space-y-2">
											<label class="block text-xs font-medium text-stone-500">หมายเหตุ</label>
											<textarea
												v-model="createForm.note"
												rows="4"
												placeholder="รายละเอียดเพิ่มเติม (ถ้ามี)"
												class="w-full resize-none rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											/>
										</div>
									</UCard>
								</div>

								<div
									class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm"
									:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
								>
											<div class="grid w-full gap-2" :class="purchaseOrderFormMode === 'edit' ? 'grid-cols-2' : 'grid-cols-3'">
										<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeCreateDrawer">ยกเลิก</AppButton>
										<template v-if="purchaseOrderFormMode === 'edit'">
											<AppButton
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-pencil-square-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canUpdatePurchaseOrder"
												:block="true"
												@click="submitEditPurchaseOrder"
											>
												{{ purchaseOrderCostOnlyEdit ? 'บันทึกต้นทุน' : 'บันทึกการแก้ไข' }}
											</AppButton>
										</template>
										<template v-else>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												icon="i-heroicons-bookmark-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canCreatePurchaseOrder"
												:block="true"
												@click="submitCreate('draft')"
											>
												บันทึก Draft
											</AppButton>
											<AppButton
												color="primary"
												variant="solid"
												size="md"
												icon="i-heroicons-check-20-solid"
												:loading="submitting"
												:spin-icon-on-loading="true"
												:disabled="submitting || !authPermissionReady || !canCreatePurchaseOrder"
												:block="true"
												@click="submitCreate('ordered')"
											>
												สร้าง PO
											</AppButton>
										</template>
									</div>
								</div>
							</div>
						</template>
					</AppResponsivePanel>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="translate-y-3 opacity-0"
				enter-to-class="translate-y-0 opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="translate-y-0 opacity-100"
				leave-to-class="translate-y-3 opacity-0"
			>
				<div
					v-if="toast"
					class="fixed bottom-6 left-1/2 z-[70] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-md bg-[rgba(28,25,23,0.92)] px-4 py-3 text-sm text-white shadow-[0_18px_40px_rgba(15,23,42,0.22)] ring-1 ring-white/10 backdrop-blur lg:left-auto lg:right-6 lg:w-[min(420px,calc(100%-2rem))] lg:translate-x-0"
				>
					{{ toast }}
				</div>
			</Transition>
		</template>
	</AppSidebarShell>
</template>
