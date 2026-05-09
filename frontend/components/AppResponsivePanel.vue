<script setup lang="ts">
const props = withDefaults(defineProps<{
	modelValue: boolean;
	title?: string;
	description?: string;
	desktopWidth?: string;
	mobileMaxHeight?: string;
	fillMobileHeight?: boolean;
	showHandle?: boolean;
	showCloseButton?: boolean;
	closeButtonSize?: "xs" | "sm" | "md" | "lg" | "xl";
	closeOnBackdrop?: boolean;
	compactHeader?: boolean;
	backdropZClass?: string;
	panelZClass?: string;
	panelClass?: string;
	contentClass?: string;
}>(), {
	desktopWidth: "420px",
	mobileMaxHeight: "88vh",
	fillMobileHeight: false,
	showHandle: true,
	showCloseButton: true,
	closeButtonSize: "md",
	closeOnBackdrop: true,
	compactHeader: false,
	backdropZClass: "z-[160]",
	panelZClass: "z-[170]",
	panelClass: "",
	contentClass: "",
});

const emit = defineEmits<{
	(event: "update:modelValue", value: boolean): void;
	(event: "close"): void;
}>();

type BodyLockSnapshot = {
	scrollY: number;
	bodyOverflow: string;
	bodyPosition: string;
	bodyTop: string;
	bodyLeft: string;
	bodyRight: string;
	bodyWidth: string;
	bodyOverscrollBehavior: string;
	htmlOverflow: string;
	htmlOverscrollBehavior: string;
};

const openPanelCount = useState<number>("app-responsive-panel-open-count", () => 0);
const bodyLockSnapshot = useState<BodyLockSnapshot | null>("app-responsive-panel-body-lock-snapshot", () => null);

const DRAG_CLOSE_DISTANCE = 96;
const panelRef = ref<HTMLElement | null>(null);
const dragState = reactive({
	active: false,
	inputMode: "none" as "none" | "pointer" | "touch",
	pointerId: -1,
	touchId: -1,
	startY: 0,
	offsetY: 0,
});

const panelVars = computed(() => ({
	"--app-panel-desktop-width": props.desktopWidth,
	"--app-panel-mobile-max-height": props.mobileMaxHeight,
}));

const panelStyle = computed(() => ({
	...panelVars.value,
	transform: dragState.offsetY > 0 ? `translateY(${dragState.offsetY}px)` : undefined,
}));

const panelMotionClass = computed(() => (
	dragState.active
		? "transition-none"
		: "transition-transform duration-200 ease-out"
));

function isDesktopViewport() {
	return import.meta.client ? window.innerWidth >= 1024 : true;
}

function resetDragState() {
	dragState.active = false;
	dragState.inputMode = "none";
	dragState.pointerId = -1;
	dragState.touchId = -1;
	dragState.startY = 0;
	dragState.offsetY = 0;
}

function resolveTargetElement(target: EventTarget | null) {
	if (target instanceof HTMLElement) return target;
	if (target instanceof Text) return target.parentElement;
	return null;
}

function canStartDragFromTarget(target: EventTarget | null) {
	const targetElement = resolveTargetElement(target);
	if (!targetElement) return false;
	if (!targetElement.closest("[data-panel-drag-handle]")) return false;
	if (targetElement.closest("button, input, textarea, select, a, [role='button']")) return false;
	return true;
}

function startDrag(startY: number) {
	dragState.active = true;
	dragState.startY = startY;
	dragState.offsetY = 0;
}

function updateDrag(currentY: number) {
	if (!dragState.active) return;
	const deltaY = currentY - dragState.startY;
	dragState.offsetY = Math.max(0, deltaY);
}

function endDrag() {
	if (!dragState.active) return;
	const shouldClose = dragState.offsetY >= DRAG_CLOSE_DISTANCE;
	resetDragState();
	if (shouldClose) close();
}

