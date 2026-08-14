<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type DashboardSnapshot = {
	checked_at: string;
	client_summary: {
		total: number;
		active: number;
		suspended: number;
	};
	monitoring: {
		checked_at: string;
		services: {
			api: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
			db: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
			redis: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
		};
		summary: {
			users_total: number;
			users_active: number;
			users_suspended: number;
			stores_total: number;
			products_total: number;
			inventory_balances_total: number;
			purchase_orders_total: number;
			fb_connections_total: number;
			fb_connections_online: number;
			wa_connections_total: number;
			wa_connections_online: number;
			integrations_total: number;
		};
		warnings: string[];
	};
	security: {
		checked_at: string;
		services: {
			api: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
			db: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
			redis: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string };
		};
		auth_policy: {
			access_token_ttl_minutes: number;
			refresh_token_ttl_days: number;
			remember_me_refresh_ttl_days: number;
			max_failed_attempts: number;
			lockout_minutes: number;
			allow_multi_session: boolean;
			default_session_limit: number;
		};
		security: {
			jwt_secret_is_default: boolean;
			jwt_secret_length: number;
			node_env: string;
			redis_driver: string;
		};
		summary: {
			users_total: number;
			users_system_admin: number;
			users_superadmin: number;
			users_suspended: number;
			users_must_change_password: number;
			users_without_password_hash: number;
			stores_total: number;
			store_members_total: number;
		};
		warnings: string[];
	};
	system: {
		default_session_limit: number;
		app_latest_build: number;
		app_min_required_build: number;
		app_update_message: string | null;
		auth_access_token_ttl_minutes: number;
		auth_refresh_token_ttl_days: number;
		auth_remember_me_refresh_ttl_days: number;
		auth_max_failed_attempts: number;
		auth_lockout_minutes: number;
		auth_allow_multi_session: number;
	};
};

type SnapshotCard = {
	id: string;
	label: string;
	value: string;
	tone: "primary" | "success" | "warning" | "error";
	note: string;
	icon: string;
};

type WatchItem = {
	id: string;
	title: string;
	description: string;
	tone: "success" | "warning" | "error" | "info";
	icon: string;
};

type Checkpoint = {
	id: string;
	label: string;
	value: string;
	description: string;
};

const { apiFetch } = useApiClient();
const pending = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const snapshot = ref<DashboardSnapshot | null>(null);

const toneClassMap: Record<SnapshotCard["tone"], string> = {
	primary: "bg-primary-50 text-primary-700 ring-primary-200",
	success: "bg-success/10 text-success ring-success/20",
	warning: "bg-warning/10 text-warning ring-warning/20",
	error: "bg-error/10 text-error ring-error/20",
};

const watchToneClassMap: Record<WatchItem["tone"], string> = {
	success: "border-l-success border-y-success/15 border-r-success/15 bg-success/5",
	warning: "border-l-warning border-y-warning/15 border-r-warning/15 bg-warning/5",
	error: "border-l-error border-y-error/15 border-r-error/15 bg-error/5",
	info: "border-l-primary border-y-primary/15 border-r-primary/15 bg-primary-50/70",
};

const watchToneIconClassMap: Record<WatchItem["tone"], string> = {
	success: "bg-success/10 text-success ring-success/15",
	warning: "bg-warning/10 text-warning ring-warning/15",
	error: "bg-error/10 text-error ring-error/15",
	info: "bg-primary-50 text-primary-700 ring-primary-200",
};

const watchToneBadgeColorMap: Record<WatchItem["tone"], "success" | "warning" | "error" | "info"> = {
	success: "success",
	warning: "warning",
	error: "error",
	info: "info",
};

const watchToneLabelMap: Record<WatchItem["tone"], string> = {
	success: "ປົກກະຕິ", warning: "ຄວນກວດ", error: "ແຈ້ງເຕືອນ", info: "ຂໍ້ມູນ",
};

function serviceStatusLabel(status: ServiceHealthStatus) {
	if (status === "healthy") return "ປົກກະຕິ";
	if (status === "degraded") return "ຊ້າກວ່າປົກກະຕິ";
	return "ບໍ່ພ້ອມໃຊ້";
}

