<script setup lang="ts">
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
	amount_base: number;
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

type ApiProduct = {
	id: string;
	store_id: string;
	sku: string;
	name: string;
	base_unit_id: string;
	cost_base: number;
};

type CreateLine = {
	id: string;
	productId: string;
	qtyOrdered: string;
	unitCost: string;
};

const runtimeConfig = useRuntimeConfig();
const { apiFetch } = useApiClient();
const { can } = useAuthSession();

const searchQuery = ref("");
const activeStatus = ref("all");
const activePaymentStatus = ref("all");

const orders = ref<ApiPurchaseOrderListItem[]>([]);
const ordersPending = ref(true);
const ordersError = ref<string | null>(null);

const products = ref<ApiProduct[]>([]);
const productsPending = ref(true);

const selectedOrderId = ref("");
const selectedOrderDetail = ref<ApiPurchaseOrderDetail | null>(null);
const detailPending = ref(false);
const detailError = ref<string | null>(null);

const detailOpen = ref(false);
const createOpen = ref(false);
const submitting = ref(false);
const toast = ref("");
const canCreatePurchaseOrder = computed(() => can("purchase_orders.create"));

const createForm = reactive({
	storeId: "",
	supplierName: "",
	supplierContact: "",
	purchaseCurrency: "LAK",
	expectedAt: "",
	note: "",
	createdBy: "Lina Punk",
	items: [] as CreateLine[],
});

const numberFormatter = new Intl.NumberFormat("th-TH");
const moneyFormatter = new Intl.NumberFormat("th-TH", {
	style: "currency",
	currency: "THB",
	maximumFractionDigits: 0,
});
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});

let reloadTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

const selectedOrder = computed(() =>
	orders.value.find((order) => order.id === selectedOrderId.value) ?? null,
);

const totalOpenOrders = computed(() => orders.value.filter((order) => order.status !== "received" && order.status !== "cancelled").length);
const totalDraftOrders = computed(() => orders.value.filter((order) => order.status === "draft").length);
const totalPendingPayments = computed(() => orders.value.filter((order) => order.payment_status !== "paid").length);
const totalEstimated = computed(() => orders.value.reduce((sum, order) => sum + Number(order.total_estimated_base || 0), 0));

watch([searchQuery, activeStatus, activePaymentStatus], () => {
	if (reloadTimer) clearTimeout(reloadTimer);
	reloadTimer = setTimeout(() => {
		void loadOrders();
	}, 180);
});

watch(selectedOrderId, (id) => {
	if (!id) return;
	if (detailOpen.value) {
		void loadOrderDetail(id);
	}
});

watch(orders, (value) => {
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}

	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = value[0].id;
	}
}, { immediate: true });

onMounted(() => {
	void Promise.all([loadOrders(), loadProducts()]);
});

onBeforeUnmount(() => {
	if (reloadTimer) clearTimeout(reloadTimer);
	if (toastTimer) clearTimeout(toastTimer);
});

function showToast(message: string) {
	toast.value = message;
	if (toastTimer) clearTimeout(toastTimer);
	toastTimer = setTimeout(() => {
		toast.value = "";
	}, 2200);
}

function formatMoney(value: number, currency = "THB") {
	try {
		return new Intl.NumberFormat("th-TH", {
			style: "currency",
			currency,
			maximumFractionDigits: 0,
		}).format(value || 0);
	} catch {
		return moneyFormatter.format(value || 0);
	}
}

