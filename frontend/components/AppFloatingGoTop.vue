<script setup lang="ts">
const props = withDefaults(defineProps<{
	hidden?: boolean;
	scrollThreshold?: number;
}>(), {
	hidden: false,
	scrollThreshold: 260,
});

type DockSide = "left" | "right" | null;
type AnchorSide = "left" | "right";
type SavedFloatingGoTopState = {
	dockedSide: DockSide;
	anchorSide: AnchorSide;
	y: number;
};

const BUTTON_SIZE = 56;
const EDGE_PEEK = 28;
const SIDE_MARGIN = 16;
const TOP_MARGIN = 84;
const BOTTOM_MARGIN = 24;
const DRAG_THRESHOLD = 8;
const STORAGE_KEY = "app-floating-go-top";

const isMounted = ref(false);
const isMobileViewport = ref(false);
const isVisible = ref(false);
const position = reactive({
	x: 0,
	y: 0,
});
const dockedSide = ref<DockSide>(null);
const anchorSide = ref<AnchorSide>("right");
const hasInitializedPosition = ref(false);
const pointerState = reactive({
	active: false,
	pointerId: -1,
	startX: 0,
	startY: 0,
	originX: 0,
	originY: 0,
	moved: false,
});

function getViewportWidth() {
	return window.innerWidth;
}

function getViewportHeight() {
	return window.innerHeight;
}

function getMaxX() {
	return Math.max(SIDE_MARGIN, getViewportWidth() - BUTTON_SIZE - SIDE_MARGIN);
}

function getMaxY() {
	return Math.max(TOP_MARGIN, getViewportHeight() - BUTTON_SIZE - BOTTOM_MARGIN);
}

function clampY(value: number) {
	return Math.min(getMaxY(), Math.max(TOP_MARGIN, value));
}

function clampX(value: number) {
	return Math.min(getMaxX(), Math.max(SIDE_MARGIN, value));
}

function getVisibleX(side: Exclude<DockSide, null>) {
	return side === "left" ? SIDE_MARGIN : getMaxX();
}

function getDockedX(side: Exclude<DockSide, null>) {
	return side === "left" ? -(BUTTON_SIZE - EDGE_PEEK) : getViewportWidth() - EDGE_PEEK;
}

function saveState() {
	if (!import.meta.client) return;

	const payload: SavedFloatingGoTopState = {
		dockedSide: dockedSide.value,
		anchorSide: anchorSide.value,
		y: clampY(position.y),
	};

	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
	} catch {
		// Ignore storage failures in restricted contexts.
	}
}

function loadSavedState() {
	if (!import.meta.client) return null;

	try {
		const rawValue = localStorage.getItem(STORAGE_KEY);
		if (!rawValue) return null;

		const parsedValue = JSON.parse(rawValue) as Partial<SavedFloatingGoTopState>;
		const nextAnchorSide: AnchorSide = parsedValue.anchorSide === "left" ? "left" : "right";
		const nextDockedSide: DockSide = parsedValue.dockedSide === "left" || parsedValue.dockedSide === "right"
			? parsedValue.dockedSide
			: null;
		const nextY = typeof parsedValue.y === "number" ? clampY(parsedValue.y) : clampY(getViewportHeight() - BUTTON_SIZE - 96);

		return {
			anchorSide: nextAnchorSide,
			dockedSide: nextDockedSide,
			y: nextY,
		} satisfies SavedFloatingGoTopState;
	} catch {
		return null;
	}
}

function setDefaultPosition() {
	anchorSide.value = "right";
	dockedSide.value = "right";
	position.x = getDockedX("right");
	position.y = clampY(getViewportHeight() - BUTTON_SIZE - 96);
	hasInitializedPosition.value = true;
	saveState();
}

function restoreSavedState(savedState: SavedFloatingGoTopState) {
	anchorSide.value = savedState.anchorSide;
	dockedSide.value = savedState.dockedSide;
	position.y = clampY(savedState.y);
	position.x = savedState.dockedSide
		? getDockedX(savedState.dockedSide)
		: getVisibleX(savedState.anchorSide);
	hasInitializedPosition.value = true;
}

function syncVisibleState() {
	if (!import.meta.client) return;

	isVisible.value = (
		isMounted.value &&
		isMobileViewport.value &&
		!props.hidden &&
		window.scrollY > props.scrollThreshold
	);
}

function syncViewport() {
	if (!import.meta.client) return;

	isMobileViewport.value = window.innerWidth < 1024;

	if (!hasInitializedPosition.value) {
		const savedState = loadSavedState();
		if (savedState) {
			restoreSavedState(savedState);
			return;
		}

		setDefaultPosition();
		return;
	}

	if (dockedSide.value) {
		position.x = getDockedX(dockedSide.value);
		position.y = clampY(position.y);
		return;
	}

	position.x = clampX(position.x);
	position.y = clampY(position.y);
}

function undock() {
	if (!dockedSide.value) return;

	const currentSide = dockedSide.value;
	anchorSide.value = currentSide;
	dockedSide.value = null;
	position.x = getVisibleX(currentSide);
	position.y = clampY(position.y);
	saveState();
}

