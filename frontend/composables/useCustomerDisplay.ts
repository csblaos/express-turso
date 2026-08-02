// Links the cashier POS window to the customer-facing screen on the second
// monitor. Everything travels over BroadcastChannel inside the same browser, so
// there is no server hop, no latency, and it keeps working without a network.

export type CustomerDisplayLine = {
	id: string;
	name: string;
	qty: number;
	unitPrice: number;
	lineTotal: number;
	isGift: boolean;
};

export type CustomerDisplayState = {
	// "awaiting_payment" is the moment the QR matters; after payment it is useless,
	// so the paid screen shows the change instead.
	status: "disabled" | "idle" | "active" | "awaiting_payment" | "paid";
	storeId: string;
	storeName: string;
	storeLogo: string;
	currency: string;
	qrImageUrl: string | null;
	adImages: string[];
	lines: CustomerDisplayLine[];
	subtotal: number;
	discount: number;
	vat: number;
	vatLabel: string;
	total: number;
	tendered: number | null;
	change: number | null;
	updatedAt: number;
};

type Message =
	| { type: "state"; state: CustomerDisplayState }
	| { type: "hello" }
	| { type: "bye" };

export function emptyCustomerDisplayState(storeName = "", currency = "LAK"): CustomerDisplayState {
	return {
		status: "idle",
		storeId: "",
		storeName,
		storeLogo: "",
		currency,
		qrImageUrl: null,
		adImages: [],
		lines: [],
		subtotal: 0,
		discount: 0,
		vat: 0,
		vatLabel: "",
		total: 0,
		tendered: null,
		change: null,
		updatedAt: Date.now(),
	};
}

const CHANNEL = "pos.customer-display";

function openChannel() {
	if (!import.meta.client || typeof BroadcastChannel === "undefined") return null;
	return new BroadcastChannel(CHANNEL);
}

// Cashier side: publishes the active bill and answers a display that opened late.
export function useCustomerDisplayPublisher(
	storeId: Ref<string> | ComputedRef<string>,
	getState?: () => CustomerDisplayState,
) {
	const channel = ref<BroadcastChannel | null>(null);
	const lastState = ref<CustomerDisplayState | null>(null);
	const displayWindow = ref<Window | null>(null);

	function post(message: Message) {
		channel.value?.postMessage(message);
	}

	function publish(state: CustomerDisplayState) {
		lastState.value = state;
		post({ type: "state", state });
	}

	function connect() {
		channel.value?.close();
		channel.value = openChannel();
		if (!channel.value) return;
		channel.value.onmessage = (event: MessageEvent<Message>) => {
			// A display that opens after the POS asks for the current bill.
			if (event.data?.type !== "hello") return;
			const current = getState?.() || lastState.value;
			if (current) post({ type: "state", state: current });
		};
	}

	// Chrome exposes the physical screen layout, which lets the window land on the
	// second monitor by itself. Elsewhere it opens normally and staff drag it once.
	async function secondScreenFeatures() {
		try {
			const api = window as unknown as {
				getScreenDetails?: () => Promise<{ screens: Array<{ left: number; top: number; width: number; height: number; isPrimary: boolean }> }>;
			};
			if (typeof api.getScreenDetails !== "function") return "";
			const details = await api.getScreenDetails();
			const external = details.screens.find((screen) => !screen.isPrimary);
			if (!external) return "";
			return `left=${external.left},top=${external.top},width=${external.width},height=${external.height}`;
		} catch {
			return "";
		}
	}

	async function openDisplay() {
		if (!import.meta.client) return;
		if (displayWindow.value && !displayWindow.value.closed) {
			displayWindow.value.focus();
			return;
		}
		const features = await secondScreenFeatures();
		displayWindow.value = window.open(
			`/customer-display?store=${encodeURIComponent(storeId.value)}`,
			"pos-customer-display",
			features || "width=1024,height=768",
		);
		const current = getState?.();
		if (current) publish(current);
	}

	onMounted(connect);
	watch(storeId, connect);
	onBeforeUnmount(() => {
		post({ type: "bye" });
		channel.value?.close();
		channel.value = null;
	});

	return { publish, openDisplay, displayWindow };
}

