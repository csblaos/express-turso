<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ClientRecord = {
	id: string;
	email: string;
	name: string;
	system_role: string;
	ui_locale: string;
	can_create_stores: number;
	max_stores: number | null;
	can_create_branches: number;
	max_branches_per_store: number | null;
	must_change_password: number;
	status: "active" | "suspended";
	client_suspended_reason: string | null;
	created_at: string;
};

type ClientListResponse = {
	items: ClientRecord[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
	summary: {
		total: number;
		active: number;
		suspended: number;
	};
};

type StoreRecord = {
	id: string;
	name: string;
};

type RoleRecord = {
	id: string;
	name: string;
	store_id: string;
};

const { apiFetch } = useApiClient();
const { currentUser, can } = useAuthSession();
const appToast = useAppToast();

const searchQuery = ref("");
const activeStatus = ref<"all" | "active" | "suspended">("all");
const pending = ref(true);
const saving = ref(false);
const error = ref<string | null>(null);
const users = ref<ClientRecord[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const totalUsers = ref(0);
const usersListScrollRef = ref<HTMLElement | null>(null);
const selectedUserId = ref("");
const createOpen = ref(false);
const detailOpen = ref(false);
const createStores = ref<StoreRecord[]>([]);
const createRoles = ref<RoleRecord[]>([]);
const createMetaPending = ref(false);

const summaryData = ref({
	total: 0,
	active: 0,
	suspended: 0,
});

const createForm = reactive({
	name: "",
	email: "",
	password: "",
	store_id: "",
	role_id: "",
	ui_locale: "th",
	status: "active" as "active" | "inactive",
});

const detailForm = reactive({
	name: "",
	email: "",
	system_role: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	can_create_branches: true,
	max_branches_per_store: "1",
	must_change_password: false,
	status: "active" as "active" | "suspended",
	suspend_reason: "",
});

const canManageSystem = computed(() => (
	can("superadmin.users.create")
	|| can("superadmin.users.update")
	|| can("settings.users.create")
	|| can("settings.users.update")
	|| can("settings.users.suspend")
	|| can("settings.users.assign_role")
	|| can("system_admin.clients.update")
));

const selectedUser = computed(() => users.value.find((user) => user.id === selectedUserId.value) || null);

const canCreateUser = computed(() => (
	createForm.name.trim().length > 0
	&& createForm.email.trim().length > 0
	&& createForm.password.trim().length >= 6
	&& createForm.store_id.trim().length > 0
	&& createForm.role_id.trim().length > 0
));

const canSaveDetail = computed(() => (
	Boolean(selectedUser.value)
	&& detailForm.name.trim().length > 0
));
const totalPages = computed(() => Math.max(1, Math.ceil(totalUsers.value / pageSize.value)));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalUsers.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalUsers.value));
const pageSummaryText = computed(() => (
	totalUsers.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalUsers.value} บัญชี`
));

const overviewStats = computed(() => ([
	{ label: "ผู้ใช้ทั้งหมด", value: summaryData.value.total },
	{ label: "กำลังใช้งาน", value: summaryData.value.active },
	{ label: "ถูกระงับ", value: summaryData.value.suspended },
	{ label: "โหลดล่าสุด", value: users.value.length },
]));

function resolveDefaultRoleId(roleList: RoleRecord[]): string {
	if (!roleList.length) return "";
	const cashier = roleList.find((role) => role.name.trim().toLowerCase() === "cashier");
	return cashier?.id || roleList[0].id;
}

function statusTone(status: ClientRecord["status"]) {
	return status === "active" ? "success" : "warning";
}

function statusLabel(status: ClientRecord["status"]) {
	return status === "active" ? "ใช้งาน" : "ระงับ";
}

function roleLabel(role: string) {
	return role || "superadmin";
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function toOptionalNumber(value: string | number) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : Number(trimmed);
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

function resetCreateForm() {
	createForm.name = "";
	createForm.email = "";
	createForm.password = "";
	createForm.store_id = "";
	createForm.role_id = "";
	createForm.ui_locale = "th";
	createForm.status = "active";
	createRoles.value = [];
}

function scrollUsersListToTop() {
	usersListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function resetListPage() {
	currentPage.value = 1;
}

function applyFilters() {
	resetListPage();
	return loadUsers();
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	return loadUsers();
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	resetListPage();
	return loadUsers();
}

async function loadCreateStores() {
	const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/superadmin/stores");
	createStores.value = response.data;
}

async function loadCreateRoles(storeId: string) {
	if (!storeId) {
		createRoles.value = [];
		return;
	}
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles?store_id=${encodeURIComponent(storeId)}`);
	createRoles.value = response.data;
	if (createForm.role_id && !createRoles.value.some((role) => role.id === createForm.role_id)) {
		createForm.role_id = resolveDefaultRoleId(createRoles.value);
	}
	if (!createForm.role_id) {
		createForm.role_id = resolveDefaultRoleId(createRoles.value);
	}
}

