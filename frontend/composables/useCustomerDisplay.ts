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
	adIntervalSeconds: number;
	lines: CustomerDisplayLine[];
	subtotal: number;
	discount: number;
	// Items total minus VAT, set only when VAT is folded into the shelf price.
	// null the rest of the time, when the subtotal already is the pre-VAT figure.
	netSubtotal: number | null;
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
	| { type: "bye" }
	// Settings changed. Sent by the settings page so an already-open display and
	// the POS both pick it up without either being reopened.
	| { type: "branding"; storeId: string; branding: CustomerDisplayBranding };

export function emptyCustomerDisplayState(storeName = "", currency = "LAK"): CustomerDisplayState {
	return {
		status: "idle",
		storeId: "",
		storeName,
		storeLogo: "",
		currency,
		qrImageUrl: null,
		adImages: [],
		adIntervalSeconds: 5,
		lines: [],
		subtotal: 0,
		discount: 0,
		netSubtotal: null,
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
	onBranding?: (branding: CustomerDisplayBranding) => void,
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
			// Settings changed in another tab: adopt them before publishing again,
			// otherwise the next bill would overwrite the display with stale ads.
			if (event.data?.type === "branding") {
				if (event.data.storeId && event.data.storeId !== storeId.value) return;
				onBranding?.(event.data.branding);
				return;
			}
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

	// With no second monitor to fill, a fixed 1024x768 wasted whatever the screen
	// actually had. Bill height is what limits how many lines a customer can see,
	// so the window takes the available screen instead.
	function fallbackWindowFeatures() {
		const width = Math.max(1024, Math.round((window.screen?.availWidth || 1024) * 0.9));
		const height = Math.max(768, Math.round((window.screen?.availHeight || 768) * 0.9));
		return `width=${width},height=${height},left=0,top=0`;
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
			features || fallbackWindowFeatures(),
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

export type CustomerDisplayBranding = {
	storeName: string;
	storeLogo: string;
	currency: string;
	// Adverts are shop identity, not bill data: without caching them the screen
	// drops back to a bare logo the moment the cashier leaves the POS page.
	adImages?: string[];
	adIntervalSeconds?: number;
};

// Cached per store: a ?store= screen must never paint another shop's name just
// because that shop was the last one open in this browser.
function brandingKey(storeId: string) {
	return storeId ? `${BRANDING_KEY}:${storeId}` : `${BRANDING_KEY}:last`;
}

function parseBranding(raw: string | null): CustomerDisplayBranding | null {
	if (!raw) return null;
	try {
		const parsed = JSON.parse(raw) as Partial<CustomerDisplayBranding>;
		if (!parsed || typeof parsed !== "object" || !parsed.storeName) return null;
		return {
			storeName: String(parsed.storeName || ""),
			storeLogo: String(parsed.storeLogo || ""),
			currency: String(parsed.currency || "LAK"),
			adImages: Array.isArray(parsed.adImages) ? parsed.adImages.filter((item): item is string => typeof item === "string" && Boolean(item)) : [],
			adIntervalSeconds: Number.isFinite(Number(parsed.adIntervalSeconds)) ? Number(parsed.adIntervalSeconds) : 5,
		};
	} catch {
		return null;
	}
}

// Shop branding barely changes, so the screen caches it and paints the welcome
// state immediately on load instead of waiting for the POS to answer. Without
// this the screen shows a nameless header with the system logo.
function readBranding(storeId: string): CustomerDisplayBranding | null {
	if (!import.meta.client) return null;
	try {
		const scoped = parseBranding(window.localStorage.getItem(brandingKey(storeId)));
		if (scoped || storeId) return scoped;
		// Only the store-agnostic screen may fall back to the pre-scoping key.
		return parseBranding(window.localStorage.getItem(BRANDING_KEY));
	} catch {
		return null;
	}
}

function saveBranding(storeId: string, branding: CustomerDisplayBranding) {
	if (!import.meta.client || !branding.storeName) return;
	try {
		const payload = JSON.stringify(branding);
		if (storeId) window.localStorage.setItem(brandingKey(storeId), payload);
		window.localStorage.setItem(brandingKey(""), payload);
	} catch {
		// a full or blocked storage must never break the screen
	}
}

// Seeds the cache from anywhere that already knows the shop, so the very first
// open of the display link shows the real name and logo instead of waiting for
// a POS window that may not even be open yet.
export function cacheCustomerDisplayBranding(storeId: string, branding: CustomerDisplayBranding) {
	saveBranding(storeId, branding);
}

// Caches the change and announces it, so a display already showing on the second
// monitor and a POS already publishing bills both follow the new settings without
// being reopened.
export function publishCustomerDisplayBranding(storeId: string, branding: CustomerDisplayBranding) {
	saveBranding(storeId, branding);
	const channel = openChannel();
	if (!channel) return;
	channel.postMessage({ type: "branding", storeId, branding } satisfies Message);
	// A BroadcastChannel delivers what was already posted, so closing right away
	// is safe and avoids leaving a channel open on a page that only ever sends.
	channel.close();
}

function writeBranding(state: CustomerDisplayState) {
	saveBranding(state.storeId, {
		storeName: state.storeName,
		storeLogo: state.storeLogo,
		currency: state.currency,
		adImages: state.adImages,
		adIntervalSeconds: state.adIntervalSeconds,
	});
}

// Customer side: renders whatever the POS last sent, nothing else.
export function useCustomerDisplayReceiver(storeId: Ref<string>) {
	// Read synchronously: waiting for onMounted paints the system logo first and
	// then swaps it, which reads as a flash on every refresh.
	const seeded = emptyCustomerDisplayState();
	const initialBranding = readBranding(storeId.value.trim());
	const state = ref<CustomerDisplayState>(initialBranding ? { ...seeded, ...initialBranding } : seeded);
	const connected = ref(false);
	let channel: BroadcastChannel | null = null;
	let helloTimer: ReturnType<typeof setTimeout> | null = null;

	function applyBranding() {
		const branding = readBranding(storeId.value.trim());
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
			// Settings were saved elsewhere; repaint without waiting for a bill.
			if (message?.type === "branding") {
				const wanted = storeId.value.trim();
				if (wanted && message.storeId && message.storeId !== wanted) return;
				state.value = { ...state.value, ...message.branding };
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
	watch(storeId, () => {
		applyBranding();
		connect();
	});
	onBeforeUnmount(() => {
		if (helloTimer) clearTimeout(helloTimer);
		channel?.close();
		channel = null;
	});

	return { state, connected };
}
