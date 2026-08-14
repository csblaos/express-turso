<script setup lang="ts">
import { formatMoneyWithSymbol } from "~/utils/currency";

// Customer-facing screen for the second monitor. It renders only what the POS
// window broadcasts: no API calls, no tokens, no navigation.
const route = useRoute();
const { t, locale } = useI18n();

const storeId = computed(() => String(route.query.store || ""));
const { state, connected } = useCustomerDisplayReceiver(storeId as Ref<string>);

// Customers read this screen, not staff, so it stays in the shop language
// regardless of what the cashier picked for themselves.
onMounted(() => {
	locale.value = "lo";
});

const SYSTEM_LOGO = "/icons/icon-512.png";
const logo = computed(() => state.value.storeLogo || SYSTEM_LOGO);
// Idle is where an advert actually gets read, so it takes the whole screen there
// and never competes with the bill once items are being rung up.
const hasAd = computed(() => state.value.adImages.length > 0);
// Rotate through the shop's adverts. One image simply stays put.
const adIndex = ref(0);
let adTimer: ReturnType<typeof setInterval> | null = null;
const currentAd = computed(() => state.value.adImages[adIndex.value] || state.value.adImages[0] || "");
const idleArtwork = computed(() => currentAd.value || logo.value);
const adBackgroundStyle = computed(() => currentAd.value ? { backgroundImage: `url(${JSON.stringify(currentAd.value)})` } : {});
// Restarts on either change: a new interval must take effect without reopening
// the screen, and an interval of 0 means the shop chose to hold on one image.
watch([ () => state.value.adImages.length, () => state.value.adIntervalSeconds ], ([ count, seconds ]) => {
	adIndex.value = 0;
	if (adTimer) { clearInterval(adTimer); adTimer = null; }
	const delay = Number(seconds) > 0 ? Number(seconds) * 1000 : 0;
	if (count > 1 && delay > 0) adTimer = setInterval(() => { adIndex.value = (adIndex.value + 1) % count; }, delay);
}, { immediate: true });
onBeforeUnmount(() => { if (adTimer) clearInterval(adTimer); });
const money = (value: number) => formatMoneyWithSymbol(value, state.value.currency || "LAK", "lo-LA");
const hasLines = computed(() => state.value.lines.length > 0);

// How long the thank-you stays up. The POS clears its receipt only when the
// cashier presses print or no-print, so without this the customer sees the total
// for however long that takes: a moment if the cashier is quick, or until the
// next sale if they walk away. Timed here instead, the screen behaves the same
// every time regardless of what the counter is doing.
const PAID_SCREEN_MS = 5000;
const paidScreenExpired = ref(false);
let paidTimer: ReturnType<typeof setTimeout> | null = null;
watch(() => state.value.status === "paid", (isPaid) => {
	if (paidTimer) { clearTimeout(paidTimer); paidTimer = null; }
	paidScreenExpired.value = false;
	if (!isPaid) return;
	paidTimer = setTimeout(() => { paidScreenExpired.value = true; paidTimer = null; }, PAID_SCREEN_MS);
}, { immediate: true });
onBeforeUnmount(() => { if (paidTimer) clearTimeout(paidTimer); });

// Everything the template branches on goes through this, so an expired thank-you
// falls back to the welcome/advert screen exactly as an idle till would.
const displayStatus = computed(() => (
	state.value.status === "paid" && paidScreenExpired.value ? "idle" : state.value.status
));

// A customer reads this from across the counter, so the type shrinks only as far
// as a long bill forces it and never past the point where it stops being legible
// at that distance. A short bill keeps the large, comfortable size: nobody buying
// two drinks should be punished for the customer who buys twenty.
//
// visible is what actually fits the panel at that density, measured against the
// bill area at 1024x768 (the size the POS opens this window at).
// rowHeight is the measured cost of one line at that size, including its rule and
// the gap below it. Ordered largest first: the biggest type that still fits the
// whole bill wins, so nothing shrinks without a reason.
const DENSITY_TIERS = [
	{ name: "text-[15px]", meta: "text-[13px]", gap: "space-y-1.5", pad: "pb-1.5", rowHeight: 50 },
	{ name: "text-[13px]", meta: "text-[11px]", gap: "space-y-1", pad: "pb-1", rowHeight: 42 },
	// The floor. Smaller than this stops being readable from across a counter, so
	// a longer bill spills instead of shrinking further.
	{ name: "text-xs", meta: "text-[11px]", gap: "space-y-1", pad: "pb-1", rowHeight: 36 },
] as const;