const BRANDING_KEY = "pos.customer-display.branding";

type Branding = { storeName: string; storeLogo: string; currency: string };

// Shop branding barely changes, so the screen caches it and paints the welcome
// state immediately on load instead of waiting for the POS to answer. Without
// this a refresh shows a nameless screen with the system logo.
function readBranding(): Branding | null {
	if (!import.meta.client) return null;
	try {
		const raw = window.localStorage.getItem(BRANDING_KEY);
		if (!raw) return null;
		const parsed = JSON.parse(raw) as Partial<Branding>;
		if (!parsed || typeof parsed !== "object") return null;
		return {
			storeName: String(parsed.storeName || ""),
			storeLogo: String(parsed.storeLogo || ""),
			currency: String(parsed.currency || "LAK"),
		};
	} catch {
		return null;
	}
}

function writeBranding(state: CustomerDisplayState) {
	if (!import.meta.client || !state.storeName) return;
	try {
		window.localStorage.setItem(BRANDING_KEY, JSON.stringify({
			storeName: state.storeName,
			storeLogo: state.storeLogo,
			currency: state.currency,
		} satisfies Branding));
	} catch {
		// a full or blocked storage must never break the screen
	}
}

// Customer side: renders whatever the POS last sent, nothing else.
export function useCustomerDisplayReceiver(storeId: Ref<string>) {
	// Read synchronously: waiting for onMounted paints the system logo first and
	// then swaps it, which reads as a flash on every refresh.
	const seeded = emptyCustomerDisplayState();
	const initialBranding = readBranding();
	const state = ref<CustomerDisplayState>(initialBranding ? { ...seeded, ...initialBranding } : seeded);
	const connected = ref(false);
	let channel: BroadcastChannel | null = null;
	let helloTimer: ReturnType<typeof setTimeout> | null = null;

	function applyBranding() {
		const branding = readBranding();
		if (!branding) return;
		state.value = { ...state.value, ...branding };
	}

	// The POS may mount after the display, or miss a single hello. Keep asking
	// until an answer arrives, then stop.
	function scheduleHello(delay: number) {
		if (helloTimer) clearTimeout(helloTimer);
		helloTimer = setTimeout(() => {
			if (connected.value) return;
			channel?.postMessage({ type: "hello" } satisfies Message);
			scheduleHello(Math.min(delay * 2, 5000));
		}, delay);
	}

	function connect() {
		channel?.close();
		channel = openChannel();
		if (!channel) return;
		channel.onmessage = (event: MessageEvent<Message>) => {
			const message = event.data;
			if (message?.type === "state") {
				// Without ?store= the screen follows whichever POS is broadcasting;
				// with it, anything from another store is ignored.
				const wanted = storeId.value.trim();
				if (wanted && message.state.storeId && message.state.storeId !== wanted) return;
				state.value = message.state;
				connected.value = true;
				writeBranding(message.state);
				if (helloTimer) { clearTimeout(helloTimer); helloTimer = null; }
				return;
			}
			// The POS window closed; keep the branding so the screen still looks
			// like the shop rather than resetting to the system logo.
			if (message?.type === "bye") {
				state.value = emptyCustomerDisplayState(state.value.storeName, state.value.currency);
				applyBranding();
				connected.value = false;
				scheduleHello(1000);
			}
		};
		channel.postMessage({ type: "hello" } satisfies Message);
		scheduleHello(600);
	}

	onMounted(connect);
	watch(storeId, connect);
	onBeforeUnmount(() => {
		if (helloTimer) clearTimeout(helloTimer);
		channel?.close();
		channel = null;
	});

	return { state, connected };
}
