<script setup lang="ts">
import { resolveApiErrorMessage } from "~/utils/api-errors";
import type { KitchenRound } from "~/composables/useKitchenQueue";

// Its own page rather than a tab: this is opened on a tablet in the kitchen and
// left running all service, where the till's toolbars are noise and the only
// interaction is one large button per ticket.
const { apiFetch } = useApiClient();
const { currentStoreId } = useAuthSession();
const { t } = useI18n();
const route = useRoute();
const toast = useAppToast();

// One screen per station: the grill tablet opens /kitchen?station=<id> and never
// reads the bar's drinks.
const stationId = computed(() => String(route.query.station || ""));
const { cooking, pending, error, load } = useKitchenQueue(currentStoreId, { stationId });

const markingId = ref("");
const now = ref(Date.now());
// A ticket ticked off by mistake is the one thing that cannot be undone from in
// here, so it is held back for a few seconds before it really goes.
const undoRound = ref<KitchenRound | null>(null);
const undoSecondsLeft = ref(0);
let undoTimer: ReturnType<typeof setInterval> | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
const UNDO_SECONDS = 10;

// Oldest first: the ticket that has been waiting longest is the one to cook next.
const queue = computed(() => [ ...cooking.value ]
	.filter((round) => round.queue_id !== undoRound.value?.queue_id)
	.sort((left, right) => left.sent_at.localeCompare(right.sent_at)));
const activeStationName = computed(() => queue.value[0]?.station_name || cooking.value[0]?.station_name || "");

function label(round: KitchenRound) {
	return round.service_mode === "pickup"
		? `${t("posPanels.queue")} ${String(round.queue_no || "-").replace(/^[A-Za-z]+/, "").padStart(3, "0")}`
		: [ round.zone_name, round.table_name ].filter(Boolean).join(" · ") || t("restaurantPos.table");
}

function waited(round: KitchenRound) {
	const minutes = Math.max(0, Math.floor((now.value - new Date(round.sent_at).getTime()) / 60000));
	return minutes < 60 ? t("pickupQueueHistory.minutes", { count: minutes }) : t("pickupQueueHistory.hoursMinutes", { hours: Math.floor(minutes / 60), minutes: minutes % 60 });
}

// A ticket nobody has picked up in a quarter of an hour is the one the floor is
// about to be asked about, so it stops looking like all the others.
function isLate(round: KitchenRound) {
	return now.value - new Date(round.sent_at).getTime() > 15 * 60 * 1000;
}
function isWarning(round: KitchenRound) {
	const age = now.value - new Date(round.sent_at).getTime();
	return age > 10 * 60 * 1000 && age <= 15 * 60 * 1000;
}

async function setDone(round: KitchenRound, done: boolean) {
	if (!currentStoreId.value) return;
	await apiFetch(`/pos/restaurant/kitchen-queue/${encodeURIComponent(round.id)}/done`, {
		method: "POST", body: { store_id: currentStoreId.value, done, station_id: round.station_id },
	});
}

function clearUndo() {
	if (undoTimer) clearInterval(undoTimer);
	undoTimer = null;
	undoRound.value = null;
	undoSecondsLeft.value = 0;
}

async function markDone(round: KitchenRound) {
	if (markingId.value || !currentStoreId.value) return;
	markingId.value = round.queue_id;
	// Anything already waiting on undo is committed now: only one ticket is ever
	// held back, so the second tap settles the first.
	clearUndo();
	try {
		await setDone(round, true);
		undoRound.value = round;
		undoSecondsLeft.value = UNDO_SECONDS;
		undoTimer = setInterval(() => {
			undoSecondsLeft.value -= 1;
			if (undoSecondsLeft.value <= 0) clearUndo();
		}, 1000);
	} catch (markError) {
		toast.error({ title: t("kitchenQueue.markFailed"), description: resolveApiErrorMessage(markError) });
		await load(true);
	} finally {
		markingId.value = "";
	}
}

async function undo() {
	const round = undoRound.value;
	if (!round) return;
	clearUndo();
	try {
		await setDone(round, false);
		await load(true);
	} catch (undoError) {
		toast.error({ title: t("kitchenQueue.markFailed"), description: resolveApiErrorMessage(undoError) });
	}
}

onMounted(() => {
	ticker = setInterval(() => { now.value = Date.now(); }, 30_000);
});
onBeforeUnmount(() => {
	if (ticker) clearInterval(ticker);
	clearUndo();
});
</script>