// Measured rather than assumed: the window is opened at the screen size, so how
// many lines fit depends on the monitor and cannot be hard-coded.
const listElement = ref<HTMLElement | null>(null);
const listHeight = ref(0);
onMounted(() => {
	if (!listElement.value || typeof ResizeObserver === "undefined") return;
	const observer = new ResizeObserver((entries) => { listHeight.value = entries[0]?.contentRect.height || 0; });
	observer.observe(listElement.value);
	onBeforeUnmount(() => observer.disconnect());
});

const density = computed(() => {
	const count = state.value.lines.length;
	// Before the first measurement, assume the most comfortable size rather than
	// flashing tiny text and growing it a frame later.
	if (!count || !listHeight.value) return DENSITY_TIERS[0];
	return DENSITY_TIERS.find((tier) => count * tier.rowHeight <= listHeight.value)
		|| DENSITY_TIERS[DENSITY_TIERS.length - 1];
});
const visibleCount = computed(() => {
	const count = state.value.lines.length;
	if (!listHeight.value) return count;
	return Math.max(1, Math.min(count, Math.floor(listHeight.value / density.value.rowHeight)));
});
// Newest first, so the line the cashier just rang up is always on screen without
// anyone being able to scroll this display.
const visibleLines = computed(() => state.value.lines.slice(0, visibleCount.value));
const hiddenLineCount = computed(() => Math.max(0, state.value.lines.length - visibleLines.value.length));
const itemCount = computed(() => state.value.lines.reduce((sum, line) => sum + line.qty, 0));
const showBill = computed(() => hasLines.value || displayStatus.value === "awaiting_payment");

// The side panel holds the advert OR the payment QR, and it competes with the
// bill for width, not height. On a narrow screen the bill panel would be squeezed
// to its 300px minimum, which truncates Lao product names, so the advert gives up
// its half: a customer checking their bill is not reading an advert anyway.
// The QR never gives way — without it they cannot pay at all.
const NARROW_SCREEN_PX = 900;
const viewportWidth = ref(Number.POSITIVE_INFINITY);
onMounted(() => {
	const measure = () => { viewportWidth.value = window.innerWidth; };
	measure();
	window.addEventListener("resize", measure);
	onBeforeUnmount(() => window.removeEventListener("resize", measure));
});
const hideSidePanel = computed(() => (
	displayStatus.value !== "awaiting_payment" && viewportWidth.value < NARROW_SCREEN_PX
));
</script>

