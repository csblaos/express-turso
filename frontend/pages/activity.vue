<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { formatAppDateTime } from "~/utils/date-format";

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
	related_order_no: string | null;
	related_queue_no: string | null;
	related_table_name: string | null;
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

type AuditEventListResponse = {
	items: ApiAuditEvent[];
	page: number;
	limit: number;
	total: number;
	has_more: boolean;
};

const { apiFetch } = useApiClient();
const { t, locale } = useI18n();
const appLocale = computed(() => locale.value as "th" | "lo" | "en");

const searchQuery = ref("");
const activeScope = ref("all");
const activeResult = ref("all");
const activeEntityType = ref("all");
const events = ref<ApiAuditEvent[]>([]);
const pending = ref(true);
const error = ref<string | null>(null);
const currentPage = ref(1);
const pageSize = ref(20);
const pageSizeOptions = [ 10, 20, 50 ];
const totalEvents = ref(0);
const selectedEventId = ref("");
const detailOpen = ref(false);

const numberFormatter = new Intl.NumberFormat("th-TH");
let loadTimer: ReturnType<typeof setTimeout> | null = null;

const scopeOptions = computed(() => [
	{ id: "all", label: t("activityPage.allAreas") },
	...Array.from(new Set(events.value.map((event) => event.scope))).map((scope) => ({
		id: scope,
		label: scope === "store" ? t("activityPage.storeArea") : scope === "system" ? t("activityPage.systemArea") : scope,
	})),
]);

const entityTypeOptions = computed(() => [
	{ id: "all", label: t("activityPage.allTypes") },
	...Array.from(new Set(events.value.map((event) => event.entity_type))).map((entityType) => ({
		id: entityType,
		label: entityLabels.value[entityType] || entityType,
	})),
]);

const resultOptions = computed(() => [
	{ id: "all", label: t("activityPage.allResults") },
	{ id: "success", label: t("activityPage.success") },
	{ id: "failed", label: t("activityPage.failed") },
]);

const selectedEvent = computed(() =>
	events.value.find((event) => event.id === selectedEventId.value)
	?? events.value[0]
	?? null,
);

const successCount = computed(() => events.value.filter((event) => event.result === "success").length);
const failedCount = computed(() => events.value.filter((event) => event.result === "failed").length);
const totalPages = computed(() => Math.max(1, Math.ceil(totalEvents.value / pageSize.value)));
const pageLabel = computed(() => t("activityPage.page", { page: currentPage.value, total: totalPages.value }));
const pageStart = computed(() => (
	totalEvents.value === 0
		? 0
		: ((currentPage.value - 1) * pageSize.value) + 1
));
const pageEnd = computed(() => Math.min(currentPage.value * pageSize.value, totalEvents.value));
const pageSummaryText = computed(() => (
	totalEvents.value === 0
		? t("activityPage.noData")
		: t("activityPage.itemsRange", { start: pageStart.value, end: pageEnd.value, total: totalEvents.value })
));

const actionLabels = computed<Record<string, string>>(() => ({
	"pos.checkout": t("activityPage.actions.checkout"), "pos.restaurant.open": t("activityPage.actions.openTable"),
	"pos.restaurant.send_kitchen": t("activityPage.actions.sendKitchen"), "pos.restaurant.checkout": t("activityPage.actions.tableCheckout"),
	"pos.restaurant.cancel_order": t("activityPage.actions.cancelOrder"), "pos.pickup.collected": t("activityPage.actions.collected"),
	"product.create": t("activityPage.actions.createProduct"), "product.update": t("activityPage.actions.updateProduct"),
	"inventory.adjust": t("activityPage.actions.adjustStock"), "promotion.create": t("activityPage.actions.createPromotion"),
	"promotion.update": t("activityPage.actions.updatePromotion"),
}));

const entityLabels = computed<Record<string, string>>(() => ({
	order: t("activityPage.entities.order"), product: t("activityPage.entities.product"),
	inventory: t("activityPage.entities.inventory"), promotion: t("activityPage.entities.promotion"),
	store: t("activityPage.entities.store"), user: t("activityPage.entities.user"),
}));

function actionLabel(action: string) {
	return actionLabels.value[action] || action.split(".").join(" › ");
}

function entityLabel(entity: string) {
	return entityLabels.value[entity] || entity;
}

function resultLabel(result: string) {
	if (result === "success") return t("activityPage.success");
	if (result === "failed") return t("activityPage.failed");
	if (result === "warning") return t("activityPage.warning");
	if (result === "pending") return t("activityPage.pending");
	return result;
}

function actorLabel(event: ApiAuditEvent) {
	return event.actor_name || t("activityPage.storeSystem");
}

