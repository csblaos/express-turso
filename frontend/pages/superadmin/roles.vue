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
};

type PermissionRecord = {
	id: string;
	key: string;
	resource: string;
	action: string;
};

type StandardPermissionAction = "view" | "create" | "update" | "delete";

type PermissionMatrixRow = {
	resource: string;
	standard: Record<StandardPermissionAction, PermissionRecord | null>;
	allKeys: string[];
};

type RoleRecord = {
	id: string;
	store_id: string;
	name: string;
	is_system: number;
	permissions_count: number;
};

type RoleDetailRecord = RoleRecord & {
	permissions: PermissionRecord[];
};

type ApplyRoleMode = "create" | "update";

const HIDDEN_ROLE_PERMISSION_KEYS = new Set([
	"connections.approve",
	"connections.export",
	"connections.manage",
]);

function isHiddenRolePermissionKey(permissionKey: string) {
	return HIDDEN_ROLE_PERMISSION_KEYS.has(permissionKey) || permissionKey.startsWith("system_admin.");
}

const { apiFetch } = useApiClient();
const { can, currentUser } = useAuthSession();
const appToast = useAppToast();

const selectedStoreId = ref("");
const selectedRoleId = ref("");
const detailOpen = ref(false);
const createOpen = ref(false);
const duplicateOpen = ref(false);
const applyOpen = ref(false);
const deleteConfirmOpen = ref(false);
const saving = ref(false);
const deletingRoleId = ref("");
const loading = ref(true);
const reloading = ref(false);
const roleDetailPending = ref(false);
const createMetaPending = ref(false);
const applyTargetRolesPending = ref(false);
const suppressStoreWatch = ref(false);
const rolesListScrollRef = ref<HTMLElement | null>(null);
const error = ref<string | null>(null);
const createError = ref<string | null>(null);
const applyError = ref<string | null>(null);
const stores = ref<StoreRecord[]>([]);
const permissions = ref<PermissionRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const roleDetailsById = ref<Record<string, RoleDetailRecord>>({});
const applyTargetRolesByStoreId = ref<Record<string, RoleRecord[]>>({});
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];

const createForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

const duplicateForm = reactive({
	name: "",
});

const applyForm = reactive({
	targetStoreId: "",
	mode: "create" as ApplyRoleMode,
	name: "",
	targetRoleId: "",
});

const canManageRoles = computed(() => (
	can("superadmin.roles.create")
	|| can("superadmin.roles.update")
	|| can("superadmin.roles.archive")
	|| can("settings.roles.create")
	|| can("settings.roles.update")
	|| can("settings.roles.archive")
));
const isCreateRoleButtonDisabled = computed(() => (
	!canManageRoles.value
	|| saving.value
));
const createPanelPending = computed(() => (
	createMetaPending.value || (loading.value && (!stores.value.length || !permissions.value.length))
));
const createRolePermissionCount = computed(() => createForm.permissionKeys.length);
const visiblePermissions = computed(() => permissions.value.filter((permission) => !isHiddenRolePermissionKey(permission.key)));
const createRolePermissionTotal = computed(() => permissionMatrixRows.value.reduce((total, row) => total + row.allKeys.length, 0));
const canSubmitCreateRole = computed(() => (
	canManageRoles.value
	&& !saving.value
	&& Boolean(selectedStoreId.value)
	&& createForm.name.trim().length > 0
	&& createRolePermissionCount.value > 0
));
const selectedRole = computed(() => roles.value.find((role) => role.id === selectedRoleId.value) ?? roles.value[0] ?? null);
const selectedRoleDetail = computed(() => (
	selectedRoleId.value ? roleDetailsById.value[selectedRoleId.value] || null : null
));
const applyTargetStoreOptions = computed(() => (
	stores.value.filter((store) => store.id !== selectedRole.value?.store_id)
));
const applyTargetRoles = computed(() => applyTargetRolesByStoreId.value[applyForm.targetStoreId] ?? []);
const applyModeOptions = [
	{ value: "create" as ApplyRoleMode, label: "สร้าง role ใหม่" },
	{ value: "update" as ApplyRoleMode, label: "อัปเดต role เดิม" },
];
const canSubmitApplyRole = computed(() => (
	canManageRoles.value
	&& !saving.value
	&& Boolean(selectedRole.value)
	&& Boolean(applyForm.targetStoreId)
	&& (
		applyForm.mode === "create"
			? applyForm.name.trim().length > 0
			: applyForm.targetRoleId.trim().length > 0
	)
));
const selectedApplyTargetRole = computed(() => (
	applyTargetRoles.value.find((role) => role.id === applyForm.targetRoleId) ?? null
));
const selectedRolePermissionCount = computed(() => (
	selectedRoleDetail.value?.permissions.length ?? selectedRole.value?.permissions_count ?? 0
));
const isSelectedSystemRole = computed(() => Number(selectedRole.value?.is_system || 0) === 1);
const roleDetailHasChanges = computed(() => {
	const roleDetail = selectedRoleDetail.value;
	if (!roleDetail) return false;

	const currentName = editorForm.name.trim();
	const originalName = roleDetail.name.trim();
	if (currentName !== originalName) return true;

	const currentPermissions = [ ...new Set(editorForm.permissionKeys) ].sort();
	const originalPermissions = [ ...new Set(roleDetail.permissions.map((permission) => permission.key)) ].sort();
	if (currentPermissions.length !== originalPermissions.length) return true;

	return currentPermissions.some((key, index) => key !== originalPermissions[index]);
});
const listPending = computed(() => loading.value || reloading.value);
const totalRoles = computed(() => roles.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalRoles.value / pageSize.value)));
const pageLabel = computed(() => `หน้า ${currentPage.value} / ${totalPages.value}`);
const pageStart = computed(() => (
	totalRoles.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalRoles.value));