function handleDragStart(event: PointerEvent) {
	if (isDesktopViewport()) return;
	if (!canStartDragFromTarget(event.target)) return;
	if (event.pointerType === "mouse" && event.button !== 0) return;

	dragState.inputMode = "pointer";
	dragState.pointerId = event.pointerId;
	startDrag(event.clientY);
	panelRef.value?.setPointerCapture?.(event.pointerId);
}

function handleDragMove(event: PointerEvent) {
	if (!dragState.active || dragState.inputMode !== "pointer") return;
	if (event.pointerId !== dragState.pointerId) return;
	updateDrag(event.clientY);
}

function handleDragEnd(event: PointerEvent) {
	if (!dragState.active || dragState.inputMode !== "pointer") return;
	if (event.pointerId !== dragState.pointerId) return;
	panelRef.value?.releasePointerCapture?.(event.pointerId);
	endDrag();
}

function handleTouchStart(event: TouchEvent) {
	if (isDesktopViewport()) return;
	if (!canStartDragFromTarget(event.target)) return;
	const touch = event.touches[0];
	if (!touch) return;

	dragState.inputMode = "touch";
	dragState.touchId = touch.identifier;
	startDrag(touch.clientY);
}

function handleTouchMove(event: TouchEvent) {
	if (!dragState.active || dragState.inputMode !== "touch") return;
	const touch = Array.from(event.touches).find((item) => item.identifier === dragState.touchId);
	if (!touch) return;
	updateDrag(touch.clientY);
	event.preventDefault();
}

function handleTouchEnd(event: TouchEvent) {
	if (!dragState.active || dragState.inputMode !== "touch") return;
	const touchStillActive = Array.from(event.touches).some((item) => item.identifier === dragState.touchId);
	if (touchStillActive) return;
	endDrag();
}

function close() {
	emit("update:modelValue", false);
	emit("close");
}

function handleBackdrop() {
	if (props.closeOnBackdrop) {
		close();
	}
}

function lockBodyScroll() {
	if (!import.meta.client) return;
	const body = document.body;
	const html = document.documentElement;

	if (openPanelCount.value === 0) {
		const scrollY = window.scrollY || window.pageYOffset || 0;
			bodyLockSnapshot.value = {
				scrollY,
				bodyOverflow: body.style.overflow,
				bodyPosition: body.style.position,
				bodyTop: body.style.top,
				bodyLeft: body.style.left,
				bodyRight: body.style.right,
				bodyWidth: body.style.width,
				bodyOverscrollBehavior: body.style.overscrollBehavior,
				htmlOverflow: html.style.overflow,
				htmlOverscrollBehavior: html.style.overscrollBehavior,
			};

		body.style.overflow = "hidden";
		body.style.position = "fixed";
		body.style.top = `-${scrollY}px`;
		body.style.left = "0";
		body.style.right = "0";
		body.style.width = "100%";
			body.style.overscrollBehavior = "none";
		html.style.overflow = "hidden";
		html.style.overscrollBehavior = "none";
	}

	openPanelCount.value += 1;
}

function unlockBodyScroll() {
	if (!import.meta.client) return;
	if (openPanelCount.value > 0) {
		openPanelCount.value -= 1;
	}
	if (openPanelCount.value > 0) return;

	const snapshot = bodyLockSnapshot.value;
	const body = document.body;
	const html = document.documentElement;
	if (snapshot) {
		body.style.overflow = snapshot.bodyOverflow;
		body.style.position = snapshot.bodyPosition;
		body.style.top = snapshot.bodyTop;
		body.style.left = snapshot.bodyLeft;
		body.style.right = snapshot.bodyRight;
		body.style.width = snapshot.bodyWidth;
			body.style.overscrollBehavior = snapshot.bodyOverscrollBehavior;
		html.style.overflow = snapshot.htmlOverflow;
		html.style.overscrollBehavior = snapshot.htmlOverscrollBehavior;
		window.scrollTo(0, snapshot.scrollY);
	}
	bodyLockSnapshot.value = null;
}

watch(() => props.modelValue, (isOpen, wasOpen) => {
	if (isOpen === wasOpen) return;
	if (isOpen) {
		lockBodyScroll();
		return;
	}
	resetDragState();
	unlockBodyScroll();
});

