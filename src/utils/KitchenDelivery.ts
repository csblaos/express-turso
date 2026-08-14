/** How a shop tells its kitchen what to cook. One answer decides whether slips
 * print, whether the kitchen queue is shown at all, and therefore whether anyone
 * is expected to tick a round off as done. */
export type KitchenDeliveryMode = "paper" | "screen" | "both" | "none";

const MODES = new Set<KitchenDeliveryMode>([ "paper", "screen", "both", "none" ]);

export function normalizeKitchenDeliveryMode(value: unknown): KitchenDeliveryMode {
	const normalized = String(value ?? "").trim().toLowerCase();
	// Paper is the default because it is what every shop did before the setting
	// existed, and an unrecognised value must never silently stop the kitchen
	// hearing about an order.
	return MODES.has(normalized as KitchenDeliveryMode) ? normalized as KitchenDeliveryMode : "paper";
}

export function kitchenPaperEnabled(value: unknown): boolean {
	const mode = normalizeKitchenDeliveryMode(value);
	return mode === "paper" || mode === "both";
}

export function kitchenScreenEnabled(value: unknown): boolean {
	const mode = normalizeKitchenDeliveryMode(value);
	return mode === "screen" || mode === "both";
}

/** Bumped by anything that changes what the kitchen still has to cook. Clients
 * send the number they last saw, and a request that matches is answered without
 * touching the database at all — the point of polling every few seconds is to
 * notice change, and most polls find none.
 *
 * Held in this process rather than Redis: the app runs as a single container,
 * production Redis is Upstash which bills per command, and a counter that costs
 * a network round trip to read would defeat the purpose. The day this runs on
 * two containers, back it with Redis instead — nothing else has to change. */
const revisions = new Map<string, number>();
type KitchenRevisionListener = (event: { storeId: string; revision: number }) => void;
const revisionListeners = new Set<KitchenRevisionListener>();

export function kitchenRevision(storeId: string): number {
	return revisions.get(storeId) || 0;
}

export function bumpKitchenRevision(storeId: string): number {
	const next = (revisions.get(storeId) || 0) + 1;
	revisions.set(storeId, next);
	for (const listener of revisionListeners) listener({ storeId, revision: next });
	return next;
}

/** The realtime transport is deliberately attached through this tiny process
 * event boundary. Kitchen writes remain independent from Socket.IO, and a
 * future multi-instance adapter can replace the listener without touching the
 * order transaction code. */
export function onKitchenRevision(listener: KitchenRevisionListener): () => void {
	revisionListeners.add(listener);
	return () => revisionListeners.delete(listener);
}