const pageSummaryText = computed(() => (
	totalRoles.value === 0
		? "ยังไม่มีข้อมูล"
		: `${pageStart.value}-${pageEnd.value} จาก ${totalRoles.value} บทบาท`
));
const paginatedRoles = computed(() => {
	const start = (currentPage.value - 1) * pageSize.value;
	const end = start + pageSize.value;
	return roles.value.slice(start, end);
});

const editorForm = reactive({
	name: "",
	permissionKeys: [] as string[],
});

const standardPermissionActions: { key: StandardPermissionAction; label: string }[] = [
	{ key: "view", label: "View" },
	{ key: "create", label: "Create" },
	{ key: "update", label: "Update" },
	{ key: "delete", label: "Delete" },
];

const standardPermissionActionSet = new Set<StandardPermissionAction>(
	standardPermissionActions.map((item) => item.key),
);

function getPermissionAction(permission: PermissionRecord): string {
	if (typeof permission.action === "string" && permission.action.trim()) {
		return permission.action.trim().toLowerCase();
	}
	const keyParts = permission.key.split(".");
	return String(keyParts[keyParts.length - 1] || "").trim().toLowerCase();
}

const permissionMatrixRows = computed<PermissionMatrixRow[]>(() => {
	const rows = new Map<string, PermissionMatrixRow>();

	for (const permission of visiblePermissions.value) {
		const action = getPermissionAction(permission);
		const standardKey = action === "archive"
			? "delete"
			: standardPermissionActionSet.has(action as StandardPermissionAction)
				? action as StandardPermissionAction
				: null;
		if (!standardKey) continue;

		const resource = permission.resource;
		const existing = rows.get(resource) || {
			resource,
			standard: {
				view: null,
				create: null,
				update: null,
				delete: null,
			},
			allKeys: [],
		};

		existing.allKeys.push(permission.key);
		if (!existing.standard[standardKey]) {
			existing.standard[standardKey] = permission;
		}

		rows.set(resource, existing);
	}

	return Array.from(rows.values())
		.map((row) => ({
			...row,
			allKeys: Array.from(new Set(row.allKeys)),
		}))
		.filter((row) => row.allKeys.length > 0)
		.sort((left, right) => left.resource.localeCompare(right.resource));
});

watch(selectedRoleDetail, (role) => {
	if (!role) {
		editorForm.name = "";
		editorForm.permissionKeys = [];
		return;
	}
	editorForm.name = role.name;
	editorForm.permissionKeys = role.permissions.map((permission) => permission.key);
}, { immediate: true });

watch(duplicateOpen, (isOpen) => {
	if (isOpen && selectedRole.value) {
		duplicateForm.name = `${selectedRole.value.name} Copy`;
	}
});

watch(applyOpen, async (isOpen) => {
	if (!isOpen || !selectedRole.value) return;
	applyForm.mode = "create";
	applyForm.name = selectedRole.value.name;
	applyForm.targetRoleId = "";
	applyForm.targetStoreId = applyTargetStoreOptions.value[0]?.id || "";
});

watch(createOpen, (isOpen) => {
	if (isOpen) {
		createError.value = null;
		if (!selectedStoreId.value && stores.value.length > 0) {
			selectedStoreId.value = stores.value[0].id;
		}
	}
});

watch(() => applyForm.targetStoreId, async (value, previousValue) => {
	if (!applyOpen.value || !value || value === previousValue) return;
	applyForm.targetRoleId = "";
	if (applyForm.mode === "update") {
		await fetchApplyTargetRoles(value);
		applyForm.targetRoleId = applyTargetRolesByStoreId.value[value]?.[0]?.id || "";
	}
});

