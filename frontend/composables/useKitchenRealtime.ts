import { io, type Socket } from "socket.io-client";
import { effectScope, type EffectScope } from "vue";

export type KitchenChangedEvent = { storeId: string; revision: number };
type Subscriber = (event: KitchenChangedEvent) => void;

let socket: Socket | null = null;
let nextSubscriberId = 1;
const subscribers = new Map<number, Subscriber>();
let lifecycleScope: EffectScope | null = null;

export function useKitchenRealtime() {
	const runtimeConfig = useRuntimeConfig();
	const { accessToken, currentStoreId } = useAuthSession();
	const connected = useState<boolean>("kitchen-realtime.connected", () => false);

	function subscribeStore() {
		const storeId = currentStoreId.value?.trim();
		if (!socket?.connected || !storeId) return;
		connected.value = false;
		socket.emit("kitchen:subscribe", { storeId }, (response: { ok: boolean }) => {
			if (!socket?.connected) return;
			connected.value = Boolean(response?.ok);
			if (!response?.ok) socket.disconnect();
		});
	}

	function connectIfNeeded() {
		if (!import.meta.client || !subscribers.size || !accessToken.value || !currentStoreId.value) return;
		if (!socket) {
			socket = io(String(runtimeConfig.public.realtimeBase || ""), {
				autoConnect: false,
				transports: [ "websocket" ],
				reconnection: true,
				reconnectionDelay: 1_000,
				reconnectionDelayMax: 10_000,
				auth: { accessToken: accessToken.value },
			});
			socket.on("connect", subscribeStore);
			socket.on("disconnect", () => { connected.value = false; });
			socket.on("connect_error", () => { connected.value = false; });
			socket.on("kitchen:changed", (event: KitchenChangedEvent) => {
				if (!event || event.storeId !== currentStoreId.value) return;
				for (const subscriber of subscribers.values()) subscriber(event);
			});
		}
		socket.auth = { accessToken: accessToken.value };
		if (!socket.connected) socket.connect();
		else subscribeStore();
	}

	function disconnectIfUnused() {
		if (subscribers.size || !socket) return;
		connected.value = false;
		socket.disconnect();
	}

	function activate(subscriber: Subscriber): () => void {
		const id = nextSubscriberId++;
		subscribers.set(id, subscriber);
		connectIfNeeded();
		return () => {
			subscribers.delete(id);
			disconnectIfUnused();
		};
	}

	if (import.meta.client && !lifecycleScope) {
		// Detached from whichever page first uses the queue: auth/store watchers
		// must survive navigation to another page that also needs realtime.
		lifecycleScope = effectScope(true);
		lifecycleScope.run(() => {
			watch(accessToken, (token, previous) => {
				if (token === previous) return;
				connected.value = false;
				if (socket) {
					socket.auth = { accessToken: token };
					socket.disconnect();
				}
				connectIfNeeded();
			});
			watch(currentStoreId, (storeId, previous) => {
				if (storeId === previous) return;
				connected.value = false;
				if (socket?.connected) subscribeStore();
				else connectIfNeeded();
			});
		});
	}

	return { connected: readonly(connected), activate };
}
