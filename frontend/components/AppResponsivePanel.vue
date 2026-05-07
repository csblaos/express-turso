<script setup lang="ts">
const props = withDefaults(defineProps<{
	modelValue: boolean;
	title?: string;
	description?: string;
	desktopWidth?: string;
	mobileMaxHeight?: string;
	showHandle?: boolean;
	showCloseButton?: boolean;
	closeOnBackdrop?: boolean;
	backdropZClass?: string;
	panelZClass?: string;
	panelClass?: string;
	contentClass?: string;
}>(), {
	desktopWidth: "420px",
	mobileMaxHeight: "88vh",
	showHandle: true,
	showCloseButton: true,
	closeOnBackdrop: true,
	backdropZClass: "z-[58]",
	panelZClass: "z-[59]",
	panelClass: "",
	contentClass: "",
});

const emit = defineEmits<{
	(event: "update:modelValue", value: boolean): void;
	(event: "close"): void;
}>();

const panelVars = computed(() => ({
	"--app-panel-desktop-width": props.desktopWidth,
	"--app-panel-mobile-max-height": props.mobileMaxHeight,
}));

function close() {
	emit("update:modelValue", false);
	emit("close");
}

function handleBackdrop() {
	if (props.closeOnBackdrop) {
		close();
	}
}
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
			:style="panelVars"
			:class="[
				'fixed inset-x-0 bottom-0 max-h-[var(--app-panel-mobile-max-height)] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[var(--app-panel-desktop-width)] lg:rounded-none',
				panelZClass,
				panelClass,
			]"
		>
			<div v-if="showHandle" class="mx-auto mt-3 h-1.5 w-16 rounded-full bg-stone-200 lg:hidden" />
			<div
				:class="[
					'scrollbar-soft max-h-[calc(var(--app-panel-mobile-max-height)-24px)] overflow-y-auto px-5 py-5 lg:h-full lg:max-h-none',
					contentClass,
				]"
			>
				<div
					v-if="title || description || showCloseButton"
					class="mb-4 flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-4"
				>
					<div v-if="title || description" class="min-w-0">
						<h2 v-if="title" class="text-lg font-semibold text-stone-950">
							{{ title }}
						</h2>
						<p v-if="description" class="mt-1 text-sm leading-6 text-stone-500">
							{{ description }}
						</p>
					</div>

					<UButton
						v-if="showCloseButton"
						color="gray"
						variant="soft"
						size="xs"
						icon="i-heroicons-x-mark-20-solid"
						class="shrink-0 rounded-xl"
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