async function openCreateModal() {
	if (!canManageSystem.value) {
		appToast.error({
			title: "ไม่มีสิทธิ์ใช้งาน",
			description: "บัญชีนี้ไม่สามารถจัดการผู้ใช้ได้",
		});
		return;
	}

	resetCreateForm();
	createOpen.value = true;
	createMetaPending.value = true;
	try {
		if (!createStores.value.length) {
			await loadCreateStores();
		}
		if (createStores.value.length > 0) {
			createForm.store_id = createStores.value[0].id;
			await loadCreateRoles(createForm.store_id);
		}
	} catch (err) {
		appToast.error({
			title: "โหลดข้อมูลสำหรับสร้างผู้ใช้ไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		createMetaPending.value = false;
	}
}

function openDetailModal(userId: string) {
	const user = users.value.find((item) => item.id === userId);
	if (!user) return;
	if (user.system_role !== "superadmin") {
		appToast.info({
			title: "ผู้ใช้พนักงาน",
			description: "แนะนำจัดการสิทธิ์ของพนักงานผ่านหน้าผู้ใช้งานในร้าน",
		});
		return;
	}
	selectedUserId.value = user.id;
	detailForm.name = user.name;
	detailForm.email = user.email;
	detailForm.system_role = user.system_role;
	detailForm.ui_locale = user.ui_locale || "th";
	detailForm.can_create_stores = Boolean(user.can_create_stores);
	detailForm.max_stores = user.max_stores === null ? "" : String(user.max_stores);
	detailForm.can_create_branches = Boolean(user.can_create_branches);
	detailForm.max_branches_per_store = user.max_branches_per_store === null ? "" : String(user.max_branches_per_store);
	detailForm.must_change_password = Boolean(user.must_change_password);
	detailForm.status = user.status;
	detailForm.suspend_reason = user.client_suspended_reason || "";
	detailOpen.value = true;
}

async function loadUsers() {
	pending.value = true;
	error.value = null;
	await nextTick();
	scrollUsersListToTop();
	try {
		const params = new URLSearchParams();
		params.set("page", String(currentPage.value));
		params.set("limit", String(pageSize.value));
		if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
		if (activeStatus.value !== "all") params.set("status", activeStatus.value);

		const response = await apiFetch<ApiEnvelope<ClientListResponse>>(`/superadmin/users?${params.toString()}`);
		users.value = response.data.items;
		totalUsers.value = response.data.total;
		summaryData.value = response.data.summary;

		if (selectedUserId.value && !users.value.some((item) => item.id === selectedUserId.value)) {
			selectedUserId.value = "";
			detailOpen.value = false;
		}

		const maxPage = Math.max(1, Math.ceil(totalUsers.value / pageSize.value));
		if (currentPage.value > maxPage) {
			currentPage.value = maxPage;
			await loadUsers();
			return;
		}
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "โหลดผู้ใช้ไม่สำเร็จ");
	} finally {
		pending.value = false;
	}
}

async function reloadUsers() {
	await loadUsers();
}

async function createUser() {
	if (!canCreateUser.value) return;
	saving.value = true;
	try {
		await apiFetch("/rbac/store-members", {
			method: "POST",
			body: {
				name: createForm.name.trim(),
				email: createForm.email.trim(),
				password: createForm.password,
				store_id: createForm.store_id,
				role_id: createForm.role_id,
				status: createForm.status,
				ui_locale: createForm.ui_locale,
				system_role: "staff",
				added_by: currentUser.value?.id || null,
			},
		});

		appToast.success({
			title: "สร้างผู้ใช้แล้ว",
			description: "เพิ่มพนักงานเข้าร้านเรียบร้อยแล้ว",
		});
		createOpen.value = false;
		resetListPage();
		await loadUsers();
	} catch (err) {
		appToast.error({
			title: "สร้างผู้ใช้ไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function saveDetail() {
	if (!selectedUser.value || !canSaveDetail.value) return;
	saving.value = true;
	try {
		await apiFetch(`/system-admin/clients/${encodeURIComponent(selectedUser.value.id)}`, {
			method: "PATCH",
			body: {
				name: detailForm.name.trim(),
				ui_locale: detailForm.ui_locale,
				can_create_stores: detailForm.can_create_stores ? 1 : 0,
				max_stores: detailForm.can_create_stores ? toOptionalNumber(detailForm.max_stores) : null,
				can_create_branches: detailForm.can_create_stores && detailForm.can_create_branches ? 1 : 0,
				max_branches_per_store: detailForm.can_create_stores ? toOptionalNumber(detailForm.max_branches_per_store) : null,
				must_change_password: detailForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});

		if (detailForm.status !== selectedUser.value.status) {
			await apiFetch(`/system-admin/clients/${encodeURIComponent(selectedUser.value.id)}/status`, {
				method: "PATCH",
				body: {
					status: detailForm.status,
					reason: detailForm.status === "suspended" ? (detailForm.suspend_reason.trim() || null) : null,
					actor_user_id: currentUser.value?.id || null,
				},
			});
		}

		appToast.success({
			title: "อัปเดตผู้ใช้แล้ว",
			description: "ข้อมูลถูกบันทึกลงฐานข้อมูลแล้ว",
		});
		detailOpen.value = false;
		await loadUsers();
	} catch (err) {
		appToast.error({
			title: "บันทึกไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

watch(() => createForm.store_id, async (storeId) => {
	if (!createOpen.value || createMetaPending.value) return;
	await loadCreateRoles(storeId);
});

watch(() => detailForm.can_create_stores, (enabled) => {
	if (enabled) return;
	detailForm.max_stores = "";
	detailForm.max_branches_per_store = "";
	detailForm.can_create_branches = false;
});

onMounted(loadUsers);
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="จัดการผู้ใช้ระดับ superadmin และติดตามสถานะการเข้าถึงร้าน"
	>
		<template #default="{ openSidebar }">
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="Superadmin Users"
					description="ข้อมูลผู้ใช้ภายใต้ client ปัจจุบันจาก API /superadmin/users"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="reloadUsers">
								รีโหลด
							</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-user-plus-20-solid" @click="openCreateModal">
								เพิ่มผู้ใช้
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
							<div
								v-for="item in overviewStats"
								:key="item.label"
								class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
							>
								<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ item.label }}</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ item.value }}</p>
							</div>
						</div>
					</UCard>

					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Superadmin users</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ข้อมูลดึงตรงจาก API พร้อมแบ่งหน้าแบบเดียวกับหน้า clients</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_180px_auto]">
									<div class="relative">
										<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute top-1/2 left-3.5 h-4.5 w-4.5 -translate-y-1/2 text-stone-400" />
										<input
											v-model="searchQuery"
											type="search"
											placeholder="ค้นหาชื่อหรืออีเมล"
											class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
											@keydown.enter="applyFilters"
										>
									</div>
									<select v-model="activeStatus" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">ทุกสถานะ</option>
										<option value="active">ใช้งาน</option>
										<option value="suspended">ระงับ</option>
									</select>
									<AppButton color="primary" variant="soft" size="md" class="sm:self-stretch" @click="applyFilters">
										ใช้ตัวกรอง
									</AppButton>
								</div>
							</div>

								<div ref="usersListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
									<div v-if="pending" class="min-h-[280px]">
										<AppInlineLoadingBar container-class="bg-neutral-100" />
									</div>
									<div v-else-if="error" class="p-5 text-center text-sm text-error">{{ error }}</div>
									<div v-else-if="!users.length" class="p-5 text-center text-sm text-stone-500">ยังไม่มีผู้ใช้</div>
									<template v-else>
										<button
											v-for="user in users"
											:key="user.id"
											type="button"
											class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
											@click="openDetailModal(user.id)"
										>
											<div class="flex items-center justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ user.name }}</p>
													<p class="mt-1 truncate text-xs text-stone-500">{{ user.email }}</p>
													<p class="mt-2 text-xs text-stone-500">{{ roleLabel(user.system_role) }} · สร้างเมื่อ {{ formatDateTime(user.created_at) }}</p>
												</div>
												<div class="flex items-center gap-2">
													<UBadge :color="statusTone(user.status)" variant="soft" :label="statusLabel(user.status)" />
													<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-chevron-right-20-solid">จัดการ</AppButton>
												</div>
											</div>
										</button>
									</template>
									</div>
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
												:disabled="currentPage <= 1 || pending"
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
												:disabled="currentPage >= totalPages || pending"
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
				v-model="createOpen"
				title="Create Employee"
				description="เพิ่มพนักงานใหม่และกำหนดสิทธิ์เข้าถึงร้านทันที"
				desktop-width="560px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อ</label>
								<input v-model="createForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">อีเมล</label>
								<input v-model="createForm.email" type="email" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">รหัสผ่าน</label>
								<input v-model="createForm.password" type="password" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">เลือกร้าน</label>
								<select
									v-model="createForm.store_id"
									:disabled="createMetaPending || saving || !createStores.length"
									class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50"
								>
									<option value="" disabled>เลือกร้านที่พนักงานจะเข้าถึง</option>
									<option v-for="store in createStores" :key="store.id" :value="store.id">
										{{ store.name }}
									</option>
								</select>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">บทบาทในร้าน</label>
								<select
									v-model="createForm.role_id"
									:disabled="createMetaPending || saving || !createForm.store_id || !createRoles.length"
									class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50"
								>
									<option value="" disabled>เลือกบทบาทของพนักงาน</option>
									<option v-for="role in createRoles" :key="role.id" :value="role.id">
										{{ role.name }}
									</option>
								</select>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">สถานะ</label>
								<select v-model="createForm.status" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option value="active">ใช้งาน</option>
									<option value="inactive">ไม่ใช้งาน</option>
								</select>
							</div>
							<div v-if="!createStores.length" class="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
								ยังไม่มีร้านในบัญชีนี้ กรุณาสร้างร้านก่อนเพิ่มพนักงาน
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" :loading="saving" :disabled="!canCreateUser" :spin-icon-on-loading="true" :block="true" @click="createUser">สร้างผู้ใช้</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="detailOpen"
				title="User Detail"
				description="แก้ไขข้อมูลผู้ใช้บนฐานข้อมูลจริง"
				desktop-width="560px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div v-if="selectedUser" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-sm font-semibold text-stone-950">{{ selectedUser.id }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ roleLabel(selectedUser.system_role) }} · สร้างเมื่อ {{ formatDateTime(selectedUser.created_at) }}</p>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">ชื่อ</label>
								<input v-model="detailForm.name" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">อีเมล</label>
								<input v-model="detailForm.email" disabled type="email" class="w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700 shadow-sm outline-none">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">max stores</label>
									<input v-model="detailForm.max_stores" :disabled="!detailForm.can_create_stores" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50">
								</div>
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">max branches/store</label>
									<input v-model="detailForm.max_branches_per_store" :disabled="!detailForm.can_create_stores" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50">
								</div>
							</div>
							<div class="grid gap-3">
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div><p class="text-sm font-medium text-stone-900">อนุญาตสร้างร้าน</p></div>
								</label>
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_branches" :disabled="!detailForm.can_create_stores" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div><p class="text-sm font-medium text-stone-900">อนุญาตสร้างสาขา</p></div>
								</label>
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div><p class="text-sm font-medium text-stone-900">บังคับเปลี่ยนรหัสผ่านครั้งถัดไป</p></div>
								</label>
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">สถานะ</label>
									<select v-model="detailForm.status" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="active">ใช้งาน</option>
										<option value="suspended">ระงับ</option>
									</select>
								</div>
								<div v-if="detailForm.status === 'suspended'">
									<label class="mb-2 block text-xs font-medium text-stone-500">เหตุผลระงับ</label>
									<input v-model="detailForm.suspend_reason" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								</div>
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
							<AppButton color="primary" variant="solid" size="md" :loading="saving" :disabled="!canSaveDetail" :spin-icon-on-loading="true" :block="true" @click="saveDetail">บันทึก</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
