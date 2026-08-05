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

type MonitoringSnapshot = {
	checked_at: string;
	runtime: {
		uptime_seconds: number;
		node_version: string;
		platform: string;
		pid: number;
		memory: {
			rss_mb: number;
			heap_used_mb: number;
			heap_total_mb: number;
			external_mb: number;
		};
	};
	services: {
		api: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
		db: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
		redis: { status: ServiceHealthStatus; latency_ms: number | null; message: string; checked_at: string; history: ServiceHistorySample[] };
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
	recent_activity: {
		window_hours: number;
		admin_changes_total: number;
		client_changes: number;
		role_changes: number;
		member_changes: number;
		password_resets: number;
	};
	pos_performance: {
		window_hours: number;
		sample_limit: number;
		last_reset_at: string | null;
		total_requests: number;
		avg_latency_ms: number;
		p95_latency_ms: number;
		slow_requests: number;
		slow_rate_percent: number;
		error_rate_percent: number;
		slow_threshold_ms: number;
		groups: Array<{
			id: string;
			label: string;
			request_count: number;
			avg_latency_ms: number;
		}>;
	};
	warnings: string[];
};

const { apiFetch } = useApiClient();
const VISIBILITY_RESUME_REFRESH_THRESHOLD_SECONDS = 15;
const SIGNAL_SLOT_COUNT = 24;
const REFRESH_INTERVAL_STORAGE_KEY = "system-admin-monitoring-refresh-interval-seconds";
const refreshIntervalOptions = [
	{ label: "30 ວິນາທີ", value: 30 },
	{ label: "1 ນາທີ", value: 60 },
	{ label: "3 ນາທີ", value: 180 },
	{ label: "5 ນາທີ", value: 300 },
];
const pending = ref(true);
const refreshing = ref(false);
const error = ref<string | null>(null);
const snapshot = ref<MonitoringSnapshot | null>(null);
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
	if (status === "healthy") return "ປົກກະຕິ";
	if (status === "degraded") return "ຊ້າກວ່າປົກກະຕິ";
	return "ບໍ່ພ້ອມໃຊ້";
}

function serviceMessage(serviceId: string, fallback: string) {
	if (serviceId === "api") return "ກວດສອບ API ສຳເລັດ";
	if (serviceId === "db") return "ກວດສອບຖານຂໍ້ມູນສຳເລັດ";
	if (serviceId === "redis") return "ກວດສອບ Redis ສຳເລັດ";
	return fallback;
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("lo-LA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function formatUptime(seconds: number) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days} ມື້ ${hours} ຊມ. ${minutes} ນາທີ`;
	if (hours > 0) return `${hours} ຊມ. ${minutes} ນາທີ`;
	return `${minutes} ນາທີ`;
}

function formatLatency(value: number) {
	return value > 0 ? `${value} ms` : "ບໍ່ມີຂໍ້ມູນ";
}

function refreshIntervalLabel(seconds: number) {
	const matched = refreshIntervalOptions.find((option) => option.value === seconds);
	return matched?.label || `${seconds} ວິນາທີ`;
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
			void loadMonitoring("auto");
			return;
		}
		nextRefreshInSeconds.value -= 1;
	}, 1000);
}

