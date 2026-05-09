<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

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
	success: "Stable",
	warning: "Check",
	error: "Alert",
	info: "Info",
};

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
	if (!snapshot.value?.checked_at) return "ยังไม่ได้โหลด";
	return formatDateTime(snapshot.value.checked_at);
});

const snapshotCards = computed<SnapshotCard[]>(() => {
	const data = snapshot.value;
	if (!data) return [];

	const openAlerts = combinedWarnings.value.length + unhealthyServiceCount.value;

	return [
		{
			id: "clients",
			label: "Active clients",
			value: String(data.client_summary.active),
			tone: "success",
			note: `จากทั้งหมด ${data.client_summary.total} บัญชีในระบบกลาง`,
			icon: "i-heroicons-user-group",
		},
		{
			id: "suspended",
			label: "Suspended",
			value: String(data.client_summary.suspended),
			tone: data.client_summary.suspended > 0 ? "warning" : "success",
			note: data.client_summary.suspended > 0 ? "มีบัญชีที่ถูกพักการใช้งานและควรเปิดดูต่อ" : "ยังไม่พบบัญชีที่ถูกพักการใช้งาน",
			icon: "i-heroicons-no-symbol",
		},
		{
			id: "sessions",
			label: "Session policy",
			value: String(data.system.default_session_limit),
			tone: "primary",
			note: `Access token ${data.system.auth_access_token_ttl_minutes} นาที`,
			icon: "i-heroicons-device-phone-mobile",
		},
		{
			id: "alerts",
			label: "Open alerts",
			value: String(openAlerts),
			tone: openAlerts > 0 ? "error" : "success",
			note: openAlerts > 0 ? "มี warning หรือ service issue ที่ควรเปิดดูต่อ" : "ยังไม่พบ warning สำคัญในรอบล่าสุด",
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
			title: unhealthyServiceCount.value > 0 ? "Service health ต้องตรวจต่อ" : "Service health ปกติ",
			description: `API ${data.monitoring.services.api.status}, DB ${data.monitoring.services.db.status}, Redis ${data.monitoring.services.redis.status}`,
			tone: serviceHealthTone,
			icon: "i-heroicons-signal",
		},
		{
			id: "auth-posture",
			title: jwtRisk ? "JWT / auth posture มีความเสี่ยง" : "Auth posture อยู่ในเกณฑ์ใช้ได้",
			description: jwtRisk
				? `JWT secret length ${data.security.security.jwt_secret_length} และควรตรวจ config เพิ่ม`
				: `Lockout ${data.security.auth_policy.lockout_minutes} นาที, failed attempts ${data.security.auth_policy.max_failed_attempts}`,
			tone: authTone,
			icon: "i-heroicons-shield-check",
		},
		{
			id: "client-state",
			title: data.client_summary.suspended > 0 ? "มีบัญชี client ถูกพักการใช้งาน" : "สถานะ client คงที่",
			description: `Active ${data.client_summary.active} / Suspended ${data.client_summary.suspended} จากทั้งหมด ${data.client_summary.total}`,
			tone: clientTone,
			icon: "i-heroicons-user-group",
		},
		{
			id: "policy-state",
			title: policyTone === "error" ? "Build policy ควรตรวจ" : "System policy พร้อมใช้งาน",
			description: `Latest build ${data.system.app_latest_build} / Min required ${data.system.app_min_required_build}`,
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
			label: "Last refresh",
			value: lastRefreshedLabel.value,
			description: "snapshot ของ dashboard รอบล่าสุด",
		},
		{
			id: "policy",
			label: "Build policy",
			value: `${data.system.app_latest_build} / ${data.system.app_min_required_build}`,
			description: "latest build เทียบกับ minimum build ที่บังคับใช้",
		},
		{
			id: "redis-driver",
			label: "Redis driver",
			value: data.security.security.redis_driver,
			description: "driver ปัจจุบันที่ระบบ auth/session ใช้งาน",
		},
		{
			id: "stores",
			label: "Stores total",
			value: String(data.monitoring.summary.stores_total),
			description: "จำนวนร้านทั้งหมดจาก monitoring summary",
		},
	];
});

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
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
		error.value = err instanceof Error ? err.message : "โหลด dashboard ไม่สำเร็จ";
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
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="ภาพรวมของระบบกลาง, clients, policy, monitoring และ security จากมุมเดียว"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Dashboard"
					description="ภาพรวมสำหรับผู้ดูแลระบบกลาง ใช้ดู health, สถานะสำคัญ และทางลัดไปยังส่วนที่ต้องจัดการต่อ"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #badges>
						<UBadge color="primary" variant="soft" label="System Admin" />
						<UBadge color="neutral" variant="soft" :label="`Refreshed ${lastRefreshedLabel}`" />
					</template>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="refreshing" :spin-icon-on-loading="true" @click="refreshDashboard">
								รีโหลด
							</AppButton>
							<AppButton color="primary" variant="solid" size="md" icon="i-heroicons-user-group-20-solid" @click="navigateTo('/system-admin/clients')">
								จัดการ Clients
							</AppButton>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">System dashboard</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">หน้า overview สำหรับตัดสินใจว่าควรเปิดไปที่ clients, security, monitoring หรือ system policy ต่อทันที</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									4 widgets
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
														<h2 class="text-lg font-semibold text-stone-950">Operations watchlist</h2>
														<p class="mt-1 text-xs leading-5 text-stone-500">สรุปจุดที่ควรตรวจต่อจาก dashboard โดยไม่ต้องสลับหลายหน้าในทันที</p>
													</div>
													<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
														{{ watchItems.length }} items
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
														<h2 class="text-lg font-semibold text-stone-950">Recent checkpoints</h2>
														<p class="mt-1 text-xs leading-5 text-stone-500">ค่าอ้างอิงสั้น ๆ เพื่อใช้เทียบก่อนลงไปหน้า detail</p>
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
