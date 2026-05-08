<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ServiceHealthStatus = "healthy" | "degraded" | "down";

type SecuritySnapshot = {
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

const { apiFetch } = useApiClient();
const pending = ref(true);
const error = ref<string | null>(null);
const snapshot = ref<SecuritySnapshot | null>(null);
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

async function loadSecurity() {
	pending.value = true;
	error.value = null;
	try {
		const response = await apiFetch<ApiEnvelope<SecuritySnapshot>>("/system-admin/security");
		snapshot.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลด security monitoring ไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}

onMounted(async () => {
	await loadSecurity();
	autoRefreshTimer = setInterval(() => {
		void loadSecurity();
	}, 30_000);
});

onBeforeUnmount(() => {
	if (autoRefreshTimer) clearInterval(autoRefreshTimer);
});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-admin']"
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
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadSecurity">
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
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">อัปเดตอัตโนมัติทุก 30 วินาที และกดรีโหลดได้ทุกเมื่อ</p>
								</div>
								<div v-if="snapshot" class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									อัปเดตล่าสุด {{ formatDateTime(snapshot.checked_at) }}
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div v-if="pending" class="min-h-[320px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="system-security-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
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
