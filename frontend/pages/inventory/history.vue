<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { formatAppDate, formatAppDateTime } from "~/utils/date-format";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

	type ApiInventoryMovement = {
		id: string;
		store_id: string;
		product_id: string;
		product_name: string;
		product_sku: string;
		type: string;
		qty_base: number;
		ref_type: string;
		ref_id: string | null;
		note: string | null;
		created_by: string | null;
		created_by_name: string | null;
		created_at: string;
		unit_name: string | null;
	};

const { apiFetch } = useApiClient();
const { currentStoreId, can, hydrateAuthState } = useAuthSession();
const route = useRoute();
const { locale } = useI18n();
const appLocale = computed(() => locale.value as "th" | "lo" | "en");
const copy = computed(() => appLocale.value === "lo" ? {
	sidebarTitle: "ປະຫວັດສະຕັອກ", sidebarDescription: "ເບິ່ງລາຍການເຄື່ອນໄຫວສະຕັອກແບບລະອຽດເພື່ອກວດສອບຍ້ອນຫຼັງ", description: "ຄົ້ນຫາ ແລະ ເບິ່ງລາຍການເຄື່ອນໄຫວສະຕັອກຍ້ອນຫຼັງ",
	search: "ຄົ້ນຫາຊື່ສິນຄ້າ, SKU, barcode, ຜູ້ດຳເນີນການ ຫຼື ໝາຍເຫດ", clearSearch: "ລ້າງຄຳຄົ້ນ", reload: "ໂຫຼດໃໝ່", filters: "ຕົວກອງ", period: "ຊ່ວງເວລາ", today: "ມື້ນີ້", thisWeek: "ອາທິດນີ້", lastWeek: "ອາທິດກ່ອນ", thisMonth: "ເດືອນນີ້", lastMonth: "ເດືອນກ່ອນ", clear: "ລ້າງ",
	type: "ປະເພດ", allTypes: "ທຸກປະເພດ", adjustmentAll: "ປັບສະຕັອກ (ທັງໝົດ)", stockIn: "ເພີ່ມເຂົ້າ", stockOut: "ຕັດອອກ", stockSet: "ຕັ້ງຄ່າໃໝ່", adjustment: "ປັບສະຕັອກ", fromDate: "ຈາກວັນທີ", toDate: "ເຖິງວັນທີ", selectDate: "ເລືອກວັນທີ", startDate: "ເລືອກວັນເລີ່ມ", endDate: "ເລືອກວັນສິ້ນສຸດ", pickDate: "ແຕະວັນທີທີ່ຕ້ອງການ", close: "ປິດ",
	latest: "ດຶງລາຍການຫຼ້າສຸດ", movements: "ລາຍການເຄື່ອນໄຫວ", movementsHint: "ສະແດງລາຍການຫຼ້າສຸດກ່ອນ ແລະ ຄົ້ນຫາ/ກອງໄດ້ຈາກດ້ານເທິງ", items: "ລາຍການ", noData: "ຍັງບໍ່ມີຂໍ້ມູນ", range: (start: number, end: number, total: number) => `${start}-${end} ຈາກ ${total} ລາຍການ`, page: (page: number, total: number) => `ໜ້າ ${page} / ${total}`,
	loadFailed: "ໂຫຼດປະຫວັດສະຕັອກບໍ່ສຳເລັດ", retry: "ລອງໃໝ່", empty: "ຍັງບໍ່ມີປະຫວັດສະຕັອກ", emptyHint: "ລອງປ່ຽນຕົວກອງ ຫຼື ຊ່ວງເວລາ", time: "ເວລາ", product: "ສິນຄ້າ", movementType: "ປະເພດການເຄື່ອນໄຫວ", quantity: "ຈຳນວນ", actor: "ຜູ້ດຳເນີນການ", note: "ໝາຍເຫດ", reference: "ເອກະສານອ້າງອີງ", unknownUser: "ບໍ່ພົບຊື່ຜູ້ໃຊ້", system: "ລະບົບ", purchaseOrder: "PO ສັ່ງຊື້", manualAdjustment: "ປັບສະຕັອກດ້ວຍມື", perPage: "ຕໍ່ໜ້າ", previous: "ກ່ອນໜ້າ", next: "ຖັດໄປ",
} : appLocale.value === "en" ? {
	sidebarTitle: "Stock history", sidebarDescription: "Review detailed stock movements for auditing", description: "Search and review historical stock movements",
	search: "Search product name, SKU, barcode, operator, or note", clearSearch: "Clear search", reload: "Reload", filters: "Filters", period: "Period", today: "Today", thisWeek: "This week", lastWeek: "Last week", thisMonth: "This month", lastMonth: "Last month", clear: "Clear",
	type: "Type", allTypes: "All types", adjustmentAll: "Stock adjustment (all)", stockIn: "Stock in", stockOut: "Stock out", stockSet: "Set stock", adjustment: "Stock adjustment", fromDate: "From date", toDate: "To date", selectDate: "Select date", startDate: "Select start date", endDate: "Select end date", pickDate: "Tap a date to select it", close: "Close",
	latest: "Latest records", movements: "Stock movements", movementsHint: "Newest records first. Search or filter above.", items: "items", noData: "No data yet", range: (start: number, end: number, total: number) => `${start}-${end} of ${total} items`, page: (page: number, total: number) => `Page ${page} / ${total}`,
	loadFailed: "Unable to load stock history", retry: "Try again", empty: "No stock history yet", emptyHint: "Try changing the filters or date range.", time: "Time", product: "Product", movementType: "Movement type", quantity: "Quantity", actor: "Operator", note: "Note", reference: "Reference", unknownUser: "Unknown user", system: "System", purchaseOrder: "Purchase order", manualAdjustment: "Manual stock adjustment", perPage: "Per page", previous: "Previous", next: "Next",
} : {
	sidebarTitle: "ประวัติสต็อก", sidebarDescription: "ดูรายการเคลื่อนไหวสต็อกแบบละเอียดสำหรับตรวจสอบย้อนหลัง", description: "ค้นหาและดูรายการเคลื่อนไหวสต็อกย้อนหลัง",
	search: "ค้นหาชื่อสินค้า, SKU, barcode, ผู้ทำ หรือหมายเหตุ", clearSearch: "ล้างคำค้น", reload: "รีโหลด", filters: "ตัวกรอง", period: "ช่วงเวลา", today: "วันนี้", thisWeek: "สัปดาห์นี้", lastWeek: "สัปดาห์ที่แล้ว", thisMonth: "เดือนนี้", lastMonth: "เดือนที่แล้ว", clear: "ล้าง",
	type: "ประเภท", allTypes: "ทุกประเภท", adjustmentAll: "ปรับสต็อก (ทั้งหมด)", stockIn: "เพิ่มเข้า", stockOut: "ตัดออก", stockSet: "ตั้งค่าใหม่", adjustment: "ปรับสต็อก", fromDate: "จากวันที่", toDate: "ถึงวันที่", selectDate: "เลือกวันที่", startDate: "เลือกเริ่มวันที่", endDate: "เลือกสิ้นวันที่", pickDate: "แตะวันที่ที่ต้องการเลือก", close: "ปิด",
	latest: "ดึงรายการล่าสุด", movements: "รายการเคลื่อนไหว", movementsHint: "แสดงเรียงล่าสุดก่อน และรองรับค้นหา/กรองจากด้านบน", items: "รายการ", noData: "ยังไม่มีข้อมูล", range: (start: number, end: number, total: number) => `${start}-${end} จาก ${total} รายการ`, page: (page: number, total: number) => `หน้า ${page} / ${total}`,
	loadFailed: "โหลดประวัติสต็อกไม่สำเร็จ", retry: "ลองใหม่", empty: "ยังไม่มีประวัติสต็อก", emptyHint: "ลองเปลี่ยนตัวกรองหรือช่วงเวลา", time: "เวลา", product: "สินค้า", movementType: "ประเภทการเคลื่อนไหว", quantity: "จำนวน", actor: "ผู้ทำ", note: "หมายเหตุ", reference: "เอกสารอ้างอิง", unknownUser: "ไม่พบชื่อผู้ใช้", system: "ระบบ", purchaseOrder: "PO สั่งซื้อ", manualAdjustment: "ปรับสต็อกด้วยมือ", perPage: "ต่อหน้า", previous: "ก่อนหน้า", next: "ถัดไป",
});

