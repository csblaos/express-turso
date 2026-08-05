<script setup lang="ts">
import { getCurrencySymbol } from "~/utils/currency";

// The currency the customer pays in. Used in two places on the payment panel —
// beside the cash keypad and beside the account cards — because the choice drives
// both, and a single component keeps the two from drifting apart.
const props = defineProps<{
	currencies: string[];
	active: string;
	// Only set when a foreign currency is chosen; the base currency has no rate.
	rateLabel?: string;
	// Fills its container and grows the touch target. Used where the picker is the
	// whole point of the card it sits in, rather than a control beside a label.
	block?: boolean;
}>();
const emit = defineEmits<{ select: [ string ] }>();

const open = ref(false);
const triggerRef = ref<HTMLElement | null>(null);
// The picker sits inside a panel that clips its overflow, so an absolutely
// positioned menu would be cut off. Rendering to <body> at a fixed position
// removes the clipping, and measuring the trigger lets it open upwards when there
// is no room below — what a native select does.
const menuStyle = ref<Record<string, string>>({});
const MENU_MAX_HEIGHT = 220;

function position() {
	const element = triggerRef.value;
	if (!element) return;
	const rect = element.getBoundingClientRect();
	const below = window.innerHeight - rect.bottom - 8;
	const above = rect.top - 8;
	const openUp = below < Math.min(MENU_MAX_HEIGHT, above) && above > below;
	menuStyle.value = {
		position: "fixed",
		left: `${rect.left}px`,
		minWidth: `${Math.max(rect.width, 132)}px`,
		maxHeight: `${Math.max(120, Math.min(MENU_MAX_HEIGHT, openUp ? above : below))}px`,
		...(openUp ? { bottom: `${window.innerHeight - rect.top + 4}px` } : { top: `${rect.bottom + 4}px` }),
	};
}

function toggle() {
	if (open.value) { open.value = false; return; }
	position();
	open.value = true;
}

function choose(code: string) {
	open.value = false;
	emit("select", code);
}

onMounted(() => {
	// Scrolling or resizing moves the trigger; a fixed menu would stay behind.
	const reposition = () => { if (open.value) position(); };
	window.addEventListener("resize", reposition);
	window.addEventListener("scroll", reposition, true);
	onBeforeUnmount(() => {
		window.removeEventListener("resize", reposition);
		window.removeEventListener("scroll", reposition, true);
	});
});

// A menu left hanging over a closed panel would sit on top of the next screen.
onBeforeUnmount(() => { open.value = false; });
</script>

<template>
	<button
		ref="triggerRef"
		type="button"
		class="flex items-center rounded-md border border-neutral-200 bg-white font-semibold text-stone-700 transition hover:border-primary-200 active:scale-[0.98]"
		:class="props.block
			? 'min-h-9 w-full justify-between gap-2 px-2.5 text-xs'
			: 'min-h-7 shrink-0 gap-1 px-2 text-[11px]'"
		:aria-expanded="open"
		aria-haspopup="listbox"
		@click="toggle"
	>
		<span class="flex items-center gap-1">
			<span :class="props.block ? 'text-sm' : 'text-xs'">{{ getCurrencySymbol(props.active) }}</span>
			<span>{{ props.active }}</span>
		</span>
		<UIcon name="i-heroicons-chevron-up-down-20-solid" class="text-stone-400" :class="props.block ? 'size-4' : 'size-3.5'" />
	</button>

	<Teleport to="body">
		<div v-if="open" class="fixed inset-0 z-[60]" @click="open = false" />
		<div
			v-if="open"
			class="scrollbar-soft z-[61] overflow-y-auto rounded-md border border-neutral-200 bg-white p-1 shadow-lg"
			:style="menuStyle"
			role="listbox"
		>
			<button
				v-for="code in props.currencies"
				:key="code"
				type="button"
				class="flex min-h-10 w-full items-center gap-2 rounded-md px-2.5 text-left text-sm font-medium transition"
				:class="props.active === code ? 'bg-primary-50 text-primary-700' : 'text-stone-700 hover:bg-neutral-50'"
				role="option"
				:aria-selected="props.active === code"
				@click="choose(code)"
			>
				<span class="w-4 text-center text-base">{{ getCurrencySymbol(code) }}</span>
				<span class="flex-1">{{ code }}</span>
				<UIcon v-if="props.active === code" name="i-heroicons-check-20-solid" class="size-4" />
			</button>
		</div>
	</Teleport>
</template>