<template>
	<div class="flex h-screen w-screen flex-col overflow-hidden bg-[#faf9f7] text-stone-900">
		<header v-if="!hasAd || showBill || displayStatus !== 'idle'" class="flex shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white px-8 py-4 [@media(max-height:700px)]:py-2">
			<div class="flex min-w-0 items-center gap-3">
				<img :src="logo" alt="" class="size-[clamp(2rem,4.5vh,2.75rem)] shrink-0 rounded-xl object-contain">
				<div class="min-w-0">
					<p class="text-xs uppercase tracking-[0.2em] text-stone-400">{{ t('customerDisplay.eyebrow') }}</p>
					<h1 class="truncate text-[clamp(0.9375rem,2.6vh,1.25rem)] font-semibold tracking-[-0.02em]">{{ state.storeName || t('customerDisplay.fallbackStore') }}</h1>
				</div>
			</div>
			<p v-if="hasLines" class="shrink-0 rounded-full bg-emerald-50 px-4 py-1.5 text-base font-semibold text-emerald-700">
				{{ t('customerDisplay.itemCount', { count: itemCount }) }}
			</p>
		</header>

		<!-- Paid: the change due is the number the customer most wants to verify.
		     A transfer or card payment has no change, so the amount paid takes that
		     spot instead of a permanent "Change 0". -->
		<section v-if="displayStatus === 'paid'" class="thank-you-screen relative flex flex-1 items-center justify-center overflow-hidden px-6 py-8 text-center sm:px-10">
			<div class="thank-you-card relative w-full max-w-2xl rounded-[2rem] border border-stone-200 bg-white px-7 py-8 shadow-[0_28px_80px_rgba(28,25,23,0.12)] sm:px-12 sm:py-11">
				<div class="thank-you-check mx-auto grid size-[clamp(5rem,12vh,7.5rem)] place-items-center rounded-full bg-emerald-500 text-white shadow-[0_14px_32px_rgba(5,150,105,0.35)]">
					<svg class="size-[58%]" viewBox="0 0 52 52" fill="none" aria-hidden="true"><path class="thank-you-check-path" d="M14 27.5 22.5 36 39 18" stroke="currentColor" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" /></svg>
				</div>
				<p class="thank-you-title mt-5 text-[clamp(2rem,6vh,3.75rem)] font-semibold leading-none tracking-[-0.045em] text-stone-950">{{ t('customerDisplay.thankYou') }}</p>
				<div class="thank-you-rule mx-auto mt-5 h-px w-16 bg-stone-200" aria-hidden="true" />
				<div class="thank-you-amount mt-6 rounded-2xl border border-stone-200 bg-white px-5 py-5 sm:px-8 sm:py-6">
					<p class="text-[clamp(0.875rem,2.3vh,1.125rem)] font-medium text-stone-500">{{ state.change !== null ? t('customerDisplay.change') : t('customerDisplay.total') }}</p>
					<p class="mt-1 text-[clamp(2.25rem,8vh,5rem)] font-semibold leading-tight tabular-nums tracking-[-0.055em] text-stone-950">{{ money(state.change !== null ? state.change : state.total) }}</p>
				</div>
				<p v-if="state.tendered !== null" class="thank-you-detail mt-5 text-[clamp(0.8125rem,2vh,1rem)] text-stone-500">
					{{ t('customerDisplay.tendered') }} <span class="font-medium tabular-nums text-stone-700">{{ money(state.tendered) }}</span><span class="mx-2 text-stone-300">•</span>{{ t('customerDisplay.total') }} <span class="font-medium tabular-nums text-stone-700">{{ money(state.total) }}</span>
				</p>
			</div>
		</section>

		<section v-else-if="displayStatus === 'disabled'" class="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
			<img :src="logo" alt="" class="size-[clamp(3.5rem,11vh,6rem)] rounded-3xl object-contain opacity-40">
			<p class="text-[clamp(1.125rem,3vh,1.5rem)] font-medium text-stone-500">{{ t('customerDisplay.turnedOff') }}</p>
			<p class="text-base text-stone-400">{{ t('customerDisplay.turnedOffHint') }}</p>
		</section>

		<section v-else-if="!showBill" class="relative flex flex-1 flex-col items-center justify-center gap-5 text-center" :class="hasAd ? 'overflow-hidden p-0' : 'px-8'">
			<div v-if="hasAd" class="customer-ad-frame customer-ad-frame-full">
				<div class="customer-ad-backdrop" :style="adBackgroundStyle" aria-hidden="true" />
				<img :key="currentAd" :src="currentAd" alt="" class="customer-ad-image">
			</div>
			<img v-else :src="idleArtwork" alt="" class="size-[clamp(4.5rem,15vh,8rem)] rounded-3xl object-contain">
			<div v-if="!hasAd">
				<p class="text-[clamp(1.5rem,5vh,2.25rem)] font-semibold leading-tight">{{ t('customerDisplay.welcome') }}</p>
				<p class="mt-2 text-[clamp(0.875rem,2.5vh,1.25rem)] text-stone-500">{{ state.storeName || t('customerDisplay.welcomeHint') }}</p>
			</div>
			<p v-if="!connected" class="absolute bottom-4 text-xs text-stone-300">{{ t('customerDisplay.waitingPos') }}</p>
		</section>

		<!-- Ordering and paying share one layout so the bill never disappears from
		     the customer's view: the panel swaps, the item list stays put. -->
		<div
			v-else
			class="grid min-h-0 flex-1 overflow-hidden"
			:class="hideSidePanel ? 'grid-cols-1' : 'grid-cols-[minmax(0,1fr)_clamp(300px,36%,420px)]'"
		>
			<section v-if="!hideSidePanel" class="flex min-h-0 flex-col items-center justify-center gap-5 border-e border-stone-200" :class="hasAd && displayStatus !== 'awaiting_payment' ? 'p-0' : 'p-8'">
				<template v-if="displayStatus === 'awaiting_payment'">
					<p class="text-[clamp(1.125rem,3vh,1.5rem)] font-semibold text-stone-700">{{ t('customerDisplay.scanToPay') }}</p>
					<img v-if="state.qrImageUrl" :src="state.qrImageUrl" alt="" class="max-h-[52vh] w-auto max-w-full rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200">
					<p v-else class="text-[clamp(0.875rem,2.5vh,1.25rem)] text-stone-400">{{ t('customerDisplay.noQr') }}</p>
					<p class="text-[clamp(2rem,6vh,3rem)] font-semibold leading-tight tabular-nums">{{ money(state.total) }}</p>
				</template>
				<template v-else>
					<div v-if="hasAd" class="customer-ad-frame customer-ad-frame-panel">
						<div class="customer-ad-backdrop" :style="adBackgroundStyle" aria-hidden="true" />
						<img :key="currentAd" :src="currentAd" alt="" class="customer-ad-image">
					</div>
					<template v-else>
						<img :src="logo" alt="" class="size-[clamp(5rem,18vh,10rem)] rounded-3xl object-contain">
						<p class="text-[clamp(1.25rem,4vh,1.875rem)] font-semibold">{{ t('customerDisplay.welcome') }}</p>
						<p class="text-[clamp(0.875rem,2.5vh,1.25rem)] text-stone-500">{{ state.storeName }}</p>
					</template>
				</template>
			</section>

			<aside class="flex min-h-0 flex-col bg-white">
				<div ref="listElement" class="min-h-0 flex-1 overflow-hidden px-5 py-4">
					<ul :class="density.gap">
						<li v-for="line in visibleLines" :key="line.id" class="flex items-start justify-between gap-3 border-b border-stone-100" :class="[density.pad, density.name]">
							<div class="min-w-0">
								<p class="font-medium leading-tight">
									{{ line.name }}
									<span v-if="line.isGift" class="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">{{ t('customerDisplay.gift') }}</span>
								</p>
								<p class="mt-0.5 text-stone-400 tabular-nums" :class="density.meta">{{ line.qty }} × {{ money(line.unitPrice) }}</p>
							</div>
							<strong class="shrink-0 tabular-nums">{{ money(line.lineTotal) }}</strong>
						</li>
					</ul>
					<p v-if="hiddenLineCount" class="mt-2 text-center text-xs text-stone-400">
						{{ t('customerDisplay.moreItems', { count: hiddenLineCount }) }}
					</p>
				</div>

				<footer class="shrink-0 border-t border-stone-200 px-5 py-4 [@media(max-height:700px)]:py-2">
					<dl class="grid gap-0.5 text-[13px]">
						<div class="flex justify-between">
							<dt class="text-stone-500">{{ t('customerDisplay.subtotal') }}</dt>
							<dd class="tabular-nums">{{ money(state.subtotal) }}</dd>
						</div>
						<div v-if="state.discount > 0" class="flex justify-between text-emerald-700">
							<dt>{{ t('customerDisplay.discount') }}</dt>
							<dd class="tabular-nums">−{{ money(state.discount) }}</dd>
						</div>
						<div v-if="state.netSubtotal !== null" class="flex justify-between">
							<dt class="text-stone-500">{{ t('customerDisplay.beforeVat') }}</dt>
							<dd class="tabular-nums">{{ money(state.netSubtotal) }}</dd>
						</div>
						<div v-if="state.vat > 0" class="flex justify-between">
							<dt class="text-stone-500">{{ state.vatLabel || 'VAT' }}</dt>
							<dd class="tabular-nums">{{ money(state.vat) }}</dd>
						</div>
					</dl>
					<div class="mt-3 border-t border-stone-200 pt-3 [@media(max-height:700px)]:mt-1.5 [@media(max-height:700px)]:pt-1.5">
						<p class="text-[clamp(0.6875rem,1.7vh,0.8125rem)] font-semibold text-stone-500">{{ t('customerDisplay.total') }}</p>
						<p class="mt-0.5 text-[clamp(1.1875rem,3.2vh,1.625rem)] font-semibold leading-tight tabular-nums tracking-[-0.02em] text-stone-950">{{ money(state.total) }}</p>
					</div>
				</footer>
			</aside>
		</div>
	</div>