watch(() => applyForm.mode, async (mode) => {
	if (!applyOpen.value) return;
	if (mode === "create") {
		applyForm.targetRoleId = "";
		if (!applyForm.name.trim() && selectedRole.value) {
			applyForm.name = selectedRole.value.name;
		}
		return;
	}

	if (applyForm.targetStoreId) {
		await fetchApplyTargetRoles(applyForm.targetStoreId);
		applyForm.targetRoleId = applyTargetRolesByStoreId.value[applyForm.targetStoreId]?.[0]?.id || "";
	}
});

watch(selectedStoreId, async (value, previousValue) => {
	if (!value) return;
	if (suppressStoreWatch.value) return;
	if (value === previousValue) return;
	currentPage.value = 1;
	await fetchRoles();
}, { immediate: false });

function scrollRolesListToTop() {
	rolesListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollRolesListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
	nextTick(() => {
		scrollRolesListToTop();
	});
}

function applyStoreFilter() {
	currentPage.value = 1;
	void fetchRoles();
}

function isPermissionChecked(permissionKey: string) {
	return editorForm.permissionKeys.includes(permissionKey);
}

function setPermissionGroupSelection(current: string[], permissionKeys: string[], checked: boolean): string[] {
	if (checked) {
		return [ ...new Set([ ...current, ...permissionKeys ]) ];
	}
	const removeSet = new Set(permissionKeys);
	return current.filter((key) => !removeSet.has(key));
}

function countSelectedPermissionKeys(selectedKeys: string[], permissionKeys: string[]): number {
	if (!selectedKeys.length || !permissionKeys.length) return 0;
	const selectedSet = new Set(selectedKeys);
	return permissionKeys.reduce((count, permissionKey) => (
		selectedSet.has(permissionKey) ? count + 1 : count
	), 0);
}

function togglePermission(permissionKey: string, checked: boolean) {
	if (checked) {
		if (!editorForm.permissionKeys.includes(permissionKey)) {
			editorForm.permissionKeys = [ ...editorForm.permissionKeys, permissionKey ];
		}
		return;
	}
	editorForm.permissionKeys = editorForm.permissionKeys.filter((key) => key !== permissionKey);
}

function togglePermissionGroup(permissionKeys: string[], checked: boolean) {
	editorForm.permissionKeys = setPermissionGroupSelection(editorForm.permissionKeys, permissionKeys, checked);
}

function isCreatePermissionChecked(permissionKey: string) {
	return createForm.permissionKeys.includes(permissionKey);
}

function toggleCreatePermission(permissionKey: string, checked: boolean) {
	if (checked) {
		if (!createForm.permissionKeys.includes(permissionKey)) {
			createForm.permissionKeys = [ ...createForm.permissionKeys, permissionKey ];
		}
		return;
	}
	createForm.permissionKeys = createForm.permissionKeys.filter((key) => key !== permissionKey);
}