const combinedWarnings = computed(() => {
	const values = new Set<string>();
	for (const warning of snapshot.value?.monitoring.warnings || []) values.add(warning);
	for (const warning of snapshot.value?.security.warnings || []) values.add(warning);
	return Array.from(values);
});

const unhealthyServiceCount = computed(() => {
	const services = snapshot.value?.monitoring.services;
	if (!services) return 0;

	return [ services.api, services.db, services.redis ]
		.filter((service) => service.status !== "healthy")
		.length;
});

const lastRefreshedLabel = computed(() => {
	if (!snapshot.value?.checked_at) return "ຍັງບໍ່ໄດ້ໂຫຼດ";
	return formatDateTime(snapshot.value.checked_at);
});

const snapshotCards = computed<SnapshotCard[]>(() => {
	const data = snapshot.value;
	if (!data) return [];

	const openAlerts = combinedWarnings.value.length + unhealthyServiceCount.value;

	return [
		{
			id: "clients",
			label: "ລູກຄ້າທີ່ໃຊ້ງານ",
			value: String(data.client_summary.active),
			tone: "success",
			note: `ຈາກທັງໝົດ ${data.client_summary.total} ບັນຊີໃນລະບົບກາງ`,
			icon: "i-heroicons-user-group",
		},
		{
			id: "suspended",
			label: "ບັນຊີຖືກລະງັບ",
			value: String(data.client_summary.suspended),
			tone: data.client_summary.suspended > 0 ? "warning" : "success",
			note: data.client_summary.suspended > 0 ? "ມີບັນຊີຖືກລະງັບ ແລະ ຄວນເປີດເບິ່ງຕໍ່" : "ຍັງບໍ່ພົບບັນຊີທີ່ຖືກລະງັບ",
			icon: "i-heroicons-no-symbol",
		},
		{
			id: "sessions",
			label: "ນະໂຍບາຍ Session",
			value: String(data.system.default_session_limit),
			tone: "primary",
			note: `Access token ${data.system.auth_access_token_ttl_minutes} ນາທີ`,
			icon: "i-heroicons-device-phone-mobile",
		},
		{
			id: "alerts",
			label: "ການແຈ້ງເຕືອນ",
			value: String(openAlerts),
			tone: openAlerts > 0 ? "error" : "success",
			note: openAlerts > 0 ? "ມີຄຳເຕືອນ ຫຼື ບັນຫາບໍລິການທີ່ຄວນເບິ່ງຕໍ່" : "ຍັງບໍ່ພົບຄຳເຕືອນສຳຄັນ",
			icon: "i-heroicons-exclamation-triangle",
		},
	];
});

const watchItems = computed<WatchItem[]>(() => {
	const data = snapshot.value;
	if (!data) return [];

	const jwtRisk = data.security.security.jwt_secret_is_default || data.security.security.jwt_secret_length < 24;
	const authTone: WatchItem["tone"] = jwtRisk ? "error" : (data.security.warnings.length > 0 ? "warning" : "success");
	const serviceHealthTone: WatchItem["tone"] = unhealthyServiceCount.value > 0
		? "error"
		: (combinedWarnings.value.length > 0 ? "warning" : "success");
	const clientTone: WatchItem["tone"] = data.client_summary.suspended > 0 ? "warning" : "success";
	const policyTone: WatchItem["tone"] = data.system.app_min_required_build > data.system.app_latest_build ? "error" : "info";

	return [
		{
			id: "service-health",
			title: unhealthyServiceCount.value > 0 ? "ສຸຂະພາບບໍລິການຄວນກວດຕໍ່" : "ສຸຂະພາບບໍລິການປົກກະຕິ",
			description: `API ${serviceStatusLabel(data.monitoring.services.api.status)}, ຖານຂໍ້ມູນ ${serviceStatusLabel(data.monitoring.services.db.status)}, Redis ${serviceStatusLabel(data.monitoring.services.redis.status)}`,
			tone: serviceHealthTone,
			icon: "i-heroicons-signal",
		},
		{
			id: "auth-posture",
			title: jwtRisk ? "JWT / auth ມີຄວາມສ່ຽງ" : "ສະຖານະ auth ຢູ່ໃນເກນໃຊ້ງານ",
			description: jwtRisk
				? `ຄວາມຍາວ JWT secret ${data.security.security.jwt_secret_length} ແລະ ຄວນກວດ config ເພີ່ມ`
				: `ລະງັບບັນຊີ ${data.security.auth_policy.lockout_minutes} ນາທີ, ຜິດພາດໄດ້ ${data.security.auth_policy.max_failed_attempts} ຄັ້ງ`,
			tone: authTone,
			icon: "i-heroicons-shield-check",
		},
		{
			id: "client-state",
			title: data.client_summary.suspended > 0 ? "ມີບັນຊີລູກຄ້າຖືກລະງັບ" : "ສະຖານະລູກຄ້າປົກກະຕິ",
			description: `ໃຊ້ງານ ${data.client_summary.active} / ຖືກລະງັບ ${data.client_summary.suspended} ຈາກທັງໝົດ ${data.client_summary.total}`,
			tone: clientTone,
			icon: "i-heroicons-user-group",
		},
		{
			id: "policy-state",
			title: policyTone === "error" ? "ນະໂຍບາຍ build ຄວນກວດ" : "ນະໂຍບາຍລະບົບພ້ອມໃຊ້",
			description: `build ຫຼ້າສຸດ ${data.system.app_latest_build} / build ຂັ້ນຕ່ຳ ${data.system.app_min_required_build}`,
			tone: policyTone,
			icon: "i-heroicons-cog-8-tooth",
		},
	];
});

