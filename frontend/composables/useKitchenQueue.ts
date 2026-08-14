export type KitchenItem = { name: string; qty: number; note: string | null; is_gift: number; station_id: string | null; station_name: string | null };
export type KitchenRound = {
	id: string; queue_id: string; round_no: number; sent_at: string; kitchen_status: string; kitchen_done_at: string | null;
	station_id: string | null; station_name: string | null;
	station_total: number; station_done: number;
	order_id: string; order_no: string; service_mode: string; queue_no: string | null; payment_status: string;
	table_name: string | null; zone_name: string | null; items: KitchenItem[];
};
type Envelope = { data: { revision: number; unchanged: boolean; rounds: KitchenRound[] } };

// Used only while realtime is unavailable. A fallback poll sends the revision it
// last saw so the server can answer unchanged requests without touching Turso.
const POLL_INTERVAL_MS = 10_000;
// During fallback polling, periodically bypass the revision optimization so the
// client also reconciles any server-side time-window behavior.
const FULL_REFRESH_MS = 60_000;
const READY_WINDOW_MS = 6 * 60 * 60 * 1000;
const STALE_ROUND_MS = 6 * 60 * 60 * 1000;

export function useKitchenQueue(
	storeId: Ref<string | undefined | null>,
	options: {
		stationId?: Ref<string>;
		enabled?: Ref<boolean>;
		/** Left at the poll interval for a kitchen screen: an empty kitchen is
		 * exactly when a cook is standing there watching for the next ticket. A
		 * till only wants a badge, so it can afford to look less often. */
		idleIntervalMs?: number;
		onReady?: (rounds: KitchenRound[]) => void;
		onChanged?: (rounds: KitchenRound[]) => void;
	} = {},
) {
	const { apiFetch } = useApiClient();
	const realtime = useKitchenRealtime();
	const storedRounds = ref<KitchenRound[]>([]);
	const pending = ref(false);
	const error = ref("");
	const revision = ref(0);
	const active = ref(false);
	let timer: ReturnType<typeof setTimeout> | null = null;
	let sequence = 0;
	let lastFullLoadAt = 0;
	let knownReady = new Set<string>();
	let primed = false;
	let stopRealtime: (() => void) | null = null;
	let realtimeLoadTimer: ReturnType<typeof setTimeout> | null = null;
	let clockTimer: ReturnType<typeof setInterval> | null = null;
	const clock = ref(Date.now());

	// Socket events replace the regular poll while connected. Time still moves
	// cards off-screen locally, so a finished ticket does not need a database read
	// merely to disappear after its serving window.
	const rounds = computed(() => storedRounds.value.filter((round) => {
		if (round.kitchen_status === "done") {
			const doneAt = new Date(round.kitchen_done_at || round.sent_at).getTime();
			return Number.isFinite(doneAt) && clock.value - doneAt <= READY_WINDOW_MS;
		}
		const sentAt = new Date(round.sent_at).getTime();
		return Number.isFinite(sentAt) && clock.value - sentAt <= STALE_ROUND_MS;
	}));

	const cooking = computed(() => rounds.value.filter((round) => round.kitchen_status !== "done"));
	const ready = computed(() => rounds.value.filter((round) => round.kitchen_status === "done"));

	async function load(force = false) {
		if (!storeId.value) return;
		// A reload asked for by hand must never be dropped because a background
		// poll happened to be in the air. Later answers win; earlier ones that
		// land late are discarded by their sequence number.
		const ticket = ++sequence;
		if (force) pending.value = true;
		try {
			const query = new URLSearchParams({ store_id: storeId.value });
			if (options.stationId?.value) query.set("station", options.stationId.value);
			const dueFullLoad = Date.now() - lastFullLoadAt >= FULL_REFRESH_MS;
			if (!force && !dueFullLoad && revision.value) query.set("since", String(revision.value));
			const response = await apiFetch<Envelope>(`/pos/restaurant/kitchen-queue?${query.toString()}`);
			if (ticket !== sequence) return;
			revision.value = Number(response.data.revision) || 0;
			if (!response.data.unchanged) {
				lastFullLoadAt = Date.now();
				storedRounds.value = response.data.rounds;
				options.onChanged?.(response.data.rounds);
				const readyIds = new Set(response.data.rounds.filter((round) => round.kitchen_status === "done").map((round) => round.queue_id));
				// Only rounds that became ready since the last look are announced, and
				// never on the first load — nobody wants a chime for yesterday's list.
				const fresh = response.data.rounds.filter((round) => round.kitchen_status === "done" && !knownReady.has(round.queue_id));
				if (primed && fresh.length) options.onReady?.(fresh);
				knownReady = readyIds;
				primed = true;
			}
			error.value = "";
		} catch (loadError) {
			if (ticket !== sequence) return;
			error.value = String((loadError as { message?: string })?.message || loadError);
		} finally {
			if (ticket === sequence) pending.value = false;
		}
	}

	function schedule() {
		if (timer) clearTimeout(timer);
		if (!active.value || realtime.connected.value) return;
		const idle = options.idleIntervalMs ?? POLL_INTERVAL_MS;
		timer = setTimeout(async () => {
			await load();
			schedule();
		}, cooking.value.length ? POLL_INTERVAL_MS : idle);
	}

	function start() {
		if (active.value) return;
		active.value = true;
		stopRealtime = realtime.activate(() => {
			// One write may bump more than once while finishing its transaction.
			// Collapse that burst into one queue read.
			if (realtimeLoadTimer) clearTimeout(realtimeLoadTimer);
			realtimeLoadTimer = setTimeout(() => void load(), 100);
		});
		clock.value = Date.now();
		clockTimer = setInterval(() => { clock.value = Date.now(); }, 30_000);
		void load(true);
		schedule();
	}

	function stop() {
		active.value = false;
		if (timer) clearTimeout(timer);
		timer = null;
		if (realtimeLoadTimer) clearTimeout(realtimeLoadTimer);
		realtimeLoadTimer = null;
		if (clockTimer) clearInterval(clockTimer);
		clockTimer = null;
		stopRealtime?.();
		stopRealtime = null;
	}

	// A tablet with its screen off, or a till on another tab, is not being read by
	// anyone. Polling it is pure waste, and the first look after coming back is a
	// full reload anyway.
	function syncVisibility() {
		if (!import.meta.client) return;
		// A shop whose kitchen works off paper has no queue to watch, so the till
		// must not ask about one all day.
		if (document.visibilityState === "visible" && options.enabled?.value !== false) start();
		else stop();
	}

	onMounted(() => {
		document.addEventListener("visibilitychange", syncVisibility);
		syncVisibility();
	});
	onBeforeUnmount(() => {
		document.removeEventListener("visibilitychange", syncVisibility);
		stop();
	});
	if (options.enabled) watch(options.enabled, syncVisibility);
	watch(storeId, () => {
		revision.value = 0;
		lastFullLoadAt = 0;
		primed = false;
		knownReady = new Set();
		// Only when something is actually watching: a hidden tab picks the new
		// store up the moment it comes back.
		if (active.value) void load(true);
		else storedRounds.value = [];
	});
	watch(realtime.connected, (isConnected, wasConnected) => {
		if (!active.value) return;
		if (isConnected) {
			if (timer) clearTimeout(timer);
			timer = null;
			// Subscription is active now; reconcile anything that happened during
			// connection setup or while the network was down.
			if (!wasConnected) void load(true);
		} else {
			schedule();
		}
	});

	return { rounds, cooking, ready, pending, error, revision, load, start, stop };
}
