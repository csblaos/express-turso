<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { getApiErrorStatus, resolveApiErrorMessage } from "~/utils/api-errors";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type ServiceHistorySample = {
	status: ServiceHealthStatus;
	latency_ms: number | null;
	checked_at: string;
};

type SignalSlot = {
	key: string;
	entry: ServiceHistorySample | null;
};

type SecuritySnapshot = {
	checked_at: string;
	services: {
		api: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
		db: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
		redis: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
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
	recent_activity: {
		window_hours: number;
		password_resets: number;
		suspensions: number;
		role_changes: number;
		client_updates: number;
	};
	auth_telemetry: {
		window_hours: number;
		login_successes: number;
		login_failures: number;
		lockouts: number;
		suspended_blocks: number;
		total_auth_events: number;
		failure_pressure_percent: number;
	};
	warnings: string[];
};

const { apiFetch } = useApiClient();
const VISIBILITY_RESUME_REFRESH_THRESHOLD_SECONDS = 15;
const SIGNAL_SLOT_COUNT = 24;
const REFRESH_INTERVAL_STORAGE_KEY = "system-admin-security-refresh-interval-seconds";
const refreshIntervalOptions = [
	{ label: "30 วิ", value: 30 },
	{ label: "1 นาที", value: 60 },
	{ label: "3 นาที", value: 180 },
	{ label: "5 นาที", value: 300 },
];
const pending = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const snapshot = ref<SecuritySnapshot | null>(null);
const selectedRefreshIntervalSeconds = ref(30);
const nextRefreshInSeconds = ref(selectedRefreshIntervalSeconds.value);
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;
let tabWasHidden = false;
let hiddenAtMs: number | null = null;

function statusTone(status: ServiceHealthStatus) {
	if (status === "healthy") return "success";
	if (status === "degraded") return "warning";
	return "error";
}

function statusLabel(status: ServiceHealthStatus) {
	if (status === "healthy") return "Healthy";
	if (status === "degraded") return "Degraded";
	return "Down";
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function refreshIntervalLabel(seconds: number) {
	const matched = refreshIntervalOptions.find((option) => option.value === seconds);
	return matched?.label || `${seconds} วิ`;
}

function isAllowedRefreshInterval(seconds: number) {
	return refreshIntervalOptions.some((option) => option.value === seconds);
}

function loadStoredRefreshInterval() {
	if (!import.meta.client) return;
	const rawValue = window.localStorage.getItem(REFRESH_INTERVAL_STORAGE_KEY);
	if (!rawValue) return;
	const parsedValue = Number(rawValue);
	if (!Number.isFinite(parsedValue) || !isAllowedRefreshInterval(parsedValue)) return;
	selectedRefreshIntervalSeconds.value = parsedValue;
	nextRefreshInSeconds.value = parsedValue;
}

function persistRefreshInterval(seconds: number) {
	if (!import.meta.client) return;
	window.localStorage.setItem(REFRESH_INTERVAL_STORAGE_KEY, String(seconds));
}

function signalBarClass(status: ServiceHealthStatus) {
	if (status === "healthy") return "bg-emerald-500";
	if (status === "degraded") return "bg-amber-400";
	return "bg-rose-500";
}

function signalBarTitle(entry: ServiceHistorySample) {
	return `${statusLabel(entry.status)} • ${entry.latency_ms === null ? "n/a" : `${entry.latency_ms}ms`} • ${formatDateTime(entry.checked_at)}`;
}

function historyHealthyPercent(history: ServiceHistorySample[]) {
	if (!history.length) return 0;
	return Math.round((history.filter((entry) => entry.status === "healthy").length / history.length) * 100);
}

function historyIncidentCount(history: ServiceHistorySample[]) {
	return history.filter((entry) => entry.status !== "healthy").length;
}

function historyDownCount(history: ServiceHistorySample[]) {
	return history.filter((entry) => entry.status === "down").length;
}

function percentage(part: number, total: number) {
	if (total <= 0) return 0;
	return Math.round((part / total) * 100);
}

function signalSlots(history: ServiceHistorySample[]): SignalSlot[] {
	const safeHistory = history.slice(-SIGNAL_SLOT_COUNT);
	const emptyCount = Math.max(0, SIGNAL_SLOT_COUNT - safeHistory.length);
	return [
		...Array.from({ length: emptyCount }, (_, index) => ({
			key: `empty-${index}`,
			entry: null,
		})),
		...safeHistory.map((entry, index) => ({
			key: `${entry.checked_at}-${index}`,
			entry,
		})),
	];
}

function stopAutoRefresh() {
	if (autoRefreshTimer) {
		clearInterval(autoRefreshTimer);
		autoRefreshTimer = null;
	}
}

function startAutoRefresh(preserveCountdown = false) {
	if (import.meta.client && document.hidden) {
		stopAutoRefresh();
		return;
	}
	stopAutoRefresh();
	if (!preserveCountdown) {
		nextRefreshInSeconds.value = selectedRefreshIntervalSeconds.value;
	}
	autoRefreshTimer = setInterval(() => {
		if (pending.value || refreshing.value) return;
		if (nextRefreshInSeconds.value <= 1) {
			void loadSecurity("auto");
			return;
		}
		nextRefreshInSeconds.value -= 1;
	}, 1000);
}

async function loadSecurity(mode: "initial" | "manual" | "auto" = "initial") {
	if (mode === "initial") {
		pending.value = true;
	} else {
		refreshing.value = true;
	}
	if (!snapshot.value) {
		error.value = null;
	}
	try {
		const response = await apiFetch<ApiEnvelope<SecuritySnapshot>>("/system-admin/security");
		snapshot.value = response.data;
		error.value = null;
		nextRefreshInSeconds.value = selectedRefreshIntervalSeconds.value;
	} catch (err) {
		if (!snapshot.value) {
			error.value = resolveApiErrorMessage(err, "โหลด security monitoring ไม่สำเร็จ", {
				forbiddenMessage: "บัญชีนี้ไม่มีสิทธิ์ดู Security ของ System Admin",
			});
		}
		if (getApiErrorStatus(err) === 403) {
			stopAutoRefresh();
		}
	} finally {
		pending.value = false;
		refreshing.value = false;
	}
}

function handleVisibilityChange() {
	if (document.hidden) {
		tabWasHidden = true;
		hiddenAtMs = Date.now();
		stopAutoRefresh();
		return;
	}
	if (!tabWasHidden) {
		startAutoRefresh();
		return;
	}
	tabWasHidden = false;
	const hiddenDurationSeconds = hiddenAtMs === null ? 0 : Math.floor((Date.now() - hiddenAtMs) / 1000);
	hiddenAtMs = null;
	if (
		hiddenDurationSeconds >= VISIBILITY_RESUME_REFRESH_THRESHOLD_SECONDS ||
		hiddenDurationSeconds >= nextRefreshInSeconds.value
	) {
		void loadSecurity("auto").finally(() => {
			startAutoRefresh();
		});
		return;
	}
	nextRefreshInSeconds.value = Math.max(1, nextRefreshInSeconds.value - hiddenDurationSeconds);
	startAutoRefresh(true);
}

function applyRefreshInterval(seconds: number) {
	selectedRefreshIntervalSeconds.value = seconds;
	nextRefreshInSeconds.value = seconds;
	persistRefreshInterval(seconds);
	startAutoRefresh();
}

onMounted(async () => {
	loadStoredRefreshInterval();
	await loadSecurity("initial");
	document.addEventListener("visibilitychange", handleVisibilityChange);
	if (document.hidden) {
		tabWasHidden = true;
		return;
	}
	startAutoRefresh();
});

onBeforeUnmount(() => {
	stopAutoRefresh();
	if (import.meta.client) {
		document.removeEventListener("visibilitychange", handleVisibilityChange);
	}
});
</script>

<template>
		<AppSidebarShell
			:nav-items="appNavItems"
			:active-ids="['system-security']"
			sidebar-eyebrow="System"
			sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="security dashboard สำหรับดู auth policy, JWT posture และ account risk summary"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Security"
					description="ตรวจสถานะความปลอดภัยระบบกลาง: auth policy, account posture และ service health"
					:tablet-layout="true"
					@menu="openSidebar"
				>
						<template #actions>
							<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 lg:flex lg:w-auto">
								<NuxtLink to="/system-admin/monitoring">
									<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-signal-20-solid">
										ดู Service health
									</AppButton>
								</NuxtLink>
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending || refreshing" :disabled="pending || refreshing" :spin-icon-on-loading="true" @click="loadSecurity('manual')">
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
										<p class="text-sm font-semibold text-stone-950">System security</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">อัปเดตอัตโนมัติตามช่วงเวลาที่เลือก และกดรีโหลดได้ทุกเมื่อ</p>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<label class="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											<span>ทุก</span>
											<select
												:value="selectedRefreshIntervalSeconds"
												class="min-w-[88px] border-0 bg-transparent pr-6 text-right text-xs font-medium text-stone-700 focus:outline-none"
												@change="applyRefreshInterval(Number(($event.target as HTMLSelectElement).value))"
											>
												<option v-for="option in refreshIntervalOptions" :key="option.value" :value="option.value">
													{{ option.label }}
												</option>
											</select>
										</label>
										<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											{{ refreshing ? `กำลังรีโหลด...` : `รีเฟรชใน ${nextRefreshInSeconds} วิ • ทุก ${refreshIntervalLabel(selectedRefreshIntervalSeconds)}` }}
										</div>
										<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}
										</div>
									</div>
								</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
									<div v-if="pending" class="min-h-[320px]">
										<div class="overflow-hidden bg-neutral-100">
											<div class="system-security-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
										</div>
									</div>
									<div v-else-if="error && !snapshot" class="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-stone-500">
										{{ error }}
									</div>
									<div v-else-if="snapshot" class="grid gap-4 p-4 xl:grid-cols-2">
										<div v-if="refreshing" class="xl:col-span-2 overflow-hidden bg-neutral-100">
											<div class="system-security-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
										</div>
										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div class="flex flex-wrap items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Security dependency status</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">สถานะย่อของ API, DB และ Redis สำหรับงาน security</p>
												</div>
												<NuxtLink to="/system-admin/monitoring" class="shrink-0">
													<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-top-right-on-square-20-solid">
														ไปหน้า Monitoring
													</AppButton>
												</NuxtLink>
											</div>
											<div class="grid gap-3 sm:grid-cols-3">
												<div
													v-for="service in [
														{ id: 'api', label: 'API', data: snapshot.services.api },
														{ id: 'db', label: 'Database', data: snapshot.services.db },
														{ id: 'redis', label: 'Redis', data: snapshot.services.redis },
													]"
													:key="service.id"
													class="rounded-md border border-neutral-200 bg-neutral-50 px-3 py-3.5"
												>
													<div class="flex items-center justify-between gap-2">
														<p class="text-sm font-semibold text-stone-900">{{ service.label }}</p>
														<UBadge :color="statusTone(service.data.status)" variant="soft" :label="statusLabel(service.data.status)" />
													</div>
													<p class="mt-2 text-xs font-medium text-stone-700">Latency: {{ service.data.latency_ms === null ? "n/a" : `${service.data.latency_ms}ms` }}</p>
													<div class="mt-3 flex items-center justify-between gap-2 text-xs">
														<p class="text-stone-500">Signal window</p>
														<p class="text-stone-500">{{ historyHealthyPercent(service.data.history) }}%</p>
													</div>
													<div class="mt-2 flex items-end gap-1">
														<UPopover
															v-for="slot in signalSlots(service.data.history)"
															:key="`${service.id}-${slot.key}`"
															:content="{ side: 'top', align: 'center', sideOffset: 8, collisionPadding: 8 }"
															:disabled="!slot.entry"
														>
															<component
																:is="slot.entry ? 'button' : 'span'"
																:type="slot.entry ? 'button' : undefined"
																class="h-4 flex-1 rounded-sm"
																:class="slot.entry ? `${signalBarClass(slot.entry.status)} cursor-pointer transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400` : 'bg-neutral-200 ring-1 ring-neutral-200/80'"
																:title="slot.entry ? signalBarTitle(slot.entry) : 'ยังไม่มีข้อมูล'"
																:aria-label="slot.entry ? signalBarTitle(slot.entry) : 'ยังไม่มีข้อมูล'"
															/>

															<template #content>
																<div class="w-[200px] rounded-md bg-white p-3 shadow-xl ring-1 ring-neutral-200">
																	<div class="flex items-center justify-between gap-2">
																		<p class="text-xs font-semibold text-stone-950">{{ slot.entry ? statusLabel(slot.entry.status) : "No data" }}</p>
																		<span v-if="slot.entry" class="h-2.5 w-2.5 rounded-full" :class="signalBarClass(slot.entry.status)" />
																	</div>
																	<p class="mt-2 text-[11px] text-stone-500">{{ slot.entry ? formatDateTime(slot.entry.checked_at) : "waiting for first checks" }}</p>
																	<p v-if="slot.entry" class="mt-1 text-xs font-medium text-stone-700">
																		Latency {{ slot.entry.latency_ms === null ? "n/a" : `${slot.entry.latency_ms}ms` }}
																	</p>
																</div>
															</template>
														</UPopover>
													</div>
													<div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-stone-500">
														<p>Last {{ service.data.history.length }} checks</p>
														<p>{{ historyIncidentCount(service.data.history) }} incidents, {{ historyDownCount(service.data.history) }} down</p>
													</div>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Auth policy</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ค่าปัจจุบันจาก system_config ที่ใช้กับ login/session</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Access token TTL</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.access_token_ttl_minutes }} นาที</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Refresh token TTL</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.refresh_token_ttl_days }} วัน</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Remember me TTL</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.remember_me_refresh_ttl_days }} วัน</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Session default limit</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.default_session_limit }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Max failed attempts</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.max_failed_attempts }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Lockout minutes</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.lockout_minutes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5 sm:col-span-2">
													<p class="text-xs text-stone-500">Allow multi session</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_policy.allow_multi_session ? "เปิด" : "ปิด" }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Security posture</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ค่า environment ที่สำคัญต่อ auth stack</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">JWT secret</p>
													<p class="mt-1 text-base font-semibold" :class="snapshot.security.jwt_secret_is_default ? 'text-rose-600' : 'text-emerald-700'">
														{{ snapshot.security.jwt_secret_is_default ? "Default (เสี่ยง)" : "Custom" }}
													</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">JWT secret length</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.security.jwt_secret_length }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">NODE_ENV</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.security.node_env }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Redis driver</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.security.redis_driver }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Account risk summary</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">สรุปสถานะบัญชีผู้ใช้ที่มีผลต่อความปลอดภัยระบบ</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Users ทั้งหมด</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">System admin</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_system_admin }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Superadmin</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_superadmin }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Users suspended</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_suspended }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Must change password</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_must_change_password }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">No password hash</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_without_password_hash }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Stores</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.stores_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Store members</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.store_members_total }}</p>
												</div>
											</div>
											<div v-if="snapshot.warnings.length" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
												<p class="font-medium">Warnings</p>
												<p class="mt-1">{{ snapshot.warnings.join(" • ") }}</p>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Password hygiene</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ภาพรวมความพร้อมของบัญชีต่อการใช้งาน auth policy ปัจจุบัน</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Password coverage</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.users_total - snapshot.summary.users_without_password_hash, snapshot.summary.users_total) }}%</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Must change rate</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.users_must_change_password, snapshot.summary.users_total) }}%</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Privileged account share</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.users_system_admin + snapshot.summary.users_superadmin, snapshot.summary.users_total) }}%</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Suspended account rate</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.users_suspended, snapshot.summary.users_total) }}%</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Recent security activity</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ความเคลื่อนไหวที่มีผลต่อบัญชีใน {{ snapshot.recent_activity.window_hours }} ชั่วโมง</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Password resets</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.password_resets }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Suspensions / activations</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.suspensions }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Role changes</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.role_changes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Client updates</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.client_updates }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Auth telemetry</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">แรงกดดันของการ login ใน {{ snapshot.auth_telemetry.window_hours }} ชั่วโมงล่าสุด</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Login successes</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.login_successes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Login failures</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.login_failures }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Lockouts</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.lockouts }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Suspended blocks</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.suspended_blocks }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Total auth events</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.total_auth_events }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Failure pressure</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.auth_telemetry.failure_pressure_percent }}%</p>
												</div>
											</div>
										</div>
									</UCard>
								</div>
							</div>

							<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
								<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
										<span v-if="pending">กำลังโหลด security…</span>
										<span v-else-if="snapshot">อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}</span>
										<span v-else>ยังไม่มีข้อมูล security</span>
									</div>
									<div class="grid w-full grid-cols-2 gap-2">
										<NuxtLink to="/system-admin/monitoring" class="w-full">
											<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-signal-20-solid" :block="true">
												Monitoring
											</AppButton>
										</NuxtLink>
										<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadSecurity">
											รีโหลด
										</AppButton>
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
@keyframes system-security-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.system-security-loading-line {
	animation: system-security-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