function actorInitial(event: ApiAuditEvent) {
	return actorLabel(event).trim().charAt(0).toUpperCase() || "S";
}

function relatedLabel(event: ApiAuditEvent) {
	if (event.related_table_name) return t("activityPage.tableRef", { value: event.related_table_name });
	if (event.related_queue_no) {
		const queueNumber = event.related_queue_no.replace(/^Q/i, "");
		return t("activityPage.queueRef", { value: queueNumber });
	}
	if (event.related_order_no) return t("activityPage.orderRef", { value: event.related_order_no });
	return entityLabel(event.entity_type);
}

const eventsListScrollRef = ref<HTMLElement | null>(null);

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
		currentPage.value = 1;
		scrollEventsListToTop();
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
		params.set("page", String(currentPage.value));
		params.set("limit", String(pageSize.value));

		const queryString = params.toString();
		const response = await apiFetch<ApiEnvelope<AuditEventListResponse>>(
			`/audit-events${queryString ? `?${queryString}` : ""}`,
		);
		events.value = response.data.items;
		totalEvents.value = response.data.total;
		const maxPage = Math.max(1, Math.ceil(response.data.total / pageSize.value));
		if (currentPage.value > maxPage) {
			currentPage.value = maxPage;
			void loadEvents();
			return;
		}
		await nextTick();
		scrollEventsListToTop();
	} catch {
		// Keep user-facing alerts localized and avoid exposing raw API/network text.
		error.value = t("activityPage.loadFailed");
	} finally {
		pending.value = false;
	}
}

function goToPage(page: number) {
	const normalizedPage = Math.max(1, Math.min(page, totalPages.value));
	if (normalizedPage === currentPage.value || pending.value) return;
	currentPage.value = normalizedPage;
	scrollEventsListToTop();
	void loadEvents();
}

function updatePageSize(value: string) {
	const normalizedSize = Number(value);
	if (!Number.isFinite(normalizedSize) || normalizedSize <= 0 || normalizedSize === pageSize.value) return;
	pageSize.value = normalizedSize;
	currentPage.value = 1;
	scrollEventsListToTop();
	void loadEvents();
}

function openEvent(eventId: string) {
	selectedEventId.value = eventId;
	detailOpen.value = true;
}

function closeEvent() {
	detailOpen.value = false;
}