const canViewInventory = computed(() => can("inventory.view"));

const searchQuery = ref("");
const movementType = ref<"all" | "ADJUSTMENT" | "ADJUSTMENT_IN" | "ADJUSTMENT_OUT" | "ADJUSTMENT_SET">("all");
const productIdFilter = computed(() => (typeof route.query.product_id === "string" ? route.query.product_id : ""));
	const fromDate = ref("");
	const toDate = ref("");
	const limit = ref(100);

const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const movements = ref<ApiInventoryMovement[]>([]);
const movementsPending = ref(true);
const movementsError = ref<string | null>(null);

const filteredMovements = computed(() => movements.value);
const totalItems = computed(() => filteredMovements.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const paginatedMovements = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredMovements.value.slice(startIndex, startIndex + pageSize.value);
});

const pageLabel = computed(() => copy.value.page(currentPage.value, totalPages.value));
const pageStart = computed(() => (
	totalItems.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalItems.value));
const pageSummaryText = computed(() => (
	totalItems.value === 0
		? copy.value.noData
		: copy.value.range(pageStart.value, pageEnd.value, totalItems.value)
));

const typeOptions = computed<Array<{ id: typeof movementType.value; label: string }>>(() => [
	{ id: "all", label: copy.value.allTypes },
	{ id: "ADJUSTMENT", label: copy.value.adjustmentAll },
	{ id: "ADJUSTMENT_IN", label: copy.value.stockIn },
	{ id: "ADJUSTMENT_OUT", label: copy.value.stockOut },
	{ id: "ADJUSTMENT_SET", label: copy.value.stockSet },
]);

