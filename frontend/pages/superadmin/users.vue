<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

// Shared starter credential for accounts created here. Every flow on this page
// sends must_change_password, so the staff member replaces it on first sign-in.
const QUICK_FILL_PASSWORD = "123456";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ClientRecord = {
	id: string;
	username: string;
	email: string;
	name: string;
	system_role: string;
	ui_locale: string;
	can_create_stores: number;
	max_stores: number | null;
	must_change_password: number;
	status: "active" | "suspended";
	client_suspended_reason: string | null;
	created_at: string;
	membership_count: number;
	primary_store_id: string | null;
	primary_store_name: string | null;
	primary_role_id: string | null;
	primary_role_name: string | null;
	primary_member_status: string | null;
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
const { t, locale } = useI18n();
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
const memberDetailOpen = ref(false);
const deleteOpen = ref(false);
const createStores = ref<StoreRecord[]>([]);
const createRoles = ref<RoleRecord[]>([]);
const createMetaPending = ref(false);
const memberMetaPending = ref(false);
const memberRoles = ref<RoleRecord[]>([]);
const showCreatePassword = ref(false);
const showMemberResetPassword = ref(false);
const createSuccess = ref<{
	name: string;
	username: string;
	email: string;
	password: string;
} | null>(null);

const summaryData = ref({
	total: 0,
	active: 0,
	suspended: 0,
});

const createForm = reactive({
	name: "",
	username: "",
	email: "",
	password: "",
	store_id: "",
	role_id: "",
	ui_locale: "th",
	status: "active" as "active" | "inactive",
});

const detailForm = reactive({
	name: "",
	username: "",
	email: "",
	system_role: "",
	ui_locale: "th",
	can_create_stores: true,
	max_stores: "1",
	must_change_password: false,
	status: "active" as "active" | "suspended",
	suspend_reason: "",
});

const memberForm = reactive({
	store_id: "",
	store_name: "",
	role_id: "",
	status: "active" as "active" | "inactive",
	reset_password: "",
	must_change_password: true,
});

const canManageSystem = computed(() => (
	can("superadmin.users.create")
	|| can("superadmin.users.update")
	|| can("settings.users.create")
	|| can("settings.users.update")
	|| can("settings.users.suspend")
	|| can("settings.users.assign_role")
	|| can("settings.users.remove_member")
	|| can("system_admin.clients.update")
));
const canEditClientAccounts = computed(() => can("system_admin.clients.update"));
const canDeleteSelectedUser = computed(() => Boolean(
	selectedUser.value
	&& selectedUser.value.id !== currentUser.value?.id
	&& selectedUser.value.system_role !== "superadmin"
	&& selectedUser.value.membership_count === 1
	&& selectedUser.value.primary_store_id
	&& (can("settings.users.remove_member") || can("superadmin.users.archive")),
));
const deleteCopy = computed(() => locale.value === "lo" ? {
	title: "ນຳອອກຈາກຮ້ານ", description: "ນຳຜູ້ໃຊ້ນີ້ອອກຈາກຮ້ານ", warning: "ຜູ້ໃຊ້ຈະບໍ່ສາມາດເຂົ້າໃຊ້ຮ້ານນີ້ໄດ້ອີກ ແຕ່ບັນຊີ ແລະ ປະຫວັດເກົ່າຈະຍັງຢູ່", confirm: "ຢືນຢັນການນຳອອກ", success: "ນຳຜູ້ໃຊ້ອອກຈາກຮ້ານແລ້ວ", failed: "ນຳຜູ້ໃຊ້ອອກບໍ່ສຳເລັດ",
} : locale.value === "th" ? {
	title: "นำออกจากร้าน", description: "นำผู้ใช้นี้ออกจากร้าน", warning: "ผู้ใช้จะไม่สามารถเข้าถึงร้านนี้ได้อีก แต่บัญชีและประวัติเดิมจะยังอยู่", confirm: "ยืนยันการนำออก", success: "นำผู้ใช้ออกจากร้านแล้ว", failed: "นำผู้ใช้ออกจากร้านไม่สำเร็จ",
} : {
	title: "Remove from store", description: "Remove this user from the store", warning: "This user will no longer be able to access this store.", confirm: "Confirm removal", success: "User removed from store", failed: "Unable to remove user from store",
});
const removedUsersLabel = computed(() => locale.value === "lo"
	? "ຜູ້ໃຊ້ທີ່ນຳອອກແລ້ວ"
	: locale.value === "th" ? "ผู้ใช้ที่นำออกแล้ว" : "Removed users");
const canManageMemberDetail = computed(() => (
	Boolean(selectedUser.value)
	&& selectedUser.value?.system_role !== "superadmin"
	&& selectedUser.value?.membership_count === 1
	&& Boolean(selectedUser.value?.primary_store_id)
));

const selectedUser = computed(() => users.value.find((user) => user.id === selectedUserId.value) || null);
const isSystemAdminReadOnly = computed(() => (
	selectedUser.value?.system_role === "superadmin" && !canEditClientAccounts.value
));

const canCreateUser = computed(() => (
	createForm.name.trim().length > 0
	&& /^[a-zA-Z0-9][a-zA-Z0-9._]{2,31}$/.test(createForm.username.trim())
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
const pageLabel = computed(() => t("superadminUsersPage.pageLabel", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	totalUsers.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalUsers.value));
const pageSummaryText = computed(() => (
	totalUsers.value === 0
		? t("superadminUsersPage.noData")
		: t("superadminUsersPage.pageSummary", { start: pageStart.value, end: pageEnd.value, count: totalUsers.value })
));

const overviewStats = computed(() => ([
	{ label: t("superadminUsersPage.totalUsers"), value: summaryData.value.total },
	{ label: t("superadminUsersPage.active"), value: summaryData.value.active },
	{ label: t("superadminUsersPage.suspended"), value: summaryData.value.suspended },
	{ label: t("superadminUsersPage.loaded"), value: users.value.length },
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
	return status === "active" ? t("superadminUsersPage.active") : t("superadminUsersPage.suspended");
}

function roleLabel(role: string) {
	return role || "superadmin";
}

function canOpenDetail(user: ClientRecord) {
	return user.system_role === "superadmin";
}

function canOpenMemberDetail(user: ClientRecord) {
	return user.system_role !== "superadmin"
		&& user.membership_count === 1
		&& Boolean(user.primary_store_id);
}

function rowActionLabel(user: ClientRecord) {
	if (user.system_role === "superadmin") {
		return canOpenDetail(user) ? t("superadminUsersPage.manage") : t("superadminUsersPage.systemAdmin");
	}
	if (canOpenMemberDetail(user)) {
		return t("superadminUsersPage.manage");
	}
	if (user.membership_count > 1) {
		return t("superadminUsersPage.storesCount", { count: user.membership_count });
	}
	return t("superadminUsersPage.storeMember");
}

function rowActionDisabled(user: ClientRecord) {
	return !canOpenDetail(user) && !canOpenMemberDetail(user);
}

function formatDateTime(value: string) {
	return formatAppDateTime(value, locale.value as "th" | "lo" | "en");
}

function toOptionalNumber(value: string | number) {
	if (typeof value === "number") {
		return Number.isFinite(value) ? value : null;
	}
	const trimmed = value.trim();
	return trimmed === "" ? null : Number(trimmed);
}

function resolveApiErrorMessage(errorValue: unknown, fallback = t("superadminUsersPage.tryAgain")) {
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
	createForm.username = "";
	createForm.email = "";
	createForm.password = "";
	createForm.store_id = "";
	createForm.role_id = "";
	createForm.ui_locale = "th";
	createForm.status = "active";
	createRoles.value = [];
	showCreatePassword.value = false;
	createSuccess.value = null;
}

function quickFillCreatePassword() {
	createForm.password = QUICK_FILL_PASSWORD;
}

function closeCreateModal() {
	createOpen.value = false;
	resetCreateForm();
}

async function copyCreatedCredential() {
	if (!createSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${createSuccess.value.username}`,
		`Password: ${createSuccess.value.password}`,
	].join("\n");

	try {
		await navigator.clipboard.writeText(text);
		appToast.success({
			title: t("superadminUsersPage.credentialCopied"),
			description: t("superadminUsersPage.credentialCopiedDescription"),
		});
	} catch {
		appToast.error({
			title: t("superadminUsersPage.copyFailed"),
			description: t("superadminUsersPage.copyFailedDescription"),
		});
	}
}

async function shareCreatedCredential() {
	if (!createSuccess.value || !import.meta.client) return;

	const text = [
		`Username: ${createSuccess.value.username}`,
		`Password: ${createSuccess.value.password}`,
	].join("\n");

	if (typeof navigator.share === "function") {
		try {
			await navigator.share({
			title: t("superadminUsersPage.staffCredential"),
				text,
			});
			return;
		} catch (error) {
			const message = error instanceof Error ? error.message : "";
			if (message.toLowerCase().includes("abort")) return;
		}
	}

	await copyCreatedCredential();
	appToast.success({
		title: t("superadminUsersPage.shareUnavailable"),
		description: t("superadminUsersPage.shareUnavailableDescription"),
	});
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

async function loadMemberRoles(storeId: string) {
	if (!storeId) {
		memberRoles.value = [];
		return;
	}
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles?store_id=${encodeURIComponent(storeId)}`);
	memberRoles.value = response.data;
}

async function openCreateModal() {
	if (!canManageSystem.value) {
		appToast.error({
			title: t("superadminUsersPage.noPermission"),
			description: t("superadminUsersPage.noPermissionDescription"),
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
			title: t("superadminUsersPage.loadCreateMetaFailed"),
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
		if (!canOpenMemberDetail(user)) {
			appToast.info({
				title: t("superadminUsersPage.manageFromStore"),
				description: user.membership_count > 1
					? t("superadminUsersPage.multipleStoresHint")
					: t("superadminUsersPage.noMembershipHint"),
			});
			return;
		}

		selectedUserId.value = user.id;
		memberForm.store_id = user.primary_store_id || "";
		memberForm.store_name = user.primary_store_name || "";
		memberForm.role_id = user.primary_role_id || "";
		memberForm.status = (user.primary_member_status === "inactive" ? "inactive" : "active");
		memberForm.reset_password = "";
		memberForm.must_change_password = true;
		showMemberResetPassword.value = false;
		memberMetaPending.value = true;
		memberDetailOpen.value = true;
		void loadMemberRoles(memberForm.store_id)
			.catch((err) => {
				appToast.error({
					title: t("superadminUsersPage.loadMemberFailed"),
					description: resolveApiErrorMessage(err),
				});
			})
			.finally(() => {
				memberMetaPending.value = false;
			});
		return;
	}
	selectedUserId.value = user.id;
	detailForm.name = user.name;
	detailForm.username = user.username;
	detailForm.email = user.email;
	detailForm.system_role = user.system_role;
	detailForm.ui_locale = user.ui_locale || "th";
	detailForm.can_create_stores = Boolean(user.can_create_stores);
	detailForm.max_stores = user.max_stores === null ? "" : String(user.max_stores);
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
		error.value = resolveApiErrorMessage(err, t("superadminUsersPage.loadFailed"));
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
		const plainPassword = createForm.password;
		await apiFetch("/rbac/store-members", {
			method: "POST",
			body: {
				name: createForm.name.trim(),
				username: createForm.username.trim(),
				email: createForm.email.trim(),
				password: createForm.password,
				store_id: createForm.store_id,
				role_id: createForm.role_id,
				status: createForm.status,
				ui_locale: createForm.ui_locale,
				system_role: "staff",
				must_change_password: true,
				added_by: currentUser.value?.id || null,
			},
		});

		appToast.success({
			title: t("superadminUsersPage.created"),
			description: t("superadminUsersPage.createdDescription"),
		});
		createSuccess.value = {
			name: createForm.name.trim(),
			username: createForm.username.trim(),
			email: createForm.email.trim(),
			password: plainPassword,
		};
		resetListPage();
		await loadUsers();
	} catch (err) {
		appToast.error({
			title: t("superadminUsersPage.createFailed"),
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
			title: t("superadminUsersPage.updated"),
			description: t("superadminUsersPage.updatedDescription"),
		});
		detailOpen.value = false;
		await loadUsers();
	} catch (err) {
		appToast.error({
			title: t("superadminUsersPage.saveFailed"),
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function saveMemberDetail() {
	if (!selectedUser.value || !canManageMemberDetail.value || !memberForm.store_id || !memberForm.role_id) return;
	saving.value = true;
	try {
		if (memberForm.role_id !== selectedUser.value.primary_role_id) {
			await apiFetch(`/rbac/store-members/${encodeURIComponent(memberForm.store_id)}/${encodeURIComponent(selectedUser.value.id)}/role`, {
				method: "PUT",
				body: {
					role_id: memberForm.role_id,
					added_by: currentUser.value?.id || null,
				},
			});
		}

		if (memberForm.status !== (selectedUser.value.primary_member_status === "inactive" ? "inactive" : "active")) {
			await apiFetch(`/rbac/store-members/${encodeURIComponent(memberForm.store_id)}/${encodeURIComponent(selectedUser.value.id)}/status`, {
				method: "PATCH",
				body: {
					status: memberForm.status,
					added_by: currentUser.value?.id || null,
				},
			});
		}

		if (memberForm.reset_password.trim().length >= 6) {
			await apiFetch(`/rbac/store-members/${encodeURIComponent(memberForm.store_id)}/${encodeURIComponent(selectedUser.value.id)}/reset-password`, {
				method: "POST",
				body: {
					password: memberForm.reset_password,
					must_change_password: memberForm.must_change_password,
					actor_user_id: currentUser.value?.id || null,
				},
			});
		}

		appToast.success({
			title: t("superadminUsersPage.updated"),
			description: t("superadminUsersPage.memberUpdatedDescription"),
		});
		memberDetailOpen.value = false;
		await loadUsers();
	} catch (err) {
		appToast.error({
			title: t("superadminUsersPage.saveFailed"),
			description: resolveApiErrorMessage(err),
		});
	} finally {
		saving.value = false;
	}
}

async function deleteSelectedUser() {
	if (!selectedUser.value || !selectedUser.value.primary_store_id || !canDeleteSelectedUser.value) return;
	saving.value = true;
	try {
		await apiFetch(`/rbac/store-members/${encodeURIComponent(selectedUser.value.primary_store_id)}/${encodeURIComponent(selectedUser.value.id)}`, { method: "DELETE" });
		deleteOpen.value = false;
		memberDetailOpen.value = false;
		appToast.success({ title: deleteCopy.value.success });
		await loadUsers();
	} catch (err) {
		appToast.error({ title: deleteCopy.value.failed, description: resolveApiErrorMessage(err) });
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
});

onMounted(loadUsers);
</script>

<template>
		<AppSidebarShell
			:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Super Admin"
		:sidebar-title="t('superadminUsersPage.title')"
		sidebar-compact-title="SUP"
		:sidebar-description="t('superadminUsersPage.description')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					title=""
					compact
					:description="t('superadminUsersPage.description')"
					@menu="openSidebar"
				>
					<template #default>
						<div class="flex w-full flex-wrap items-center gap-2 pt-0.5 sm:pt-1">
							<UInput
								v-model="searchQuery"
								icon="i-heroicons-magnifying-glass-20-solid"
								size="lg"
								color="neutral"
								:placeholder="t('superadminUsersPage.searchPlaceholder')"
								class="min-w-0 flex-1 [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
								@keydown.enter="applyFilters"
							/>
							<div class="flex shrink-0 gap-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-arrow-path-20-solid"
									class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
									:loading="pending"
									:disabled="pending"
									:spin-icon-on-loading="true"
									:aria-label="t('superadminUsersPage.reload')"
									:title="t('superadminUsersPage.reload')"
									@click="reloadUsers"
								>
									<span class="hidden sm:inline">{{ t('superadminUsersPage.reload') }}</span>
								</AppButton>
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clock-20-solid" to="/superadmin/removed-users" class="h-9 shrink-0 rounded-md px-2 sm:h-auto sm:px-3" :title="removedUsersLabel" :aria-label="removedUsersLabel">
									<span class="hidden sm:inline">{{ removedUsersLabel }}</span>
								</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-user-plus-20-solid"
									class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
									:aria-label="t('superadminUsersPage.addUser')"
									:title="t('superadminUsersPage.addUser')"
									@click="openCreateModal"
								>
									<span class="hidden sm:inline">{{ t('superadminUsersPage.addUser') }}</span>
								</AppButton>
							</div>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid gap-3 lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="grid grid-cols-2 gap-2.5 md:grid-cols-4">
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

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ t('superadminUsersPage.usersTitle') }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('superadminUsersPage.usersDescription') }}</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
									<select v-model="activeStatus" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
										<option value="all">{{ t('superadminUsersPage.allStatuses') }}</option>
										<option value="active">{{ t('superadminUsersPage.active') }}</option>
										<option value="suspended">{{ t('superadminUsersPage.suspended') }}</option>
									</select>
									<AppButton color="primary" variant="soft" size="md" class="sm:self-stretch" @click="applyFilters">
										{{ t('superadminUsersPage.applyFilters') }}
									</AppButton>
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-hidden">
								<div ref="usersListScrollRef" class="scrollbar-soft min-h-0 h-full overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
									<div v-if="pending" class="min-h-[280px]">
										<AppInlineLoadingBar container-class="bg-neutral-100" />
									</div>
									<div v-else-if="error" class="p-5 text-center text-sm text-error">{{ error }}</div>
									<div v-else-if="!users.length" class="p-5 text-center text-sm text-stone-500">{{ t('superadminUsersPage.empty') }}</div>
									<div v-else class="overflow-x-auto">
										<table class="min-w-[1080px] w-full border-separate border-spacing-0">
											<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
												<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.user') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.role') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.status') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.systemRole') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.store') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.createdAt') }}</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">{{ t('superadminUsersPage.action') }}</th>
												</tr>
											</thead>
											<tbody>
												<tr
													v-for="user in users"
													:key="user.id"
													class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
													:class="(detailOpen || memberDetailOpen) && selectedUserId === user.id ? 'bg-primary-50' : 'bg-white'"
													@click="openDetailModal(user.id)"
												>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<div class="min-w-0">
															<p class="truncate font-semibold text-stone-950">{{ user.name }}</p>
															<p class="mt-1 truncate text-xs text-stone-500">{{ user.username }} · {{ user.email }}</p>
														</div>
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<UBadge color="neutral" variant="soft" :label="user.primary_role_name || '-'" />
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<UBadge :color="statusTone(user.status)" variant="soft" :label="statusLabel(user.status)" />
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4">
														<UBadge color="neutral" variant="soft" :label="roleLabel(user.system_role)" />
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600">
														<div class="flex min-w-0 items-center gap-2">
															<span class="max-w-40 truncate font-medium text-stone-800" :title="user.primary_store_name || ''">
																{{ user.primary_store_name || '-' }}
															</span>
															<UBadge
																v-if="user.membership_count > 1"
																color="neutral"
																variant="soft"
																:label="`+${user.membership_count - 1}`"
															/>
														</div>
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 whitespace-nowrap text-stone-600">
														{{ formatDateTime(user.created_at) }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="rounded-md"
															icon="i-heroicons-chevron-right-20-solid"
															:disabled="rowActionDisabled(user)"
															@click.stop="openDetailModal(user.id)"
														>
															{{ rowActionLabel(user) }}
														</AppButton>
													</td>
												</tr>
											</tbody>
										</table>
									</div>
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
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('superadminUsersPage.perPage') }}</label>
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
												:aria-label="t('superadminUsersPage.previousPage')"
												:title="t('superadminUsersPage.previousPage')"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">{{ t('superadminUsersPage.previous') }}</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || pending"
												:aria-label="t('superadminUsersPage.nextPage')"
												:title="t('superadminUsersPage.nextPage')"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">{{ t('superadminUsersPage.next') }}</span>
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
				v-model="createOpen"
				:title="t('superadminUsersPage.createTitle')"
				:description="t('superadminUsersPage.createDescription')"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div v-if="!createSuccess" class="space-y-4 pb-6">
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.name') }}</label>
								<input v-model="createForm.name" :placeholder="locale === 'lo' ? 'ຕົວຢ່າງ: ສົມໄຊ ໄຊຍະວົງ' : locale === 'th' ? 'ตัวอย่าง: สมชาย ใจดี' : 'Example: Somchai Jaidee'" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
								<input v-model="createForm.username" autocomplete="username" placeholder="somchai" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<p class="mt-2 text-xs leading-5 text-stone-500">a-z, 0-9, . ແລະ _ · 3–32 ຕົວອັກສອນ</p>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.email') }}</label>
								<input v-model="createForm.email" :placeholder="locale === 'lo' ? 'ຕົວຢ່າງ: somchai@example.com' : locale === 'th' ? 'ตัวอย่าง: somchai@example.com' : 'Example: somchai@example.com'" type="email" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.password') }}</label>
								<div class="relative">
									<input
										v-model="createForm.password"
										:type="showCreatePassword ? 'text' : 'password'"
										:placeholder="t('superadminUsersPage.passwordPlaceholder')"
										class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
									<button
										type="button"
										class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
										:aria-label="showCreatePassword ? t('superadminUsersPage.hidePassword') : t('superadminUsersPage.showPassword')"
										:title="showCreatePassword ? t('superadminUsersPage.hidePassword') : t('superadminUsersPage.showPassword')"
										@click="showCreatePassword = !showCreatePassword"
									>
										<UIcon :name="showCreatePassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
									</button>
								</div>
								<p class="mt-2 text-xs leading-5 text-stone-500">{{ t('superadminUsersPage.passwordHint') }}</p>
								<button
									type="button"
									class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
									@click="quickFillCreatePassword"
								>
									<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
									{{ t('superadminUsersPage.usePassword') }}
								</button>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.selectStore') }}</label>
								<select
									v-model="createForm.store_id"
									:disabled="createMetaPending || saving || !createStores.length"
									class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50"
								>
									<option value="" disabled>{{ t('superadminUsersPage.selectStorePlaceholder') }}</option>
									<option v-for="store in createStores" :key="store.id" :value="store.id">
										{{ store.name }}
									</option>
								</select>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.storeRole') }}</label>
								<select
									v-model="createForm.role_id"
									:disabled="createMetaPending || saving || !createForm.store_id || !createRoles.length"
									class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50"
								>
									<option value="" disabled>{{ t('superadminUsersPage.selectRolePlaceholder') }}</option>
									<option v-for="role in createRoles" :key="role.id" :value="role.id">
										{{ role.name }}
									</option>
								</select>
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.status') }}</label>
								<select v-model="createForm.status" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option value="active">{{ t('superadminUsersPage.active') }}</option>
									<option value="inactive">{{ t('superadminUsersPage.inactive') }}</option>
								</select>
							</div>
							<div v-if="!createStores.length" class="rounded-md border border-warning/40 bg-warning/5 px-4 py-3 text-sm text-warning">
								{{ t('superadminUsersPage.noStoresHint') }}
							</div>
						</div>
						<div v-else class="space-y-4 pb-6">
							<div class="rounded-md border border-success/20 bg-success/5 p-4">
								<div class="flex items-start gap-3">
									<div class="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-success/10 text-success ring-1 ring-success/15">
										<UIcon name="i-heroicons-check-circle-20-solid" class="h-5 w-5" />
									</div>
									<div>
										<p class="text-sm font-semibold text-stone-950">{{ t('superadminUsersPage.created') }}</p>
										<p class="mt-1 text-sm leading-6 text-stone-600">{{ t('superadminUsersPage.createdCredentialHint') }}</p>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('superadminUsersPage.credential') }}</p>
								<div class="mt-4 space-y-3">
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.username }}
										</div>
									</div>
									<div>
										<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.password') }}</label>
										<div class="rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900">
											{{ createSuccess.password }}
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-4 py-3">
								<p class="text-sm font-medium text-stone-900">{{ createSuccess.name }}</p>
								<p class="mt-1 text-xs leading-5 text-stone-500">{{ t('superadminUsersPage.credentialTemporaryHint') }}</p>
							</div>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div v-if="!createSuccess" class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="closeCreateModal">{{ t('superadminUsersPage.cancel') }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :loading="saving" :disabled="!canCreateUser" :spin-icon-on-loading="true" :block="true" @click="createUser">{{ t('superadminUsersPage.createUser') }}</AppButton>
						</div>
						<div v-else class="grid w-full gap-2 sm:grid-cols-3">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-clipboard-document-20-solid" :block="true" @click="copyCreatedCredential">{{ t('superadminUsersPage.copy') }}</AppButton>
							<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-share-20-solid" :block="true" @click="shareCreatedCredential">{{ t('superadminUsersPage.share') }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" @click="closeCreateModal">{{ t('superadminUsersPage.done') }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="detailOpen"
				:title="t('superadminUsersPage.userDetailTitle')"
				:description="t('superadminUsersPage.userDetailDescription')"
				desktop-width="680px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div v-if="selectedUser" class="flex h-full min-h-0 flex-col">
					<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto px-5 py-5">
						<div class="space-y-4 pb-6">
							<div v-if="isSystemAdminReadOnly" class="rounded-md border border-primary-200 bg-primary-50 px-4 py-3">
								<div class="flex items-start gap-2.5">
									<UIcon name="i-heroicons-information-circle-20-solid" class="mt-0.5 h-5 w-5 shrink-0 text-primary-600" />
									<div>
										<p class="text-sm font-semibold text-primary-900">{{ t('superadminUsersPage.systemAdminOnly') }}</p>
										<p class="mt-1 text-xs leading-5 text-primary-800">{{ t('superadminUsersPage.systemAdminOnlyDescription') }}</p>
									</div>
								</div>
							</div>
							<p class="text-xs text-stone-500">{{ roleLabel(selectedUser.system_role) }} · {{ t('superadminUsersPage.createdAt') }} {{ formatDateTime(selectedUser.created_at) }}</p>
							<div v-if="isSystemAdminReadOnly" class="grid gap-3 sm:grid-cols-2">
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<p class="text-xs font-medium text-stone-500">{{ t('superadminUsersPage.name') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ detailForm.name }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<p class="text-xs font-medium text-stone-500">Username</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ detailForm.username || '—' }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4 sm:col-span-2">
									<p class="text-xs font-medium text-stone-500">{{ t('superadminUsersPage.email') }}</p>
									<p class="mt-1 break-all text-sm font-semibold text-stone-900">{{ detailForm.email }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<p class="text-xs font-medium text-stone-500">{{ t('superadminUsersPage.maxStores') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ detailForm.max_stores }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<p class="text-xs font-medium text-stone-500">{{ t('superadminUsersPage.allowCreateStores') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ detailForm.can_create_stores ? 'ອະນຸຍາດ' : 'ບໍ່ອະນຸຍາດ' }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<p class="text-xs font-medium text-stone-500">{{ t('superadminUsersPage.status') }}</p>
									<p class="mt-1 text-sm font-semibold text-stone-900">{{ statusLabel(detailForm.status) }}</p>
								</div>
							</div>
							<template v-else>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.name') }}</label>
								<input v-model="detailForm.name" :disabled="isSystemAdminReadOnly" :placeholder="locale === 'lo' ? 'ຕົວຢ່າງ: ສົມໄຊ ໄຊຍະວົງ' : locale === 'th' ? 'ตัวอย่าง: สมชาย ใจดี' : 'Example: Somchai Jaidee'" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50 disabled:text-stone-700">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
								<input v-model="detailForm.username" disabled type="text" class="w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700 shadow-sm outline-none">
							</div>
							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.email') }}</label>
								<input v-model="detailForm.email" disabled type="email" class="w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700 shadow-sm outline-none">
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.maxStores') }}</label>
									<input v-model="detailForm.max_stores" :disabled="isSystemAdminReadOnly || !detailForm.can_create_stores" type="number" min="1" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50">
								</div>
							</div>
							<div class="grid gap-3">
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.can_create_stores" :disabled="isSystemAdminReadOnly" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div><p class="text-sm font-medium text-stone-900">{{ t('superadminUsersPage.allowCreateStores') }}</p></div>
								</label>
								<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
									<input v-model="detailForm.must_change_password" :disabled="isSystemAdminReadOnly" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
									<div><p class="text-sm font-medium text-stone-900">{{ t('superadminUsersPage.requirePasswordChange') }}</p></div>
								</label>
							</div>
							<div class="grid gap-4 sm:grid-cols-2">
								<div>
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.status') }}</label>
									<select v-model="detailForm.status" :disabled="isSystemAdminReadOnly" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50">
										<option value="active">{{ t('superadminUsersPage.active') }}</option>
										<option value="suspended">{{ t('superadminUsersPage.suspended') }}</option>
									</select>
								</div>
								<div v-if="detailForm.status === 'suspended'">
									<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.suspensionReason') }}</label>
									<input v-model="detailForm.suspend_reason" :disabled="isSystemAdminReadOnly" type="text" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50">
								</div>
							</div>
							</template>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full gap-2" :class="isSystemAdminReadOnly ? 'grid-cols-1' : 'grid-cols-2'">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">{{ t('superadminUsersPage.close') }}</AppButton>
							<AppButton v-if="!isSystemAdminReadOnly" color="primary" variant="solid" size="md" :loading="saving" :disabled="!canSaveDetail" :spin-icon-on-loading="true" :block="true" @click="saveDetail">{{ t('superadminUsersPage.save') }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="memberDetailOpen"
				:title="t('superadminUsersPage.memberDetailTitle')"
				:description="t('superadminUsersPage.memberDetailDescription')"
				desktop-width="680px"
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
								<p class="text-sm font-semibold text-stone-950">{{ selectedUser.name }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ selectedUser.email }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ memberForm.store_name || selectedUser.primary_store_name || "-" }}</p>
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">Username</label>
								<input :value="selectedUser.username" disabled type="text" class="w-full rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700 shadow-sm outline-none">
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.storeRole') }}</label>
								<select
									v-model="memberForm.role_id"
									:disabled="memberMetaPending || saving || !memberRoles.length"
									class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 disabled:bg-neutral-50"
								>
									<option value="" disabled>{{ t('superadminUsersPage.selectRolePlaceholder') }}</option>
									<option v-for="role in memberRoles" :key="role.id" :value="role.id">
										{{ role.name }}
									</option>
								</select>
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.memberStatus') }}</label>
								<select v-model="memberForm.status" class="w-full rounded-md border border-neutral-200 bg-white px-3 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option value="active">{{ t('superadminUsersPage.active') }}</option>
									<option value="inactive">{{ t('superadminUsersPage.inactive') }}</option>
								</select>
							</div>

							<div>
								<label class="mb-2 block text-xs font-medium text-stone-500">{{ t('superadminUsersPage.resetPassword') }}</label>
								<div class="relative">
									<input
										v-model="memberForm.reset_password"
										:type="showMemberResetPassword ? 'text' : 'password'"
										:placeholder="t('superadminUsersPage.resetPasswordPlaceholder')"
										class="w-full rounded-md border border-neutral-200 bg-white py-3 pl-4 pr-12 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
									<button
										type="button"
										class="absolute right-2.5 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
										:aria-label="showMemberResetPassword ? t('superadminUsersPage.hidePassword') : t('superadminUsersPage.showPassword')"
										:title="showMemberResetPassword ? t('superadminUsersPage.hidePassword') : t('superadminUsersPage.showPassword')"
										@click="showMemberResetPassword = !showMemberResetPassword"
									>
										<UIcon :name="showMemberResetPassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'" class="h-4 w-4" />
									</button>
								</div>
								<p class="mt-2 text-xs leading-5 text-stone-500">{{ t('superadminUsersPage.resetPasswordHint') }}</p>
								<button
									type="button"
									class="mt-2 inline-flex items-center gap-1 rounded-md bg-primary-50 px-3 py-1.5 text-xs font-medium text-primary-700 transition hover:bg-primary-100"
									@click="memberForm.reset_password = QUICK_FILL_PASSWORD"
								>
									<UIcon name="i-heroicons-bolt-20-solid" class="h-3.5 w-3.5" />
									{{ t('superadminUsersPage.usePassword') }}
								</button>
							</div>

							<label class="flex items-start gap-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<input v-model="memberForm.must_change_password" type="checkbox" class="mt-1 h-4 w-4 rounded border-neutral-300 text-primary focus:ring-primary-200">
								<div><p class="text-sm font-medium text-stone-900">{{ t('superadminUsersPage.requirePasswordChangeAfterLogin') }}</p></div>
							</label>
						</div>
					</div>
					<div class="shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] backdrop-blur-sm">
						<div class="grid w-full grid-cols-3 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="memberDetailOpen = false">{{ t('superadminUsersPage.close') }}</AppButton>
							<AppButton color="error" variant="soft" size="md" icon="i-heroicons-trash-20-solid" :block="true" :disabled="!canDeleteSelectedUser" @click="deleteOpen = true">{{ deleteCopy.title }}</AppButton>
							<AppButton color="primary" variant="solid" size="md" :loading="saving" :disabled="memberMetaPending || !memberForm.role_id" :spin-icon-on-loading="true" :block="true" @click="saveMemberDetail">{{ t('superadminUsersPage.save') }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel v-model="deleteOpen" :title="deleteCopy.title" :description="deleteCopy.description" desktop-width="680px" compact-header>
				<div v-if="selectedUser" class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-red-200 bg-red-50 p-4">
							<p class="font-semibold text-red-900">{{ selectedUser.name }}</p>
							<p class="mt-1 text-sm font-medium text-red-800">{{ selectedUser.primary_store_name || memberForm.store_name || '-' }}</p>
							<p class="mt-1 text-sm text-red-700">{{ deleteCopy.warning }}</p>
						</div>
					</div>
					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="deleteOpen = false">{{ t('superadminUsersPage.cancel') }}</AppButton>
							<AppButton color="error" variant="solid" size="md" icon="i-heroicons-trash-20-solid" :block="true" :loading="saving" @click="deleteSelectedUser">{{ deleteCopy.confirm }}</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