function formatDate(value?: string | null) {
	if (!value) return "-";
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function statusColor(status: string) {
	if (status === "received") return "green";
	if (status === "ordered" || status === "shipped") return "blue";
	if (status === "cancelled") return "red";
	return "orange";
}

function paymentStatusColor(status: string) {
	if (status === "paid") return "green";
	if (status === "partial") return "orange";
	return "gray";
}

function productLabel(productId: string) {
	const product = products.value.find((item) => item.id === productId);
	return product ? `${product.name} · ${product.sku}` : "เลือกสินค้า";
}

function unitCostPlaceholder(productId: string) {
	const product = products.value.find((item) => item.id === productId);
	return product ? String(Number(product.cost_base || 0)) : "0";
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

function syncCostFromProduct(line: CreateLine) {
	const product = products.value.find((item) => item.id === line.productId);
	if (product && !line.unitCost) {
		line.unitCost = String(Number(product.cost_base || 0));
	}
}

function resetCreateForm() {
	createForm.storeId = products.value[0]?.store_id || orders.value[0]?.store_id || "";
	createForm.supplierName = "";
	createForm.supplierContact = "";
	createForm.purchaseCurrency = "LAK";
	createForm.expectedAt = "";
	createForm.note = "";
	createForm.createdBy = "Lina Punk";
	createForm.items = [];
	addLine();
}

function openCreateDrawer() {
	resetCreateForm();
	createOpen.value = true;
	detailOpen.value = false;
}

function closeCreateDrawer() {
	createOpen.value = false;
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	createOpen.value = false;
	detailOpen.value = true;
	void loadOrderDetail(orderId);
}

function closeDetail() {
	detailOpen.value = false;
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

async function loadOrderDetail(id: string) {
	detailPending.value = true;
	detailError.value = null;

	try {
		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>(`/purchase-orders/${id}`);
		selectedOrderDetail.value = response.data;
	} catch (err) {
		detailError.value = err instanceof Error ? err.message : "โหลดรายละเอียด PO ไม่สำเร็จ";
	} finally {
		detailPending.value = false;
	}
}

async function submitCreate() {
	if (!createForm.storeId) {
		showToast("ยังไม่มี store_id สำหรับสร้าง PO");
		return;
	}

	if (!createForm.items.length || createForm.items.some((line) => !line.productId || !line.qtyOrdered)) {
		showToast("กรอกสินค้าและจำนวนให้ครบ");
		return;
	}

	submitting.value = true;
	try {
		const payload = {
			store_id: createForm.storeId,
			supplier_name: createForm.supplierName || null,
			supplier_contact: createForm.supplierContact || null,
			purchase_currency: createForm.purchaseCurrency,
			expected_at: createForm.expectedAt ? new Date(createForm.expectedAt).toISOString() : null,
			note: createForm.note || null,
			created_by: createForm.createdBy || null,
			items: createForm.items.map((line) => ({
				product_id: line.productId,
				qty_ordered: Number(line.qtyOrdered),
				unit_cost_purchase: Number(line.unitCost || unitCostPlaceholder(line.productId) || 0),
			})),
		};

		const response = await apiFetch<ApiEnvelope<ApiPurchaseOrderDetail>>("/purchase-orders", {
			method: "POST",
			body: payload,
		});

		showToast("สร้าง Purchase Order แล้ว");
		createOpen.value = false;
		await loadOrders();
		openDetail(response.data.order.id);
	} catch (err) {
		showToast(err instanceof Error ? err.message : "สร้าง PO ไม่สำเร็จ");
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['purchase']"
		sidebar-eyebrow="Purchase"
		sidebar-title="สั่งซื้อ"
		sidebar-compact-title="PO"
		sidebar-description="จัดการ purchase orders, supplier, สถานะรับของ และต้นทุนก่อนเข้าสต็อก"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="space-y-4">
						<div class="flex items-start gap-3">
							<UButton color="gray" variant="soft" size="lg" class="justify-center lg:hidden" icon="i-heroicons-bars-3-20-solid" aria-label="เปิดเมนู" title="เปิดเมนู" @click="openSidebar" />
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<UBadge color="orange" variant="soft" label="Purchase Orders" />
									<UBadge color="gray" variant="soft" :label="`${numberFormatter.format(orders.length)} รายการ`" />
								</div>
								<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">สั่งซื้อสินค้า</h1>
								<p class="mt-1 text-sm text-stone-500">หน้าเริ่มต้นสำหรับจัดการ PO, supplier และวางแผนรับของเข้าร้าน</p>
							</div>
						</div>

						<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
							<div class="relative">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
									placeholder="ค้นหาเลข PO, supplier หรือ contact"
									class="w-full rounded-2xl border border-[#e7e4dd] bg-white py-3 pl-11 pr-10 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
								>
								<button
									v-if="searchQuery"
									type="button"
									class="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-[#f5f5f4] hover:text-stone-700"
									@click="searchQuery = ''"
								>
									<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
								</button>
							</div>

							<select v-model="activeStatus" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option value="all">ทุกสถานะ</option>
								<option value="draft">Draft</option>
								<option value="ordered">Ordered</option>
								<option value="shipped">Shipped</option>
								<option value="received">Received</option>
								<option value="cancelled">Cancelled</option>
							</select>

							<select v-model="activePaymentStatus" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option value="all">ทุกการชำระ</option>
								<option value="unpaid">Unpaid</option>
								<option value="partial">Partial</option>
								<option value="paid">Paid</option>
							</select>

							<UButton color="orange" variant="solid" size="lg" icon="i-heroicons-plus-20-solid" label="สร้าง PO" :disabled="!canCreatePurchaseOrder" @click="openCreateDrawer" />
						</div>

						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">เปิดอยู่</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(totalOpenOrders) }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Draft</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(totalDraftOrders) }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">ค้างชำระ</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(totalPendingPayments) }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">มูลค่าประมาณ</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ formatMoney(totalEstimated, "THB") }}</p>
							</div>
						</div>
					</div>
				</UCard>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<UCard v-if="ordersPending" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
						<div class="py-12 text-center text-sm text-stone-500">กำลังโหลด purchase orders…</div>
					</UCard>

					<UCard v-else-if="ordersError" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
						<div class="space-y-3 py-10 text-center">
							<p class="text-sm text-stone-600">{{ ordersError }}</p>
							<UButton color="orange" variant="soft" @click="loadOrders">ลองใหม่</UButton>
						</div>
					</UCard>

					<div v-else-if="orders.length" class="space-y-3">
						<button
							v-for="order in orders"
							:key="order.id"
							type="button"
							class="w-full rounded-[24px] border border-[#e7e4dd] bg-white p-4 text-left shadow-sm transition hover:shadow-md"
							:class="selectedOrderId === order.id ? 'ring-2 ring-[#f3c7a7]' : ''"
							@click="openDetail(order.id)"
						>
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<UBadge :color="statusColor(order.status)" variant="soft" :label="order.status" />
										<UBadge :color="paymentStatusColor(order.payment_status)" variant="soft" :label="order.payment_status" />
									</div>
									<p class="mt-3 text-base font-semibold text-stone-950">{{ order.po_number }}</p>
									<p class="mt-1 text-sm text-stone-500">{{ order.supplier_name || "ไม่ระบุ supplier" }}<span v-if="order.supplier_contact"> · {{ order.supplier_contact }}</span></p>
									<p class="mt-2 text-xs text-stone-400">สร้างเมื่อ {{ formatDate(order.created_at) }}</p>
								</div>

								<div class="grid gap-3 text-right sm:grid-cols-4 sm:text-left">
									<div>
										<p class="text-xs text-stone-400">รายการ</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ numberFormatter.format(order.item_count) }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">สั่งรวม</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ numberFormatter.format(order.total_qty_ordered) }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">คาดรับ</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatDate(order.expected_at) }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">มูลค่า</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatMoney(order.total_estimated_base, "THB") }}</p>
									</div>
								</div>
							</div>
						</button>
					</div>

					<UCard v-else class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
						<div class="space-y-3 py-12 text-center">
							<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-stone-400 ring-1 ring-[#e7e4dd]">
								<UIcon name="i-heroicons-clipboard-document-list" class="h-6 w-6" />
							</div>
							<div>
								<p class="text-sm font-medium text-stone-900">ยังไม่มี purchase order</p>
								<p class="mt-1 text-sm text-stone-500">เริ่มสร้าง PO แรกเพื่อวางแผนรับของและติดตามต้นทุนก่อนเข้าสินค้าคงคลัง</p>
							</div>
							<div class="pt-1">
								<UButton color="orange" variant="solid" label="สร้าง PO" :disabled="!canCreatePurchaseOrder" @click="openCreateDrawer" />
							</div>
						</div>
					</UCard>
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
					v-if="detailOpen || createOpen"
					class="fixed inset-0 z-[58] bg-[rgba(28,25,23,0.42)] backdrop-blur-[2px]"
					@click="detailOpen ? closeDetail() : closeCreateDrawer()"
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
					v-if="detailOpen"
					class="fixed inset-x-0 bottom-0 z-[59] max-h-[88vh] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-[28px]"
				>
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] p-4 text-stone-900">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Purchase order</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">รายละเอียด PO</h2>
								</div>
								<UButton color="gray" variant="soft" size="xs" icon="i-heroicons-x-mark-20-solid" aria-label="ปิดรายละเอียด PO" title="ปิดรายละเอียด PO" @click="closeDetail" />
							</div>

							<div v-if="selectedOrder" class="mt-4 rounded-[24px] bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start gap-3">
									<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
										<UIcon name="i-heroicons-clipboard-document-list" class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-lg font-semibold text-stone-950">{{ selectedOrder.po_number }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrder.supplier_name || "ไม่ระบุ supplier" }}</p>
											</div>
											<UBadge :color="statusColor(selectedOrder.status)" variant="soft" :label="selectedOrder.status" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="paymentStatusColor(selectedOrder.payment_status)" variant="soft" :label="selectedOrder.payment_status" />
											<UBadge color="gray" variant="soft" :label="selectedOrder.purchase_currency" />
											<UBadge color="gray" variant="soft" :label="`${selectedOrder.item_count} รายการ`" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto py-4 pr-1">
							<UCard v-if="detailPending" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
								<div class="py-10 text-center text-sm text-stone-500">กำลังโหลดรายละเอียด…</div>
							</UCard>
							<UCard v-else-if="detailError" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
								<div class="space-y-3 py-10 text-center">
									<p class="text-sm text-stone-600">{{ detailError }}</p>
									<UButton color="orange" variant="soft" @click="selectedOrderId && loadOrderDetail(selectedOrderId)">ลองใหม่</UButton>
								</div>
							</UCard>
							<template v-else-if="selectedOrderDetail">
								<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
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
											<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrderDetail.order.total_estimated_base, "THB") }}</dd>
										</div>
										<div class="flex items-start justify-between gap-4">
											<dt class="text-stone-500">หมายเหตุ</dt>
											<dd class="max-w-[220px] text-right font-medium text-stone-900">{{ selectedOrderDetail.order.note || "-" }}</dd>
										</div>
									</dl>
								</div>

								<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">รายการสินค้า</h3>
										<UBadge color="gray" variant="soft" :label="`${selectedOrderDetail.items.length} lines`" />
									</div>
									<div class="mt-4 space-y-3">
										<div v-for="item in selectedOrderDetail.items" :key="item.id" class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]">
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ item.product_name || item.product_id }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ item.product_sku || "-" }} · {{ item.unit_name || "base unit" }}</p>
												</div>
												<p class="text-sm font-semibold text-stone-900">{{ formatMoney(item.unit_cost_base, "THB") }}</p>
											</div>
											<div class="mt-3 flex flex-wrap gap-2">
												<UBadge color="gray" variant="soft" :label="`สั่ง ${numberFormatter.format(item.qty_ordered)}`" />
												<UBadge color="gray" variant="soft" :label="`รับแล้ว ${numberFormatter.format(item.qty_received)}`" />
											</div>
										</div>
									</div>
								</div>

								<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
									<div class="flex items-center justify-between gap-2">
										<h3 class="text-sm font-semibold text-stone-950">Payments</h3>
										<UBadge :color="paymentStatusColor(selectedOrderDetail.order.payment_status)" variant="soft" :label="selectedOrderDetail.order.payment_status" />
									</div>
									<div v-if="selectedOrderDetail.payments.length" class="mt-4 space-y-3">
										<div v-for="payment in selectedOrderDetail.payments" :key="payment.id" class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]">
											<div class="flex items-start justify-between gap-3">
												<div>
													<p class="text-sm font-semibold text-stone-900">{{ payment.entry_type }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ formatDate(payment.paid_at) }}</p>
												</div>
												<p class="text-sm font-semibold text-stone-900">{{ formatMoney(payment.amount_base, "THB") }}</p>
											</div>
										</div>
									</div>
									<div v-else class="mt-4 rounded-2xl bg-white px-4 py-4 text-sm text-stone-500 ring-1 ring-[#e7e4dd]">
										ยังไม่มี payment entry
									</div>
								</div>
							</template>
						</div>
					</div>
				</div>
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
					v-if="createOpen"
					class="fixed inset-x-0 bottom-0 z-[59] max-h-[88vh] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[520px] lg:rounded-none lg:rounded-l-[28px]"
				>
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] p-4 text-stone-900">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Create purchase order</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">สร้าง PO ใหม่</h2>
								</div>
								<UButton color="gray" variant="soft" size="xs" icon="i-heroicons-x-mark-20-solid" aria-label="ปิดฟอร์มสร้าง PO" title="ปิดฟอร์มสร้าง PO" @click="closeCreateDrawer" />
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto py-4 pr-1">
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">Supplier</label>
									<input v-model="createForm.supplierName" type="text" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">Supplier contact</label>
									<input v-model="createForm.supplierContact" type="text" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								</div>
							</div>

							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">Currency</label>
									<select v-model="createForm.purchaseCurrency" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
										<option value="LAK">LAK</option>
										<option value="THB">THB</option>
										<option value="USD">USD</option>
									</select>
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">Expected at</label>
									<input v-model="createForm.expectedAt" type="datetime-local" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								</div>
							</div>

							<div>
								<div class="mb-2 flex items-center justify-between gap-3">
									<label class="block text-xs font-medium text-stone-500">รายการสินค้า</label>
									<UButton color="gray" variant="soft" size="xs" icon="i-heroicons-plus-20-solid" label="เพิ่มรายการ" @click="addLine" />
								</div>

								<div class="space-y-3">
									<div v-for="line in createForm.items" :key="line.id" class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
										<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_110px_120px_auto]">
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">สินค้า</label>
												<select v-model="line.productId" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]" @change="syncCostFromProduct(line)">
													<option value="" disabled>{{ productsPending ? "กำลังโหลดสินค้า..." : "เลือกสินค้า" }}</option>
													<option v-for="product in products" :key="product.id" :value="product.id">{{ productLabel(product.id) }}</option>
												</select>
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">จำนวน</label>
												<input v-model="line.qtyOrdered" type="number" min="1" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
											</div>
											<div>
												<label class="mb-2 block text-xs font-medium text-stone-500">ต้นทุน/หน่วย</label>
												<input v-model="line.unitCost" type="number" min="0" :placeholder="unitCostPlaceholder(line.productId)" class="w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
											</div>
											<div class="flex items-end">
												<UButton color="gray" variant="soft" size="lg" icon="i-heroicons-trash-20-solid" aria-label="ลบรายการ" title="ลบรายการ" @click="removeLine(line.id)" />
											</div>
										</div>
									</div>
								</div>
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">หมายเหตุ</label>
								<textarea v-model="createForm.note" rows="4" class="w-full resize-none rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]" />
							</div>
						</div>

						<div class="border-t border-[#e7e4dd] pt-4">
							<div class="grid gap-2 sm:grid-cols-2">
								<UButton color="gray" variant="soft" size="lg" label="ยกเลิก" @click="closeCreateDrawer" />
								<UButton color="orange" variant="solid" size="lg" :loading="submitting" :disabled="!canCreatePurchaseOrder" label="บันทึก PO" @click="submitCreate" />
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
					v-if="toast"
					class="fixed bottom-6 left-1/2 z-[70] w-[min(560px,calc(100%-2rem))] -translate-x-1/2 rounded-2xl bg-[rgba(28,25,23,0.92)] px-4 py-3 text-sm text-white shadow-2xl ring-1 ring-white/10 backdrop-blur"
				>
					{{ toast }}
				</div>
			</Transition>
		</template>
	</AppSidebarShell>
</template>