function formatDate(value: string) {
	return formatAppDateTime(value, appLocale.value);
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

function scrollEventsListToTop() {
	eventsListScrollRef.value?.scrollTo({
		top: 0,
		behavior: "auto",
	});
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['activity']"
		sidebar-eyebrow="Activity"
		:sidebar-title="t('nav.activity')"
		sidebar-compact-title="LOG"
		:sidebar-description="t('activityPage.historyHint')"
	>
		<template #default="{ openSidebar }">
			<div class="grid gap-3 pb-3 lg:gap-4">
				<AppPageHeader
					class="block"
					:title-badge="false"
					compact
					@menu="openSidebar"
				>
					<template #default>
						<div class="pt-0.5 sm:pt-1">
							<div class="relative w-full min-w-0">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
				:placeholder="t('activityPage.search')"
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
						</div>
					</template>
				</AppPageHeader>

				<div class="grid grid-cols-3 gap-2 lg:pr-1">
					<div class="rounded-md border border-neutral-200 bg-white p-3 text-center">
					<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ t('activityPage.total') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(totalEvents) }}</p>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-3 text-center">
					<p class="text-[11px] font-semibold tracking-[0.08em] text-stone-400">{{ t('activityPage.successOnPage') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(successCount) }}</p>
					</div>
					<div class="rounded-md border border-neutral-200 bg-white p-3 text-center">
					<p class="text-[11px] font-semibold tracking-[0.08em] text-stone-400">{{ t('activityPage.reviewOnPage') }}</p>
						<p class="mt-1 text-xl font-semibold text-stone-950">{{ numberFormatter.format(failedCount) }}</p>
					</div>
				</div>

				<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
						<div>
							<p class="text-sm font-semibold text-stone-950">{{ t('activityPage.filters') }}</p>
						</div>
						<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
							{{ t('common.itemCount', { count: numberFormatter.format(totalEvents) }) }}
						</div>
					</div>

					<div class="grid gap-2 px-4 py-3">
						<div class="grid grid-cols-2 gap-2 md:grid-cols-[minmax(0,1fr)_minmax(220px,0.6fr)] md:items-end">
							<div class="min-w-0">
								<label class="mb-1 block text-[11px] font-medium text-stone-500" for="activity-scope-select">
									{{ t('activityPage.area') }}
								</label>
								<div class="relative">
									<select
										id="activity-scope-select"
										v-model="activeScope"
										class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
										<option v-for="option in scopeOptions" :key="option.id" :value="option.id">
											{{ option.label }}
										</option>
									</select>
									<UIcon
										name="i-heroicons-chevron-up-down"
										class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
									/>
								</div>
							</div>

							<div class="min-w-0">
								<label class="mb-1 block text-[11px] font-medium text-stone-500" for="activity-entity-select">
									{{ t('activityPage.dataType') }}
								</label>
								<div class="relative">
									<select
										id="activity-entity-select"
										v-model="activeEntityType"
										class="w-full appearance-none rounded-md border border-neutral-200 bg-white px-4 py-2.5 pr-10 text-sm font-medium text-stone-800 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
									>
										<option v-for="option in entityTypeOptions" :key="option.id" :value="option.id">
											{{ option.label }}
										</option>
									</select>
									<UIcon
										name="i-heroicons-arrows-up-down"
										class="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400"
									/>
								</div>
							</div>
						</div>

						<div class="scrollbar-hidden md:scrollbar-soft flex flex-nowrap gap-2 overflow-x-auto pb-1">
							<AppButton
								v-for="option in resultOptions"
								:key="option.id"
								:color="activeResult === option.id ? 'primary' : 'neutral'"
								:variant="activeResult === option.id ? 'solid' : 'soft'"
								size="md"
								class="shrink-0 whitespace-nowrap rounded-md"
								@click="activeResult = option.id"
							>
								{{ option.label }}
							</AppButton>
						</div>
					</div>
				</div>

					<div class="overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
							<div class="flex h-full min-h-0 flex-col">
								<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
									<div>
										<p class="text-sm font-semibold text-stone-950">{{ t('activityPage.history') }}</p>
										<p class="mt-1 hidden text-xs text-stone-500 lg:block">{{ t('activityPage.historyHint') }}</p>
									</div>
									<div class="flex items-center gap-2">
										<AppButton
											color="neutral"
											variant="soft"
											size="md"
											icon="i-heroicons-arrow-path-20-solid"
											class="w-10 justify-center rounded-md px-0 sm:w-auto sm:px-3"
											:loading="pending"
											:disabled="pending"
											:spin-icon-on-loading="true"
											@click="loadEvents"
										>
											<span class="hidden sm:inline">{{ t('activityPage.reload') }}</span>
										</AppButton>
										<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
											{{ pageSummaryText }}
										</div>
									</div>
								</div>

							<div ref="eventsListScrollRef" class="min-h-0 flex-1 overflow-auto pb-[calc(4rem+env(safe-area-inset-bottom))]">
								<div v-if="pending" class="min-h-[280px]">
									<div class="overflow-hidden bg-neutral-100">
										<div class="activity-loading-line h-[2px] w-1/3 rounded-r-full bg-primary" />
									</div>
								</div>
								<div v-else-if="error" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center">
									<div class="space-y-3">
										<p class="text-sm text-stone-600">{{ error }}</p>
									<AppButton color="primary" variant="soft" size="md" class="rounded-md" @click="loadEvents">{{ t('common.retry') }}</AppButton>
									</div>
								</div>
								<div v-else-if="!events.length" class="flex h-full min-h-[280px] items-center justify-center px-4 text-center text-stone-500">
									{{ t('activityPage.noActivity') }}
								</div>
								<div v-else>
									<div class="overflow-x-auto">
										<table class="min-w-[860px] w-full border-separate border-spacing-0">
											<thead class="sticky top-0 z-10 bg-[#fcfbf8] dark:bg-[#221d18]">
												<tr>
															<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.16em] text-stone-400 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-500">{{ t('activityPage.time') }}</th>
															<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-stone-400 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-500">{{ t('activityPage.activity') }}</th>
															<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-stone-400 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-500">{{ t('activityPage.operator') }}</th>
															<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-stone-400 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-500">{{ t('activityPage.relatedData') }}</th>
															<th class="border-b border-[#ece6dc] bg-[#fcfbf8] px-4 py-3 text-left text-xs font-semibold tracking-[0.08em] text-stone-400 dark:border-[#3a332a] dark:bg-[#221d18] dark:text-stone-500">{{ t('activityPage.result') }}</th>
												</tr>
											</thead>
											<tbody>
												<tr
													v-for="event in events"
													:key="event.id"
													class="cursor-pointer bg-white transition hover:bg-primary-50"
													:class="selectedEvent?.id === event.id ? 'bg-primary-50' : ''"
													@click="openEvent(event.id)"
												>
														<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
															{{ formatDate(event.occurred_at) }}
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
															<p class="text-sm font-semibold text-stone-900">{{ actionLabel(event.action) }}</p>
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
															<div class="flex items-center gap-2.5">
																<div class="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xs font-semibold text-primary-700 ring-1 ring-primary-100">{{ actorInitial(event) }}</div>
																<div>
																	<p class="text-sm font-medium text-stone-900">{{ actorLabel(event) }}</p>
																</div>
															</div>
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-3 align-top text-sm text-stone-500">
															<p class="font-medium text-stone-800">{{ relatedLabel(event) }}</p>
															<p class="mt-1 text-xs text-stone-400">{{ t('activityPage.clickDetails') }}</p>
														</td>
														<td class="border-b border-[#f1ede6] px-4 py-3 align-top">
															<UBadge :color="getResultColor(event.result)" variant="soft" :label="resultLabel(event.result)" />
														</td>
												</tr>
											</tbody>
										</table>
									</div>
								</div>
							</div>

							<div class="sticky bottom-0 z-10 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.96)] px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm">
								<div class="flex flex-col gap-2.5 sm:gap-3 md:flex-row md:items-center md:justify-between">
									<div class="flex items-center justify-between gap-3 md:min-w-0 md:flex-1">
										<div class="min-w-0 text-xs text-stone-500 sm:text-sm">
											<span class="sm:hidden">{{ pageSummaryText }}</span>
											<span class="hidden sm:inline">{{ pageLabel }} • {{ pageSummaryText }}</span>
										</div>
										<div class="shrink-0 rounded-md bg-neutral-100 px-2.5 py-1 text-[11px] font-medium text-stone-600 sm:hidden">
											{{ pageLabel }}
										</div>
									</div>

									<div class="flex items-center justify-between gap-2 sm:flex-wrap sm:justify-end md:flex-nowrap md:justify-end">
										<div class="flex items-center gap-2">
											<label class="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">{{ t('activityPage.perPage') }}</label>
											<select
												:value="pageSize"
												class="min-w-[68px] rounded-md border border-neutral-200 bg-white px-2.5 py-2 text-sm text-stone-700 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200"
												@change="updatePageSize(($event.target as HTMLSelectElement).value)"
											>
												<option v-for="option in pageSizeOptions" :key="option" :value="option">
													{{ option }}
												</option>
											</select>
										</div>

										<div class="flex items-center gap-2">
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												icon="i-heroicons-chevron-left-20-solid"
												:disabled="currentPage <= 1 || pending"
												:aria-label="t('activityPage.previous')"
												:title="t('activityPage.previous')"
												@click="goToPage(currentPage - 1)"
											>
												<span class="hidden sm:inline">{{ t('activityPage.previous') }}</span>
											</AppButton>
											<AppButton
												color="neutral"
												variant="soft"
												size="md"
												class="rounded-md"
												trailing-icon="i-heroicons-chevron-right-20-solid"
												:disabled="currentPage >= totalPages || pending"
												:aria-label="t('activityPage.next')"
												:title="t('activityPage.next')"
												@click="goToPage(currentPage + 1)"
											>
												<span class="hidden sm:inline">{{ t('activityPage.next') }}</span>
											</AppButton>
										</div>
									</div>
								</div>
							</div>
						</div>
				</div>
			</div>

			<Teleport to="body">
			<AppResponsivePanel
				v-model="detailOpen"
				:title="t('activityPage.details')"
				:description="t('activityPage.detailsHint')"
				desktop-width="680px"
				close-button-size="md"
				compact-header
				panel-z-class="z-[170]"
				backdrop-z-class="z-[160]"
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
												<h3 class="truncate text-base font-semibold text-stone-950">{{ actionLabel(selectedEvent.action) }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ relatedLabel(selectedEvent) }}</p>
											</div>
											<UBadge :color="getResultColor(selectedEvent.result)" variant="soft" :label="resultLabel(selectedEvent.result)" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="getScopeColor(selectedEvent.scope)" variant="soft" :label="selectedEvent.scope === 'store' ? t('activityPage.storeArea') : t('activityPage.systemArea')" />
											<UBadge color="neutral" variant="soft" :label="formatDate(selectedEvent.occurred_at)" />
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
								<h3 class="text-sm font-semibold text-stone-950">{{ t('activityPage.mainSummary') }}</h3>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ t('activityPage.operator') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ actorLabel(selectedEvent) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ t('activityPage.activity') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ actionLabel(selectedEvent.action) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ t('activityPage.dataType') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ entityLabel(selectedEvent.entity_type) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">{{ t('activityPage.relatedData') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ relatedLabel(selectedEvent) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4">
										<dt class="text-stone-500">{{ t('activityPage.result') }}</dt>
										<dd class="text-right font-medium text-stone-900">{{ resultLabel(selectedEvent.result) }}</dd>
									</div>
								</dl>
							</div>
						</div>
					</div>
				</template>
			</AppResponsivePanel>
			</Teleport>
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
