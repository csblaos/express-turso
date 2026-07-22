<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type SuperadminSecuritySnapshot = {
	checked_at: string;
	summary: {
		stores_total: number;
		stores_without_members: number;
		store_members_total: number;
		users_total: number;
		users_active: number;
		users_suspended: number;
		users_must_change_password: number;
	};
	role_breakdown: {
		superadmin: number;
		owner: number;
		manager: number;
		cashier: number;
		other: number;
	};
	warnings: string[];
};

const { apiFetch } = useApiClient();
const { locale } = useI18n();

const copy = computed(() => locale.value === "lo" ? {
	description: "ພາບລວມຄວາມພ້ອມຂອງຜູ້ໃຊ້ ຮ້ານ ແລະ ທີມງານພາຍໃຕ້ Super Admin ນີ້", reload: "ໂຫຼດໃໝ່", title: "ພາບລວມຄວາມປອດໄພ", subtitle: "ພາບລວມສຳລັບຂອບເຂດ Owner ເພື່ອໃຫ້ໂຫຼດໄວ", updated: "ອັບເດດລ່າສຸດ", users: "ຜູ້ໃຊ້ທັງໝົດ", usersNote: "ບັນຊີໃນຂອບເຂດ Super Admin ນີ້", active: "ໃຊ້ງານ", activeNote: "ບັນຊີທີ່ຍັງບໍ່ຖືກລະງັບ", stores: "ຮ້ານທັງໝົດ", storesNote: "ຮ້ານພາຍໃຕ້ກຸ່ມເຈົ້າຂອງນີ້", noTeam: "ຮ້ານທີ່ຍັງບໍ່ມີທີມ", noTeamNote: "ຄວນກວດສອບກ່ອນເປີດໃຊ້ງານ", posture: "ສະຖານະບັນຊີ", postureHint: "ສະຫຼຸບສະຖານະບັນຊີ ແລະ ຄວາມຄອບຄຸມຂອງທີມ", suspended: "ຖືກລະງັບ", passwordChange: "ຕ້ອງປ່ຽນລະຫັດຜ່ານ", members: "ສະມາຊິກຮ້ານທັງໝົດ", coverage: "ຄວາມຄອບຄຸມຂອງຮ້ານ", coverageHint: "ກວດວ່າທຸກຮ້ານມີທີມກ່ອນເລີ່ມໃຊ້ງານ", attention: "ຕ້ອງກວດເບິ່ງ", ready: "ພ້ອມໃຊ້ງານ", noMembers: "ຮ້ານທີ່ບໍ່ມີສະມາຊິກ", roles: "ການແຈກບົດບາດ", rolesHint: "ການແຈກບົດບາດຜູ້ໃຊ້ໃນຂອບເຂດນີ້", warnings: "ຄຳເຕືອນ", warningsHint: "ສັນຍານທີ່ຄວນຕິດຕາມ", items: "ລາຍການ", none: "ບໍ່ມີລາຍການທີ່ຕ້ອງຕິດຕາມ", noRisk: "ບໍ່ພົບສັນຍານຄວາມສ່ຽງຫຼັກໃນຂໍ້ມູນລ່າສຸດ", superAdmin: "ຜູ້ດູແລລະບົບສູງສຸດ", owner: "ເຈົ້າຂອງ", manager: "ຜູ້ຈັດການ", cashier: "ພະນັກງານຂາຍ", other: "ອື່ນໆ",
} : locale.value === "en" ? {
	description: "A readiness snapshot for users, stores, and teams within this Super Admin scope.", reload: "Reload", title: "Security snapshot", subtitle: "A lightweight Owner-scope snapshot for fast reading.", updated: "Last updated", users: "Total users", usersNote: "Accounts in this Super Admin scope", active: "Active", activeNote: "Accounts that are not suspended", stores: "Total stores", storesNote: "Stores under this owner group", noTeam: "Stores without a team", noTeamNote: "Review before going live", posture: "Account posture", postureHint: "Summary of account status and team coverage.", suspended: "Suspended", passwordChange: "Must change password", members: "Total store members", coverage: "Store coverage", coverageHint: "Check every store has a team before onboarding or launch.", attention: "Needs attention", ready: "Ready", noMembers: "Stores without members", roles: "Role breakdown", rolesHint: "Distribution of user roles in this scope.", warnings: "Warnings", warningsHint: "Signals to follow up in this Owner scope.", items: "items", none: "No follow-up items", noRisk: "No key risk signals in the latest snapshot.", superAdmin: "Super Admin", owner: "Owner", manager: "Manager", cashier: "Cashier", other: "Other",
} : {
	description: "ภาพรวมความพร้อมของผู้ใช้ ร้าน และทีม ภายใต้ Super Admin นี้", reload: "รีโหลด", title: "ภาพรวมความปลอดภัย", subtitle: "ภาพรวมขอบเขต Owner แบบกระชับ เพื่อให้อ่านเร็ว", updated: "อัปเดตล่าสุด", users: "ผู้ใช้ทั้งหมด", usersNote: "บัญชีในขอบเขต Super Admin นี้", active: "กำลังใช้งาน", activeNote: "บัญชีที่ยังไม่ถูกระงับ", stores: "ร้านทั้งหมด", storesNote: "ร้านที่อยู่ใต้กลุ่มเจ้าของนี้", noTeam: "ร้านที่ยังไม่มีทีม", noTeamNote: "ควรตรวจสอบก่อนเปิดใช้งานจริง", posture: "สถานะบัญชี", postureHint: "สรุปสถานะบัญชีและการครอบคลุมของทีม", suspended: "บัญชีที่ถูกระงับ", passwordChange: "ยังต้องเปลี่ยนรหัสผ่าน", members: "สมาชิกในร้านทั้งหมด", coverage: "ความครอบคลุมของร้าน", coverageHint: "ตรวจว่าร้านทุกแห่งมีทีมรองรับก่อนเริ่มใช้งาน", attention: "ต้องตรวจสอบ", ready: "พร้อมใช้งาน", noMembers: "ร้านที่ยังไม่มีสมาชิก", roles: "การกระจายบทบาท", rolesHint: "การกระจายบทบาทของผู้ใช้ในขอบเขตนี้", warnings: "คำเตือน", warningsHint: "สัญญาณที่ควรติดตามในขอบเขต Owner นี้", items: "รายการ", none: "ไม่มีรายการต้องติดตาม", noRisk: "ไม่พบสัญญาณความเสี่ยงสำคัญในข้อมูลล่าสุด", superAdmin: "ผู้ดูแลระบบสูงสุด", owner: "เจ้าของ", manager: "ผู้จัดการ", cashier: "แคชเชียร์", other: "อื่น ๆ",
});