function snapToNearestEdge() {
	const nextSide: Exclude<DockSide, null> = (position.x + (BUTTON_SIZE / 2)) < (getViewportWidth() / 2)
		? "left"
		: "right";

	anchorSide.value = nextSide;
	dockedSide.value = nextSide;
	position.x = getDockedX(nextSide);
	position.y = clampY(position.y);
	saveState();
}

function scrollToTop() {
	window.scrollTo({
		top: 0,
		behavior: "smooth",
	});
}

function handleButtonTap() {
	if (dockedSide.value) {
		undock();
		return;
	}

	scrollToTop();
}

function resetPointerState() {
	pointerState.active = false;
	pointerState.pointerId = -1;
	pointerState.moved = false;
}

function handlePointerDown(event: PointerEvent) {
	if (!isVisible.value) return;

	pointerState.active = true;
	pointerState.pointerId = event.pointerId;
	pointerState.startX = event.clientX;
	pointerState.startY = event.clientY;
	pointerState.originX = position.x;
	pointerState.originY = position.y;
	pointerState.moved = false;

	(event.currentTarget as HTMLElement | null)?.setPointerCapture?.(event.pointerId);
}

function handlePointerMove(event: PointerEvent) {
	if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;

	const deltaX = event.clientX - pointerState.startX;
	const deltaY = event.clientY - pointerState.startY;

	if (!pointerState.moved && Math.hypot(deltaX, deltaY) >= DRAG_THRESHOLD) {
		pointerState.moved = true;

		if (dockedSide.value) {
			const currentSide = dockedSide.value;
			anchorSide.value = currentSide;
			dockedSide.value = null;
			position.x = getVisibleX(currentSide);
			pointerState.originX = position.x;
		}
	}

	if (!pointerState.moved) return;

	position.x = clampX(pointerState.originX + deltaX);
	position.y = clampY(pointerState.originY + deltaY);
}

function handlePointerUp(event: PointerEvent) {
	if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;

	(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);

	const moved = pointerState.moved;
	resetPointerState();

	if (!moved) {
		handleButtonTap();
		return;
	}

	snapToNearestEdge();
}

function handlePointerCancel(event: PointerEvent) {
	if (!pointerState.active || event.pointerId !== pointerState.pointerId) return;
	(event.currentTarget as HTMLElement | null)?.releasePointerCapture?.(event.pointerId);
	resetPointerState();
}

const buttonIcon = computed(() => {
	if (dockedSide.value === "left") return "i-heroicons-chevron-right-20-solid";
	if (dockedSide.value === "right") return "i-heroicons-chevron-left-20-solid";
	return "i-heroicons-arrow-up-20-solid";
});

const buttonTitle = computed(() => {
	if (dockedSide.value) return "ดึงปุ่มกลับเข้าหน้าจอ";
	return "กลับขึ้นด้านบน";
});

const wrapperClass = computed(() => {
	if (pointerState.active && pointerState.moved) return "transition-none";
	return "transition-transform duration-200 ease-out";
});

const buttonClass = computed(() => {
	if (dockedSide.value === "left") {
		return "h-14 w-14 justify-end rounded-r-2xl rounded-l-none pr-3 shadow-[0_16px_32px_rgba(17,24,39,0.18)]";
	}

	if (dockedSide.value === "right") {
		return "h-14 w-14 justify-start rounded-l-2xl rounded-r-none pl-3 shadow-[0_16px_32px_rgba(17,24,39,0.18)]";
	}

	return "h-14 w-14 justify-center rounded-full shadow-[0_16px_32px_rgba(17,24,39,0.18)]";
});

watch(() => props.hidden, () => {
	syncVisibleState();
}, { immediate: true });

watch(dockedSide, () => {
	if (!import.meta.client) return;
	position.y = clampY(position.y);
});

watch(() => position.y, () => {
	if (!import.meta.client || !hasInitializedPosition.value || pointerState.active) return;
	saveState();
});

onMounted(() => {
	isMounted.value = true;
	syncViewport();
	syncVisibleState();

	window.addEventListener("resize", syncViewport);
	window.addEventListener("scroll", syncVisibleState, { passive: true });
});

onUnmounted(() => {
	window.removeEventListener("resize", syncViewport);
	window.removeEventListener("scroll", syncVisibleState);
});
</script>

<template>
	<div
		v-if="isVisible"
		class="fixed inset-0 z-[38] pointer-events-none lg:hidden"
		aria-hidden="false"
	>
		<div
			class="pointer-events-auto absolute touch-none select-none"
			:class="wrapperClass"
			:style="{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }"
		>
			<AppButton
				color="primary"
				variant="solid"
				size="lg"
				:icon="buttonIcon"
				:aria-label="buttonTitle"
				:title="buttonTitle"
				class="border border-primary-500/15 bg-primary-500 text-white ring-0"
				:class="buttonClass"
				@pointerdown="handlePointerDown"
				@pointermove="handlePointerMove"
				@pointerup="handlePointerUp"
				@pointercancel="handlePointerCancel"
			/>
		</div>
	</div>
</template>