</template>

<style scoped>
.thank-you-screen {
	background: #fff;
}

/* Preserve the advert's whole composition, whatever its aspect ratio. The same
   image fills the spare space behind it, enlarged and blurred, so a portrait
   banner on a landscape display (and vice versa) never leaves blank bands. */
.customer-ad-frame {
	position: relative;
	isolation: isolate;
	overflow: hidden;
	background: #f5f5f4;
}
.customer-ad-frame-full { width: 100%; height: 100%; }
.customer-ad-frame-panel { width: 100%; height: 100%; }
.customer-ad-backdrop {
	position: absolute;
	inset: -2rem;
	z-index: 0;
	background-position: center;
	background-size: cover;
	filter: blur(26px);
	transform: scale(1.08);
	opacity: .78;
}
.customer-ad-backdrop::after {
	content: "";
	position: absolute;
	inset: 0;
	background: rgba(255, 255, 255, .1);
}
.customer-ad-image {
	position: relative;
	z-index: 1;
	display: block;
	width: 100%;
	height: 100%;
	object-fit: contain;
	object-position: center;
	animation: customer-ad-in 360ms ease-out both;
}

.thank-you-card { animation: thank-you-card-in 620ms cubic-bezier(.16, 1, .3, 1) both; }
.thank-you-check { animation: thank-you-check-in 560ms 80ms cubic-bezier(.16, 1, .3, 1) both; }
.thank-you-check-path { stroke-dasharray: 40; stroke-dashoffset: 40; animation: thank-you-draw-check 360ms 420ms ease-out forwards; }
.thank-you-title { animation: thank-you-fade-up 520ms 210ms cubic-bezier(.16, 1, .3, 1) both; }
.thank-you-rule { animation: thank-you-rule-in 400ms 320ms ease-out both; }
.thank-you-amount { animation: thank-you-fade-up 540ms 330ms cubic-bezier(.16, 1, .3, 1) both; }
.thank-you-detail { animation: thank-you-fade-up 480ms 440ms cubic-bezier(.16, 1, .3, 1) both; }

@keyframes thank-you-card-in { from { opacity: 0; transform: translateY(22px) scale(.96); } to { opacity: 1; transform: translateY(0) scale(1); } }
@keyframes customer-ad-in { from { opacity: 0; transform: scale(1.015); } to { opacity: 1; transform: scale(1); } }
@keyframes thank-you-check-in { 0% { transform: scale(0); } 70% { transform: scale(1.12); } 100% { transform: scale(1); } }
@keyframes thank-you-draw-check { to { stroke-dashoffset: 0; } }
@keyframes thank-you-fade-up { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
@keyframes thank-you-rule-in { from { opacity: 0; transform: scaleX(0); } to { opacity: 1; transform: scaleX(1); } }
@media (prefers-reduced-motion: reduce) {
	.thank-you-card, .thank-you-check, .thank-you-check-path, .thank-you-title, .thank-you-rule, .thank-you-amount, .thank-you-detail, .customer-ad-image { animation: none; }
	.thank-you-check-path { stroke-dashoffset: 0; }
}
</style>