const pending = ref(true);
const error = ref<string | null>(null);
const snapshot = ref<SuperadminSecuritySnapshot | null>(null);

const overviewStats = computed(() => {
	const data = snapshot.value?.summary;
	if (!data) return [];

	return [
		{
			label: copy.value.users,
			value: data.users_total,
			note: copy.value.usersNote,
		},
		{
			label: copy.value.active,
			value: data.users_active,
			note: copy.value.activeNote,
		},
		{
			label: copy.value.stores,
			value: data.stores_total,
			note: copy.value.storesNote,
		},
		{
			label: copy.value.noTeam,
			value: data.stores_without_members,
			note: copy.value.noTeamNote,
		},
	];
});

const roleBreakdownRows = computed(() => {
	const breakdown = snapshot.value?.role_breakdown;
	if (!breakdown) return [];

	return [
		{ key: "superadmin", label: copy.value.superAdmin, value: breakdown.superadmin, tone: "primary" as const },
		{ key: "owner", label: copy.value.owner, value: breakdown.owner, tone: "success" as const },
		{ key: "manager", label: copy.value.manager, value: breakdown.manager, tone: "warning" as const },
		{ key: "cashier", label: copy.value.cashier, value: breakdown.cashier, tone: "neutral" as const },
		{ key: "other", label: copy.value.other, value: breakdown.other, tone: "info" as const },
	];
});

