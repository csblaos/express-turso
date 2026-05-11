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
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3 lg:gap-4">
				<AppPageHeader
					title="ผู้ใช้งานและสิทธิ์การใช้งาน"
					description="จัดการสมาชิกในร้าน กำหนดบทบาท และดู permission summary ตามร้านที่กำลังใช้งาน"
					@menu="openSidebar"
				>
					<div class="ml-auto grid w-full gap-3 pt-2 lg:w-auto lg:grid-cols-[minmax(320px,1fr)_auto_auto] lg:justify-end">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="neutral"
							placeholder="ค้นหาชื่อผู้ใช้หรืออีเมล"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5 [&_input]:shadow-sm [&_input]:focus:border-primary-300 [&_input]:focus:ring-2 [&_input]:focus:ring-primary-200"
							@keyup.enter="fetchMembers"
						/>
						<AppButton
							color="neutral"
							variant="soft"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-arrow-path-20-solid"
							label="รีเฟรช"
							@click="fetchMembers"
						/>
						<AppButton
							color="primary"
							size="md"
							class="justify-center rounded-md"
							icon="i-heroicons-user-plus-20-solid"
							label="เพิ่มผู้ใช้"
							:disabled="!canCreateUsers || !selectedStoreId"
							@click="createOpen = true"
						/>
					</div>
				</AppPageHeader>

				<div class="grid min-h-0 gap-3 overflow-hidden lg:grid-rows-[auto_auto_minmax(0,1fr)] lg:pr-1">
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

							<div class="grid gap-3 md:grid-cols-3">
								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ร้านที่กำลังใช้งาน</label>
									<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-stone-700">
										{{ selectedStoreLabel }}
									</div>
									<p class="text-xs text-stone-500">
										{{ hasMultipleStoreAccess ? "ถ้าต้องการจัดการอีกร้าน ให้เปลี่ยนร้านจากตัวสลับหลักก่อนเข้าหน้านี้" : "หน้านี้จะแสดงสมาชิกของร้านที่คุณกำลังใช้งานอยู่เท่านั้น" }}
									</p>
								</div>

								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">สถานะ</label>
									<select
										v-model="activeStatus"
										class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										@change="fetchMembers"
									>
										<option v-for="status in statusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
									</select>
								</div>

								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาท</label>
									<select
										v-model="activeRoleId"
										class="w-full rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm font-medium text-stone-700 outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
										@change="fetchMembers"
									>
										<option v-for="role in roleOptions" :key="role.id" :value="role.id">{{ role.label }}</option>
									</select>
								</div>
							</div>
						</div>
					</UCard>

					<UCard class="h-full min-h-0 rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex flex-wrap items-start justify-between gap-3">
								<div>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Members</p>
									<h2 class="text-lg font-semibold text-stone-950">สมาชิกในร้าน</h2>
									<p class="mt-1 text-sm text-stone-500">คลิกผู้ใช้เพื่อดูบทบาท สถานะ และ permission summary แบบละเอียด</p>
								</div>
								<div class="flex flex-wrap gap-2">
									<UBadge color="neutral" variant="soft" :label="selectedStoreLabel" />
									<UBadge color="neutral" variant="soft" :label="`${members.length} รายการ`" />
								</div>
							</div>

							<div v-if="membersPending" class="mt-4">
								<AppInlineLoadingBar minimal />
							</div>

							<div v-if="membersError" class="mt-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ membersError }}
							</div>

							<div v-else-if="!members.length" class="mt-4 rounded-md border border-dashed border-neutral-200 bg-[#faf8f4] px-5 py-10 text-center">
								<UIcon name="i-heroicons-users" class="mx-auto h-8 w-8 text-stone-300" />
								<p class="mt-3 text-sm font-medium text-stone-700">ยังไม่มีสมาชิกในร้านนี้</p>
								<p class="mt-1 text-sm text-stone-500">เพิ่มผู้ใช้ใหม่หรือเชิญผู้ใช้เดิมเข้ามาในร้านก่อน</p>
							</div>

							<div v-else class="mt-4 min-h-0 flex-1">
								<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto pb-1">
									<button
										v-for="member in members"
										:key="`${member.store_id}:${member.user_id}`"
										type="button"
										class="w-full rounded-md border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-primary-200 hover:bg-primary-50"
										@click="openMemberDetail(member.user_id)"
									>
										<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<p class="text-base font-semibold text-stone-950">{{ member.name }}</p>
													<UBadge :color="statusTone(member.status)" variant="soft" :label="member.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'" />
													<UBadge color="neutral" variant="soft" :label="member.role_name" />
												</div>
												<p class="mt-1 text-sm text-stone-500">{{ member.email }}</p>
												<div class="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
													<span class="rounded-md bg-white px-2.5 py-1 ring-1 ring-neutral-200">System role: {{ member.system_role }}</span>
													<span class="rounded-md bg-white px-2.5 py-1 ring-1 ring-neutral-200">{{ member.permissions_count }} permissions</span>
													<span class="rounded-md bg-white px-2.5 py-1 ring-1 ring-neutral-200">เพิ่มเมื่อ {{ formatDate(member.created_at) }}</span>
												</div>
											</div>
											<UIcon name="i-heroicons-chevron-right-20-solid" class="hidden h-5 w-5 text-stone-300 lg:block" />
										</div>
									</button>
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				:title="selectedMember ? selectedMember.name : 'รายละเอียดสมาชิก'"
				description="จัดการบทบาท สถานะ และดู permission summary ของผู้ใช้"
				desktop-width="420px"
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
				desktop-width="440px"
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
				desktop-width="420px"
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