onUnmounted(() => {
	if (props.modelValue) {
		unlockBodyScroll();
	}
});
</script>

<template>
	<Transition
		enter-active-class="transition duration-200 ease-out"
		enter-from-class="opacity-0"
		enter-to-class="opacity-100"
		leave-active-class="transition duration-150 ease-in"
		leave-from-class="opacity-100"
		leave-to-class="opacity-0"
	>
			<div
				v-if="modelValue"
				:class="['fixed inset-0 bg-[rgba(28,25,23,0.42)] backdrop-blur-[2px]', backdropZClass]"
				@click="handleBackdrop"
				@touchmove.prevent
				@wheel.prevent
			/>
	</Transition>

	<Transition
		enter-active-class="transition duration-200 ease-out"
		enter-from-class="translate-y-full opacity-0 lg:translate-y-0 lg:translate-x-full"
		enter-to-class="translate-y-0 opacity-100 lg:translate-x-0"
		leave-active-class="transition duration-150 ease-in"
		leave-from-class="translate-y-0 opacity-100 lg:translate-x-0"
		leave-to-class="translate-y-full opacity-0 lg:translate-y-0 lg:translate-x-full"
	>
		<div
				v-if="modelValue"
				ref="panelRef"
				:style="panelStyle"
				:class="[
				'fixed inset-x-0 bottom-0 max-h-[var(--app-panel-mobile-max-height)] rounded-none bg-[#fffefd] shadow-[0_16px_48px_rgba(31,28,24,0.12)] ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[var(--app-panel-desktop-width)] lg:rounded-none',
				fillMobileHeight ? 'h-[var(--app-panel-mobile-max-height)]' : '',
				panelMotionClass,
				panelZClass,
				panelClass,
			]"
				@pointermove="handleDragMove"
				@pointerup="handleDragEnd"
				@pointercancel="handleDragEnd"
				@touchmove="handleTouchMove"
				@touchend="handleTouchEnd"
				@touchcancel="handleTouchEnd"
			>
					<div
						v-if="showHandle"
						class="mx-auto mt-3 h-1.5 w-16 rounded-full bg-stone-200 lg:hidden touch-none"
						data-panel-drag-handle
						@pointerdown="handleDragStart"
						@touchstart="handleTouchStart"
					/>
			<div
				:class="[
					'scrollbar-soft max-h-[calc(var(--app-panel-mobile-max-height)-24px)] overflow-y-auto px-5 py-5 lg:h-full lg:max-h-none',
					fillMobileHeight ? 'h-[calc(var(--app-panel-mobile-max-height)-24px)]' : '',
					contentClass,
				]"
			>
					<div
						v-if="title || description || showCloseButton"
						:class="[
							'flex items-start justify-between border-b border-[#f1ede6]',
							compactHeader ? 'mb-3 gap-3 pb-3' : 'mb-5 gap-4 pb-4',
							]"
							data-panel-drag-handle
							@pointerdown="handleDragStart"
							@touchstart="handleTouchStart"
						>
					<div v-if="title || description" class="min-w-0">
						<h2 v-if="title" :class="compactHeader ? 'text-base font-semibold text-stone-950 sm:text-lg' : 'text-lg font-semibold text-stone-950'">
							{{ title }}
						</h2>
						<p v-if="description" :class="compactHeader ? 'mt-0.5 text-xs leading-5 text-stone-500 sm:text-sm sm:leading-6' : 'mt-1 text-sm leading-6 text-stone-500'">
							{{ description }}
						</p>
					</div>

					<AppButton
						v-if="showCloseButton"
						color="neutral"
						variant="soft"
						:size="closeButtonSize"
						icon="i-heroicons-x-mark-20-solid"
						class="shrink-0"
						aria-label="ปิด"
						title="ปิด"
						@click="close"
					/>
				</div>

				<slot :close="close" />
			</div>
		</div>
	</Transition>
</template>
