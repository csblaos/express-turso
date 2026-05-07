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
const { currentUser, can } = useAuthSession();

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

const canManageUsers = computed(() => can("settings.manage_users"));
const canManageRoles = computed(() => can("settings.manage_roles"));

const selectedMember = computed(() =>
	members.value.find((member) => member.user_id === selectedMemberId.value) ?? members.value[0] ?? null,
);

const roleOptions = computed(() => [
	{ id: "all", label: "ทุกบทบาท" },
	...roles.value.map((role) => ({ id: role.id, label: role.name })),
]);

watch(selectedStoreId, async (value) => {
	if (!value) return;
	await Promise.all([fetchRoles(), fetchMembers()]);
}, { immediate: false });

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
		createForm.role_id = roles.value[0]?.id || "";
	}
});

watch(resetPasswordOpen, (isOpen) => {
	if (isOpen) {
		resetPasswordForm.password = "dev123456";
		resetPasswordForm.must_change_password = true;
	}
});

function statusTone(status: string) {
	return status === "active" ? "green" : "gray";
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
		if (!selectedStoreId.value) {
			selectedStoreId.value = stores.value[0]?.id || "";
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
	if (!selectedStoreId.value || !createForm.role_id) return;
	saving.value = true;
	try {
		await apiFetch("/rbac/store-members", {
			method: "POST",
			body: {
				store_id: selectedStoreId.value,
				name: createForm.name,
				email: createForm.email,
				password: createForm.password,
				role_id: createForm.role_id,
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
		sidebar-title="สิทธิ์การใช้งาน"
		sidebar-compact-title="ACC"
		sidebar-description="จัดการสมาชิกในร้าน, บทบาท และ permission summary"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="ผู้ใช้งานและสิทธิ์การใช้งาน"
					description="จัดการสมาชิกในร้าน, เปลี่ยนบทบาท และตรวจ permission summary ในพื้นที่เดียว"
					@menu="openSidebar"
				>
					<template #badges>
						<UBadge color="gray" variant="soft" label="Settings" />
						<UBadge color="orange" variant="soft" label="Access control" />
					</template>

					<SettingsAccessTabs />

					<div class="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
						<UInput
							v-model="searchQuery"
							icon="i-heroicons-magnifying-glass-20-solid"
							size="lg"
							color="gray"
							placeholder="ค้นหาชื่อผู้ใช้หรืออีเมล"
							class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:shadow-sm"
							@keyup.enter="fetchMembers"
						/>
						<UButton
							color="gray"
							variant="soft"
							size="lg"
							class="justify-center rounded-2xl"
							icon="i-heroicons-funnel-20-solid"
							label="รีเฟรช"
							@click="fetchMembers"
						/>
						<UButton
							color="orange"
							size="lg"
							class="justify-center rounded-2xl"
							icon="i-heroicons-user-plus-20-solid"
							label="เพิ่มผู้ใช้"
							:disabled="!canManageUsers || !selectedStoreId"
							@click="createOpen = true"
						/>
					</div>
				</AppPageHeader>

				<div class="grid min-h-0 gap-4">
					<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto lg:pr-1">
						<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
							<div class="grid gap-3 md:grid-cols-3">
								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">ร้าน</label>
									<select
										v-model="selectedStoreId"
										class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5] focus:bg-white"
										:disabled="storesPending"
									>
										<option v-for="store in stores" :key="store.id" :value="store.id">{{ store.name }}</option>
									</select>
								</div>

								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">สถานะ</label>
									<select
										v-model="activeStatus"
										class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5] focus:bg-white"
										@change="fetchMembers"
									>
										<option v-for="status in statusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
									</select>
								</div>

								<div class="space-y-2">
									<label class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาท</label>
									<select
										v-model="activeRoleId"
										class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5] focus:bg-white"
										@change="fetchMembers"
									>
										<option v-for="role in roleOptions" :key="role.id" :value="role.id">{{ role.label }}</option>
									</select>
								</div>
							</div>
						</UCard>

						<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd]">
							<div class="flex items-center justify-between gap-3">
								<div>
									<h2 class="text-lg font-semibold text-stone-950">สมาชิกในร้าน</h2>
									<p class="mt-1 text-sm text-stone-500">คลิกผู้ใช้เพื่อดู role และ permission summary แบบละเอียด</p>
								</div>
								<UBadge color="gray" variant="soft" :label="`${members.length} รายการ`" />
							</div>

							<div v-if="membersError" class="mt-4 rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ membersError }}
							</div>

							<div v-else-if="membersPending" class="mt-4 grid gap-3">
								<div v-for="index in 5" :key="index" class="h-24 animate-pulse rounded-2xl bg-[#f5f5f4]" />
							</div>

							<div v-else-if="!members.length" class="mt-4 rounded-2xl border border-dashed border-[#e7e4dd] bg-[#faf8f4] px-5 py-10 text-center">
								<UIcon name="i-heroicons-users" class="mx-auto h-8 w-8 text-stone-300" />
								<p class="mt-3 text-sm font-medium text-stone-700">ยังไม่มีสมาชิกในร้านนี้</p>
								<p class="mt-1 text-sm text-stone-500">เพิ่มผู้ใช้ใหม่หรือเชิญผู้ใช้เดิมเข้ามาในร้านก่อน</p>
							</div>

							<div v-else class="mt-4 grid gap-3">
								<button
									v-for="member in members"
									:key="`${member.store_id}:${member.user_id}`"
									type="button"
									class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4 text-left transition hover:border-[#d9d5cd] hover:shadow-sm"
									@click="openMemberDetail(member.user_id)"
								>
									<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2">
												<p class="text-base font-semibold text-stone-950">{{ member.name }}</p>
												<UBadge :color="statusTone(member.status)" variant="soft" :label="member.status === 'active' ? 'ใช้งาน' : 'ปิดใช้งาน'" />
												<UBadge color="gray" variant="soft" :label="member.role_name" />
											</div>
											<p class="mt-1 text-sm text-stone-500">{{ member.email }}</p>
											<div class="mt-3 flex flex-wrap gap-2 text-xs text-stone-500">
												<span class="rounded-full bg-[#f5f5f4] px-2.5 py-1">System role: {{ member.system_role }}</span>
												<span class="rounded-full bg-[#f5f5f4] px-2.5 py-1">{{ member.permissions_count }} permissions</span>
												<span class="rounded-full bg-[#f5f5f4] px-2.5 py-1">เพิ่มเมื่อ {{ formatDate(member.created_at) }}</span>
											</div>
										</div>
										<UIcon name="i-heroicons-chevron-right-20-solid" class="hidden h-5 w-5 text-stone-300 lg:block" />
									</div>
								</button>
							</div>
						</UCard>
					</div>

				</div>
			</div>

			<AppResponsivePanel v-model="detailOpen" desktop-width="420px">
				<template v-if="selectedMember" #default="{ close }">
					<div class="space-y-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Member detail</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">{{ selectedMember.name }}</h2>
								<p class="mt-1 text-sm text-stone-500">{{ selectedMember.email }}</p>
							</div>
							<div class="flex items-center gap-2">
								<UButton
									color="gray"
									variant="soft"
									size="sm"
									class="justify-center rounded-xl"
									icon="i-heroicons-key-20-solid"
									label="รีเซ็ตรหัสผ่าน"
									:disabled="!canManageUsers"
									@click="resetPasswordOpen = true"
								/>
								<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="close" />
							</div>
						</div>

						<div class="rounded-2xl border border-[#ece8df] bg-[#faf8f4] p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">บทบาท</p>
							<select
								:value="selectedMember.role_id"
								class="mt-3 w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5]"
								:disabled="!canManageRoles"
								@change="saveMemberRole(selectedMember, ($event.target as HTMLSelectElement).value)"
							>
								<option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
							</select>
						</div>

						<div class="rounded-2xl border border-[#ece8df] bg-[#faf8f4] p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">สถานะสมาชิก</p>
							<select
								:value="selectedMember.status"
								class="mt-3 w-full rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5]"
								:disabled="!canManageUsers"
								@change="saveMemberStatus(selectedMember, ($event.target as HTMLSelectElement).value)"
							>
								<option v-for="status in memberStatusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
							</select>
						</div>

						<div class="rounded-2xl border border-[#ece8df] bg-[#faf8f4] p-4">
							<p class="text-xs font-semibold uppercase tracking-[0.18em] text-stone-400">Permission summary</p>
							<div class="mt-3 flex flex-wrap gap-2">
								<span
									v-for="permission in selectedMember.permissions"
									:key="permission.id"
									class="rounded-full bg-white px-3 py-1.5 text-xs font-medium text-stone-600 ring-1 ring-[#e7e4dd]"
								>
									{{ permission.key }}
								</span>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel v-model="createOpen" desktop-width="440px">
				<template #default="{ close }">
					<div class="space-y-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Create member</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">เพิ่มสมาชิกในร้าน</h2>
								<p class="mt-1 text-sm text-stone-500">สร้างผู้ใช้ใหม่หรือผูกผู้ใช้เดิมเข้ากับร้านพร้อมบทบาทเริ่มต้น</p>
							</div>
							<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="close" />
						</div>

						<div class="space-y-4">
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">ชื่อผู้ใช้</label>
								<UInput v-model="createForm.name" size="lg" color="gray" class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3" />
							</div>
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">อีเมล</label>
								<UInput v-model="createForm.email" type="email" size="lg" color="gray" class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3" />
							</div>
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">รหัสผ่านเริ่มต้น</label>
								<UInput v-model="createForm.password" size="lg" color="gray" class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3" />
							</div>
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">บทบาท</label>
								<select v-model="createForm.role_id" class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5] focus:bg-white">
									<option v-for="role in roles" :key="role.id" :value="role.id">{{ role.name }}</option>
								</select>
							</div>
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">สถานะ</label>
								<select v-model="createForm.status" class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 outline-none transition focus:border-[#d4b8a5] focus:bg-white">
									<option v-for="status in memberStatusOptions" :key="status.id" :value="status.id">{{ status.label }}</option>
								</select>
							</div>
						</div>

						<div class="flex gap-3 pt-2">
							<UButton color="gray" variant="soft" size="lg" block class="justify-center rounded-2xl" label="ยกเลิก" @click="close" />
							<UButton color="orange" size="lg" block class="justify-center rounded-2xl" label="บันทึกผู้ใช้" :loading="saving" :disabled="saving || !canManageUsers" @click="createMember" />
						</div>
					</div>
				</template>
			</AppResponsivePanel>

			<AppResponsivePanel v-model="resetPasswordOpen" desktop-width="420px" mobile-max-height="72vh">
				<template v-if="selectedMember" #default="{ close }">
					<div class="space-y-4">
						<div class="flex items-start justify-between gap-3">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Reset password</p>
								<h2 class="mt-2 text-xl font-semibold text-stone-950">รีเซ็ตรหัสผ่าน</h2>
								<p class="mt-1 text-sm text-stone-500">ตั้งรหัสผ่านใหม่ให้ {{ selectedMember.name }} และบังคับเปลี่ยนรหัสผ่านเมื่อเข้าใช้งานครั้งถัดไปได้</p>
							</div>
							<UButton color="gray" variant="ghost" icon="i-heroicons-x-mark-20-solid" @click="close" />
						</div>

						<div class="space-y-4">
							<div class="space-y-2">
								<label class="text-sm font-medium text-stone-700">รหัสผ่านใหม่</label>
								<UInput
									v-model="resetPasswordForm.password"
									size="lg"
									color="gray"
									class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3"
								/>
							</div>

							<label class="flex items-center gap-3 rounded-2xl border border-[#ece8df] bg-[#faf8f4] px-4 py-3 text-sm text-stone-700">
								<input
									v-model="resetPasswordForm.must_change_password"
									type="checkbox"
									class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
								/>
								<span>บังคับให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบครั้งถัดไป</span>
							</label>
						</div>

						<div class="flex gap-3 pt-2">
							<UButton color="gray" variant="soft" size="lg" block class="justify-center rounded-2xl" label="ยกเลิก" @click="close" />
							<UButton color="orange" size="lg" block class="justify-center rounded-2xl" label="บันทึกรหัสผ่านใหม่" :disabled="!canManageUsers || saving" :loading="saving" @click="resetMemberPassword" />
						</div>
					</div>
				</template>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>
