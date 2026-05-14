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

type CategoryRecord = {
	id: string;
	store_id: string;
	name: string;
	sort_order: number;
	created_at: string;
};

const { apiFetch } = useApiClient();
const { currentUser, currentAccess, can } = useAuthSession();
const appToast = useAppToast();

const searchQuery = ref("");
const selectedStoreId = ref("");
const selectedCategoryId = ref("");
const categoriesListScrollRef = ref<HTMLElement | null>(null);
const categoriesPending = ref(false);
const storesPending = ref(true);
const categoriesError = ref<string | null>(null);
const saving = ref(false);
const createOpen = ref(false);
const detailOpen = ref(false);
const deleteOpen = ref(false);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const stores = ref<StoreRecord[]>([]);
const categories = ref<CategoryRecord[]>([]);

const createForm = reactive({
	name: "",
	sort_order: "0",
});

const detailForm = reactive({
	name: "",
	sort_order: "0",
});

const isElevatedStoreManager = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
));
const canViewCategories = computed(() => isElevatedStoreManager.value || can("products.view"));
const canCreateCategories = computed(() => isElevatedStoreManager.value || can("products.create"));
const canUpdateCategories = computed(() => isElevatedStoreManager.value || can("products.update"));
const canDeleteCategories = computed(() => isElevatedStoreManager.value || can("products.archive"));
const lockedStoreId = computed(() => (
	currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| ""
));
const membershipCount = computed(() => currentAccess.value?.memberships?.length ?? 0);
const hasMultipleStoreAccess = computed(() => membershipCount.value > 1);
const selectedStoreLabel = computed(() => (
	stores.value.find((store) => store.id === selectedStoreId.value)?.name
	|| "ยังไม่พบร้านที่กำลังใช้งาน"
));
const filteredCategories = computed(() => {
	const keyword = searchQuery.value.trim().toLowerCase();
	if (!keyword) return categories.value;
	return categories.value.filter((category) => (
		category.name.toLowerCase().includes(keyword)
		|| category.id.toLowerCase().includes(keyword)
	));
});
const totalCategories = computed(() => filteredCategories.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalCategories.value / pageSize.value)));
const paginatedCategories = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return filteredCategories.value.slice(startIndex, startIndex + pageSize.value);
});
const selectedCategory = computed(() => (
	paginatedCategories.value.find((category) => category.id === selectedCategoryId.value)
	|| filteredCategories.value.find((category) => category.id === selectedCategoryId.value)
	|| categories.value.find((category) => category.id === selectedCategoryId.value)
	|| paginatedCategories.value[0]
	|| filteredCategories.value[0]
	|| categories.value[0]
	|| null
));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalCategories.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalCategories.value));
const pageSummaryText = computed(() => (
	totalCategories.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalCategories.value} หมวด`
));
const overviewStats = computed(() => ([
	{ label: "หมวดทั้งหมด", value: categories.value.length },
	{ label: "ผลลัพธ์ที่แสดง", value: filteredCategories.value.length },
	{ label: "sort order สูงสุด", value: categories.value.length ? Math.max(...categories.value.map((category) => Number(category.sort_order || 0))) : 0 },
	{ label: "โหลดล่าสุด", value: categories.value.length ? formatDate(categories.value[0].created_at) : "-" },
]));
const nextSortOrder = computed(() => (
	categories.value.length
		? Math.max(...categories.value.map((category) => Number(category.sort_order || 0))) + 1
		: 1
));
const canCreateCategory = computed(() => (
	Boolean(selectedStoreId.value)
	&& createForm.name.trim().length > 0
));
const canSaveDetail = computed(() => (
	Boolean(selectedCategory.value)
	&& detailForm.name.trim().length > 0
	&& detailHasChanges.value
));
const detailHasChanges = computed(() => {
	if (!selectedCategory.value) return false;
	return (
		detailForm.name.trim() !== selectedCategory.value.name
		|| toNumberStringValue(detailForm.sort_order) !== Number(selectedCategory.value.sort_order ?? 0)
	);
});

watch([ lockedStoreId, stores ], () => {
	const nextStoreId = lockedStoreId.value || stores.value[0]?.id || "";
	if (nextStoreId && selectedStoreId.value !== nextStoreId) {
		selectedStoreId.value = nextStoreId;
	}
}, { immediate: true });

watch(selectedStoreId, async (value) => {
	if (!value || !canViewCategories.value) return;
	await fetchCategories();
}, { immediate: false });

watch(filteredCategories, (value) => {
	const maxPage = Math.max(1, Math.ceil(value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
	}
	if (!value.length) {
		selectedCategoryId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((category) => category.id === selectedCategoryId.value)) {
		selectedCategoryId.value = paginatedCategories.value[0]?.id || value[0].id;
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
	createForm.name = "";
	createForm.sort_order = String(nextSortOrder.value);
});

watch(detailOpen, (isOpen) => {
	if (!isOpen || !selectedCategory.value) return;
	detailForm.name = selectedCategory.value.name;
	detailForm.sort_order = String(selectedCategory.value.sort_order ?? 0);
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

function toNumberStringValue(value: string | number | null | undefined) {
	const trimmed = String(value ?? "").trim();
	if (trimmed === "") return 0;
	const nextValue = Number(trimmed);
	return Number.isFinite(nextValue) ? nextValue : 0;
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function scrollCategoriesListToTop() {
	categoriesListScrollRef.value?.scrollTo({
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
		scrollCategoriesListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	nextTick(() => {
		scrollCategoriesListToTop();
	});
}

function openCategoryDetail(categoryId: string) {
	selectedCategoryId.value = categoryId;
	if (selectedCategory.value) {
		detailForm.name = selectedCategory.value.name;
		detailForm.sort_order = String(selectedCategory.value.sort_order ?? 0);
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

async function fetchCategories() {
	if (!selectedStoreId.value) return;
	categoriesPending.value = true;
	categoriesError.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<CategoryRecord[]>>(`/product-categories?store_id=${encodeURIComponent(selectedStoreId.value)}`);
		categories.value = response.data;
		await nextTick();
		scrollCategoriesListToTop();
	} catch (error) {
		categoriesError.value = resolveApiErrorMessage(error, "โหลดหมวดสินค้าไม่สำเร็จ");
	} finally {
		categoriesPending.value = false;
	}
}

async function createCategory() {
	if (!canCreateCategory.value || !selectedStoreId.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<CategoryRecord>>("/product-categories", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name.trim(),
				sort_order: toNumberStringValue(createForm.sort_order),
			},
		});
		createOpen.value = false;
		appToast.success({
			title: "สร้างหมวดสินค้าแล้ว",
			description: createForm.name.trim(),
		});
		await fetchCategories();
	} catch (error) {
		appToast.error({
			title: "สร้างหมวดสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

async function saveCategoryDetail() {
	if (!selectedCategory.value || !canSaveDetail.value) return;
	saving.value = true;
	try {
		await apiFetch<ApiEnvelope<CategoryRecord>>(`/product-categories/${encodeURIComponent(selectedCategory.value.id)}`, {
			method: "PUT",
			body: {
				name: detailForm.name.trim(),
				sort_order: toNumberStringValue(detailForm.sort_order),
			},
		});
		appToast.success({
			title: "บันทึกหมวดสินค้าแล้ว",
			description: detailForm.name.trim(),
		});
		await fetchCategories();
		detailOpen.value = false;
	} catch (error) {
		appToast.error({
			title: "บันทึกหมวดสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

async function deleteCategory() {
	if (!selectedCategory.value || !canDeleteCategories.value || saving.value) return;
	saving.value = true;
	try {
		await apiFetch(`/product-categories/${encodeURIComponent(selectedCategory.value.id)}`, {
			method: "DELETE",
		});
		appToast.success({
			title: "ลบหมวดสินค้าแล้ว",
			description: selectedCategory.value.name,
		});
		deleteOpen.value = false;
		detailOpen.value = false;
		await fetchCategories();
	} catch (error) {
		appToast.error({
			title: "ลบหมวดสินค้าไม่สำเร็จ",
			description: resolveApiErrorMessage(error),
			timeout: 3200,
		});
	} finally {
		saving.value = false;
	}
}

function openDeleteModal() {
	if (!selectedCategory.value || !canDeleteCategories.value || saving.value) return;
	deleteOpen.value = true;
}

function closeDeleteModal() {
	if (saving.value) return;
	deleteOpen.value = false;
}

onMounted(async () => {
	storesPending.value = true;
	categoriesPending.value = true;
	categoriesError.value = null;
	try {
		await fetchStores();
		if (selectedStoreId.value && canViewCategories.value) {
			await fetchCategories();
		}
	} catch (error) {
		categoriesError.value = resolveApiErrorMessage(error, "โหลดหมวดสินค้าไม่สำเร็จ");
	} finally {
		storesPending.value = false;
		categoriesPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		sidebar-title="Categories"
		sidebar-compact-title="CAT"
		sidebar-description="จัดการหมวดสินค้าในร้านที่กำลังใช้งาน พร้อมลำดับการแสดงผลสำหรับหน้าสินค้าและ POS"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:gap-4">
				<AppPageHeader
					title="หมวดสินค้า"
					description="จัดการหมวดสินค้า ลำดับการแสดงผล และดูรายการหมวดของร้านที่กำลังใช้งาน"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full gap-3 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:justify-end">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="neutral"
							placeholder="ค้นหาชื่อหมวดหรือ category id"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-arrow-path-20-solid"
							label="รีเฟรช"
							@click="fetchCategories"
						/>
						<AppButton
							color="primary"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-plus-20-solid"
							label="เพิ่มหมวด"
							:disabled="!canCreateCategories || !selectedStoreId"
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
									<p class="text-sm font-semibold text-stone-950">Categories</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">จัดการหมวดสินค้าและลำดับการแสดงผลของร้านที่กำลังใช้งาน</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div ref="categoriesListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="categoriesPending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="categoriesError" class="p-5 text-center text-sm text-error">{{ categoriesError }}</div>
								<div v-else-if="!filteredCategories.length" class="p-5 text-center text-sm text-stone-500">ยังไม่มีหมวดสินค้า</div>
								<template v-else>
									<button
										v-for="category in paginatedCategories"
										:key="category.id"
										type="button"
										class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
										@click="openCategoryDetail(category.id)"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ category.name }}</p>
												<p class="mt-1 truncate text-xs text-stone-500">{{ category.id }}</p>
												<p class="mt-2 text-xs text-stone-500">
													sort {{ category.sort_order ?? 0 }}
													· สร้างเมื่อ {{ formatDate(category.created_at) }}
												</p>
											</div>
											<div class="flex items-center gap-2">
												<UBadge color="neutral" variant="soft" :label="`sort ${category.sort_order ?? 0}`" />
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
												:disabled="currentPage <= 1 || categoriesPending"
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
												:disabled="currentPage >= totalPages || categoriesPending"
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
				:title="selectedCategory ? selectedCategory.name : 'รายละเอียดหมวดสินค้า'"
				description="แก้ชื่อหมวดสินค้าและลำดับการแสดงผลของหมวดนี้"
				desktop-width="420px"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedCategory">
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Category id</p>
								<p class="mt-2 text-sm font-semibold text-stone-900">{{ selectedCategory.id }}</p>
								<p class="mt-1 text-xs text-stone-500">Store: {{ selectedStoreLabel }}</p>
							</div>

							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">ชื่อหมวดสินค้า</label>
								<UInput v-model="detailForm.name" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
							</div>

							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">sort order</label>
								<UInput v-model="detailForm.sort_order" type="number" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
								<p class="text-xs leading-5 text-stone-500">เลขน้อยจะแสดงก่อน เลขมากจะแสดงทีหลัง เหมาะใช้จัดลำดับหมวดบนหน้าสินค้าและ POS</p>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Created at</p>
								<p class="mt-2 text-sm font-semibold text-stone-900">{{ formatDate(selectedCategory.created_at) }}</p>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-3 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton color="error" variant="soft" size="md" icon="i-heroicons-trash-20-solid" :block="true" :disabled="!canDeleteCategories || saving" @click="openDeleteModal">ลบ</AppButton>
								<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" :loading="saving" :spin-icon-on-loading="true" :disabled="saving || !canSaveDetail || !canUpdateCategories" @click="saveCategoryDetail">
									บันทึก
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteOpen"
				title="ลบหมวดสินค้า"
				description="ยืนยันการลบหมวดสินค้าแบบถาวรจากร้านที่กำลังใช้งาน"
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
								<p class="mt-1 text-xs leading-5 text-stone-600">ถ้าลบสำเร็จ หมวดสินค้านี้จะหายจากระบบทันที และต้องสร้างใหม่หากต้องการใช้งานอีกครั้ง</p>
							</div>

							<div v-if="selectedCategory" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-medium text-stone-900">{{ selectedCategory.name }}</p>
								<p class="mt-1 text-xs text-stone-500">Store: {{ selectedStoreLabel }}</p>
							</div>

							<div class="rounded-md border border-neutral-200 bg-white p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">Confirm delete</p>
								<p class="mt-3 text-sm text-stone-700">ยืนยันการลบหมวดสินค้านี้ออกจากร้านปัจจุบัน ถ้าลบแล้วจะไม่สามารถกู้คืนได้จากหน้าจอนี้</p>
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
								:disabled="saving || !canDeleteCategories"
								:spin-icon-on-loading="true"
								:block="true"
								@click="deleteCategory"
							>
								ลบถาวร
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="createOpen"
				title="เพิ่มหมวดสินค้า"
				description="สร้างหมวดสินค้าใหม่สำหรับร้านที่กำลังใช้งาน"
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
							<label class="text-sm font-medium text-stone-700">ชื่อหมวดสินค้า</label>
							<UInput v-model="createForm.name" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
						</div>

							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">sort order</label>
								<UInput v-model="createForm.sort_order" type="number" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
								<p class="text-xs leading-5 text-stone-500">ระบบเติมค่าให้อัตโนมัติเป็นลำดับถัดไป และคุณยังปรับเองได้ถ้าต้องการเรียงหมวดใหม่</p>
							</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :block="true" :loading="saving" :spin-icon-on-loading="true" :disabled="saving || !canCreateCategory" @click="createCategory">
								บันทึกหมวด
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