type DatePickerField = "from" | "to";
type CalendarDay = {
	date: string;
	day: number;
	isCurrentMonth: boolean;
	isToday: boolean;
	isSelected: boolean;
	isInRange: boolean;
};

const datePickerOpen = ref(false);
const datePickerField = ref<DatePickerField>("from");
const datePickerMonth = ref(startOfMonth(new Date()));
const weekdayLabels = computed(() => appLocale.value === "lo" ? ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສ", "ສ"] : appLocale.value === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]);

	function formatDate(value: string) {
	return formatAppDateTime(value, appLocale.value);
}

function getMovementTone(type: string) {
	if (type.includes("_IN")) return "success";
	if (type.includes("_OUT")) return "warning";
	if (type.includes("_SET")) return "neutral";
	return "neutral";
}

function getMovementLabel(type: string) {
	if (type === "ADJUSTMENT_IN") return copy.value.stockIn;
	if (type === "ADJUSTMENT_OUT") return copy.value.stockOut;
	if (type === "ADJUSTMENT_SET") return copy.value.stockSet;
	if (type.startsWith("ADJUSTMENT")) return copy.value.adjustment;
	return type;
	}

function formatReferenceType(refType: string) {
	if (refType === "purchase_order") return copy.value.purchaseOrder;
	if (refType === "manual_adjustment") return copy.value.manualAdjustment;
	if (!refType) return "-";
	return refType
		.replace(/_/g, " ")
		.replace(/\s+/g, " ")
		.trim();
}

function parseDateInputValue(value: string) {
	if (!value) return null;
	const parsed = new Date(`${value}T00:00:00`);
	return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatPickerDate(value: string | null) {
	const parsed = parseDateInputValue(value || "");
	if (!parsed) return copy.value.selectDate;
	return formatAppDate(parsed, appLocale.value, { dateStyle: appLocale.value === "lo" ? "long" : "medium" });
}

function setDateRangeValue(field: DatePickerField, value: string) {
	if (field === "from") {
		fromDate.value = value;
		if (toDate.value && toDate.value < value) {
			toDate.value = value;
		}
		return;
	}

	toDate.value = value;
	if (fromDate.value && fromDate.value > value) {
		fromDate.value = value;
	}
}

function openDatePicker(field: DatePickerField) {
	datePickerField.value = field;
	const baseValue = field === "from" ? fromDate.value : toDate.value;
	const parsed = parseDateInputValue(baseValue);
	datePickerMonth.value = startOfMonth(parsed || new Date());
	datePickerOpen.value = true;
}

function closeDatePicker() {
	datePickerOpen.value = false;
}

function moveDatePickerMonth(offset: number) {
	const nextMonth = new Date(datePickerMonth.value);
	nextMonth.setMonth(nextMonth.getMonth() + offset);
	datePickerMonth.value = startOfMonth(nextMonth);
}

function pickDate(day: CalendarDay) {
	if (!day.isCurrentMonth) return;
	setDateRangeValue(datePickerField.value, day.date);
	closeDatePicker();
}

function pickToday() {
	const value = toDateInputValue(new Date());
	setDateRangeValue(datePickerField.value, value);
	datePickerMonth.value = startOfMonth(new Date(value));
	closeDatePicker();
}

function clearCurrentDate() {
	if (datePickerField.value === "from") {
		fromDate.value = "";
	} else {
		toDate.value = "";
	}
	closeDatePicker();
}

const datePickerMonthLabel = computed(() => formatAppDate(datePickerMonth.value, appLocale.value, {
	month: "long",
	year: "numeric",
}));

const datePickerCurrentValue = computed(() => (
	datePickerField.value === "from" ? fromDate.value : toDate.value
));

const datePickerCalendarDays = computed<CalendarDay[]>(() => {
	const start = startOfMonth(datePickerMonth.value);
	const startOffset = start.getDay();
	const gridStart = new Date(start);
	gridStart.setDate(gridStart.getDate() - startOffset);
	const selectedDate = datePickerCurrentValue.value || "";
	const fromValue = fromDate.value;
	const toValue = toDate.value;

	return Array.from({ length: 42 }, (_, index) => {
		const current = new Date(gridStart);
		current.setDate(gridStart.getDate() + index);
		const date = toDateInputValue(current);
		const isInRange = !!fromValue && !!toValue && date >= fromValue && date <= toValue;
		return {
			date,
			day: current.getDate(),
			isCurrentMonth: current.getMonth() === start.getMonth() && current.getFullYear() === start.getFullYear(),
			isToday: date === toDateInputValue(new Date()),
			isSelected: date === selectedDate,
			isInRange,
		};
	});
});

const datePickerCalendarWeeks = computed(() => {
	const weeks: CalendarDay[][] = [];
	for (let index = 0; index < datePickerCalendarDays.value.length; index += 7) {
		weeks.push(datePickerCalendarDays.value.slice(index, index + 7));
	}
	return weeks;
});

	type DatePresetId = "today" | "this_week" | "last_week" | "this_month" | "last_month";

	function pad2(value: number) {
		return String(value).padStart(2, "0");
	}

	function toDateInputValue(date: Date) {
		return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
	}

	function startOfLocalDayIso(dateInputValue: string) {
		// Convert local day boundary to UTC ISO for backend comparisons.
		return new Date(`${dateInputValue}T00:00:00`).toISOString();
	}

	function endOfLocalDayIso(dateInputValue: string) {
		return new Date(`${dateInputValue}T23:59:59.999`).toISOString();
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
			const day = today.getDay(); // 0=Sun..6=Sat
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
		movementType.value = "all";
		fromDate.value = "";
		toDate.value = "";
		limit.value = 100;
		currentPage.value = 1;
		// These are server-side filters, so the list has to be fetched again for the
		// clear to show. The filter watcher does that refetch.
	}

	function formatQty(value: number) {
		const formatter = new Intl.NumberFormat(appLocale.value === "lo" ? "lo-LA" : appLocale.value === "en" ? "en-US" : "th-TH");
		return formatter.format(value);
	}

function getMovementQtyLabel(value: number) {
	if (value > 0) return `+${formatQty(value)}`;
	return formatQty(value);
}

	function scrollListToTop() {
	if (!import.meta.client) return;
	document.getElementById("app-shell-scroll-root")?.scrollTo({ top: 0, behavior: "auto" });
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	nextTick(() => {
		scrollListToTop();
	});
}

// Every filter (search included) reloads on its own, so there is no Apply button.
let filterReloadTimer: ReturnType<typeof setTimeout> | null = null;
watch([searchQuery, movementType, fromDate, toDate, limit], () => {
	currentPage.value = 1;
	if (filterReloadTimer) clearTimeout(filterReloadTimer);
	filterReloadTimer = setTimeout(() => { void loadHistory(); }, 250);
});
onBeforeUnmount(() => { if (filterReloadTimer) clearTimeout(filterReloadTimer); });

watch(pageSize, () => {
	currentPage.value = 1;
});

watch(filteredMovements, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
}, { immediate: true });

	// Filters reload themselves while typing, so requests can overlap. Track the
	// latest one and ignore whatever comes back late instead of dropping the call.
	let historyRequestId = 0;

	async function loadHistory() {
		if (!canViewInventory.value) return;

		const requestId = ++historyRequestId;
		movementsPending.value = true;
		movementsError.value = null;
		try {
			const storeId = currentStoreId.value || "";
			const response = await apiFetch<ApiEnvelope<ApiInventoryMovement[]>>("/inventory/movements", {
			query: {
				store_id: storeId || undefined,
				product_id: productIdFilter.value || undefined,
					limit: limit.value,
					query: searchQuery.value.trim() || undefined,
					type: movementType.value === "all" ? undefined : movementType.value,
					from: fromDate.value ? startOfLocalDayIso(fromDate.value) : undefined,
					to: toDate.value ? endOfLocalDayIso(toDate.value) : undefined,
				},
			});

			if (requestId !== historyRequestId) return;
			movements.value = response.data;
	} catch (error) {
		if (requestId !== historyRequestId) return;
		movements.value = [];
		movementsError.value = resolveApiErrorMessage(error, copy.value.loadFailed);
		} finally {
			if (requestId === historyRequestId) movementsPending.value = false;
		}
	}

watch([canViewInventory, currentStoreId, productIdFilter], () => {
	void loadHistory();
}, { immediate: true });

onMounted(() => {
	hydrateAuthState();
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['stock']"
		sidebar-eyebrow="Inventory"
		:sidebar-title="copy.sidebarTitle"
		sidebar-compact-title="HIS"
		:sidebar-description="copy.sidebarDescription"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-2 pb-2 lg:gap-3">
				<AppPageHeader
					compact
					title=""
					:description="copy.description"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								:placeholder="copy.search"
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
								:aria-label="copy.clearSearch"
								:title="copy.clearSearch"
								@click="searchQuery = ''"
							/>
						</div>

						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							icon="i-heroicons-arrow-path-20-solid"
							class="justify-center rounded-md"
							:aria-label="copy.reload"
							:title="copy.reload"
							:loading="movementsPending"
							:spin-icon-on-loading="true"
							@click="loadHistory"
						>
							<span class="hidden sm:inline">{{ copy.reload }}</span>
						</AppButton>
					</div>
				</AppPageHeader>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ copy.filters }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ pageSummaryText }}
							</div>
						</div>

							<div class="grid gap-2 px-4 py-3">
								<div class="flex flex-wrap items-center justify-between gap-2">
									<div class="flex flex-wrap items-center gap-2">
										<span class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ copy.period }}</span>
										<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('today')">{{ copy.today }}</AppButton>
										<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_week')">{{ copy.thisWeek }}</AppButton>
										<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_week')">{{ copy.lastWeek }}</AppButton>
										<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('this_month')">{{ copy.thisMonth }}</AppButton>
										<AppButton color="neutral" variant="soft" size="xs" class="rounded-md" @click="applyPreset('last_month')">{{ copy.lastMonth }}</AppButton>
									</div>
									<div class="flex items-center gap-2">
										<AppButton
											color="neutral"
											variant="ghost"
											size="xs"
											class="rounded-md"
											:disabled="movementsPending"
											@click="clearFilters"
										>
											{{ copy.clear }}
										</AppButton>
									</div>
								</div>

								<div class="grid w-full gap-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)_minmax(0,1fr)] lg:items-end">
									<div class="min-w-0">
										<label class="mb-1 block text-[11px] font-medium text-stone-500" for="movement-type-select">
											{{ copy.type }}
									</label>
									<div class="relative">
										<select
											id="movement-type-select"
											v-model="movementType"
											class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="option in typeOptions" :key="option.id" :value="option.id">
												{{ option.label }}
											</option>
										</select>
										<UIcon
											name="i-heroicons-chevron-up-down"
											class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
										/>
									</div>
								</div>

									<div class="grid grid-cols-2 gap-2 lg:contents">
										<div class="min-w-0">
											<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ copy.fromDate }}</label>
											<button
												type="button"
												class="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 text-left text-sm font-medium text-stone-800 shadow-sm outline-none transition hover:border-primary-300 hover:bg-primary-50/40 focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												@click="openDatePicker('from')"
											>
												<span class="truncate">{{ fromDate ? formatPickerDate(fromDate) : copy.selectDate }}</span>
												<UIcon name="i-heroicons-calendar-days-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
											</button>
										</div>

										<div class="min-w-0">
											<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ copy.toDate }}</label>
											<button
												type="button"
												class="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 text-left text-sm font-medium text-stone-800 shadow-sm outline-none transition hover:border-primary-300 hover:bg-primary-50/40 focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												@click="openDatePicker('to')"
											>
												<span class="truncate">{{ toDate ? formatPickerDate(toDate) : copy.selectDate }}</span>
												<UIcon name="i-heroicons-calendar-days-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
											</button>
										</div>
									</div>
								</div>

							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="text-xs text-stone-500">
									{{ copy.latest }} {{ limit }} {{ copy.items }}
								</div>
								<div class="flex items-center gap-2">
									<AppButton
										color="neutral"
										variant="soft"
										size="xs"
										class="rounded-md"
										:disabled="limit <= 100"
										@click="limit = 100"
									>
										100
									</AppButton>
									<AppButton
										color="neutral"
										variant="soft"
										size="xs"
										class="rounded-md"
										:disabled="limit === 200"
										@click="limit = 200"
									>
										200
									</AppButton>
									<AppButton
										color="neutral"
										variant="soft"
										size="xs"
										class="rounded-md"
										:disabled="limit === 500"
										@click="limit = 500"
									>
										500
									</AppButton>
								</div>
							</div>
						</div>
					</div>
				</div>

				<AppResponsivePanel
					v-model="datePickerOpen"
					:title="datePickerField === 'from' ? copy.startDate : copy.endDate"
					:description="datePickerCurrentValue ? formatPickerDate(datePickerCurrentValue) : copy.pickDate"
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
										{{ copy.today }}
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
											<span>{{ copy.clear }}</span>
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
										{{ copy.close }}
									</AppButton>
								</div>
							</div>
						</div>
					</template>
				</AppResponsivePanel>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">{{ copy.movements }}</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.movementsHint }}</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ totalItems }} {{ copy.items }}
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="movementsPending" class="min-h-[280px]">
								<AppInlineLoadingBar container-class="bg-neutral-100" />
							</div>
							<div v-else-if="movementsError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm text-stone-600">{{ movementsError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" :label="copy.retry" @click="loadHistory" />
								</div>
							</div>
							<div v-else-if="!filteredMovements.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm font-medium text-stone-900">{{ copy.empty }}</p>
									<p class="text-sm text-stone-500">{{ copy.emptyHint }}</p>
								</div>
							</div>

							<table v-else class="min-w-[1180px] w-full border-separate border-spacing-0">
									<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
										<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.time }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.product }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 whitespace-nowrap dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.movementType }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.quantity }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.actor }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.note }}</th>
											<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ copy.reference }}</th>
									</tr>
								</thead>
								<tbody>
									<tr
										v-for="movement in paginatedMovements"
										:key="movement.id"
										class="bg-white text-sm text-stone-700 transition hover:bg-primary-50"
									>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
												{{ formatDate(movement.created_at) }}
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4">
												<div class="min-w-0">
													<p class="truncate font-semibold text-stone-950">{{ movement.product_name }}</p>
													<p class="mt-1 truncate text-xs text-stone-500">{{ movement.product_sku }}</p>
												</div>
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 whitespace-nowrap">
												<UBadge :color="getMovementTone(movement.type)" variant="soft" :label="getMovementLabel(movement.type)" />
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-right font-semibold tabular-nums text-stone-950 whitespace-nowrap">
												{{ getMovementQtyLabel(movement.qty_base) }}
											</td>
											<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
												{{ movement.created_by_name || (movement.created_by ? copy.unknownUser : copy.system) }}
											</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
											{{ movement.note || "-" }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
											<div class="inline-flex flex-col gap-1">
												<span class="inline-flex w-fit items-center rounded-md bg-white px-2.5 py-1 text-xs font-medium text-stone-700 ring-1 ring-neutral-200">
													{{ formatReferenceType(movement.ref_type) }}
												</span>
												<span v-if="movement.ref_id" class="text-[11px] text-stone-400">
													ID: {{ movement.ref_id }}
												</span>
											</div>
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
										<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ copy.perPage }}</label>
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
											:disabled="currentPage <= 1 || movementsPending"
											:aria-label="copy.previous"
											:title="copy.previous"
											@click="goToPage(currentPage - 1)"
										>
											<span class="hidden sm:inline">{{ copy.previous }}</span>
										</AppButton>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											class="rounded-md"
											trailing-icon="i-heroicons-chevron-right-20-solid"
											:disabled="currentPage >= totalPages || movementsPending"
											:aria-label="copy.next"
											:title="copy.next"
											@click="goToPage(currentPage + 1)"
										>
											<span class="hidden sm:inline">{{ copy.next }}</span>
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
