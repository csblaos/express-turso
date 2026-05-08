<script setup lang="ts">
const props = withDefaults(defineProps<{
	modelValue: boolean;
	title?: string;
	description?: string;
	desktopWidth?: string;
	mobileMaxHeight?: string;
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
	showHandle: true,
	showCloseButton: true,
	closeButtonSize: "xs",
	closeOnBackdrop: true,
	compactHeader: false,
	backdropZClass: "z-[58]",
	panelZClass: "z-[59]",
	panelClass: "",
	contentClass: "",
});

const emit = defineEmits<{
	(event: "update:modelValue", value: boolean): void;
	(event: "close"): void;
}>();

const DRAG_CLOSE_DISTANCE = 96;
const panelRef = ref<HTMLElement | null>(null);
const dragState = reactive({
	active: false,
	pointerId: -1,
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
	dragState.pointerId = -1;
	dragState.startY = 0;
	dragState.offsetY = 0;
}

function canStartDragFromTarget(target: EventTarget | null) {
	if (!(target instanceof HTMLElement)) return false;
	if (target.closest("button, input, textarea, select, a, [role='button']")) return false;
	return true;
}

function handleDragStart(event: PointerEvent) {
	if (isDesktopViewport()) return;
	if (!canStartDragFromTarget(event.target)) return;

	dragState.active = true;
	dragState.pointerId = event.pointerId;
	dragState.startY = event.clientY;
	dragState.offsetY = 0;
	panelRef.value?.setPointerCapture?.(event.pointerId);
}

function handleDragMove(event: PointerEvent) {
	if (!dragState.active || event.pointerId !== dragState.pointerId) return;
	const deltaY = event.clientY - dragState.startY;
	dragState.offsetY = Math.max(0, deltaY);
}

function handleDragEnd(event: PointerEvent) {
	if (!dragState.active || event.pointerId !== dragState.pointerId) return;
	panelRef.value?.releasePointerCapture?.(event.pointerId);

	const shouldClose = dragState.offsetY >= DRAG_CLOSE_DISTANCE;
	resetDragState();
	if (shouldClose) close();
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

watch(() => props.modelValue, (isOpen) => {
	if (!isOpen) resetDragState();
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
				panelMotionClass,
				panelZClass,
				panelClass,
			]"
			@pointermove="handleDragMove"
			@pointerup="handleDragEnd"
			@pointercancel="handleDragEnd"
		>
			<div
				v-if="showHandle"
				class="mx-auto mt-3 h-1.5 w-16 rounded-full bg-stone-200 lg:hidden touch-none"
				@pointerdown="handleDragStart"
			/>
			<div
				:class="[
					'scrollbar-soft max-h-[calc(var(--app-panel-mobile-max-height)-24px)] overflow-y-auto px-5 py-5 lg:h-full lg:max-h-none',
					contentClass,
				]"
			>
				<div
					v-if="title || description || showCloseButton"
					:class="[
						'flex items-start justify-between border-b border-[#f1ede6]',
						compactHeader ? 'mb-3 gap-3 pb-3' : 'mb-5 gap-4 pb-4',
					]"
					@pointerdown="handleDragStart"
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