const maxRoleCount = computed(() => {
	const counts = roleBreakdownRows.value.map((row) => row.value);
	return counts.length ? Math.max(...counts, 1) : 1;
});

const localizedWarnings = computed(() => {
	const summary = snapshot.value?.summary;
	if (!summary) return [];

	if (locale.value === "lo") {
		return [
			summary.users_must_change_password > 0 ? `ຍັງມີ ${summary.users_must_change_password} ບັນຊີທີ່ຄວນປ່ຽນລະຫັດຜ່ານກ່ອນໃຊ້ງານຕໍ່` : null,
			summary.users_suspended > 0 ? `ມີ ${summary.users_suspended} ບັນຊີທີ່ຖືກລະງັບໃນຂອບເຂດ Super Admin ນີ້` : null,
			summary.stores_without_members > 0 ? `ຍັງມີ ${summary.stores_without_members} ຮ້ານທີ່ບໍ່ມີສະມາຊິກໃນທີມ` : null,
		].filter((warning): warning is string => Boolean(warning));
	}

	if (locale.value === "en") {
		return [
			summary.users_must_change_password > 0 ? `${summary.users_must_change_password} account(s) should change their password before continuing.` : null,
			summary.users_suspended > 0 ? `${summary.users_suspended} suspended account(s) are in this Super Admin scope.` : null,
			summary.stores_without_members > 0 ? `${summary.stores_without_members} store(s) do not yet have team members.` : null,
		].filter((warning): warning is string => Boolean(warning));
	}

	return [
		summary.users_must_change_password > 0 ? `ยังมี ${summary.users_must_change_password} บัญชีที่ควรเปลี่ยนรหัสผ่านก่อนใช้งานต่อ` : null,
		summary.users_suspended > 0 ? `มี ${summary.users_suspended} บัญชีที่ถูกระงับอยู่ในขอบเขต Super Admin นี้` : null,
		summary.stores_without_members > 0 ? `ยังมี ${summary.stores_without_members} ร้านที่ยังไม่มีสมาชิกในทีม` : null,
	].filter((warning): warning is string => Boolean(warning));
});

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat(locale.value === "lo" ? "lo-LA" : locale.value === "en" ? "en-US" : "th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function resolveApiErrorMessage(errorValue: unknown, fallback = copy.value.title) {
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

function toneClasses(tone: "primary" | "success" | "warning" | "neutral" | "info") {
	if (tone === "primary") {
		return {
			bar: "bg-primary",
			badge: "bg-primary-50 text-primary-700 ring-primary-200",
		};
	}
	if (tone === "success") {
		return {
			bar: "bg-emerald-500",
			badge: "bg-emerald-50 text-emerald-700 ring-emerald-200",
		};
	}
	if (tone === "warning") {
		return {
			bar: "bg-amber-500",
			badge: "bg-amber-50 text-amber-700 ring-amber-200",
		};
	}
	if (tone === "info") {
		return {
			bar: "bg-sky-500",
			badge: "bg-sky-50 text-sky-700 ring-sky-200",
		};
	}

	return {
		bar: "bg-stone-400",
		badge: "bg-neutral-100 text-stone-700 ring-neutral-200",
	};
}

async function loadSecurity() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<SuperadminSecuritySnapshot>>("/superadmin/security");
		snapshot.value = response.data;
	} catch (err) {
		error.value = resolveApiErrorMessage(err);
	} finally {
		pending.value = false;
	}
}