async function loadMonitoring(mode: "initial" | "manual" | "auto" = "initial") {
	if (mode === "initial") {
		pending.value = true;
	} else {
		refreshing.value = true;
	}
	if (!snapshot.value) {
		error.value = null;
	}
	try {
		const response = await apiFetch<ApiEnvelope<MonitoringSnapshot>>("/system-admin/monitoring");
		snapshot.value = response.data;
		error.value = null;
		nextRefreshInSeconds.value = selectedRefreshIntervalSeconds.value;
	} catch (err) {
		if (!snapshot.value) {
			error.value = resolveApiErrorMessage(err, "ໂຫຼດຂໍ້ມູນຕິດຕາມບໍ່ສຳເລັດ", {
				forbiddenMessage: "ບັນຊີນີ້ບໍ່ມີສິດເບິ່ງການຕິດຕາມລະບົບ",
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
		void loadMonitoring("auto").finally(() => {
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
	await loadMonitoring("initial");
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
			:active-ids="['system-monitoring']"
			sidebar-eyebrow="ລະບົບ"
			sidebar-title="ຜູ້ດູແລລະບົບ"
		sidebar-compact-title="SYS"
		sidebar-description="ຕິດຕາມສະຖານະ API, ຖານຂໍ້ມູນ, Redis ແລະ ຊັບພະຍາກອນຫຼັກຂອງແພລດຟອມ"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
					<AppPageHeader
						title="ການຕິດຕາມລະບົບ"
						description="ກວດສຸຂະພາບລະບົບແບບໃກ້ຄຽງເວລາຈິງ ພ້ອມສະຫຼຸບຜູ້ໃຊ້, ຮ້ານ ແລະ latency"
						:title-badge="false"
						compact
						body-class="px-3 py-2.5 sm:px-4 sm:py-3"
						:tablet-layout="true"
					@menu="openSidebar"
				>
						<template #actions>
							<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 lg:flex lg:w-auto">
								<NuxtLink to="/system-admin/security">
									<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-shield-check-20-solid">
										ຄວາມປອດໄພ
									</AppButton>
								</NuxtLink>
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending || refreshing" :disabled="pending || refreshing" :spin-icon-on-loading="true" @click="loadMonitoring('manual')">
									ໂຫຼດໃໝ່
								</AppButton>
							</div>
						</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
									<div>
										<p class="text-sm font-semibold text-stone-950">ຕິດຕາມສະຖານະລະບົບ</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">ອັບເດດອັດຕະໂນມັດຕາມຮອບເວລາທີ່ເລືອກ ແລະ ໂຫຼດໃໝ່ໄດ້ທຸກເວລາ</p>
									</div>
									<div class="flex flex-wrap items-center gap-2">
										<label class="flex items-center gap-2 rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											<span>ທຸກ</span>
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
											{{ refreshing ? `ກຳລັງໂຫຼດໃໝ່...` : `ໂຫຼດໃໝ່ໃນ ${nextRefreshInSeconds} ວິນາທີ • ທຸກ ${refreshIntervalLabel(selectedRefreshIntervalSeconds)}` }}
										</div>
										<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											ອັບເດດລ່າສຸດ {{ formatDateTime(snapshot.checked_at) }}
										</div>
									</div>
								</div>

								<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
									<div v-if="pending" class="min-h-[320px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="system-monitoring-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
									<div v-else-if="error && !snapshot" class="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-stone-500">
										{{ error }}
									</div>
									<div v-else-if="snapshot" class="grid gap-4 p-4 xl:grid-cols-2">
										<div v-if="refreshing" class="xl:col-span-2 overflow-hidden bg-neutral-100">
											<div class="system-monitoring-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
										</div>
										<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div class="flex flex-wrap items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">ສຸຂະພາບຂອງບໍລິການ</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ສະຖານະ ແລະ latency ຂອງ API, ຖານຂໍ້ມູນ ແລະ Redis</p>
												</div>
												<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-600">
													ເວລາເຮັດວຽກ {{ formatUptime(snapshot.runtime.uptime_seconds) }}
												</div>
											</div>

											<div class="grid gap-3 sm:grid-cols-3">
												<div
													v-for="service in [
														{ id: 'api', label: 'API', data: snapshot.services.api },
																		{ id: 'db', label: 'ຖານຂໍ້ມູນ', data: snapshot.services.db },
														{ id: 'redis', label: 'Redis', data: snapshot.services.redis },
													]"
													:key="service.id"
													class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
												>
													<div class="flex items-center justify-between gap-2">
														<p class="text-sm font-semibold text-stone-900">{{ service.label }}</p>
														<UBadge :color="statusTone(service.data.status)" variant="soft" :label="statusLabel(service.data.status)" />
													</div>
													<p class="mt-2 text-xs text-stone-500">{{ serviceMessage(service.id, service.data.message) }}</p>
													<div class="mt-3 flex items-center justify-between gap-2 text-xs">
														<p class="font-medium text-stone-700">
															Latency: {{ service.data.latency_ms === null ? "ບໍ່ມີຂໍ້ມູນ" : `${service.data.latency_ms} ms` }}
														</p>
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
															:title="slot.entry ? signalBarTitle(slot.entry) : 'ຍັງບໍ່ມີຂໍ້ມູນ'"
															:aria-label="slot.entry ? signalBarTitle(slot.entry) : 'ຍັງບໍ່ມີຂໍ້ມູນ'"
															/>

															<template #content>
																<div class="w-[200px] rounded-md bg-white p-3 shadow-xl ring-1 ring-neutral-200">
																	<div class="flex items-center justify-between gap-2">
																	<p class="text-xs font-semibold text-stone-950">{{ slot.entry ? statusLabel(slot.entry.status) : "ບໍ່ມີຂໍ້ມູນ" }}</p>
																		<span v-if="slot.entry" class="h-2.5 w-2.5 rounded-full" :class="signalBarClass(slot.entry.status)" />
																	</div>
																<p class="mt-2 text-[11px] text-stone-500">{{ slot.entry ? formatDateTime(slot.entry.checked_at) : "ລໍຖ້າການກວດຄັ້ງທຳອິດ" }}</p>
																	<p v-if="slot.entry" class="mt-1 text-xs font-medium text-stone-700">
																Latency {{ slot.entry.latency_ms === null ? "ບໍ່ມີຂໍ້ມູນ" : `${slot.entry.latency_ms} ms` }}
																	</p>
																</div>
															</template>
														</UPopover>
													</div>
													<div class="mt-2 flex items-center justify-between gap-2 text-[11px] text-stone-500">
														<p>ກວດລ່າສຸດ {{ service.data.history.length }} ຄັ້ງ</p>
														<p>ຜິດປົກກະຕິ {{ historyIncidentCount(service.data.history) }} ຄັ້ງ, ລະບົບລົ້ມ {{ historyDownCount(service.data.history) }} ຄັ້ງ</p>
													</div>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">ສະຫຼຸບຊັບພະຍາກອນ</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ຜູ້ໃຊ້, ຮ້ານ ແລະ ຂໍ້ມູນລະບົບທີ່ກ່ຽວຂ້ອງ</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຜູ້ໃຊ້ທັງໝົດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຜູ້ໃຊ້ທີ່ໃຊ້ງານ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_active }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຮ້ານທັງໝົດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.stores_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ສິນຄ້າ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.products_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ລາຍການສະຕັອກ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.inventory_balances_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ໃບສັ່ງຊື້</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.purchase_orders_total }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">ປະສິດທິພາບ POS</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ສະແດງ route ທີ່ຮ້ານໃຊ້ງານຈິງ ເຊັ່ນ ອໍເດີ, ສິນຄ້າ, ສະຕັອກ ແລະ ໃບສັ່ງຊື້ ໃນ {{ snapshot.pos_performance.window_hours }} ຊົ່ວໂມງຫຼ້າສຸດ</p>
												<p class="mt-1 text-[11px] text-stone-400">
													ລ້າງຄ່າຫຼ້າສຸດ
													<span class="font-medium text-stone-600">
														{{ snapshot.pos_performance.last_reset_at ? formatDateTime(snapshot.pos_performance.last_reset_at) : "ຍັງບໍ່ມີຂໍ້ມູນ" }}
													</span>
												</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຈຳນວນຄຳຮ້ອງຂໍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.pos_performance.total_requests }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Latency ສະເລ່ຍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatLatency(snapshot.pos_performance.avg_latency_ms) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">P95 latency</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatLatency(snapshot.pos_performance.p95_latency_ms) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຄຳຮ້ອງຂໍທີ່ຊ້າ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.pos_performance.slow_requests }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ອັດຕາຄຳຮ້ອງຂໍຊ້າ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.pos_performance.slow_rate_percent }}%</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ອັດຕາ error 5xx</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.pos_performance.error_rate_percent }}%</p>
												</div>
											</div>
											<div v-if="snapshot.pos_performance.groups.length" class="space-y-2">
												<p class="text-xs font-semibold tracking-[0.16em] text-stone-400">ກຸ່ມ route</p>
												<div class="grid gap-2 sm:grid-cols-2">
													<div
														v-for="group in snapshot.pos_performance.groups"
														:key="group.id"
														class="rounded-md border border-neutral-200 bg-white px-3 py-3"
													>
														<div class="flex items-center justify-between gap-3">
															<p class="text-sm font-medium text-stone-900">{{ group.label }}</p>
															<p class="text-xs text-stone-500">{{ group.request_count }} ຄຳຮ້ອງຂໍ</p>
														</div>
														<p class="mt-2 text-xs text-stone-500">ສະເລ່ຍ {{ formatLatency(group.avg_latency_ms) }}</p>
													</div>
												</div>
											</div>
											<p class="text-[11px] text-stone-500">
												ເກນຄຳຮ້ອງຂໍຊ້າ > {{ snapshot.pos_performance.slow_threshold_ms }} ms, ເກັບສູງສຸດ {{ snapshot.pos_performance.sample_limit }} ຄຳຮ້ອງຂໍ ແລະ ບໍ່ນັບ monitoring, security, reports, settings ຫຼື health checks
											</p>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">ການເຊື່ອມຕໍ່</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ສະຖານະການເຊື່ອມຕໍ່ Facebook ແລະ WhatsApp</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການເຊື່ອມຕໍ່ Facebook</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.fb_connections_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Facebook ທີ່ອອນລາຍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.fb_connections_online }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການເຊື່ອມຕໍ່ WhatsApp</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.wa_connections_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">WhatsApp ທີ່ອອນລາຍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.wa_connections_online }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5 sm:col-span-2">
													<p class="text-xs text-stone-500">ການເຊື່ອມຕໍ່ຮ້ານທັງໝົດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.integrations_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ອັດຕາ Facebook ອອນລາຍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.fb_connections_online, snapshot.summary.fb_connections_total) }}%</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ອັດຕາ WhatsApp ອອນລາຍ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ percentage(snapshot.summary.wa_connections_online, snapshot.summary.wa_connections_total) }}%</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">ພາບລວມການດຳເນີນງານ</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ກິດຈະກຳຫຼ້າສຸດຈາກ audit log ໃນ {{ snapshot.recent_activity.window_hours }} ຊົ່ວໂມງ</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການປ່ຽນແປງຜູ້ດູແລ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.admin_changes_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການປ່ຽນແປງລູກຄ້າ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.client_changes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການປ່ຽນແປງບົດບາດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.role_changes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການເພີ່ມສະມາຊິກ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.member_changes }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5 sm:col-span-2">
													<p class="text-xs text-stone-500">ການຕັ້ງລະຫັດຜ່ານໃໝ່</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.recent_activity.password_resets }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-3">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">ສະຖານະການເຮັດວຽກ</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">ຂໍ້ມູນ process ຂອງ Node.js</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ເວີຊັນ Node</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.node_version }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ແພລດຟອມ</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.platform }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">PID</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.pid }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ໜ່ວຍຄວາມຈຳ RSS</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.memory.rss_mb }} MB</p>
												</div>
											</div>
											<div v-if="snapshot.warnings.length" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
												<p class="font-medium">ຄຳເຕືອນ</p>
												<p class="mt-1">{{ snapshot.warnings.join(" • ") }}</p>
											</div>
										</div>
									</UCard>
								</div>
							</div>

							<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
								<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span v-if="pending">ກຳລັງໂຫຼດການຕິດຕາມ…</span>
											<span v-else-if="snapshot">ອັບເດດລ່າສຸດ {{ formatDateTime(snapshot.checked_at) }}</span>
											<span v-else>ຍັງບໍ່ມີຂໍ້ມູນການຕິດຕາມ</span>
									</div>
									<div class="grid w-full grid-cols-2 gap-2">
										<NuxtLink to="/system-admin/security" class="w-full">
											<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-shield-check-20-solid" :block="true">
												ຄວາມປອດໄພ
											</AppButton>
										</NuxtLink>
										<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadMonitoring">
											ໂຫຼດໃໝ່
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
@keyframes system-monitoring-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.system-monitoring-loading-line {
	animation: system-monitoring-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
