<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatMoneyWithSymbol } from "~/utils/currency";

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

const { apiFetch } = useApiClient();
const { currentStoreId, hydrateAuthState } = useAuthSession();

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

const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});
const numberFormatter = new Intl.NumberFormat("th-TH");

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
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalItems.value} รายการ`
));
const storeCurrency = computed(() => {
	return stores.value.find((store) => store.id === currentStoreId.value)?.currency?.trim()?.toUpperCase()
		|| stores.value[0]?.currency?.trim()?.toUpperCase()
		|| "LAK";
});

const typeOptions: Array<{ id: typeof statusFilter.value; label: string }> = [
	{ id: "all", label: "ทุกสถานะ" },
	{ id: "draft", label: "ร่าง" },
	{ id: "ordered", label: "สั่งซื้อแล้ว" },
	{ id: "shipped", label: "ส่งแล้ว" },
	{ id: "arrived", label: "รอรับสต็อก" },
	{ id: "received", label: "รับครบแล้ว" },
	{ id: "cancelled", label: "ยกเลิก" },
];

const paymentOptions: Array<{ id: typeof paymentFilter.value; label: string }> = [
	{ id: "all", label: "ทุกการชำระ" },
	{ id: "unpaid", label: "Unpaid" },
	{ id: "partial", label: "Partial" },
	{ id: "paid", label: "Paid" },
];

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

function clearFilters() {
	searchQuery.value = "";
	statusFilter.value = "all";
	paymentFilter.value = "all";
	fromDate.value = "";
	toDate.value = "";
	currentPage.value = 1;
}

function formatDate(value: string | null) {
	if (!value) return "-";
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function formatMoney(value: number) {
	return formatMoneyWithSymbol(value, storeCurrency.value);
}

function statusColor(status: string) {
	if (status === "received") return "success";
	if (status === "shipped") return "info";
	if (status === "ordered") return "primary";
	if (status === "arrived") return "warning";
	if (status === "cancelled") return "error";
	return "neutral";
}

function statusLabel(status: string) {
	if (status === "draft") return "ร่าง";
	if (status === "ordered") return "สั่งซื้อแล้ว";
	if (status === "shipped") return "ส่งแล้ว";
	if (status === "arrived") return "รอรับสต็อก";
	if (status === "partial") return "รับบางส่วน";
	if (status === "received") return "รับครบแล้ว";
	if (status === "cancelled") return "ยกเลิก";
	return status;
}

function paymentStatusColor(status: string) {
	if (status === "paid") return "success";
	if (status === "partial") return "warning";
	return "neutral";
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
		ordersError.value = resolveApiErrorMessage(error, "โหลดประวัติ PO ไม่สำเร็จ");
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
		sidebar-title="ประวัติ PO"
		sidebar-compact-title="PO HIS"
		sidebar-description="ดูประวัติ purchase order และสถานะย้อนหลัง"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title="ประวัติ PO"
					description="ค้นหาและดู purchase order ย้อนหลัง"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								placeholder="ค้นหาเลข PO, supplier, contact หรือหมายเหตุ"
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
								aria-label="ล้างคำค้น"
								title="ล้างคำค้น"
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
							aria-label="รีโหลด"
							title="รีโหลด"
							@click="loadHistory"
						>
							<span class="hidden sm:inline">รีโหลด</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">ตัวกรอง</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ pageSummaryText }}
							</div>
						</div>

						<div class="grid gap-2 px-4 py-3">
							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="flex flex-wrap items-center gap-2">
									<span class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">ช่วงเวลา</span>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('today')">วันนี้</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_week')">สัปดาห์นี้</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_week')">สัปดาห์ที่แล้ว</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_month')">เดือนนี้</AppButton>
									<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_month')">เดือนที่แล้ว</AppButton>
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
										ล้าง
									</AppButton>
									<AppButton
										color="primary"
										variant="solid"
										size="xs"
										class="rounded-md"
										icon="i-heroicons-funnel"
										:loading="ordersPending"
										:spin-icon-on-loading="true"
										@click="loadHistory"
									>
										ใช้ตัวกรอง
									</AppButton>
								</div>
							</div>

							<div class="grid gap-2 md:grid-cols-3 md:items-end">
								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500">สถานะ PO</label>
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
									<label class="mb-1 block text-[11px] font-medium text-stone-500">สถานะชำระเงิน</label>
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

								<div class="grid gap-2 sm:grid-cols-2">
									<div class="min-w-0">
										<label class="mb-1 block text-[11px] font-medium text-stone-500">จากวันที่</label>
										<input
											v-model="fromDate"
											type="date"
											class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
									</div>
									<div class="min-w-0">
										<label class="mb-1 block text-[11px] font-medium text-stone-500">ถึงวันที่</label>
										<input
											v-model="toDate"
											type="date"
											class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">รายการประวัติ PO</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">เรียงจากรายการล่าสุด และรองรับค้นหา/กรองจากด้านบน</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ totalItems }} รายการ
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="ordersPending" class="min-h-[280px]">
								<AppInlineLoadingBar container-class="bg-neutral-100" />
							</div>
							<div v-else-if="ordersError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm text-stone-600">{{ ordersError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadHistory">ลองใหม่</AppButton>
								</div>
							</div>
							<div v-else-if="!filteredOrders.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm font-medium text-stone-900">ยังไม่มีประวัติ PO</p>
									<p class="text-sm text-stone-500">ลองเปลี่ยนตัวกรองหรือช่วงเวลา</p>
								</div>
							</div>

							<table v-else class="min-w-[1120px] w-full border-separate border-spacing-0">
								<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
									<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
										<th class="border-b border-[#ece6dc] px-4 py-3">เวลา</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">PO</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">Supplier</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">สถานะ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">ชำระ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3 text-right">จำนวน</th>
										<th class="border-b border-[#ece6dc] px-4 py-3 text-right">รับแล้ว</th>
										<th class="border-b border-[#ece6dc] px-4 py-3 text-right">มูลค่า</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">อัปเดต</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="order in paginatedOrders"
										:key="order.id"
										class="bg-white text-sm text-stone-700 transition hover:bg-primary-50"
									>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
											{{ formatDate(order.created_at) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<p class="font-semibold text-stone-950">{{ order.po_number }}</p>
											<p class="mt-1 text-xs text-stone-400">{{ order.purchase_currency }} · {{ order.created_by || "-" }}</p>
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<p class="font-medium text-stone-900">{{ order.supplier_name || "ไม่ระบุ supplier" }}</p>
											<p v-if="order.supplier_contact" class="mt-1 text-xs text-stone-500">{{ order.supplier_contact }}</p>
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="paymentStatusColor(order.payment_status)" variant="soft" :label="order.payment_status" />
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
		</template>
	</AppSidebarShell>
</template>
