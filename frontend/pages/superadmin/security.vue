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

const pending = ref(true);
const error = ref<string | null>(null);
const snapshot = ref<SuperadminSecuritySnapshot | null>(null);

const overviewStats = computed(() => {
	const data = snapshot.value?.summary;
	if (!data) return [];

	return [
		{
			label: "ผู้ใช้ทั้งหมด",
			value: data.users_total,
			note: "บัญชีใน scope ของ superadmin นี้",
		},
		{
			label: "กำลังใช้งาน",
			value: data.users_active,
			note: "บัญชีที่ยังไม่ถูกระงับ",
		},
		{
			label: "ร้านทั้งหมด",
			value: data.stores_total,
			note: "ร้านที่อยู่ใต้เจ้าของกลุ่มนี้",
		},
		{
			label: "ร้านที่ยังไม่มีทีม",
			value: data.stores_without_members,
			note: "ควรตรวจสอบก่อนเปิดใช้งานจริง",
		},
	];
});

const roleBreakdownRows = computed(() => {
	const breakdown = snapshot.value?.role_breakdown;
	if (!breakdown) return [];

	return [
		{ key: "superadmin", label: "Superadmin", value: breakdown.superadmin, tone: "primary" as const },
		{ key: "owner", label: "Owner", value: breakdown.owner, tone: "success" as const },
		{ key: "manager", label: "Manager", value: breakdown.manager, tone: "warning" as const },
		{ key: "cashier", label: "Cashier", value: breakdown.cashier, tone: "neutral" as const },
		{ key: "other", label: "Other", value: breakdown.other, tone: "info" as const },
	];
});

const maxRoleCount = computed(() => {
	const counts = roleBreakdownRows.value.map((row) => row.value);
	return counts.length ? Math.max(...counts, 1) : 1;
});

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function resolveApiErrorMessage(errorValue: unknown, fallback = "โหลด security snapshot ไม่สำเร็จ") {
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
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="snapshot ความพร้อมของผู้ใช้ ร้าน และทีม ภายใต้ superadmin นี้เท่านั้น"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Security"
					description="ดูความพร้อมของบัญชี ร้าน และทีมในขอบเขต superadmin นี้ โดยไม่รวม security กลางของแพลตฟอร์ม"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton
								color="neutral"
								variant="soft"
								size="md"
								icon="i-heroicons-arrow-path-20-solid"
								:loading="pending"
								:disabled="pending"
								:spin-icon-on-loading="true"
								@click="loadSecurity"
							>
								รีโหลด
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Security snapshot</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">manual snapshot สำหรับ owner scope นี้เท่านั้น เพื่อคุม query ให้เบาและอ่านเร็ว</p>
								</div>
								<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}
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
									<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
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
													<h2 class="text-lg font-semibold text-stone-950">Account posture</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">สรุปสถานะบัญชีและการครอบคลุมของทีมในร้านภายใต้ superadmin นี้</p>
												</div>

												<div class="grid gap-3 sm:grid-cols-2">
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">บัญชีที่ยังใช้งาน</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_active }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">บัญชีที่ถูกระงับ</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_suspended }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">ยังต้องเปลี่ยนรหัสผ่าน</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.users_must_change_password }}</p>
													</div>
													<div class="rounded-md bg-neutral-50 px-3 py-3.5">
														<p class="text-xs text-stone-500">สมาชิกในร้านทั้งหมด</p>
														<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.store_members_total }}</p>
													</div>
												</div>

												<div class="rounded-md border border-neutral-200 bg-white px-3 py-3.5">
													<div class="flex items-center justify-between gap-3">
														<div>
															<p class="text-sm font-semibold text-stone-900">Store coverage</p>
															<p class="mt-1 text-xs leading-5 text-stone-500">ตรวจว่าร้านทุกแห่งมีทีมรองรับก่อน onboarding หรือเปิดใช้งานจริง</p>
														</div>
														<UBadge
															:color="snapshot.summary.stores_without_members > 0 ? 'warning' : 'success'"
															variant="soft"
															:label="snapshot.summary.stores_without_members > 0 ? 'ต้องตรวจสอบ' : 'พร้อมใช้งาน'"
														/>
													</div>

													<div class="mt-3 grid gap-3 sm:grid-cols-2">
														<div class="rounded-md bg-neutral-50 px-3 py-3">
															<p class="text-xs text-stone-500">ร้านทั้งหมด</p>
															<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.stores_total }}</p>
														</div>
														<div class="rounded-md bg-neutral-50 px-3 py-3">
															<p class="text-xs text-stone-500">ร้านที่ยังไม่มีสมาชิก</p>
															<p class="mt-1 text-base font-semibold text-stone-950">{{ snapshot.summary.stores_without_members }}</p>
														</div>
													</div>
												</div>
											</div>
										</UCard>

										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
											<div class="space-y-4">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Role breakdown</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">กระจายบทบาทของผู้ใช้ที่อยู่ในขอบเขตของ superadmin นี้</p>
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
													<h2 class="text-lg font-semibold text-stone-950">Warnings</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">สัญญาณที่ควรตามต่อในฝั่งธุรกิจของ owner scope นี้</p>
												</div>
												<UBadge
													:color="snapshot.warnings.length > 0 ? 'warning' : 'success'"
													variant="soft"
													:label="snapshot.warnings.length > 0 ? `${snapshot.warnings.length} รายการ` : 'ไม่มีรายการต้องตามต่อ'"
												/>
											</div>

											<div v-if="snapshot.warnings.length" class="grid gap-3">
												<div
													v-for="warning in snapshot.warnings"
													:key="warning"
													class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900"
												>
													{{ warning }}
												</div>
											</div>
											<div v-else class="rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-800">
												ไม่พบสัญญาณความเสี่ยงหลักใน scope ของ superadmin นี้ตอน snapshot ล่าสุด
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
