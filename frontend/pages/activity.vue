<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

type ApiAuditEvent = {
	id: string;
	scope: string;
	store_id: string | null;
	actor_user_id: string | null;
	actor_name: string | null;
	actor_role: string | null;
	action: string;
	entity_type: string;
	entity_id: string | null;
	result: string;
	reason_code: string | null;
	ip_address: string | null;
	user_agent: string | null;
	request_id: string | null;
	metadata: unknown | null;
	before: unknown | null;
	after: unknown | null;
	occurred_at: string;
};

const { apiFetch } = useApiClient();

const searchQuery = ref("");
const activeScope = ref("all");
const activeResult = ref("all");
const activeEntityType = ref("all");
const events = ref<ApiAuditEvent[]>([]);
const pending = ref(true);
const error = ref<string | null>(null);
const selectedEventId = ref("");
const detailOpen = ref(false);

const numberFormatter = new Intl.NumberFormat("th-TH");
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});

let loadTimer: ReturnType<typeof setTimeout> | null = null;

const scopeOptions = computed(() => [
	{ id: "all", label: "ทุก scope" },
	...Array.from(new Set(events.value.map((event) => event.scope))).map((scope) => ({
		id: scope,
		label: scope,
	})),
]);

const entityTypeOptions = computed(() => [
	{ id: "all", label: "ทุก entity" },
	...Array.from(new Set(events.value.map((event) => event.entity_type))).map((entityType) => ({
		id: entityType,
		label: entityType,
	})),
]);

const resultOptions = [
	{ id: "all", label: "ทุกผลลัพธ์" },
	{ id: "success", label: "สำเร็จ" },
	{ id: "failed", label: "ล้มเหลว" },
	{ id: "warning", label: "เตือน" },
	{ id: "pending", label: "รอดำเนินการ" },
];

const selectedEvent = computed(() =>
	events.value.find((event) => event.id === selectedEventId.value)
	?? events.value[0]
	?? null,
);

const successCount = computed(() => events.value.filter((event) => event.result === "success").length);
const failedCount = computed(() => events.value.filter((event) => event.result === "failed").length);
const uniqueActors = computed(() => new Set(events.value.map((event) => event.actor_name || event.actor_user_id || "unknown")).size);

watch(events, (value) => {
	if (!value.length) {
		selectedEventId.value = "";
		detailOpen.value = false;
		return;
	}

	const firstEvent = value[0];
	if (!value.some((event) => event.id === selectedEventId.value)) {
		selectedEventId.value = firstEvent ? firstEvent.id : "";
	}
}, { immediate: true });

watch([searchQuery, activeScope, activeResult, activeEntityType], () => {
	if (loadTimer) clearTimeout(loadTimer);
	loadTimer = setTimeout(() => {
		void loadEvents();
	}, 180);
});

onMounted(() => {
	void loadEvents();
});

onBeforeUnmount(() => {
	if (loadTimer) clearTimeout(loadTimer);
});

async function loadEvents() {
	pending.value = true;
	error.value = null;

	try {
		const params = new URLSearchParams();
		const query = searchQuery.value.trim();

		if (query) params.set("query", query);
		if (activeScope.value !== "all") params.set("scope", activeScope.value);
		if (activeResult.value !== "all") params.set("result", activeResult.value);
		if (activeEntityType.value !== "all") params.set("entity_type", activeEntityType.value);
		params.set("limit", "100");

		const queryString = params.toString();
		const response = await apiFetch<ApiEnvelope<ApiAuditEvent[]>>(
			`/audit-events${queryString ? `?${queryString}` : ""}`,
		);
		events.value = response.data;
	} catch (err) {
		error.value = err instanceof Error ? err.message : "โหลดกิจกรรมไม่สำเร็จ";
	} finally {
		pending.value = false;
	}
}

function openEvent(eventId: string) {
	selectedEventId.value = eventId;
	detailOpen.value = true;
}

function closeEvent() {
	detailOpen.value = false;
}