const checkpoints = computed<Checkpoint[]>(() => {
	const data = snapshot.value;
	if (!data) return [];

	return [
		{
			id: "refresh",
			label: "ອັບເດດຫຼ້າສຸດ",
			value: lastRefreshedLabel.value,
			description: "snapshot ຂອງແດຊບອດຮອບຫຼ້າສຸດ",
		},
		{
			id: "policy",
			label: "ສະຖານະ build",
			value: `${data.system.app_latest_build} / ${data.system.app_min_required_build}`,
			description: "build ຫຼ້າສຸດ ທຽບກັບ build ຂັ້ນຕ່ຳທີ່ບັງຄັບ",
		},
		{
			id: "redis-driver",
			label: "ໄດຣເວີ Redis",
			value: data.security.security.redis_driver,
			description: "ໄດຣເວີທີ່ auth/session ໃຊ້ງານຢູ່",
		},
		{
			id: "stores",
			label: "ຮ້ານທັງໝົດ",
			value: String(data.monitoring.summary.stores_total),
			description: "ຈຳນວນຮ້ານຈາກ monitoring summary",
		},
	];
});

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("lo-LA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

async function loadDashboard(options?: { refresh?: boolean }) {
	if (options?.refresh) {
		refreshing.value = true;
	} else {
		pending.value = true;
	}

	error.value = null;
	try {
		// Dashboard does a one-shot fetch on page mount and on explicit manual refresh only.
		const response = await apiFetch<ApiEnvelope<DashboardSnapshot>>("/system-admin/dashboard");
		snapshot.value = response.data;
	} catch (err) {
		error.value = resolveApiErrorMessage(err, "ໂຫຼດແດຊບອດບໍ່ສຳເລັດ", {
			forbiddenMessage: "ບັນຊີນີ້ບໍ່ມີສິດເບິ່ງແດຊບອດຜູ້ດູແລລະບົບ",
		});
	} finally {
		pending.value = false;
		refreshing.value = false;
	}
}

async function refreshDashboard() {
	await loadDashboard({ refresh: true });
}

onMounted(async () => {
	// No polling loop here. If auto-refresh is needed later, add it intentionally.
	await loadDashboard();
});
</script>

<template>
		<AppSidebarShell
			:nav-items="appNavItems"
			:active-ids="['system-dashboard']"
			sidebar-eyebrow="ລະບົບ"
			sidebar-title="ຜູ້ດູແລລະບົບ"
		sidebar-compact-title="SYS"
		sidebar-description="ພາບລວມລະບົບກາງ, ລູກຄ້າ, ນະໂຍບາຍ, ການຕິດຕາມ ແລະ ຄວາມປອດໄພ"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
					<AppPageHeader
						title="ແດຊບອດ"
						description="ພາບລວມສຳລັບຜູ້ດູແລລະບົບ ເບິ່ງສະຖານະສຳຄັນ ແລະ ທາງລັດໄປຈັດການຕໍ່"
						:title-badge="false"
						compact
						body-class="px-3 py-2.5 sm:px-4 sm:py-3"
						:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="refreshing" :spin-icon-on-loading="true" @click="refreshDashboard">
								ໂຫຼດໃໝ່
							</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-user-group-20-solid" @click="navigateTo('/system-admin/clients')">
								ຈັດການລູກຄ້າ
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">ແດຊບອດລະບົບ</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ພາບລວມເພື່ອເລືອກໄປຈັດການລູກຄ້າ, ຄວາມປອດໄພ, ການຕິດຕາມ ຫຼື ນະໂຍບາຍລະບົບ</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									4 ສ່ວນສະຫຼຸບ
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto">
								<div v-if="pending" class="min-h-[320px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="dashboard-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>

								<div v-else-if="error" class="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-stone-500">
									{{ error }}
								</div>

								<div v-else-if="snapshot" class="space-y-4 p-4">
									<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
										<UCard
											v-for="card in snapshotCards"
											:key="card.id"
											class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200"
										>
											<div class="space-y-3">
												<div class="flex items-start justify-between gap-3">
													<div>
														<p class="text-xs font-medium uppercase tracking-[0.16em] text-stone-400">{{ card.label }}</p>
														<p class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{{ card.value }}</p>
													</div>
													<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1" :class="toneClassMap[card.tone]">
														<UIcon :name="card.icon" class="h-5 w-5" />
													</div>
												</div>
												<p class="text-sm leading-6 text-stone-500">{{ card.note }}</p>
											</div>
										</UCard>
									</div>

									<div class="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.9fr)]">
										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
											<div class="space-y-4">
												<div class="flex flex-wrap items-start justify-between gap-3">
													<div>
														<h2 class="text-lg font-semibold text-stone-950">ລາຍການທີ່ຄວນຕິດຕາມ</h2>
														<p class="mt-1 text-xs leading-5 text-stone-500">ສະຫຼຸບຈຸດທີ່ຄວນກວດຕໍ່ໂດຍບໍ່ຕ້ອງສະຫຼັບຫຼາຍໜ້າ</p>
													</div>
													<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
														{{ watchItems.length }} ລາຍການ
													</div>
												</div>

												<div class="space-y-3">
													<div
														v-for="item in watchItems"
														:key="item.id"
														class="rounded-md border-l-[3px] px-4 py-3"
														:class="watchToneClassMap[item.tone]"
													>
														<div class="flex items-start justify-between gap-3">
															<div class="flex min-w-0 items-start gap-3">
																<div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md ring-1" :class="watchToneIconClassMap[item.tone]">
																<UIcon :name="item.icon" class="h-4.5 w-4.5" />
															</div>
															<div class="min-w-0">
																<p class="text-sm font-semibold text-stone-950">{{ item.title }}</p>
																<p class="mt-1 text-sm leading-6 text-stone-600">{{ item.description }}</p>
															</div>
														</div>
															<UBadge
																:color="watchToneBadgeColorMap[item.tone]"
																variant="soft"
																:label="watchToneLabelMap[item.tone]"
																class="shrink-0"
															/>
														</div>
													</div>
												</div>
											</div>
										</UCard>

										<div>
											<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
												<div class="space-y-4">
													<div>
														<h2 class="text-lg font-semibold text-stone-950">ຈຸດກວດສອບຫຼ້າສຸດ</h2>
														<p class="mt-1 text-xs leading-5 text-stone-500">ຂໍ້ມູນອ້າງອີງແບບຫຍໍ້ກ່ອນເຂົ້າເບິ່ງລາຍລະອຽດ</p>
													</div>

													<div class="space-y-3">
														<div
															v-for="checkpoint in checkpoints"
															:key="checkpoint.id"
															class="rounded-md bg-neutral-50 px-4 py-3"
														>
															<div class="flex items-center justify-between gap-3">
																<p class="text-sm font-semibold text-stone-900">{{ checkpoint.label }}</p>
																<p class="text-sm font-medium text-stone-500">{{ checkpoint.value }}</p>
															</div>
															<p class="mt-1 text-sm leading-6 text-stone-500">{{ checkpoint.description }}</p>
														</div>
													</div>
												</div>
											</UCard>
										</div>
									</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
@keyframes dashboard-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.dashboard-loading-line {
	animation: dashboard-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
