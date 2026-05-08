<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ServiceHealthStatus = "healthy" | "degraded" | "down";

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

const { apiFetch } = useApiClient();
const pending = ref(true);
const error = ref<string | null>(null);
const snapshot = ref<MonitoringSnapshot | null>(null);
let autoRefreshTimer: ReturnType<typeof setInterval> | null = null;

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

function formatUptime(seconds: number) {
	const days = Math.floor(seconds / 86400);
	const hours = Math.floor((seconds % 86400) / 3600);
	const minutes = Math.floor((seconds % 3600) / 60);
	if (days > 0) return `${days}d ${hours}h ${minutes}m`;
	if (hours > 0) return `${hours}h ${minutes}m`;
	return `${minutes}m`;
}

async function loadMonitoring() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<MonitoringSnapshot>>("/system-admin/monitoring");
		snapshot.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด monitoring ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}

onMounted(async () => {
	await loadMonitoring();
	autoRefreshTimer = setInterval(() => {
		void loadMonitoring();
	}, 30_000);
});

onBeforeUnmount(() => {
	if (autoRefreshTimer) {
		clearInterval(autoRefreshTimer);
	}
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-admin']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="monitoring dashboard สำหรับดูสถานะ API, DB, Redis และภาพรวมทรัพยากรหลักของแพลตฟอร์ม"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Monitoring"
					description="ตรวจสุขภาพระบบกลางแบบ near real-time พร้อมสรุป users/stores/integrations และ service latency"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto hidden w-full flex-wrap justify-end gap-2 lg:flex lg:w-auto">
							<NuxtLink to="/system-admin/security">
								<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-shield-check-20-solid">
									Security
								</AppButton>
							</NuxtLink>
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadMonitoring">
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
									<p class="text-sm font-semibold text-stone-950">System monitoring</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">อัปเดตอัตโนมัติทุก 30 วินาที และกดรีโหลดได้ทุกเมื่อ</p>
								</div>
								<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div v-if="pending" class="min-h-[320px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="system-monitoring-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
								<div v-else-if="error" class="flex h-full min-h-[320px] items-center justify-center px-4 text-center text-stone-500">
									{{ error }}
								</div>
								<div v-else-if="snapshot" class="grid gap-4 p-4 xl:grid-cols-2">
									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div class="flex flex-wrap items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Service health</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">API, DB และ Redis latency/status</p>
												</div>
												<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-600">
													Uptime {{ formatUptime(snapshot.runtime.uptime_seconds) }}
												</div>
											</div>

											<div class="grid gap-3 sm:grid-cols-3">
												<div
													v-for="service in [
														{ id: 'api', label: 'API', data: snapshot.services.api },
														{ id: 'db', label: 'Database', data: snapshot.services.db },
														{ id: 'redis', label: 'Redis', data: snapshot.services.redis },
													]"
													:key="service.id"
													class="rounded-md border border-neutral-200 bg-neutral-50 p-4"
												>
													<div class="flex items-center justify-between gap-2">
														<p class="text-sm font-semibold text-stone-900">{{ service.label }}</p>
														<UBadge :color="statusTone(service.data.status)" variant="soft" :label="statusLabel(service.data.status)" />
													</div>
													<p class="mt-2 text-xs text-stone-500">{{ service.data.message }}</p>
													<p class="mt-2 text-xs font-medium text-stone-700">
														Latency: {{ service.data.latency_ms === null ? "n/a" : `${service.data.latency_ms}ms` }}
													</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Resource summary</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">users, stores และงานระบบที่เกี่ยวข้อง</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Users</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Users (active)</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.users_active }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Stores</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.stores_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Products</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.products_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Inventory balances</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.inventory_balances_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Purchase orders</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.purchase_orders_total }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Integrations</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">FB/WA connection coverage</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">FB connections</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.fb_connections_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">FB online</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.fb_connections_online }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">WA connections</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.wa_connections_total }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">WA online</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.wa_connections_online }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5 sm:col-span-2">
													<p class="text-xs text-stone-500">Store integrations total</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ snapshot.summary.integrations_total }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-3">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Runtime</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">Node.js process context</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Node version</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.node_version }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Platform</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.platform }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">PID</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.pid }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">RSS memory</p>
													<p class="mt-1 text-sm font-semibold text-stone-900">{{ snapshot.runtime.memory.rss_mb }} MB</p>
												</div>
											</div>
											<div v-if="snapshot.warnings.length" class="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
												<p class="font-medium">Warnings</p>
												<p class="mt-1">{{ snapshot.warnings.join(" • ") }}</p>
											</div>
										</div>
									</UCard>
								</div>
							</div>

							<div class="fixed inset-x-0 bottom-0 z-[70] shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.08)] backdrop-blur-sm lg:hidden">
								<div class="mx-auto flex w-full max-w-[1100px] flex-col gap-2.5">
									<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
										<span v-if="pending">กำลังโหลด monitoring…</span>
										<span v-else-if="snapshot">อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}</span>
										<span v-else>ยังไม่มีข้อมูล monitoring</span>
									</div>
									<div class="grid w-full grid-cols-2 gap-2">
										<NuxtLink to="/system-admin/security" class="w-full">
											<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-shield-check-20-solid" :block="true">
												Security
											</AppButton>
										</NuxtLink>
										<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" :block="true" @click="loadMonitoring">
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
@keyframes system-monitoring-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.system-monitoring-loading-line {
	animation: system-monitoring-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
