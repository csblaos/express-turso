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

type PermissionRecord = {
	id: string;
	key: string;
	resource: string;
	action: string;
};

type RoleRecord = {
	id: string;
	store_id: string;
	name: string;
	is_system: number;
	permissions: PermissionRecord[];
	permissions_count: number;
};

type StoreMemberRecord = {
	store_id: string;
	user_id: string;
	name: string;
	email: string;
	system_role: string;
	ui_locale: string;
	status: string;
	role_id: string;
	role_name: string;
	created_at: string;
	added_by: string | null;
	permissions_count: number;
	permissions: PermissionRecord[];
};

const { apiFetch } = useApiClient();
const { currentUser, currentAccess, can, fetchMe } = useAuthSession();

const searchQuery = ref("");
const activeStatus = ref("all");
const activeRoleId = ref("all");
const selectedStoreId = ref("");
const selectedMemberId = ref("");
const detailOpen = ref(false);
const createOpen = ref(false);
const resetPasswordOpen = ref(false);
const saving = ref(false);
const storesPending = ref(true);
const membersPending = ref(false);
const membersError = ref<string | null>(null);

const stores = ref<StoreRecord[]>([]);
const roles = ref<RoleRecord[]>([]);
const members = ref<StoreMemberRecord[]>([]);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [10, 20, 50];

const createForm = reactive({
	name: "",
	email: "",
	password: "dev123456",
	role_id: "",
	status: "active",
});

const resetPasswordForm = reactive({
	password: "dev123456",
	must_change_password: true,
});

const statusOptions = [
	{ id: "all", label: "ทุกสถานะ" },
	{ id: "active", label: "ใช้งาน" },
	{ id: "inactive", label: "ปิดใช้งาน" },
];

const memberStatusOptions = [
	{ id: "active", label: "ใช้งาน" },
	{ id: "inactive", label: "ปิดใช้งาน" },
];

const isElevatedStoreManager = computed(() => (
	currentUser.value?.systemRole === "superadmin"
	|| currentUser.value?.systemRole === "system_admin"
));
const canCreateUsers = computed(() => isElevatedStoreManager.value || can("settings.users.create"));
const canUpdateUsers = computed(() => isElevatedStoreManager.value || can("settings.users.update"));
const canSuspendUsers = computed(() => isElevatedStoreManager.value || can("settings.users.suspend"));
const canResetPasswords = computed(() => isElevatedStoreManager.value || can("settings.users.reset_password"));
const canManageUsers = computed(() => (
	canCreateUsers.value
	|| canUpdateUsers.value
	|| canSuspendUsers.value
	|| canResetPasswords.value
));
const canManageRoles = computed(() => isElevatedStoreManager.value || can("settings.users.assign_role"));
const lockedStoreId = computed(() => (
	currentAccess.value?.store_id
	|| currentAccess.value?.memberships?.[0]?.store_id
	|| ""
));
const membershipCount = computed(() => currentAccess.value?.memberships?.length ?? 0);
const hasMultipleStoreAccess = computed(() => membershipCount.value > 1);