<template>
	<div class="min-h-screen bg-stone-100 px-3 py-3 sm:px-5 sm:py-4">
		<div class="mx-auto w-full max-w-[1680px]">
		<header class="sticky top-0 z-20 -mx-3 mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-stone-200 bg-stone-100/95 px-3 pb-3 backdrop-blur sm:-mx-5 sm:px-5">
			<div>
				<h1 class="flex flex-wrap items-baseline gap-x-2 text-2xl font-black tracking-tight text-stone-950 sm:text-3xl">
					{{ t("kitchenQueue.title") }}
					<span v-if="activeStationName" class="text-lg font-bold text-emerald-700 sm:text-xl">· {{ activeStationName }}</span>
				</h1>
				<p class="mt-0.5 hidden text-sm text-stone-500 sm:block">{{ t("kitchenQueue.subtitle") }}</p>
			</div>
			<div class="flex items-center gap-2">
				<UBadge :color="queue.length ? 'warning' : 'success'" variant="soft" size="lg" class="min-h-10 px-3 text-sm font-bold">{{ t("kitchenQueue.waiting", { count: queue.length }) }}</UBadge>
				<AppButton class="min-h-10" color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="pending" @click="load(true)">{{ t("kitchenQueue.refresh") }}</AppButton>
			</div>
		</header>

		<UAlert v-if="error" class="mb-3" color="error" variant="soft" icon="i-heroicons-exclamation-triangle" :title="error" />

		<!-- Sits above the list, not inside it: the ticket it belongs to has already
		     gone, and the way back has to be findable without hunting. -->
		<div v-if="undoRound" class="mb-3 flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-300 bg-white px-4 py-3 shadow-sm">
			<p class="text-sm font-semibold text-stone-900">
				{{ t("kitchenQueue.markedDone", { label: label(undoRound) }) }}
				<span class="ml-1 font-normal text-stone-500">{{ undoSecondsLeft }}s</span>
			</p>
			<AppButton color="neutral" variant="solid" icon="i-heroicons-arrow-uturn-left" @click="undo">{{ t("kitchenQueue.undo") }}</AppButton>
		</div>

		<div v-if="!queue.length" class="flex min-h-[65vh] flex-col items-center justify-center rounded-xl border-2 border-dashed border-stone-300 bg-white text-center shadow-sm">
			<UIcon name="i-heroicons-check-circle" class="size-14 text-emerald-500" />
			<p class="mt-3 text-xl font-semibold text-stone-900">{{ t("kitchenQueue.empty") }}</p>
			<p class="mt-1 text-sm text-stone-500">{{ t("kitchenQueue.emptyHint") }}</p>
		</div>

		<div v-else class="grid grid-cols-1 items-start gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
			<article
				v-for="round in queue"
				:key="round.queue_id"
				class="flex min-h-[280px] flex-col overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-shadow hover:shadow-md"
				:class="isLate(round) ? 'border-red-500' : isWarning(round) ? 'border-amber-400' : 'border-stone-200'"
			>
				<header class="flex items-start justify-between gap-3 border-b px-4 py-3.5" :class="isLate(round) ? 'border-red-200 bg-red-50' : isWarning(round) ? 'border-amber-200 bg-amber-50' : 'border-stone-200 bg-stone-50'">
					<div class="min-w-0">
						<p class="truncate text-3xl font-black leading-none tracking-tight text-stone-950">{{ label(round) }}</p>
						<p class="mt-2 text-xs font-medium text-stone-500">{{ t("posPanels.round", { round: round.round_no }) }} · {{ round.order_no }}</p>
						<p v-if="round.station_name" class="mt-1 text-xs font-semibold text-emerald-700">{{ round.station_name }}</p>
					</div>
					<p class="shrink-0 rounded-lg px-2.5 py-1.5 text-sm font-bold tabular-nums" :class="isLate(round) ? 'bg-red-100 text-red-700' : isWarning(round) ? 'bg-amber-100 text-amber-800' : 'bg-white text-stone-600 shadow-sm ring-1 ring-stone-200'">{{ waited(round) }}</p>
				</header>
				<ul class="flex-1 divide-y divide-stone-100">
					<li v-for="(item, index) in round.items" :key="index" class="flex items-start justify-between gap-4 px-4 py-3.5">
						<div class="min-w-0">
							<p class="text-xl font-bold leading-tight text-stone-950">{{ item.name }}</p>
							<p v-if="item.station_name && !stationId" class="text-xs text-stone-400">{{ item.station_name }}</p>
							<p v-if="item.note" class="mt-0.5 text-sm font-medium text-amber-700">{{ item.note }}</p>
						</div>
						<span class="shrink-0 rounded-lg bg-stone-950 px-3 py-1.5 text-xl font-black tabular-nums text-white">× {{ item.qty }}</span>
					</li>
				</ul>
				<footer class="border-t border-stone-100 p-3.5">
					<AppButton block size="xl" class="min-h-16 touch-manipulation text-lg font-black" color="success" variant="solid" icon="i-heroicons-check" :loading="markingId === round.queue_id" :disabled="Boolean(markingId)" @click="markDone(round)">
						{{ t("kitchenQueue.markDone") }}
					</AppButton>
				</footer>
			</article>
		</div>
		</div>
	</div>
</template>