function toggleCreatePermissionGroup(groupPermissionKeys: string[], checked: boolean) {
	createForm.permissionKeys = setPermissionGroupSelection(createForm.permissionKeys, groupPermissionKeys, checked);
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

async function selectRole(roleId: string) {
	selectedRoleId.value = roleId;
	detailOpen.value = true;
	await loadRoleDetail(roleId);
}

function openCreateRolePanel() {
	if (!canManageRoles.value) return;
	if (!selectedStoreId.value && !loading.value && !stores.value.length) {
		appToast.error({
			title: "ยังไม่พบร้าน",
			description: "กรุณาสร้างร้านก่อน จึงจะสร้างบทบาทได้",
		});
		return;
	}
	createOpen.value = true;
}

function openApplyRolePanel() {
	if (!canManageRoles.value || !selectedRole.value) return;
	if (!applyTargetStoreOptions.value.length) {
		appToast.error({
			title: "ยังไม่มีร้านปลายทาง",
			description: "ต้องมีร้านอื่นอย่างน้อย 1 ร้านก่อน จึงจะใช้ role นี้ข้ามร้านได้",
		});
		return;
	}
	applyError.value = null;
	applyOpen.value = true;
}

async function reloadRolePage() {
	if (loading.value || reloading.value) return;
	reloading.value = true;
	error.value = null;
	try {
		suppressStoreWatch.value = true;
		await Promise.all([ fetchStores(), fetchPermissions() ]);
		suppressStoreWatch.value = false;
		if (selectedStoreId.value) {
			await fetchRoles();
		}
	} catch (fetchError) {
		error.value = fetchError instanceof Error ? fetchError.message : "โหลดข้อมูลบทบาทไม่สำเร็จ";
		appToast.error({
			title: "รีโหลดไม่สำเร็จ",
			description: error.value,
		});
	} finally {
		suppressStoreWatch.value = false;
		reloading.value = false;
	}
}

async function fetchStores() {
	const response = await apiFetch<ApiEnvelope<StoreRecord[]>>("/superadmin/stores");
	stores.value = response.data;
	const hasCurrentStore = stores.value.some((store) => store.id === selectedStoreId.value);
	const nextStoreId = hasCurrentStore ? selectedStoreId.value : (stores.value[0]?.id || "");
	if (nextStoreId !== selectedStoreId.value) {
		selectedStoreId.value = nextStoreId;
	}
}

async function fetchPermissions() {
	const response = await apiFetch<ApiEnvelope<PermissionRecord[]>>("/rbac/permissions");
	permissions.value = response.data;
}

async function fetchRoles() {
	if (!selectedStoreId.value) return;
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles-summary?store_id=${encodeURIComponent(selectedStoreId.value)}`);
	roles.value = response.data;
	const validRoleIds = new Set(roles.value.map((role) => role.id));
	roleDetailsById.value = Object.fromEntries(
		Object.entries(roleDetailsById.value).filter(([ roleId ]) => validRoleIds.has(roleId)),
	);
	if (!roles.value.some((role) => role.id === selectedRoleId.value)) {
		selectedRoleId.value = roles.value[0]?.id || "";
	}
	if (currentPage.value > totalPages.value) {
		currentPage.value = totalPages.value;
	}
	await nextTick();
	scrollRolesListToTop();
}

async function fetchApplyTargetRoles(storeId: string, force = false) {
	if (!storeId) return;
	if (!force && applyTargetRolesByStoreId.value[storeId]) return;
	applyTargetRolesPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles-summary?store_id=${encodeURIComponent(storeId)}`);
		applyTargetRolesByStoreId.value = {
			...applyTargetRolesByStoreId.value,
			[storeId]: response.data,
		};
	} finally {
		applyTargetRolesPending.value = false;
	}
}

async function loadRoleDetail(roleId: string, force = false) {
	if (!roleId) return;
	if (!force && roleDetailsById.value[roleId]) return;
	roleDetailPending.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleDetailRecord>>(`/rbac/roles/${encodeURIComponent(roleId)}`);
		roleDetailsById.value = {
			...roleDetailsById.value,
			[roleId]: response.data,
		};
	} finally {
		roleDetailPending.value = false;
	}
}

async function createRole() {
	if (createPanelPending.value) return;
	if (!selectedStoreId.value) return;
	if (!createForm.name.trim()) {
		createError.value = "กรุณาระบุชื่อบทบาท";
		appToast.error({
			title: "สร้างบทบาทไม่สำเร็จ",
			description: createError.value,
		});
		return;
	}
	if (!createForm.permissionKeys.length) {
		createError.value = "กรุณาเลือกสิทธิ์อย่างน้อย 1 รายการ";
		appToast.error({
			title: "สร้างบทบาทไม่สำเร็จ",
			description: createError.value,
		});
		return;
	}

	createError.value = null;
	saving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord>>("/rbac/roles", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name.trim(),
				permission_keys: createForm.permissionKeys,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		createOpen.value = false;
		createForm.name = "";
		createForm.permissionKeys = [];
		await fetchRoles();
		selectedRoleId.value = response.data.id;
		await loadRoleDetail(response.data.id, true);
		appToast.success({
			title: "สร้างบทบาทแล้ว",
			description: "เพิ่ม role ใหม่เรียบร้อย",
		});
	} catch (err) {
		createError.value = resolveApiErrorMessage(err, "สร้างบทบาทไม่สำเร็จ");
		appToast.error({
			title: "สร้างบทบาทไม่สำเร็จ",
			description: createError.value,
		});
	} finally {
		saving.value = false;
	}
}

async function saveRole() {
	if (!selectedRole.value) return;
	if (!roleDetailHasChanges.value) return;
	saving.value = true;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}`, {
			method: "PUT",
			body: {
				name: editorForm.name,
				permission_keys: editorForm.permissionKeys,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		await fetchRoles();
		await loadRoleDetail(selectedRole.value.id, true);
	} finally {
		saving.value = false;
	}
}

async function duplicateRole() {
	if (!selectedRole.value) return;
	saving.value = true;
	try {
		const response = await apiFetch<ApiEnvelope<RoleRecord>>(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}/duplicate`, {
			method: "POST",
			body: {
				name: duplicateForm.name,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		duplicateOpen.value = false;
		await fetchRoles();
		selectedRoleId.value = response.data.id;
		await loadRoleDetail(response.data.id, true);
	} finally {
		saving.value = false;
	}
}