const selectedMember = computed(() =>
	members.value.find((member) => member.user_id === selectedMemberId.value) ?? members.value[0] ?? null,
);
const totalItems = computed(() => members.value.length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalItems.value / pageSize.value)));
const paginatedMembers = computed(() => {
	const startIndex = (currentPage.value - 1) * pageSize.value;
	return members.value.slice(startIndex, startIndex + pageSize.value);
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

const roleOptions = computed(() => [
	{ id: "all", label: "ทุกบทบาท" },
	...roles.value.map((role) => ({ id: role.id, label: role.name })),
]);
const selectedStoreLabel = computed(() => (
	stores.value.find((store) => store.id === selectedStoreId.value)?.name
	|| "ยังไม่พบร้านที่กำลังใช้งาน"
));
const overviewStats = computed(() => ([
	{ label: "สมาชิกทั้งหมด", value: members.value.length },
	{ label: "ใช้งาน", value: members.value.filter((member) => member.status === "active").length },
	{ label: "ปิดใช้งาน", value: members.value.filter((member) => member.status !== "active").length },
	{ label: "บทบาทในร้าน", value: roles.value.length },
]));

function resolveDefaultRoleId(roleList: RoleRecord[]): string {
	if (!roleList.length) return "";
	const cashier = roleList.find((role) => role.name.trim().toLowerCase() === "cashier");
	return cashier?.id || roleList[0].id;
}

watch(selectedStoreId, async (value) => {
	if (!value) return;
	await fetchMe(value);
	await Promise.all([fetchRoles(), fetchMembers()]);
}, { immediate: false });

watch([ lockedStoreId, stores ], () => {
	const nextStoreId = lockedStoreId.value || stores.value[0]?.id || "";
	if (nextStoreId && selectedStoreId.value !== nextStoreId) {
		selectedStoreId.value = nextStoreId;
	}
}, { immediate: true });

watch(members, (value) => {
	if (!value.length) {
		selectedMemberId.value = "";
		detailOpen.value = false;
		return;
	}

	if (!value.some((member) => member.user_id === selectedMemberId.value)) {
		selectedMemberId.value = value[0].user_id;
	}
}, { immediate: true });

watch([members, pageSize, currentPage], () => {
	const maxPage = Math.max(1, Math.ceil(members.value.length / pageSize.value));
	if (currentPage.value > maxPage) {
		currentPage.value = maxPage;
		return;
	}

	if (!members.value.length) {
		selectedMemberId.value = "";
		detailOpen.value = false;
		return;
	}

	const visibleMembers = paginatedMembers.value;
	if (!visibleMembers.length) return;
	if (!visibleMembers.some((member) => member.user_id === selectedMemberId.value)) {
		selectedMemberId.value = visibleMembers[0].user_id;
	}
}, { immediate: true });

watch(createOpen, (isOpen) => {
	if (isOpen) {
		createForm.role_id = resolveDefaultRoleId(roles.value);
	}
});

watch(resetPasswordOpen, (isOpen) => {
	if (isOpen) {
		resetPasswordForm.password = "dev123456";
		resetPasswordForm.must_change_password = true;
	}
});

function statusTone(status: string) {
	return status === "active" ? "success" : "neutral";
}

function formatDate(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function openMemberDetail(userId: string) {
	selectedMemberId.value = userId;
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

async function fetchRoles() {
	if (!selectedStoreId.value) return;
	const response = await apiFetch<ApiEnvelope<RoleRecord[]>>(`/rbac/roles?store_id=${encodeURIComponent(selectedStoreId.value)}`);
	roles.value = response.data;
	if (activeRoleId.value !== "all" && !roles.value.some((role) => role.id === activeRoleId.value)) {
		activeRoleId.value = "all";
	}
	if (createOpen.value) {
		createForm.role_id = resolveDefaultRoleId(roles.value);
	}
}

async function fetchMembers() {
	if (!selectedStoreId.value) return;
	membersPending.value = true;
	membersError.value = null;
	try {
		const params = new URLSearchParams({
			store_id: selectedStoreId.value,
		});
		if (searchQuery.value.trim()) params.set("search", searchQuery.value.trim());
		if (activeStatus.value !== "all") params.set("status", activeStatus.value);
		if (activeRoleId.value !== "all") params.set("role_id", activeRoleId.value);

			const response = await apiFetch<ApiEnvelope<StoreMemberRecord[]>>(`/rbac/store-members?${params.toString()}`);
			members.value = response.data;
			currentPage.value = 1;
		} catch (error) {
			membersError.value = error instanceof Error ? error.message : "โหลดสมาชิกไม่สำเร็จ";
		} finally {
			membersPending.value = false;
		}
}

async function saveMemberRole(member: StoreMemberRecord, roleId: string) {
	if (!selectedStoreId.value) return;
	await apiFetch(`/rbac/store-members/${encodeURIComponent(selectedStoreId.value)}/${encodeURIComponent(member.user_id)}/role`, {
		method: "PUT",
		body: {
			role_id: roleId,
			status: member.status,
			added_by: currentUser.value?.id || null,
		},
	});
	await fetchMembers();
}

async function saveMemberStatus(member: StoreMemberRecord, status: string) {
	if (!selectedStoreId.value) return;
	await apiFetch(`/rbac/store-members/${encodeURIComponent(selectedStoreId.value)}/${encodeURIComponent(member.user_id)}/status`, {
		method: "PATCH",
		body: {
			status,
			added_by: currentUser.value?.id || null,
		},
	});
	await fetchMembers();
}

async function createMember() {
	if (!selectedStoreId.value) return;
	saving.value = true;
	try {
		await apiFetch("/rbac/store-members", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name,
				email: createForm.email,
				password: createForm.password,
				role_id: createForm.role_id || undefined,
				status: createForm.status,
				added_by: currentUser.value?.id || null,
			},
		});

		createForm.name = "";
		createForm.email = "";
		createForm.password = "dev123456";
		createForm.status = "active";
		createOpen.value = false;
		await fetchMembers();
	} finally {
		saving.value = false;
	}
}

async function resetMemberPassword() {
	if (!selectedStoreId.value || !selectedMember.value) return;
	saving.value = true;
	try {
		await apiFetch(`/rbac/store-members/${encodeURIComponent(selectedStoreId.value)}/${encodeURIComponent(selectedMember.value.user_id)}/reset-password`, {
			method: "POST",
			body: {
				password: resetPasswordForm.password,
				must_change_password: resetPasswordForm.must_change_password,
				actor_user_id: currentUser.value?.id || null,
			},
		});
		resetPasswordOpen.value = false;
	} finally {
		saving.value = false;
	}
}

function scrollUsersListToTop() {
	if (!import.meta.client) return;
	document.getElementById("settings-users-list-scroll")?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}

function goToPage(nextPage: number) {
	const normalizedPage = Math.min(Math.max(1, nextPage), totalPages.value);
	if (normalizedPage === currentPage.value) return;
	currentPage.value = normalizedPage;
	nextTick(() => {
		scrollUsersListToTop();
	});
}

function updatePageSize(nextPageSize: number | string) {
	const normalizedSize = Number(nextPageSize);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
	nextTick(() => {
		scrollUsersListToTop();
	});
}

onMounted(async () => {
	storesPending.value = true;
	membersPending.value = true;
	membersError.value = null;
	try {
		await fetchStores();
		if (selectedStoreId.value) {
			await Promise.all([fetchRoles(), fetchMembers()]);
		}
	} catch (error) {
		membersError.value = error instanceof Error ? error.message : "โหลดข้อมูลผู้ใช้งานไม่สำเร็จ";
	} finally {
		storesPending.value = false;
		membersPending.value = false;
	}
});
</script>

<template>
	<AppSidebarShell
			:nav-items="appNavItems"
			:active-ids="['settings']"
			sidebar-eyebrow="Settings"
		sidebar-title="Users"
		sidebar-compact-title="USR"
		sidebar-description="จัดการสมาชิกในร้าน บทบาท และสิทธิ์การใช้งานตามร้านที่กำลังดู"
	>
			<template #default="{ openSidebar }">
				<div class="grid gap-3 pb-3 lg:gap-4">
					<AppPageHeader
						title=""
						compact
						description="จัดการสมาชิกในร้าน กำหนดบทบาท และดู permission summary ตามร้านที่กำลังใช้งาน"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 pt-0.5 sm:pt-1 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:gap-3 lg:justify-end">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="neutral"
							placeholder="ค้นหาชื่อผู้ใช้หรืออีเมล"
							class="min-w-0 w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
							@keyup.enter="fetchMembers"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
							icon="i-heroicons-arrow-path-20-solid"
							aria-label="รีเฟรช"
							title="รีเฟรช"
							@click="fetchMembers"
						>
							<span class="hidden sm:inline">รีเฟรช</span>
						</AppButton>
						<AppButton
							color="primary"
							size="md"
							class="h-9 w-9 shrink-0 justify-center rounded-md px-0 sm:h-auto sm:w-auto sm:px-3"
							icon="i-heroicons-user-plus-20-solid"
							aria-label="เพิ่มผู้ใช้"
							title="เพิ่มผู้ใช้"
							:disabled="!canCreateUsers || !selectedStoreId"
							@click="createOpen = true"
						>
							<span class="hidden sm:inline">เพิ่มผู้ใช้</span>
						</AppButton>
					</div>
				</AppPageHeader>

					<div class="grid gap-3 lg:pr-1">
						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
							<div class="grid grid-cols-2 gap-2 sm:gap-3 md:grid-cols-4">
								<div
									v-for="stat in overviewStats"
									:key="stat.label"
									class="min-w-0 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2 sm:px-4 sm:py-3"
								>
									<p class="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-400 sm:text-[11px] sm:tracking-[0.18em]">{{ stat.label }}</p>
									<p class="mt-1 text-lg font-semibold text-stone-950 sm:mt-2 sm:text-2xl">{{ stat.value }}</p>
								</div>
							</div>
						</UCard>

					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3">
							<div class="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
								<div>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Filters</p>
									<h2 class="mt-2 text-lg font-semibold text-stone-950">ตัวกรองของร้านที่กำลังใช้งาน</h2>
								</div>
								<div class="flex flex-wrap gap-2">
									<UBadge color="neutral" variant="soft" :label="selectedStoreLabel" />
									<UBadge
										:color="hasMultipleStoreAccess ? 'primary' : 'neutral'"
										variant="soft"
										:label="hasMultipleStoreAccess ? 'เปลี่ยนร้านจากตัวสลับหลัก' : 'ยึดตามร้านที่กำลังใช้งาน'"
									/>
								</div>
							</div>

							<div class="grid gap-3">
								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ร้านที่กำลังใช้งาน</label>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-stone-700">
										{{ selectedStoreLabel }}
									</div>
									<p class="text-xs text-stone-500">
										{{ hasMultipleStoreAccess ? "ถ้าต้องการจัดการอีกร้าน ให้เปลี่ยนร้านจากตัวสลับหลักก่อนเข้าหน้านี้" : "หน้านี้จะแสดงสมาชิกของร้านที่คุณกำลังใช้งานอยู่เท่านั้น" }}
									</p>
								</div>

								<div class="grid grid-cols-2 gap-3">
									<div class="space-y-2 min-w-0">
										<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">สถานะ</label>
										<select
											v-model="activeStatus"
											class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 sm:px-4"
											@change="fetchMembers"
										>
											<option v-for="status in statusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
										</select>
									</div>

									<div class="space-y-2 min-w-0">
										<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาท</label>
										<select
											v-model="activeRoleId"
											class="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200 sm:px-4"
											@change="fetchMembers"
										>
											<option v-for="role in roleOptions" :key="role.id" :value="role.id">{{ role.label }}</option>
										</select>
									</div>
								</div>
							</div>
						</div>
					</UCard>

						<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
							<div class="flex h-full min-h-0 flex-col">
								<div class="flex flex-wrap items-center justify-between gap-3 border-b border-[#ece6dc] px-4 py-3">
									<div class="min-w-0">
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Members</p>
										<h2 class="text-lg font-semibold text-stone-950">สมาชิกในร้าน</h2>
										<p class="mt-1 text-sm text-stone-500">คลิกผู้ใช้เพื่อดูบทบาท สถานะ และ permission summary แบบละเอียด</p>
									</div>
									<div class="flex flex-wrap gap-2">
										<UBadge color="neutral" variant="soft" :label="selectedStoreLabel" />
										<UBadge color="neutral" variant="soft" :label="`${members.length} รายการ`" />
									</div>
								</div>

								<div class="min-h-0 flex-1 overflow-hidden">
										<div id="settings-users-list-scroll" class="scrollbar-soft min-h-0 h-full overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
										<div v-if="membersPending" class="min-h-[280px]">
											<AppInlineLoadingBar minimal />
										</div>

										<div v-else-if="membersError" class="flex min-h-[280px] items-center justify-center px-4 text-center">
											<div class="space-y-3">
												<p class="text-sm text-rose-700">{{ membersError }}</p>
												<AppButton color="primary" variant="soft" size="md" class="rounded-md" label="ลองใหม่" @click="fetchMembers" />
											</div>
										</div>

										<div v-else-if="!members.length" class="flex min-h-[280px] items-center justify-center px-4 text-center">
											<div class="space-y-3">
												<UIcon name="i-heroicons-users" class="mx-auto h-8 w-8 text-stone-300" />
												<p class="text-sm font-medium text-stone-700">ยังไม่มีสมาชิกในร้านนี้</p>
												<p class="text-sm text-stone-500">เพิ่มผู้ใช้ใหม่หรือเชิญผู้ใช้เดิมเข้ามาในร้านก่อน</p>
											</div>
										</div>

											<table v-else class="min-w-[980px] w-full border-separate border-spacing-0">
												<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
													<tr class="text-left text-xs font-medium uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">
														<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">ผู้ใช้</th>
														<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">บทบาท</th>
														<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">สถานะ</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">System role</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">Permissions</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 dark:border-[#3a332a] dark:bg-[#221d18]">เพิ่มเมื่อ</th>
													<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-right dark:border-[#3a332a] dark:bg-[#221d18]">Action</th>
												</tr>
											</thead>
											<tbody>
													<tr
														v-for="member in paginatedMembers"
														:key="`${member.store_id}:${member.user_id}`"
														class="cursor-pointer text-sm text-stone-700 transition hover:bg-primary-50"
														:class="detailOpen && selectedMemberId === member.user_id ? 'bg-primary-50' : 'bg-white'"
														@click="openMemberDetail(member.user_id)"
													>
														<td class="border-b border-[#f1ede6] px-4 py-4">
															<div class="min-w-0">
																<p class="truncate font-semibold text-stone-950">{{ member.name }}</p>
																<p class="mt-1 truncate text-xs text-stone-500">{{ member.email }}</p>
															</div>
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-4">
															<UBadge color="neutral" variant="soft" :label="member.role_name" />
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-4">
															<UBadge :color="member.status === 'active' ? 'success' : 'neutral'" variant="soft" :label="member.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'" />
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-4">
															<UBadge color="neutral" variant="soft" :label="member.system_role" />
														</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-stone-600 tabular-nums">
														{{ member.permissions_count }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 whitespace-nowrap text-stone-600">
														{{ formatDate(member.created_at) }}
													</td>
													<td class="border-b border-[#f1ede6] px-4 py-4 text-right">
														<AppButton
															color="neutral"
															variant="soft"
															size="md"
															class="rounded-md"
															icon="i-heroicons-chevron-right-20-solid"
															@click.stop="openMemberDetail(member.user_id)"
														>
															จัดการ
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
												:disabled="currentPage <= 1 || membersPending"
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
												:disabled="currentPage >= totalPages || membersPending"
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
					:title="selectedMember ? selectedMember.name : 'รายละเอียดสมาชิก'"
					description="จัดการบทบาท สถานะ และดู permission summary ของผู้ใช้"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				>
				<template v-if="selectedMember">
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ข้อมูลผู้ใช้</p>
								<p class="mt-2 text-sm font-semibold text-stone-900">{{ selectedMember.email }}</p>
								<p class="mt-1 text-xs text-stone-500">System role: {{ selectedMember.system_role }}</p>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาท</p>
								<select
									:value="selectedMember.role_id"
									class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									:disabled="!canManageRoles"
									@change="saveMemberRole(selectedMember, ($event.target as HTMLSelectElement).value)"
								>
									<option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
								</select>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">สถานะสมาชิก</p>
								<select
									:value="selectedMember.status"
									class="mt-3 w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									:disabled="!canSuspendUsers"
									@change="saveMemberStatus(selectedMember, ($event.target as HTMLSelectElement).value)"
								>
									<option v-for="status in memberStatusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
								</select>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Permission summary</p>
								<div class="mt-3 flex flex-wrap gap-2">
									<span
										v-for="permission in selectedMember.permissions"
										:key="permission.id"
										class="rounded-md bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-neutral-200"
									>
										{{ permission.key }}
									</span>
								</div>
							</div>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="detailOpen = false">ปิด</AppButton>
								<AppButton color="primary" variant="soft" size="md" icon="i-heroicons-key-20-solid" :block="true" :disabled="!canResetPasswords" @click="resetPasswordOpen = true">
									รีเซ็ตรหัสผ่าน
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

				<AppResponsivePanel
					v-model="createOpen"
					title="เพิ่มสมาชิกในร้าน"
					description="สร้างผู้ใช้ใหม่หรือผูกผู้ใช้เดิมเข้ากับร้านพร้อมบทบาทเริ่มต้น"
					desktop-width="680px"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				>
				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">ชื่อผู้ใช้</label>
							<UInput v-model="createForm.name" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">อีเมล</label>
							<UInput v-model="createForm.email" type="email" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">รหัสผ่านเริ่มต้น</label>
							<UInput v-model="createForm.password" size="lg" color="neutral" class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5" />
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">บทบาท</label>
							<select v-model="createForm.role_id" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
							</select>
						</div>
						<div class="space-y-2">
							<label class="text-sm font-medium text-stone-700">สถานะ</label>
							<select v-model="createForm.status" class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
								<option v-for="status in memberStatusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
							</select>
						</div>
					</div>

					<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
						<div class="grid w-full grid-cols-2 gap-2">
							<AppButton color="neutral" variant="soft" size="md" :block="true" @click="createOpen = false">ยกเลิก</AppButton>
							<AppButton color="primary" variant="solid" size="md" :block="true" :loading="saving" :spin-icon-on-loading="true" :disabled="saving || !canCreateUsers" @click="createMember">
								บันทึกผู้ใช้
							</AppButton>
						</div>
					</div>
				</div>
			</AppResponsivePanel>

				<AppResponsivePanel
					v-model="resetPasswordOpen"
					:title="selectedMember ? `รีเซ็ตรหัสผ่าน: ${selectedMember.name}` : 'รีเซ็ตรหัสผ่าน'"
					description="ตั้งรหัสผ่านใหม่และกำหนดให้เปลี่ยนรหัสผ่านเมื่อเข้าสู่ระบบครั้งถัดไป"
					desktop-width="680px"
					mobile-max-height="72vh"
					close-button-size="md"
					compact-header
					content-class="flex h-full flex-col overflow-hidden px-0 py-0"
			>
				<template v-if="selectedMember">
					<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
						<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-5 py-4">
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">รหัสผ่านใหม่</label>
								<UInput
									v-model="resetPasswordForm.password"
									size="lg"
									color="neutral"
									class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
								/>
							</div>

							<label class="flex items-center gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-stone-700">
								<input
									v-model="resetPasswordForm.must_change_password"
									type="checkbox"
									class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
								/>
								<span>บังคับให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบครั้งถัดไป</span>
							</label>
						</div>

						<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
							<div class="grid w-full grid-cols-2 gap-2">
								<AppButton color="neutral" variant="soft" size="md" :block="true" @click="resetPasswordOpen = false">ยกเลิก</AppButton>
								<AppButton color="primary" variant="solid" size="md" :block="true" :disabled="!canResetPasswords || saving" :loading="saving" :spin-icon-on-loading="true" @click="resetMemberPassword">
									บันทึกรหัสผ่านใหม่
								</AppButton>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
