<script setup lang="ts">
// Generic confirmation for destructive actions, styled to match
// LogoutConfirmModal so every confirm in the app looks the same.
withDefaults(defineProps<{
	open: boolean;
	title: string;
	description?: string;
	confirmLabel: string;
	cancelLabel: string;
	tone?: "danger" | "primary";
	pending?: boolean;
}>(), {
	description: "",
	tone: "primary",
	pending: false,
});

defineEmits<{
	(e: "cancel"): void;
	(e: "confirm"): void;
}>();
</script>

<template>
	<Transition
		appear
		enter-active-class="transition duration-200 ease-out"
		enter-from-class="opacity-0"
		enter-to-class="opacity-100"
		leave-active-class="transition duration-150 ease-in"
		leave-from-class="opacity-100"
		leave-to-class="opacity-0"
	>
		<div
			v-if="open"
			class="fixed inset-0 z-[190] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
			@click.self="$emit('cancel')"
		>
			<Transition
				appear
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="translate-y-2 scale-[0.98] opacity-0"
				enter-to-class="translate-y-0 scale-100 opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="translate-y-0 scale-100 opacity-100"
				leave-to-class="translate-y-2 scale-[0.98] opacity-0"
			>
				<div v-if="open" class="w-full max-w-md rounded-md border border-[#e7e4dd] bg-[#fffefd] p-6 shadow-2xl" @click.stop>
					<div class="flex items-start gap-4">
						<div
							class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md ring-1"
							:class="tone === 'danger' ? 'bg-rose-50 text-rose-700 ring-rose-200' : 'bg-primary-50 text-primary-700 ring-primary-200'"
						>
							<UIcon :name="tone === 'danger' ? 'i-heroicons-exclamation-triangle' : 'i-heroicons-question-mark-circle'" class="h-6 w-6" />
						</div>
						<div class="min-w-0 flex-1">
							<h3 class="text-xl font-semibold tracking-[-0.03em] text-stone-950">{{ title }}</h3>
							<p v-if="description" class="mt-2 text-sm leading-6 text-stone-500">{{ description }}</p>
						</div>
					</div>

					<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<AppButton color="neutral" variant="soft" size="lg" class="justify-center" :label="cancelLabel" :disabled="pending" @click="$emit('cancel')" />
						<AppButton :color="tone === 'danger' ? 'error' : 'primary'" size="lg" class="justify-center" :label="confirmLabel" :loading="pending" :disabled="pending" @click="$emit('confirm')" />
					</div>
				</div>
			</Transition>
		</div>
	</Transition>
</template>
