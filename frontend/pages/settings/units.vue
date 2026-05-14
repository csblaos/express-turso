<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type StoreRecord = {
	id: string;
	name: string;
	currency?: string;
};

type UnitRecord = {
	id: string;
	code: string;
	name_th: string;
	scope: string;
	store_id: string | null;
};

const { apiFetch } = useApiClient();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const appToast = useAppToast();

const searchQuery = ref("");
const selectedStoreId = ref("");
const selectedUnitId = ref("");
const unitsListScrollRef = ref<HTMLElement | null>(null);
const unitsPending = ref(false);
const storesPending = ref(true);
const unitsError = ref<string | null>(null);
const saving = ref(false);
const presetPending = ref(false);
const createOpen = ref(false);
const detailOpen = ref(false);
const deleteOpen = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const stores = ref<StoreRecord[]>([]);
const units = ref<UnitRecord[]>([]);

const createForm = reactive({
	code: "",
	name_th: "",
});

const detailForm = reactive({
	code: "",
	name_th: "",
});

const isElevatedStoreManager = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
));
const canViewUnits = computed(() => isElevatedStoreManager.value || can("products.view"));
const canCreateUnits = computed(() => isElevatedStoreManager.value || can("products.create"));
const canUpdateUnits = computed(() => isElevatedStoreManager.value || can("products.update"));
const canDeleteUnits = computed(() => isElevatedStoreManager.value || can("products.archive"));
const lockedStoreId = computed(() => (
	currentStoreId.value
	|| currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| ""
));
const effectiveStoreId = computed(() => (
	selectedStoreId.value
	|| currentStoreId.value
	|| currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| stores.value[0]?.id
	|| ""
));
const selectedStoreLabel = computed(() => (
	stores.value.find((store) => store.id === effectiveStoreId.value)?.name
	|| "ยังไม่พบร้านที่กำลังใช้งาน"
));
const filteredUnits = computed(() => {
	const keyword = searchQuery.value.trim().toLowerCase();
	if (!keyword) return units.value;
	return units.value.filter((unit) => (
		unit.code.toLowerCase().includes(keyword)
		|| unit.name_th.toLowerCase().includes(keyword)
		|| unit.id.toLowerCase().includes(keyword)
	));
});
const totalUnits = computed(() => filteredUnits.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalUnits.value / pageSize.value)));
const paginatedUnits = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredUnits.value.slice(startIndex, startIndex + pageSize.value);
});
const selectedUnit = computed(() => (
	paginatedUnits.value.find((unit) => unit.id === selectedUnitId.value)
	|| filteredUnits.value.find((unit) => unit.id === selectedUnitId.value)
	|| units.value.find((unit) => unit.id === selectedUnitId.value)
	|| paginatedUnits.value[0]
	|| filteredUnits.value[0]
	|| units.value[0]
	|| null
));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalUnits.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalUnits.value));
const pageSummaryText = computed(() => (
	totalUnits.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalUnits.value} หน่วย`
));
const overviewStats = computed(() => ([
	{ label: "หน่วยทั้งหมด", value: units.value.length },
	{ label: "ผลลัพธ์ที่แสดง", value: filteredUnits.value.length },
	{ label: "Code ไม่ซ้ำ", value: new Set(units.value.map((unit) => unit.code.trim().toLowerCase())).size },
	{ label: "Store scoped", value: units.value.filter((unit) => unit.store_id === effectiveStoreId.value).length },
]));
const canCreateUnit = computed(() => (
	Boolean(effectiveStoreId.value)
	&& createForm.code.trim().length > 0
	&& createForm.name_th.trim().length > 0
));
const detailHasChanges = computed(() => {
	if (!selectedUnit.value) return false;
	return (
		detailForm.code.trim() !== selectedUnit.value.code
		|| detailForm.name_th.trim() !== selectedUnit.value.name_th
	);
});
const canSaveDetail = computed(() => (
	Boolean(selectedUnit.value)
	&& detailForm.code.trim().length > 0
	&& detailForm.name_th.trim().length > 0
	&& detailHasChanges.value
));

watch([lockedStoreId, stores], () => {
	const nextStoreId = lockedStoreId.value || stores.value[0]?.id || "";
	if (nextStoreId && selectedStoreId.value !== nextStoreId) {
		selectedStoreId.value = nextStoreId;
	}
}, { immediate: true });

watch(effectiveStoreId, async (value) => {
	if (!value || !canViewUnits.value) return;
	if (selectedStoreId.value !== value) {
		selectedStoreId.value = value;
	}
	await fetchUnits();
}, { immediate: false });

watch(filteredUnits, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
	if (!value.length) {
		selectedUnitId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((unit) => unit.id === selectedUnitId.value)) {
		selectedUnitId.value = paginatedUnits.value[0]?.id || value[0].id;
	}
}, { immediate: true });

watch(searchQuery, () => {
	resetListPage();
});

watch(pageSize, () => {
	resetListPage();
});

watch(createOpen, (isOpen) => {
	if (!isOpen) return;
	createForm.code = "";
	createForm.name_th = "";
});

watch(detailOpen, (isOpen) => {
	if (!isOpen || !selectedUnit.value) return;
	detailForm.code = selectedUnit.value.code;
	detailForm.name_th = selectedUnit.value.name_th;
});

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

function scrollUnitsListToTop() {
	unitsListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function resetListPage() {
	currentPage.value = 1;
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollUnitsListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	nextTick(() => {
		scrollUnitsListToTop();
	});
}

function openUnitDetail(unitId: string) {
	selectedUnitId.value = unitId;
	if (selectedUnit.value) {
		detailForm.code = selectedUnit.value.code;
		detailForm.name_th = selectedUnit.value.name_th;
	}
	detailOpen.value = true;
}

async function fetchStores() {
	storesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/stores");
		stores.value = response.data;
		const nextLockedStoreId = lockedStoreId.value || stores.value[0]?.id || "";
		if (nextLockedStoreId) {
			selectedStoreId.value = nextLockedStoreId;
		}
	} finally {
		storesPending.value = false;
	}
}

async function fetchUnits() {
	if (!effectiveStoreId.value) return;
	unitsPending.value = true;
	unitsError.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<UnitRecord[]>>(`/units?store_id=${encodeURIComponent(effectiveStoreId.value)}`);
		units.value = response.data;
		await nextTick();
		scrollUnitsListToTop();
	} catch (error) {
		unitsError.value = resolveApiErrorMessage(error, "โหลดหน่วยสินค้าไม่สำเร็จ");
	} finally {
		unitsPending.value = false;
	}
}

async function createUnit() {
	if (!canCreateUnit.value || !effectiveStoreId.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<UnitRecord>>("/units", {
			method: "POST",
			body: {
				code: createForm.code.trim(),
				name_th: createForm.name_th.trim(),
				scope: "store",
				store_id: effectiveStoreId.value,
			},
		});
		createOpen.value = false;
		appToast.success({
			title: "สร้างหน่วยสินค้าแล้ว",
			description: createForm.name_th.trim(),
		});
		await fetchUnits();
	} catch (error) {
		appToast.error({
			title: "สร้างหน่วยสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

async function importDefaultUnits() {
	if (!effectiveStoreId.value || !canCreateUnits.value || presetPending.value) return;
	presetPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<UnitRecord[]>>("/units/import-defaults", {
			method: "POST",
			body: {
				store_id: effectiveStoreId.value,
			},
		});
		const createdCount = response.data.length;
		appToast.success({
			title: createdCount > 0 ? "โหลด preset หน่วยสินค้าแล้ว" : "หน่วยมาตรฐานมีครบแล้ว",
			description: createdCount > 0
				? `เพิ่ม ${createdCount} หน่วยมาตรฐานให้ร้านนี้แล้ว`
				: "ไม่พบหน่วยมาตรฐานที่ต้องเพิ่มใหม่",
		});
		await fetchUnits();
	} catch (error) {
		appToast.error({
			title: "โหลด preset ไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		presetPending.value = false;
	}
}

async function saveUnitDetail() {
	if (!selectedUnit.value || !canSaveDetail.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<UnitRecord>>(`/units/${encodeURIComponent(selectedUnit.value.id)}`, {
			method: "PUT",
			body: {
				code: detailForm.code.trim(),
				name_th: detailForm.name_th.trim(),
			},
		});
		appToast.success({
			title: "บันทึกหน่วยสินค้าแล้ว",
			description: detailForm.name_th.trim(),
		});
		await fetchUnits();
		detailOpen.value = false;
	} catch (error) {
		appToast.error({
			title: "บันทึกหน่วยสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

function openDeleteModal() {
	if (!selectedUnit.value || !canDeleteUnits.value || saving.value) return;
	deleteOpen.value = true;
}

function closeDeleteModal() {
	if (saving.value) return;
	deleteOpen.value = false;
}

async function deleteUnit() {
	if (!selectedUnit.value || !canDeleteUnits.value || saving.value) return;
	saving.value = true;
	try {
		await apiFetch(`/units/${encodeURIComponent(selectedUnit.value.id)}`, {
			method: "DELETE",
		});
		appToast.success({
			title: "ลบหน่วยสินค้าแล้ว",
			description: selectedUnit.value.name_th,
		});
		deleteOpen.value = false;
		detailOpen.value = false;
		await fetchUnits();
	} catch (error) {
		appToast.error({
			title: "ลบหน่วยสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

onMounted(async () => {
	storesPending.value = true;
	unitsPending.value = true;
	unitsError.value = null;
	try {
		await fetchStores();
		if (effectiveStoreId.value && canViewUnits.value) {
			await fetchUnits();
		}
	} catch (error) {
		unitsError.value = resolveApiErrorMessage(error, "โหลดหน่วยสินค้าไม่สำเร็จ");
	} finally {
		storesPending.value = false;
		unitsPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		sidebar-title="Units"
		sidebar-compact-title="UNT"
		sidebar-description="จัดการหน่วยสินค้าและหน่วยขายของร้านที่กำลังใช้งาน"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:gap-4">
				<AppPageHeader
					title="หน่วยสินค้า"
					description="จัดการหน่วยสินค้าและรหัสย่อที่ใช้กับสินค้าและ POS"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full gap-3 pt-2 lg:w-auto lg:grid-cols-[minmax(280px,1fr)_auto_auto_auto] lg:justify-end">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="neutral"
							placeholder="ค้นหา code, ชื่อหน่วย หรือ unit id"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-arrow-path-20-solid"
							label="รีเฟรช"
							@click="fetchUnits"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-squares-plus-20-solid"
							:loading="presetPending"
							:spin-icon-on-loading="true"
							:disabled="!canCreateUnits || !effectiveStoreId || presetPending"
							label="โหลด preset"
							@click="importDefaultUnits"
						/>
						<AppButton
							color="primary"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-plus-20-solid"
							label="เพิ่มหน่วย"
							:disabled="!canCreateUnits || !effectiveStoreId"
							@click="createOpen = true"
						/>
					</div>
				</AppPageHeader>

				<div class="grid min-h-0 gap-3 overflow-hidden lg:grid-rows-[auto_minmax(0,1fr)] lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-4">
							<div
								v-for="stat in overviewStats"
								:key="stat.label"
								class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3"
							>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ stat.label }}</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ stat.value }}</p>
							</div>
						</div>
					</UCard>

					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Units</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">จัดการชื่อหน่วยสินค้า รหัสย่อ และรายการหน่วยที่ใช้ในร้านที่กำลังใช้งาน</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div ref="unitsListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="unitsPending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="unitsError" class="p-5 text-center text-sm text-error">{{ unitsError }}</div>
								<div v-else-if="!filteredUnits.length" class="p-5 text-center text-sm text-stone-500">ยังไม่มีหน่วยสินค้า</div>
								<template v-else>
									<button
										v-for="unit in paginatedUnits"
										:key="unit.id"
										type="button"
										class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
										@click="openUnitDetail(unit.id)"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ unit.name_th }}</p>
												<p class="mt-1 truncate text-xs text-stone-500">{{ unit.id }}</p>
												<p class="mt-2 text-xs text-stone-500">
													code {{ unit.code }}
													· {{ unit.scope === 'global' ? 'global unit' : 'store unit' }}
												</p>
											</div>
											<div class="flex items-center gap-2">
												<UBadge color="neutral" variant="soft" :label="unit.code" />
												<AppButton
													color="neutral"
													variant="soft"
													size="md"
													icon="i-heroicons-chevron-right-20-solid"
												>
													จัดการ
												</AppButton>
											</div>
										</div>
									</button>
								</template>
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
												:disabled="currentPage <= 1 || unitsPending"
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
												:disabled="currentPage >= totalPages || unitsPending"
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
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				:title="selectedUnit ? selectedUnit.name_th : 'รายละเอียดหน่วยสินค้า'"
				description="แก้ชื่อหน่วยสินค้าและรหัสย่อของหน่วยนี้"
				desktop-width="420px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedUnit">
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Unit id</p>
								<p class="mt-2 text-sm font-semibold text-stone-900">{{ selectedUnit.id }}</p>
								<p class="mt-1 text-xs text-stone-500">Store: {{ selectedStoreLabel }}</p>
							</div>

							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">รหัสย่อ</label>
								<UInput v-model="detailForm.code" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
								<p class="text-xs leading-5 text-stone-500">ใช้รหัสสั้นเพื่อให้เลือกหน่วยได้เร็วขึ้นในฟอร์มสินค้าและจุดขาย เช่น `pcs`, `box`, `kg`</p>
							</div>

							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">ชื่อหน่วยสินค้า</label>
								<UInput v-model="detailForm.name_th" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Scope</p>
								<p class="mt-2 text-sm font-semibold text-stone-900">{{ selectedUnit.scope === "global" ? "Global" : "Store" }}</p>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-3 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton color="error" variant="soft" size="md" icon="i-heroicons-trash-20-solid" :block="true" :disabled="!canDeleteUnits || saving" @click="openDeleteModal">ลบ</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" :loading="saving" :spin-icon-on-loading="true" :disabled="saving || !canSaveDetail || !canUpdateUnits" @click="saveUnitDetail">
									บันทึก
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteOpen"
				title="ลบหน่วยสินค้า"
				description="ยืนยันการลบหน่วยสินค้าแบบถาวรจากร้านที่กำลังใช้งาน"
				desktop-width="420px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-4">
						<div class="space-y-4 pb-6">
							<div class="rounded-md border border-error-200 bg-error-50 p-4">
								<p class="text-sm font-semibold text-stone-950">ลบแบบถาวร</p>
								<p class="mt-1 text-xs leading-5 text-stone-600">ถ้าลบสำเร็จ หน่วยสินค้านี้จะหายจากระบบทันที และต้องสร้างใหม่หากต้องการใช้งานอีกครั้ง</p>
							</div>

							<div v-if="selectedUnit" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">{{ selectedUnit.name_th }}</p>
								<p class="mt-1 text-xs text-stone-500">code: {{ selectedUnit.code }}</p>
							</div>

							<div class="rounded-md border border-neutral-200 bg-white p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">Confirm delete</p>
								<p class="mt-3 text-sm text-stone-700">ยืนยันการลบหน่วยสินค้านี้ออกจากร้านปัจจุบัน ถ้าลบแล้วจะไม่สามารถกู้คืนได้จากหน้าจอนี้</p>
							</div>
						</div>
					</div>

					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeDeleteModal">ปิด</AppButton>
							<AppButton
								color="error"
								variant="solid"
								size="md"
								icon="i-heroicons-trash-20-solid"
								:loading="saving"
								:disabled="saving || !canDeleteUnits"
								:spin-icon-on-loading="true"
								:block="true"
								@click="deleteUnit"
							>
								ลบถาวร
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="createOpen"
				title="เพิ่มหน่วยสินค้า"
				description="สร้างหน่วยสินค้าใหม่สำหรับร้านที่กำลังใช้งาน"
				desktop-width="420px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ร้านที่กำลังใช้งาน</p>
							<p class="mt-2 text-sm font-semibold text-stone-900">{{ selectedStoreLabel }}</p>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">รหัสย่อ</label>
							<UInput v-model="createForm.code" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
							<p class="text-xs leading-5 text-stone-500">แนะนำให้ใช้รหัสสั้นและจำง่าย เช่น `pcs`, `pack`, `kg`, `set`</p>
						</div>

						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">ชื่อหน่วยสินค้า</label>
							<UInput v-model="createForm.name_th" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :block="true" :loading="saving" :spin-icon-on-loading="true" :disabled="saving || !canCreateUnit" @click="createUnit">
								บันทึกหน่วย
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
