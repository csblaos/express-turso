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
watch(() => state.value.adImages.length, (count) => {
	adIndex.value = 0;
	if (adTimer) { clearInterval(adTimer); adTimer = null; }
	if (count > 1) adTimer = setInterval(() => { adIndex.value = (adIndex.value + 1) % count; }, 5000);
}, { immediate: true });
onBeforeUnmount(() => { if (adTimer) clearInterval(adTimer); });
const money = (value: number) => formatMoneyWithSymbol(value, state.value.currency || "LAK", "lo-LA");
const hasLines = computed(() => state.value.lines.length > 0);
const itemCount = computed(() => state.value.lines.reduce((sum, line) => sum + line.qty, 0));
const showBill = computed(() => hasLines.value || state.value.status === "awaiting_payment");
</script>

<template>
	<div class="flex h-screen w-screen flex-col overflow-hidden bg-[#faf9f7] text-stone-900">
		<header class="flex shrink-0 items-center justify-between gap-4 border-b border-stone-200 bg-white px-8 py-4">
			<div class="flex min-w-0 items-center gap-3">
				<img :src="logo" alt="" class="size-11 shrink-0 rounded-xl object-contain">
				<div class="min-w-0">
					<p class="text-xs uppercase tracking-[0.2em] text-stone-400">{{ t('customerDisplay.eyebrow') }}</p>
					<h1 class="truncate text-xl font-semibold tracking-[-0.02em]">{{ state.storeName || t('customerDisplay.fallbackStore') }}</h1>
				</div>
			</div>
			<p v-if="hasLines" class="shrink-0 rounded-full bg-emerald-50 px-4 py-1.5 text-base font-semibold text-emerald-700">
				{{ t('customerDisplay.itemCount', { count: itemCount }) }}
			</p>
		</header>

		<!-- Paid: the change due is the number the customer most wants to verify. -->
		<section v-if="state.status === 'paid'" class="flex flex-1 flex-col items-center justify-center gap-6 px-8 text-center">
			<p class="text-5xl font-semibold text-emerald-600">{{ t('customerDisplay.thankYou') }}</p>
			<div v-if="state.change !== null" class="rounded-2xl bg-white px-12 py-8 shadow-sm ring-1 ring-stone-200">
				<p class="text-xl text-stone-500">{{ t('customerDisplay.change') }}</p>
				<p class="mt-2 text-6xl font-semibold tabular-nums text-stone-950">{{ money(state.change) }}</p>
			</div>
			<p v-if="state.tendered !== null" class="text-xl text-stone-500">
				{{ t('customerDisplay.tendered') }} {{ money(state.tendered) }} · {{ t('customerDisplay.total') }} {{ money(state.total) }}
			</p>
		</section>

		<section v-else-if="state.status === 'disabled'" class="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
			<img :src="logo" alt="" class="size-24 rounded-3xl object-contain opacity-40">
			<p class="text-2xl font-medium text-stone-500">{{ t('customerDisplay.turnedOff') }}</p>
			<p class="text-base text-stone-400">{{ t('customerDisplay.turnedOffHint') }}</p>
		</section>

		<section v-else-if="!showBill" class="relative flex flex-1 flex-col items-center justify-center gap-5 px-8 text-center">
			<img :src="idleArtwork" alt="" :class="hasAd ? 'max-h-[62vh] w-auto max-w-full rounded-2xl object-contain shadow-sm' : 'size-32 rounded-3xl object-contain'">
			<div v-if="!hasAd">
				<p class="text-4xl font-semibold">{{ t('customerDisplay.welcome') }}</p>
				<p class="mt-2 text-xl text-stone-500">{{ state.storeName || t('customerDisplay.welcomeHint') }}</p>
			</div>
			<p v-if="!connected" class="absolute bottom-4 text-xs text-stone-300">{{ t('customerDisplay.waitingPos') }}</p>
		</section>

		<!-- Ordering and paying share one layout so the bill never disappears from
		     the customer's view: the panel swaps, the item list stays put. -->
		<div v-else class="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_420px] overflow-hidden">
			<section class="flex min-h-0 flex-col items-center justify-center gap-5 border-e border-stone-200 p-8">
				<template v-if="state.status === 'awaiting_payment'">
					<p class="text-2xl font-semibold text-stone-700">{{ t('customerDisplay.scanToPay') }}</p>
					<img v-if="state.qrImageUrl" :src="state.qrImageUrl" alt="" class="max-h-[52vh] w-auto max-w-full rounded-2xl bg-white p-3 shadow-sm ring-1 ring-stone-200">
					<p v-else class="text-xl text-stone-400">{{ t('customerDisplay.noQr') }}</p>
					<p class="text-5xl font-semibold tabular-nums">{{ money(state.total) }}</p>
				</template>
				<template v-else>
					<img v-if="hasAd" :key="currentAd" :src="currentAd" alt="" class="max-h-[62vh] w-auto max-w-full rounded-2xl object-contain shadow-sm">
					<template v-else>
						<img :src="logo" alt="" class="size-40 rounded-3xl object-contain">
						<p class="text-3xl font-semibold">{{ t('customerDisplay.welcome') }}</p>
						<p class="text-xl text-stone-500">{{ state.storeName }}</p>
					</template>
				</template>
			</section>

			<aside class="flex min-h-0 flex-col bg-white">
				<div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
					<ul class="space-y-3">
						<li v-for="line in state.lines" :key="line.id" class="flex items-start justify-between gap-3 border-b border-stone-100 pb-3 text-lg">
							<div class="min-w-0">
								<p class="font-medium leading-6">
									{{ line.name }}
									<span v-if="line.isGift" class="ms-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-700">{{ t('customerDisplay.gift') }}</span>
								</p>
								<p class="mt-0.5 text-base text-stone-400 tabular-nums">{{ line.qty }} × {{ money(line.unitPrice) }}</p>
							</div>
							<strong class="shrink-0 tabular-nums">{{ money(line.lineTotal) }}</strong>
						</li>
					</ul>
				</div>

				<footer class="shrink-0 border-t border-stone-200 px-5 py-4">
					<dl class="grid gap-1 text-base">
						<div class="flex justify-between">
							<dt class="text-stone-500">{{ t('customerDisplay.subtotal') }}</dt>
							<dd class="tabular-nums">{{ money(state.subtotal) }}</dd>
						</div>
						<div v-if="state.discount > 0" class="flex justify-between text-emerald-700">
							<dt>{{ t('customerDisplay.discount') }}</dt>
							<dd class="tabular-nums">−{{ money(state.discount) }}</dd>
						</div>
						<div v-if="state.vat > 0" class="flex justify-between">
							<dt class="text-stone-500">{{ state.vatLabel || 'VAT' }}</dt>
							<dd class="tabular-nums">{{ money(state.vat) }}</dd>
						</div>
					</dl>
					<div class="mt-3 border-t border-stone-200 pt-3">
						<p class="text-lg font-semibold text-stone-500">{{ t('customerDisplay.total') }}</p>
						<p class="mt-1 text-5xl font-semibold tabular-nums tracking-[-0.02em] text-stone-950">{{ money(state.total) }}</p>
					</div>
				</footer>
			</aside>
		</div>
	</div>
</template>
