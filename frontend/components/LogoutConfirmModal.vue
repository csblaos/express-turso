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
	<div
		v-if="open"
		class="fixed inset-0 z-[90] flex items-center justify-center bg-black/45 p-4"
		@click.self="$emit('close')"
	>
		<div class="w-full max-w-md rounded-[28px] border border-[#e7e4dd] bg-[#fffefd] p-6 shadow-2xl">
			<div class="flex items-start gap-4">
				<div class="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
					<UIcon name="i-heroicons-arrow-left-on-rectangle" class="h-6 w-6" />
				</div>
				<div class="min-w-0 flex-1">
					<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Logout</p>
					<h3 class="mt-2 text-xl font-semibold tracking-[-0.03em] text-stone-950">ออกจากระบบตอนนี้หรือไม่</h3>
					<p class="mt-2 text-sm leading-6 text-stone-500">หากยืนยัน ระบบจะพาคุณกลับไปหน้าเข้าสู่ระบบทันที โดยรอบนี้ยังเป็น UI preview เท่านั้น</p>
				</div>
			</div>

			<div class="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
				<UButton
					color="gray"
					variant="soft"
					size="lg"
					class="justify-center rounded-2xl"
					label="ยกเลิก"
					@click="$emit('close')"
				/>
				<UButton
					color="orange"
					size="lg"
					class="justify-center rounded-2xl"
					label="ออกจากระบบ"
					@click="$emit('confirm')"
				/>
			</div>
		</div>
	</div>
</template>
