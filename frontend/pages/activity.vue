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

const runtimeConfig = useRuntimeConfig();
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

	if (!value.some((event) => event.id === selectedEventId.value)) {
		selectedEventId.value = value[0].id;
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
	if (result === "success") return "green";
	if (result === "failed") return "red";
	if (result === "warning") return "orange";
	return "gray";
}

function getScopeColor(scope: string) {
	if (scope === "system") return "orange";
	if (scope === "store") return "green";
	if (scope === "inventory") return "blue";
	return "gray";
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
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<AppPageHeader
					title="กิจกรรมระบบ"
					description="แนะนำใช้ชื่อเมนู `กิจกรรม` ใน sidebar เพราะสั้นกว่า Audit Log แต่ยังครอบทั้ง audit events และ activity feed ได้ดี"
					@menu="openSidebar"
				>
					<template #badges>
						<UBadge color="orange" variant="soft" label="กิจกรรม" />
						<UBadge color="gray" variant="soft" :label="`${numberFormatter.format(events.length)} events`" />
					</template>

					<div class="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto_auto]">
							<div class="relative">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
									placeholder="ค้นหาจาก actor, action, entity, request id"
									class="w-full rounded-2xl border border-[#e7e4dd] bg-white py-3 pl-11 pr-10 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
								>
								<button
									v-if="searchQuery"
									type="button"
									class="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-[#f5f5f4] hover:text-stone-700"
									@click="searchQuery = ''"
								>
									<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
								</button>
							</div>

							<select v-model="activeScope" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option v-for="option in scopeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
							</select>

							<select v-model="activeResult" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option v-for="option in resultOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
							</select>
						</div>

						<div class="grid gap-3 sm:grid-cols-3">
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">ทั้งหมด</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(events.length) }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">สำเร็จ</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(successCount) }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Actors</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ numberFormatter.format(uniqueActors) }}</p>
							</div>
						</div>
				</AppPageHeader>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
						<UCard v-if="pending" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
							<div class="py-12 text-center text-sm text-stone-500">กำลังโหลดกิจกรรม…</div>
						</UCard>

						<UCard v-else-if="error" class="border border-dashed border-[#f1c7c0] bg-[#fff7f5] shadow-none">
							<div class="space-y-3 py-10 text-center">
								<p class="text-sm text-stone-600">{{ error }}</p>
								<UButton color="orange" variant="soft" @click="loadEvents">ลองใหม่</UButton>
							</div>
						</UCard>

						<div v-else-if="events.length" class="space-y-3">
							<div class="mb-3 flex items-center justify-between">
								<div class="flex items-center gap-2">
									<p class="text-sm font-semibold text-stone-900">รายการกิจกรรม</p>
									<select v-model="activeEntityType" class="rounded-xl border border-[#e7e4dd] bg-white px-3 py-2 text-xs text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
										<option v-for="option in entityTypeOptions" :key="option.id" :value="option.id">{{ option.label }}</option>
									</select>
								</div>
								<p class="text-xs text-stone-400">คลิกการ์ดเพื่อดูรายละเอียด</p>
							</div>

							<button
								v-for="event in events"
								:key="event.id"
								type="button"
								class="w-full rounded-2xl border bg-white p-4 text-left shadow-sm transition hover:shadow-md"
								:class="selectedEvent?.id === event.id ? 'border-[#efd7c6] ring-1 ring-[#efd7c6]' : 'border-[#e7e4dd]'"
								@click="openEvent(event.id)"
							>
								<div class="flex flex-wrap items-start justify-between gap-3">
									<div class="min-w-0">
										<div class="flex flex-wrap items-center gap-2">
											<UBadge :color="getScopeColor(event.scope)" variant="soft" :label="event.scope" />
											<UBadge :color="getResultColor(event.result)" variant="soft" :label="event.result" />
											<span class="text-xs text-stone-400">{{ formatDate(event.occurred_at) }}</span>
										</div>
										<p class="mt-3 text-sm font-semibold text-stone-900">
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

						<UCard v-else class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
							<div class="space-y-3 py-12 text-center">
								<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-stone-400 ring-1 ring-[#e7e4dd]">
									<UIcon name="i-heroicons-clipboard-document-check" class="h-6 w-6" />
								</div>
								<div>
									<p class="text-sm font-medium text-stone-900">ยังไม่มี audit event</p>
									<p class="mt-1 text-sm text-stone-500">เมื่อระบบเริ่มบันทึกกิจกรรมสำคัญ รายการจะมาแสดงที่หน้านี้</p>
								</div>
							</div>
						</UCard>
				</div>
			</div>

			<AppResponsivePanel
				v-model="detailOpen"
				desktop-width="460px"
				panel-z-class="z-[59]"
				backdrop-z-class="z-[58]"
				panel-class="bg-[#fffefd]"
				content-class="p-4 text-stone-900"
				@close="closeEvent"
			>
				<template v-if="selectedEvent" #default="{ close }">
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)]">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Audit detail</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">รายละเอียดกิจกรรม</h2>
								</div>
								<UButton
									color="gray"
									variant="soft"
									size="xs"
									icon="i-heroicons-x-mark-20-solid"
									aria-label="ปิดรายละเอียดกิจกรรม"
									title="ปิดรายละเอียดกิจกรรม"
									@click="close"
								/>
							</div>

							<div class="mt-4 rounded-[24px] bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start gap-3">
									<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
										<UIcon name="i-heroicons-clipboard-document-check" class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-lg font-semibold text-stone-950">{{ selectedEvent.action }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedEvent.entity_type }}<span v-if="selectedEvent.entity_id"> · {{ selectedEvent.entity_id }}</span></p>
											</div>
											<UBadge :color="getResultColor(selectedEvent.result)" variant="soft" :label="selectedEvent.result" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="getScopeColor(selectedEvent.scope)" variant="soft" :label="selectedEvent.scope" />
											<UBadge color="gray" variant="soft" :label="selectedEvent.actor_role || 'ไม่ระบุ role'" />
											<UBadge color="gray" variant="soft" :label="formatDate(selectedEvent.occurred_at)" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto py-4 pr-1">
							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
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

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<h3 class="text-sm font-semibold text-stone-950">Metadata</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-2xl border border-[#e7e4dd] bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.metadata) }}</pre>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<h3 class="text-sm font-semibold text-stone-950">Before</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-2xl border border-[#e7e4dd] bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.before) }}</pre>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<h3 class="text-sm font-semibold text-stone-950">After</h3>
								<pre class="mt-4 max-h-48 overflow-auto rounded-2xl border border-[#e7e4dd] bg-white p-4 text-xs leading-6 text-stone-700">{{ stringifyBlock(selectedEvent.after) }}</pre>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>

		</template>
	</AppSidebarShell>
</template>
