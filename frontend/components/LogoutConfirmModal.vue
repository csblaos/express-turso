<script setup lang="ts">
defineProps<{
	open: boolean;
}>();

defineEmits<{
	(e: "close"): void;
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
			class="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4 backdrop-blur-[2px]"
			@click.self="$emit('close')"
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
				<div
					v-if="open"
					class="w-full max-w-md rounded-md border border-[#e7e4dd] bg-[#fffefd] p-6 shadow-2xl"
					@click.stop
				>
					<div class="flex items-start gap-4">
						<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200">
							<UIcon name="i-heroicons-arrow-left-on-rectangle" class="h-6 w-6" />
						</div>
						<div class="min-w-0 flex-1">
							<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Logout</p>
							<h3 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">ออกจากระบบตอนนี้หรือไม่</h3>
							<p class="mt-2 text-sm leading-6 text-stone-500">หากยืนยัน ระบบจะพาคุณกลับไปหน้าเข้าสู่ระบบทันที โดยรอบนี้ยังเป็น UI preview เท่านั้น</p>
						</div>
					</div>

					<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
						<AppButton
							color="neutral"
							variant="soft"
							size="lg"
							class="justify-center"
							label="ยกเลิก"
							@click="$emit('close')"
						/>
						<AppButton
							color="primary"
							size="lg"
							class="justify-center"
							label="ออกจากระบบ"
							@click="$emit('confirm')"
						/>
					</div>
				</div>
			</Transition>
		</div>
	</Transition>
</template>
