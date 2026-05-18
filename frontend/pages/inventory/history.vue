<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

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
	created_at: string;
	unit_name: string | null;
};

const { apiFetch } = useApiClient();
const { currentStoreId, can, hydrateAuthState } = useAuthSession();
const route = useRoute();

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

const typeOptions: Array<{ id: typeof movementType.value; label: string }> = [
	{ id: "all", label: "ทุกประเภท" },
	{ id: "ADJUSTMENT", label: "ปรับสต็อก (ทั้งหมด)" },
	{ id: "ADJUSTMENT_IN", label: "เพิ่มเข้า" },
	{ id: "ADJUSTMENT_OUT", label: "ตัดออก" },
	{ id: "ADJUSTMENT_SET", label: "ตั้งค่าใหม่" },
];

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});

function formatDate(value: string) {
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function getMovementTone(type: string) {
	if (type.includes("_IN")) return "success";
	if (type.includes("_OUT")) return "warning";
	if (type.includes("_SET")) return "neutral";
	return "neutral";
}

function getMovementLabel(type: string) {
	if (type === "ADJUSTMENT_IN") return "เพิ่มเข้า";
	if (type === "ADJUSTMENT_OUT") return "ตัดออก";
	if (type === "ADJUSTMENT_SET") return "ตั้งค่าใหม่";
	if (type.startsWith("ADJUSTMENT")) return "ปรับสต็อก";
	return type;
}

function formatQty(value: number) {
	const formatter = new Intl.NumberFormat("th-TH");
	return formatter.format(value);
}

function getMovementQtyLabel(value: number) {
	if (value > 0) return `+${formatQty(value)}`;
	return formatQty(value);
}

function resolveApiErrorMessage(errorValue: unknown, fallback = "โปรดลองอีกครั้ง") {
	if (typeof errorValue === "object" && errorValue) {
		const response = Reflect.get(errorValue, "response");
		if (typeof response === "object" && response) {
			const data = Reflect.get(response, "_data") || Reflect.get(response, "data");
			if (typeof data === "object" && data) {
				const message = Reflect.get(data, "message");
				if (typeof message === "string" && message.trim()) {
					return message;
				}
			}
		}
	}

	if (errorValue instanceof Error && errorValue.message.trim()) {
		return errorValue.message;
	}

	return fallback;
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

watch([searchQuery, movementType, fromDate, toDate, limit], () => {
	currentPage.value = 1;
});

watch(pageSize, () => {
	currentPage.value = 1;
});

watch(filteredMovements, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
}, { immediate: true });

async function loadHistory() {
	if (!canViewInventory.value) return;

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
				from: fromDate.value ? `${fromDate.value}T00:00:00.000Z` : undefined,
				to: toDate.value ? `${toDate.value}T23:59:59.999Z` : undefined,
			},
		});

		movements.value = response.data;
	} catch (error) {
		movements.value = [];
		movementsError.value = resolveApiErrorMessage(error, "โหลดประวัติสต็อกไม่สำเร็จ");
	} finally {
		movementsPending.value = false;
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
		sidebar-title="ประวัติสต็อก"
		sidebar-compact-title="HIS"
		sidebar-description="ดูรายการเคลื่อนไหวสต็อกแบบละเอียดสำหรับตรวจสอบย้อนหลัง"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title="ประวัติสต็อก"
					description="ค้นหาและดูรายการเคลื่อนไหวสต็อกย้อนหลัง (audit trail)"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-2 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto] lg:justify-end">
						<div class="relative min-w-0">
							<UInput
								v-model="searchQuery"
								size="lg"
								icon="i-heroicons-magnifying-glass-20-solid"
								placeholder="ค้นหาชื่อสินค้า, SKU, barcode, ผู้ทำ หรือหมายเหตุ"
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
							aria-label="รีโหลด"
							title="รีโหลด"
							:loading="movementsPending"
							:spin-icon-on-loading="true"
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
							<div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)_minmax(180px,0.5fr)] md:items-end">
								<div class="min-w-0">
									<label class="mb-1 block text-[11px] font-medium text-stone-500" for="movement-type-select">
										ประเภท
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

							<div class="flex flex-wrap items-center justify-between gap-2">
								<div class="text-xs text-stone-500">
									ดึงล่าสุด {{ limit }} รายการ
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

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex h-full min-h-0 flex-col">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
							<div>
								<p class="text-sm font-semibold text-stone-950">รายการเคลื่อนไหว</p>
								<p class="mt-1 hidden text-xs text-stone-500 lg:block">แสดงเรียงล่าสุดก่อน และรองรับค้นหา/กรองจากด้านบน</p>
							</div>
							<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
								{{ totalItems }} รายการ
							</div>
						</div>

						<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
							<div v-if="movementsPending" class="min-h-[280px]">
								<AppInlineLoadingBar container-class="bg-neutral-100" />
							</div>
							<div v-else-if="movementsError" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm text-stone-600">{{ movementsError }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" label="ลองใหม่" @click="loadHistory" />
								</div>
							</div>
							<div v-else-if="!filteredMovements.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
								<div class="space-y-3">
									<p class="text-sm font-medium text-stone-900">ยังไม่มีประวัติสต็อก</p>
									<p class="text-sm text-stone-500">ลองเปลี่ยนตัวกรองหรือช่วงเวลา</p>
								</div>
							</div>

							<table v-else class="min-w-[1180px] w-full border-separate border-spacing-0">
								<thead class="sticky top-0 z-10 bg-[#fcfbf8]">
									<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400">
										<th class="border-b border-[#ece6dc] px-4 py-3">เวลา</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">สินค้า</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">ประเภท</th>
										<th class="border-b border-[#ece6dc] px-4 py-3 text-right">จำนวน</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">ผู้ทำ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">หมายเหตุ</th>
										<th class="border-b border-[#ece6dc] px-4 py-3">อ้างอิง</th>
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
										<td class="border-b border-[#f1ede6] px-4 py-4">
											<UBadge :color="getMovementTone(movement.type)" variant="soft" :label="getMovementLabel(movement.type)" />
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-right font-semibold tabular-nums text-stone-950 whitespace-nowrap">
											{{ getMovementQtyLabel(movement.qty_base) }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 whitespace-nowrap">
											{{ movement.created_by || "ระบบ" }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
											{{ movement.note || "-" }}
										</td>
										<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
											<span class="rounded-md bg-white px-2.5 py-1 ring-1 ring-neutral-200">
												{{ movement.ref_type }}
											</span>
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
											:disabled="currentPage <= 1 || movementsPending"
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
											trailing-icon="i-heroicons-chevron-right-20-solid"
											:disabled="currentPage >= totalPages || movementsPending"
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