async function applyRoleToAnotherStore() {
	if (!selectedRole.value || !canSubmitApplyRole.value) return;
	applyError.value = null;
	saving.value = true;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(selectedRole.value.id)}/apply`, {
			method: "POST",
			body: {
				target_store_id: applyForm.targetStoreId,
				mode: applyForm.mode,
				name: applyForm.mode === "create" ? applyForm.name.trim() : undefined,
				target_role_id: applyForm.mode === "update" ? applyForm.targetRoleId : undefined,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		applyOpen.value = false;
		appToast.success({
			title: "ใช้ role กับอีกร้านแล้ว",
			description: applyForm.mode === "create"
				? "คัดลอกบทบาทและสิทธิ์ไปยังร้านปลายทางเรียบร้อย"
				: "อัปเดต permission ของบทบาทปลายทางเรียบร้อย",
		});
	} catch (err) {
		applyError.value = resolveApiErrorMessage(err, "ใช้ role กับอีกร้านไม่สำเร็จ");
		appToast.error({
			title: "ใช้ role กับอีกร้านไม่สำเร็จ",
			description: applyError.value,
		});
	} finally {
		saving.value = false;
	}
}

function openDeleteRoleConfirm() {
	const role = selectedRole.value;
	if (!role) return;
	deleteConfirmOpen.value = true;
}

async function removeRole() {
	const role = selectedRole.value;
	if (!role) return;
	deletingRoleId.value = role.id;
	try {
		await apiFetch(`/rbac/roles/${encodeURIComponent(role.id)}`, {
			method: "DELETE",
		});
		appToast.success({
			title: "ลบบทบาทแล้ว",
			description: "ระบบบันทึกแบบ soft delete เรียบร้อย",
		});
		deleteConfirmOpen.value = false;
		detailOpen.value = false;
		await fetchRoles();
	} catch (err) {
		appToast.error({
			title: "ลบบทบาทไม่สำเร็จ",
			description: resolveApiErrorMessage(err),
		});
	} finally {
		deletingRoleId.value = "";
	}
}

onMounted(async () => {
	loading.value = true;
	error.value = null;
	try {
		suppressStoreWatch.value = true;
		await Promise.all([fetchStores(), fetchPermissions()]);
		suppressStoreWatch.value = false;
		if (selectedStoreId.value) {
			await fetchRoles();
		}
	} catch (fetchError) {
		error.value = fetchError instanceof Error ? fetchError.message : "โหลดข้อมูลบทบาทไม่สำเร็จ";
	} finally {
		suppressStoreWatch.value = false;
		loading.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="จัดการบทบาทระดับร้านภายใต้ client ที่คุณดูแล"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
				<AppPageHeader
					title="Role Settings"
					description="กำหนดบทบาทและสิทธิ์ของผู้ใช้ในแต่ละร้านจากมุม Superadmin"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								:loading="listPending"
								:spin-icon-on-loading="true"
								:disabled="loading || saving"
								@click="reloadRolePage"
							>
								รีโหลด
							</AppButton>
							<AppButton
								color="primary"
								variant="solid"
								size="md"
								icon="i-heroicons-plus-20-solid"
								:disabled="isCreateRoleButtonDisabled"
								@click="openCreateRolePanel"
							>
								สร้างบทบาท
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Superadmin roles</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">จัดการบทบาทตามร้าน พร้อมมุมมองรายการและการแบ่งหน้าแบบเดียวกับหน้า users</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ pageSummaryText }}
								</div>
							</div>

							<div class="border-b border-[#ece6dc] px-4 py-3">
								<div class="grid gap-2.5 sm:grid-cols-[minmax(0,1fr)_auto]">
									<select
										v-model="selectedStoreId"
										class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
										<option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
									</select>
									<AppButton color="primary" variant="soft" size="md" class="sm:self-stretch" @click="applyStoreFilter">
										ใช้ตัวกรอง
									</AppButton>
								</div>
							</div>

							<div ref="rolesListScrollRef" class="scrollbar-soft min-h-0 flex-1 overflow-y-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="listPending" class="min-h-[280px]">
									<AppInlineLoadingBar container-class="bg-neutral-100" />
								</div>
								<div v-else-if="error" class="p-5 text-center text-sm text-error">
									{{ error }}
								</div>
								<div v-else-if="!roles.length" class="p-5 text-center text-sm text-stone-500">
									ยังไม่มี role ในร้านนี้
								</div>
								<template v-else>
									<button
										v-for="role in paginatedRoles"
										:key="role.id"
										type="button"
										class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
										:class="selectedRoleId === role.id ? 'bg-primary-50' : ''"
										@click="selectRole(role.id)"
									>
										<div class="flex items-center justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ role.name }}</p>
												<p class="mt-1 truncate text-xs text-stone-500">{{ role.permissions_count }} permissions</p>
											</div>
											<div class="flex items-center gap-2">
												<UBadge :color="role.is_system ? 'neutral' : 'primary'" variant="soft" :label="role.is_system ? 'system' : 'custom'" />
												<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-chevron-right-20-solid">จัดการ</AppButton>
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
												:disabled="currentPage <= 1 || listPending"
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
												:disabled="currentPage >= totalPages || listPending"
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
				:title="selectedRole ? selectedRole.name : 'Role editor'"
				description="ปรับชื่อบทบาทและกำหนด permission ที่ role นี้สามารถใช้งานได้"
				desktop-width="620px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedRole">
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] text-stone-900">
						<div class="shrink-0 px-5 pt-3">
							<AppInlineLoadingBar
								v-if="roleDetailPending"
								:minimal="true"
							/>
						</div>
							<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
								<div v-if="isSelectedSystemRole" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3">
									<div class="flex items-start gap-2.5">
										<UIcon name="i-heroicons-information-circle-20-solid" class="mt-0.5 h-5 w-5 text-amber-600" />
										<div class="min-w-0">
											<p class="text-sm font-semibold text-amber-800">System role</p>
											<p class="mt-1 text-sm text-amber-700">บทบาทค่าเริ่มต้นของระบบ ไม่สามารถลบได้</p>
										</div>
									</div>
								</div>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาท</label>
								<UInput
									v-model="editorForm.name"
									size="lg"
									color="neutral"
									:disabled="roleDetailPending || !selectedRoleDetail || saving || !canManageRoles"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<div
								v-for="row in permissionMatrixRows"
								:key="row.resource"
								class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold capitalize text-stone-900">{{ row.resource }}</p>
										<p class="mt-1 text-xs text-stone-500">
											เลือกแล้ว {{ countSelectedPermissionKeys(editorForm.permissionKeys, row.allKeys) }} / {{ row.allKeys.length }}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											label="เลือกทั้งหมด"
											:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
											@click="togglePermissionGroup(row.allKeys, true)"
										/>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											label="ล้างทั้งหมด"
											:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
											@click="togglePermissionGroup(row.allKeys, false)"
										/>
									</div>
								</div>

								<div class="mt-4 overflow-x-auto">
									<div class="min-w-[460px] space-y-2">
										<div class="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(0,64px))] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
											<p>Actions</p>
											<p
												v-for="standardAction in standardPermissionActions"
												:key="`${row.resource}-head-${standardAction.key}`"
												class="text-center"
											>
												{{ standardAction.label }}
											</p>
										</div>

										<div class="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(0,64px))] items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-3">
											<p class="text-sm font-medium text-stone-800">Permission</p>
											<div
												v-for="standardAction in standardPermissionActions"
												:key="`${row.resource}-body-${standardAction.key}`"
												class="flex items-center justify-center"
											>
													<input
														v-if="row.standard[standardAction.key]"
														:checked="isPermissionChecked(row.standard[standardAction.key]!.key)"
														type="checkbox"
														class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
														:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
														@change="togglePermission(row.standard[standardAction.key]!.key, ($event.target as HTMLInputElement).checked)"
													/>
												<span v-else class="text-xs text-stone-300">-</span>
											</div>
										</div>
									</div>
								</div>

							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-check-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail || !roleDetailHasChanges"
									:loading="saving"
									:spin-icon-on-loading="true"
									@click="saveRole"
								>
									บันทึก
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-document-duplicate-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
									@click="duplicateOpen = true"
								>
									ทำสำเนา role นี้
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="primary"
									variant="soft"
									size="md"
									icon="i-heroicons-arrow-right-circle-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail"
									@click="openApplyRolePanel"
								>
									ใช้กับอีกร้าน
								</AppButton>
							</div>
							<div class="mt-2">
								<AppButton
									color="error"
									variant="soft"
									size="md"
									icon="i-heroicons-trash-20-solid"
									:block="true"
									:disabled="!canManageRoles || saving || roleDetailPending || !selectedRoleDetail || deletingRoleId === selectedRole?.id"
									:loading="deletingRoleId === selectedRole?.id"
									:spin-icon-on-loading="true"
									@click="openDeleteRoleConfirm"
								>
									ลบบทบาท
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="createOpen"
				title="สร้างบทบาทใหม่"
				description="เริ่มจากชื่อ role แล้วเลือกสิทธิ์ที่เหมาะกับทีมงานของร้านนี้"
				desktop-width="520px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div v-if="createPanelPending" class="space-y-4">
							<AppInlineLoadingBar label="กำลังเตรียมข้อมูลสำหรับสร้างบทบาท..." />
						</div>

						<template v-else>
							<div v-if="!selectedStoreId" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
								ยังไม่พบร้านสำหรับสร้างบทบาท กรุณาสร้างร้านก่อนหรือรีโหลดข้อมูลอีกครั้ง
							</div>

							<div class="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-stone-700">
								เลือกแล้ว {{ createRolePermissionCount }} / {{ createRolePermissionTotal }} สิทธิ์
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาท</label>
								<UInput
									v-model="createForm.name"
									size="lg"
									color="neutral"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<div
								v-for="row in permissionMatrixRows"
								:key="`create-${row.resource}`"
								class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
							>
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold capitalize text-stone-900">{{ row.resource }}</p>
										<p class="mt-1 text-xs text-stone-500">
											เลือกแล้ว {{ countSelectedPermissionKeys(createForm.permissionKeys, row.allKeys) }} / {{ row.allKeys.length }}
										</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											label="เลือกทั้งหมด"
											:disabled="!canManageRoles || saving"
											@click="toggleCreatePermissionGroup(row.allKeys, true)"
										/>
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											label="ล้างทั้งหมด"
											:disabled="!canManageRoles || saving"
											@click="toggleCreatePermissionGroup(row.allKeys, false)"
										/>
									</div>
								</div>

								<div class="mt-4 overflow-x-auto">
									<div class="min-w-[460px] space-y-2">
										<div class="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(0,64px))] items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-stone-500">
											<p>Actions</p>
											<p
												v-for="standardAction in standardPermissionActions"
												:key="`create-${row.resource}-head-${standardAction.key}`"
												class="text-center"
											>
												{{ standardAction.label }}
											</p>
										</div>

										<div class="grid grid-cols-[minmax(120px,1fr)_repeat(4,minmax(0,64px))] items-center gap-2 rounded-md border border-neutral-200 bg-white px-3 py-3">
											<p class="text-sm font-medium text-stone-800">Permission</p>
											<div
												v-for="standardAction in standardPermissionActions"
												:key="`create-${row.resource}-body-${standardAction.key}`"
												class="flex items-center justify-center"
											>
												<input
													v-if="row.standard[standardAction.key]"
													:checked="isCreatePermissionChecked(row.standard[standardAction.key]!.key)"
													type="checkbox"
													class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
													:disabled="!canManageRoles || saving"
													@change="toggleCreatePermission(row.standard[standardAction.key]!.key, ($event.target as HTMLInputElement).checked)"
												/>
												<span v-else class="text-xs text-stone-300">-</span>
											</div>
										</div>
									</div>
								</div>

							</div>

							<div v-if="createError" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ createError }}
							</div>
						</template>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-plus-20-solid" :block="true" :disabled="createPanelPending || !canSubmitCreateRole" :loading="saving" :spin-icon-on-loading="true" @click="createRole">
								สร้างบทบาท
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="duplicateOpen"
				title="ทำสำเนาบทบาท"
				description="ระบบจะคัดลอก permission จาก role ปัจจุบันไปยัง role ใหม่"
				desktop-width="620px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
							<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาทใหม่</label>
							<UInput
								v-model="duplicateForm.name"
								size="lg"
								color="neutral"
								class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
							/>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="duplicateOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" :block="true" :disabled="!canManageRoles || saving" :loading="saving" :spin-icon-on-loading="true" @click="duplicateRole">
								ทำสำเนา
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="applyOpen"
				title="ใช้ role นี้กับอีกร้าน"
				description="คัดลอก permission ของ role ปัจจุบันไปยังร้านปลายทาง โดยไม่ต้อง preload roles ทุก store ตั้งแต่แรก"
				desktop-width="620px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="rounded-md border border-primary-200 bg-primary-50 px-4 py-3 text-sm text-stone-700">
							<div class="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p class="font-semibold text-stone-900">{{ selectedRole?.name || "-" }}</p>
									<p class="mt-1 text-xs text-stone-500">Source store: {{ stores.find((store) => store.id === selectedRole?.store_id)?.name || "-" }}</p>
								</div>
								<UBadge color="primary" variant="soft" :label="`${selectedRolePermissionCount} permissions`" />
							</div>
						</div>

						<div v-if="!applyTargetStoreOptions.length" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
							ยังไม่มีร้านอื่นให้ใช้ role นี้ต่อได้
						</div>

						<template v-else>
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ร้านปลายทาง</label>
								<select
									v-model="applyForm.targetStoreId"
									class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
								>
									<option v-for="store in applyTargetStoreOptions" :key="store.id" :value="store.id">{{ store.name }}</option>
								</select>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">โหมด</label>
								<div class="mt-3 grid gap-2 sm:grid-cols-2">
									<button
										v-for="option in applyModeOptions"
										:key="option.value"
										type="button"
										class="rounded-md border px-3 py-3 text-left text-sm transition"
										:class="applyForm.mode === option.value ? 'border-primary-300 bg-primary-50 text-primary-800' : 'border-neutral-200 bg-white text-stone-700 hover:bg-neutral-50'"
										@click="applyForm.mode = option.value"
									>
										{{ option.label }}
									</button>
								</div>
							</div>

							<div v-if="applyForm.mode === 'create'" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ชื่อบทบาทใหม่</label>
								<UInput
									v-model="applyForm.name"
									size="lg"
									color="neutral"
									class="mt-3 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
								<p class="mt-2 text-xs text-stone-500">เหมาะกับการสร้าง role ใหม่ในร้านปลายทาง โดยใช้ permission ชุดเดียวกับต้นทาง</p>
							</div>

							<div v-else class="space-y-3 rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div v-if="applyTargetRolesPending">
									<AppInlineLoadingBar label="กำลังโหลดบทบาทของร้านปลายทาง..." />
								</div>
								<template v-else>
									<div v-if="!applyTargetRoles.length" class="rounded-md border border-warning-200 bg-warning-50 px-4 py-3 text-sm text-stone-700">
										ร้านปลายทางยังไม่มี role ให้เลือกอัปเดต
									</div>
									<div v-else>
										<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาทปลายทาง</label>
										<select
											v-model="applyForm.targetRoleId"
											class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										>
											<option v-for="role in applyTargetRoles" :key="role.id" :value="role.id">{{ role.name }}</option>
										</select>
										<p class="mt-2 text-xs text-stone-500">
											ระบบจะอัปเดต permission ของ
											<span class="font-semibold text-stone-700">{{ selectedApplyTargetRole?.name || "role ปลายทาง" }}</span>
											ให้ตรงกับ role ต้นทาง โดยยังคงชื่อ role เดิมของร้านปลายทางไว้
										</p>
									</div>
								</template>
							</div>

							<div v-if="applyError" class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ applyError }}
							</div>
						</template>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="applyOpen = false">ยกเลิก</AppButton>
							<AppButton
								color="primary"
								variant="solid"
								size="md"
								icon="i-heroicons-arrow-right-circle-20-solid"
								:block="true"
								:disabled="applyTargetRolesPending || !canSubmitApplyRole"
								:loading="saving"
								:spin-icon-on-loading="true"
								@click="applyRoleToAnotherStore"
							>
								{{ applyForm.mode === 'create' ? 'สร้างในร้านปลายทาง' : 'อัปเดต role ปลายทาง' }}
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

			<AppResponsivePanel
				v-model="deleteConfirmOpen"
				:title="isSelectedSystemRole ? 'ลบบทบาทระบบไม่ได้' : 'ยืนยันการลบบทบาท'"
				:description="isSelectedSystemRole ? 'บทบาทนี้ถูกสร้างเป็นค่าเริ่มต้นของระบบ จึงป้องกันการลบเพื่อความปลอดภัย' : 'ระบบจะลบบทบาทแบบ soft delete และสามารถเพิ่มหน้าถังขยะเพื่อกู้คืนในอนาคตได้'"
				desktop-width="620px"
				mobile-max-height="88dvh"
				:fill-mobile-height="true"
				close-button-size="md"
				compact-header
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div
							class="rounded-md p-4"
							:class="isSelectedSystemRole ? 'border border-amber-200 bg-amber-50' : 'border border-rose-200 bg-rose-50'"
						>
							<p v-if="isSelectedSystemRole" class="text-sm text-amber-800">
								บทบาท
								<span class="font-semibold">"{{ selectedRole?.name || '-' }}"</span>
								เป็นบทบาทระบบ จึงลบไม่ได้
							</p>
							<p v-else class="text-sm text-rose-800">
								ต้องการลบบทบาท
								<span class="font-semibold">"{{ selectedRole?.name || '-' }}"</span>
								ใช่หรือไม่?
							</p>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div v-if="isSelectedSystemRole" class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="deleteConfirmOpen = false">
								ปิด
							</AppButton>
							<AppButton
								color="primary"
								variant="solid"
								size="md"
								icon="i-heroicons-document-duplicate-20-solid"
								:block="true"
								@click="deleteConfirmOpen = false; duplicateOpen = true"
							>
								ทำสำเนาแทน
							</AppButton>
						</div>
						<div v-else class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" :disabled="deletingRoleId === selectedRole?.id" @click="deleteConfirmOpen = false">
								ยกเลิก
							</AppButton>
							<AppButton
								color="error"
								variant="solid"
								size="md"
								icon="i-heroicons-trash-20-solid"
								:block="true"
								:disabled="deletingRoleId === selectedRole?.id"
								:loading="deletingRoleId === selectedRole?.id"
								:spin-icon-on-loading="true"
								@click="removeRole"
							>
								ลบบทบาท
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