function formatDate(value: string) {
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function getResultColor(result: string) {
	if (result === "success") return "success";
	if (result === "failed") return "error";
	if (result === "warning") return "warning";
	return "neutral";
}

function getScopeColor(scope: string) {
	if (scope === "system") return "warning";
	if (scope === "store") return "success";
	if (scope === "inventory") return "info";
	return "neutral";
}

function stringifyBlock(value: unknown) {
	if (value === null || value === undefined) return "ไม่มีข้อมูล";
	if (typeof value === "string") return value;

	try {
		return JSON.stringify(value, null, 2);
	} catch {
		return String(value);
	}
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['activity']"
		sidebar-eyebrow="Activity"
		sidebar-title="กิจกรรม"
		sidebar-compact-title="LOG"
		sidebar-description="ดู audit events, ประวัติการเปลี่ยนแปลง และผลลัพธ์ของ action สำคัญในระบบ"
	>
		<template #default="{ openSidebar }">
			<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
				<AppPageHeader
					title="กิจกรรมระบบ"
					description=""
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #actions>
						<div class="ml-auto flex w-full flex-wrap justify-end gap-2 md:w-auto">
							<AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :loading="pending" :disabled="pending" :spin-icon-on-loading="true" @click="loadEvents">
								รีโหลด
							</AppButton>
						</div>
					</template>

					<template #default>
						<div class="space-y-2">
							<div class="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
								<div class="relative min-w-0">
									<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
									<input
										v-model="searchQuery"
										type="text"
										placeholder="ค้นหา actor, action, entity, request id"
										class="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-10 pr-11 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
									<button
										v-if="searchQuery"
										type="button"
										class="absolute right-2.5 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-md text-stone-400 transition hover:bg-primary-50 hover:text-primary-700"
										@click="searchQuery = ''"
									>
										<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
									</button>
								</div>

								<select v-model="activeScope" class="rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option v-for="option in scopeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
								</select>

								<select v-model="activeEntityType" class="rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option v-for="option in entityTypeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
								</select>
							</div>

							<div class="flex w-full flex-wrap items-center justify-end gap-2">
								<AppButton
									v-for="option in resultOptions"
									:key="option.id"
									:color="activeResult === option.id ? 'primary' : 'neutral'"
									:variant="activeResult === option.id ? 'solid' : 'soft'"
									size="md"
									class="rounded-md"
									@click="activeResult = option.id"
								>
									{{ option.label }}
								</AppButton>
							</div>

							<div class="grid gap-2 sm:grid-cols-3">
								<div class="rounded-md border border-neutral-200 bg-white p-3">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">ทั้งหมด</p>
									<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(events.length) }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-white p-3">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">สำเร็จ</p>
									<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(successCount) }}</p>
								</div>
								<div class="rounded-md border border-neutral-200 bg-white p-3">
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Failed</p>
									<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(failedCount) }}</p>
								</div>
							</div>
						</div>
					</template>
				</AppPageHeader>

				<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="h-full min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Audit events</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ไล่ดูเหตุการณ์ล่าสุดเพื่อเช็กการเปลี่ยนแปลงและผลลัพธ์จาก action สำคัญ</p>
								</div>
								<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
									{{ numberFormatter.format(uniqueActors) }} actors
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="activity-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
								<div v-else-if="error" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
									<div class="space-y-3">
										<p class="text-sm text-stone-600">{{ error }}</p>
										<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadEvents">ลองใหม่</AppButton>
									</div>
								</div>
								<div v-else-if="!events.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									ยังไม่มี audit event
								</div>
								<div v-else>
									<button
										v-for="event in events"
										:key="event.id"
										type="button"
										class="w-full border-b border-[#f1ede6] px-4 py-3 text-left transition hover:bg-primary-50"
										:class="selectedEvent?.id === event.id ? 'bg-primary-50' : 'bg-white'"
										@click="openEvent(event.id)"
									>
										<div class="flex flex-wrap items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex flex-wrap items-center gap-2">
													<UBadge :color="getScopeColor(event.scope)" variant="soft" :label="event.scope" />
													<UBadge :color="getResultColor(event.result)" variant="soft" :label="event.result" />
													<span class="text-xs text-stone-400">{{ formatDate(event.occurred_at) }}</span>
												</div>
												<p class="mt-2 text-sm font-semibold text-stone-900">
													{{ event.action }}
													<span class="font-normal text-stone-500">· {{ event.entity_type }}</span>
												</p>
												<p class="mt-1 text-sm text-stone-500">
													{{ event.actor_name || event.actor_user_id || "ไม่ระบุผู้กระทำ" }}
													<span v-if="event.entity_id">· {{ event.entity_id }}</span>
													<span v-if="event.request_id">· {{ event.request_id }}</span>
												</p>
											</div>
											<UIcon name="i-heroicons-chevron-right-20-solid" class="h-5 w-5 shrink-0 text-stone-300" />
										</div>
									</button>
								</div>
							</div>

							<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
								<div class="flex items-center justify-between gap-2 text-xs text-stone-500 sm:text-sm">
									<div>{{ numberFormatter.format(events.length) }} events</div>
									<div>{{ numberFormatter.format(successCount) }} success • {{ numberFormatter.format(failedCount) }} failed</div>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				title="รายละเอียดกิจกรรม"
				description="ตรวจข้อมูลก่อน-หลัง และ metadata ของเหตุการณ์นี้"
				desktop-width="460px"
				close-button-size="md"
				compact-header
				panel-z-class="z-[59]"
				backdrop-z-class="z-[58]"
				content-class="flex h-full flex-col overflow-hidden px-0 py-0"
				@close="closeEvent"
			>
				<template v-if="selectedEvent">
					<div class="flex h-full min-h-0 flex-col">
						<div class="scrollbar-soft min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-5">
							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<div class="flex items-start gap-3">
									<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
										<UIcon name="i-heroicons-clipboard-document-check" class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-base font-semibold text-stone-950">{{ selectedEvent.action }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedEvent.entity_type }}<span v-if="selectedEvent.entity_id"> · {{ selectedEvent.entity_id }}</span></p>
											</div>
											<UBadge :color="getResultColor(selectedEvent.result)" variant="soft" :label="selectedEvent.result" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="getScopeColor(selectedEvent.scope)" variant="soft" :label="selectedEvent.scope" />
											<UBadge color="neutral" variant="soft" :label="selectedEvent.actor_role || 'ไม่ระบุ role'" />
											<UBadge color="neutral" variant="soft" :label="formatDate(selectedEvent.occurred_at)" />
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">Actor</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedEvent.actor_name || selectedEvent.actor_user_id || "-" }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">Request ID</dt>
										<dd class="max-w-[220px] break-all text-right font-medium text-stone-900">{{ selectedEvent.request_id || "-" }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">IP Address</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedEvent.ip_address || "-" }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4">
										<dt class="text-stone-500">Reason</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedEvent.reason_code || "-" }}</dd>
									</div>
								</dl>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">Metadata</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.metadata) }}</pre>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">Before</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.before) }}</pre>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">After</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-md border border-neutral-200 bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.after) }}</pre>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>
		</template>
	</AppSidebarShell>
</template>

<style scoped>
@keyframes activity-loading-slide {
	0% { transform: translateX(-120%); }
	100% { transform: translateX(420%); }
}

.activity-loading-line {
	animation: activity-loading-slide 1.2s linear infinite;
	will-change: transform;
}
</style>