onMounted(async () => {
	await loadSecurity();
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Super Admin"
		sidebar-title="Super Admin"
		sidebar-compact-title="SUP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					class="hidden md:block"
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 pt-0.5 md:flex md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								class="rounded-md"
								:loading="pending"
								:disabled="pending"
								:spin-icon-on-loading="true"
								@click="loadSecurity"
							>
								{{ copy.reload }}
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">{{ copy.title }}</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ copy.subtitle }}</p>
								</div>
								<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ copy.updated }} {{ formatDateTime(snapshot.checked_at) }}
								</div>
							</div>

							<div v-if="pending" class="shrink-0">
								<AppInlineLoadingBar container-class="rounded-none border-x-0 border-t-0 bg-neutral-100" />
							</div>

							<div class="scrollbar-soft min-h-0 flex-1 overflow-y-auto p-4">
								<div v-if="error" class="flex min-h-[320px] items-center justify-center px-4 text-center text-sm text-stone-500">
									{{ error }}
								</div>

								<div v-else-if="!pending && snapshot" class="grid gap-4">
									<div class="grid grid-cols-2 gap-3 md:grid-cols-4">
										<div
											v-for="stat in overviewStats"
											:key="stat.label"
											class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
										>
											<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ stat.label }}</p>
											<p class="mt-2 text-2xl font-semibold text-stone-950">{{ stat.value }}</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">{{ stat.note }}</p>
										</div>
									</div>

									<div class="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
											<div class="space-y-4">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">{{ copy.posture }}</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.postureHint }}</p>
												</div>

												<div class="grid grid-cols-2 gap-3">
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">{{ copy.active }}</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_active }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">{{ copy.suspended }}</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_suspended }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">{{ copy.passwordChange }}</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_must_change_password }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">{{ copy.members }}</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.store_members_total }}</p>
													</div>
												</div>

												<div class="rounded-md border border-neutral-200 bg-white px-3 py-3.5">
													<div class="flex items-center justify-between gap-3">
														<div>
															<p class="text-sm font-semibold text-stone-900">{{ copy.coverage }}</p>
															<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.coverageHint }}</p>
														</div>
														<UBadge
															:color="snapshot.summary.stores_without_members > 0 ? 'warning' : 'success'"
															variant="soft"
															:label="snapshot.summary.stores_without_members > 0 ? copy.attention : copy.ready"
														/>
													</div>

													<div class="mt-3 grid gap-3 sm:grid-cols-2">
														<div class="rounded-md bg-neutral-50 px-3 py-3">
															<p class="text-xs text-stone-500">{{ copy.stores }}</p>
															<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.stores_total }}</p>
														</div>
														<div class="rounded-md bg-neutral-50 px-3 py-3">
															<p class="text-xs text-stone-500">{{ copy.noMembers }}</p>
															<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.stores_without_members }}</p>
														</div>
													</div>
												</div>
											</div>
										</UCard>

										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
											<div class="space-y-4">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">{{ copy.roles }}</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.rolesHint }}</p>
												</div>

												<div class="space-y-3">
													<div
														v-for="row in roleBreakdownRows"
														:key="row.key"
														class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3"
													>
														<div class="flex items-center justify-between gap-3">
															<p class="text-sm font-medium text-stone-900">{{ row.label }}</p>
															<span class="inline-flex items-center rounded-md px-2.5 py-1 text-xs font-semibold ring-1" :class="toneClasses(row.tone).badge">
																{{ row.value }}
															</span>
														</div>
														<div class="mt-3 h-2 overflow-hidden rounded-full bg-neutral-200">
															<div
																class="h-full rounded-full transition-all"
																:class="toneClasses(row.tone).bar"
																:style="{ width: `${Math.max(row.value > 0 ? 12 : 0, (row.value / maxRoleCount) * 100)}%` }"
															/>
														</div>
													</div>
												</div>
											</div>
										</UCard>
									</div>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex flex-wrap items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">{{ copy.warnings }}</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.warningsHint }}</p>
												</div>
												<UBadge
													:color="localizedWarnings.length > 0 ? 'warning' : 'success'"
													variant="soft"
													:label="localizedWarnings.length > 0 ? `${localizedWarnings.length} ${copy.items}` : copy.none"
												/>
											</div>

											<div v-if="localizedWarnings.length" class="grid gap-3">
												<div
													v-for="warning in localizedWarnings"
													:key="warning"
													class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
												>
													{{ warning }}
												</div>
											</div>
											<div v-else class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
												{{ copy.noRisk }}
											</div>
										</div>
									</UCard>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
