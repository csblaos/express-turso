<script setup lang="ts">
import { formatAppDate } from "~/utils/date-format";

type Field = "from" | "to";
type CalendarDay = {
	date: string;
	day: number;
	isCurrentMonth: boolean;
	isToday: boolean;
	isSelected: boolean;
	isInRange: boolean;
};

const props = withDefaults(defineProps<{
	from: string;
	to: string;
	fromLabel?: string;
	toLabel?: string;
	selectLabel?: string;
	startTitle?: string;
	endTitle?: string;
	pickHint?: string;
	todayLabel?: string;
	clearLabel?: string;
	closeLabel?: string;
}>(), {
	fromLabel: "",
	toLabel: "",
	selectLabel: "",
	startTitle: "",
	endTitle: "",
	pickHint: "",
	todayLabel: "",
	clearLabel: "",
	closeLabel: "",
});

const emit = defineEmits<{
	(event: "update:from", value: string): void;
	(event: "update:to", value: string): void;
}>();

const { locale } = useI18n();
const appLocale = computed(() => locale.value as "th" | "lo" | "en");
const open = ref(false);
const field = ref<Field>("from");
const month = ref(startOfMonth(new Date()));

const fallback = computed(() => appLocale.value === "lo"
	? { from: "ຈາກວັນທີ", to: "ເຖິງວັນທີ", select: "ເລືອກວັນທີ", start: "ເລືອກວັນເລີ່ມ", end: "ເລືອກວັນສິ້ນສຸດ", pick: "ແຕະວັນທີທີ່ຕ້ອງການ", today: "ມື້ນີ້", clear: "ລ້າງ", close: "ປິດ" }
	: appLocale.value === "en"
		? { from: "From date", to: "To date", select: "Select date", start: "Select start date", end: "Select end date", pick: "Tap a date to select it", today: "Today", clear: "Clear", close: "Close" }
		: { from: "จากวันที่", to: "ถึงวันที่", select: "เลือกวันที่", start: "เลือกวันเริ่มต้น", end: "เลือกวันสิ้นสุด", pick: "แตะวันที่ที่ต้องการ", today: "วันนี้", clear: "ล้าง", close: "ปิด" });

const labels = computed(() => ({
	from: props.fromLabel || fallback.value.from,
	to: props.toLabel || fallback.value.to,
	select: props.selectLabel || fallback.value.select,
	start: props.startTitle || fallback.value.start,
	end: props.endTitle || fallback.value.end,
	pick: props.pickHint || fallback.value.pick,
	today: props.todayLabel || fallback.value.today,
	clear: props.clearLabel || fallback.value.clear,
	close: props.closeLabel || fallback.value.close,
}));
const weekdays = computed(() => appLocale.value === "lo"
	? ["ອາ", "ຈ", "ອ", "ພ", "ພຫ", "ສ", "ສ"]
	: appLocale.value === "en" ? ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] : ["อา", "จ", "อ", "พ", "พฤ", "ศ", "ส"]);

function pad2(value: number) {
	return String(value).padStart(2, "0");
}
function dateValue(date: Date) {
	return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}
function parseDate(value: string) {
	const parsed = value ? new Date(`${value}T00:00:00`) : null;
	return parsed && !Number.isNaN(parsed.getTime()) ? parsed : null;
}
function startOfMonth(date: Date) {
	return new Date(date.getFullYear(), date.getMonth(), 1);
}
function formatted(value: string) {
	const parsed = parseDate(value);
	return parsed ? formatAppDate(parsed, appLocale.value, { dateStyle: appLocale.value === "lo" ? "long" : "medium" }) : labels.value.select;
}
function show(target: Field) {
	field.value = target;
	month.value = startOfMonth(parseDate(target === "from" ? props.from : props.to) || new Date());
	open.value = true;
}
function setValue(value: string) {
	if (field.value === "from") {
		emit("update:from", value);
		if (props.to && props.to < value) emit("update:to", value);
	} else {
		emit("update:to", value);
		if (props.from && props.from > value) emit("update:from", value);
	}
}
function moveMonth(offset: number) {
	const next = new Date(month.value);
	next.setMonth(next.getMonth() + offset);
	month.value = startOfMonth(next);
}
function pick(day: CalendarDay) {
	if (!day.isCurrentMonth) return;
	setValue(day.date);
	open.value = false;
}
function pickToday() {
	setValue(dateValue(new Date()));
	open.value = false;
}
function clear() {
	if (field.value === "from") emit("update:from", "");
	else emit("update:to", "");
	open.value = false;
}

const currentValue = computed(() => field.value === "from" ? props.from : props.to);
const monthLabel = computed(() => formatAppDate(month.value, appLocale.value, { month: "long", year: "numeric" }));
const weeks = computed(() => {
	const first = startOfMonth(month.value);
	const gridStart = new Date(first);
	gridStart.setDate(gridStart.getDate() - first.getDay());
	const days = Array.from({ length: 42 }, (_, index): CalendarDay => {
		const current = new Date(gridStart);
		current.setDate(gridStart.getDate() + index);
		const date = dateValue(current);
		return {
			date,
			day: current.getDate(),
			isCurrentMonth: current.getMonth() === first.getMonth() && current.getFullYear() === first.getFullYear(),
			isToday: date === dateValue(new Date()),
			isSelected: date === currentValue.value,
			isInRange: Boolean(props.from && props.to && date >= props.from && date <= props.to),
		};
	});
	return Array.from({ length: 6 }, (_, index) => days.slice(index * 7, index * 7 + 7));
});
</script>

<template>
	<div class="grid grid-cols-2 gap-2">
		<div class="min-w-0">
			<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ labels.from }}</label>
			<button type="button" class="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 text-left text-sm font-medium text-stone-800 shadow-sm outline-none transition hover:border-primary-300 hover:bg-primary-50/40 focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#1b1713] dark:text-stone-100" @click="show('from')">
				<span class="truncate">{{ from ? formatted(from) : labels.select }}</span>
				<UIcon name="i-heroicons-calendar-days-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
			</button>
		</div>
		<div class="min-w-0">
			<label class="mb-1 block text-[11px] font-medium text-stone-500">{{ labels.to }}</label>
			<button type="button" class="flex h-11 w-full items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-4 text-left text-sm font-medium text-stone-800 shadow-sm outline-none transition hover:border-primary-300 hover:bg-primary-50/40 focus:border-primary-300 focus:ring-2 focus:ring-primary-200 dark:border-[#3a332a] dark:bg-[#1b1713] dark:text-stone-100" @click="show('to')">
				<span class="truncate">{{ to ? formatted(to) : labels.select }}</span>
				<UIcon name="i-heroicons-calendar-days-20-solid" class="h-4 w-4 shrink-0 text-stone-400" />
			</button>
		</div>

		<AppResponsivePanel v-model="open" :title="field === 'from' ? labels.start : labels.end" :description="currentValue ? formatted(currentValue) : labels.pick" desktop-width="420px" close-button-size="md" compact-header full-bleed-header content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden">
			<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900 dark:text-stone-100">
				<div class="min-h-0 overflow-y-auto py-2">
					<div class="rounded-none border border-neutral-200 bg-neutral-50 p-4 shadow-sm sm:rounded-md dark:border-[#3a332a] dark:bg-[#221d18]">
						<div class="flex items-center justify-between gap-2">
							<AppButton color="neutral" variant="soft" size="xs" icon="i-heroicons-chevron-left-20-solid" @click="moveMonth(-1)" />
							<div class="text-sm font-semibold">{{ monthLabel }}</div>
							<AppButton color="neutral" variant="soft" size="xs" icon="i-heroicons-chevron-right-20-solid" @click="moveMonth(1)" />
						</div>
						<div class="mt-4 grid grid-cols-7 gap-1 text-center text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400">
							<div v-for="label in weekdays" :key="label" class="py-1">{{ label }}</div>
						</div>
						<div class="mt-2 space-y-1">
							<div v-for="week in weeks" :key="week[0]?.date" class="grid grid-cols-7 gap-1">
								<button v-for="day in week" :key="day.date" type="button" class="flex h-11 items-center justify-center rounded-md text-sm font-medium transition" :class="day.isCurrentMonth ? day.isSelected ? 'bg-primary-600 text-white shadow-sm' : day.isInRange ? 'bg-primary-50 text-primary-700' : day.isToday ? 'bg-amber-50 text-amber-700 ring-1 ring-amber-200' : 'bg-white text-stone-800 ring-1 ring-neutral-200 hover:bg-primary-50/50 dark:bg-[#1b1713] dark:text-stone-100 dark:ring-[#3a332a]' : 'bg-transparent text-stone-300 ring-1 ring-transparent'" :disabled="!day.isCurrentMonth" @click="pick(day)">
									{{ day.day }}
								</button>
							</div>
						</div>
					</div>
				</div>
				<div class="shrink-0 border-t border-neutral-200 bg-white px-4 py-3 dark:border-[#3a332a] dark:bg-[#1b1713]">
					<div class="grid grid-cols-3 gap-2">
						<AppButton color="neutral" variant="soft" icon="i-heroicons-calendar-days-20-solid" :label="labels.today" @click="pickToday" />
						<AppButton color="neutral" variant="soft" icon="i-heroicons-eraser-20-solid" :label="labels.clear" @click="clear" />
						<AppButton color="primary" :label="labels.close" @click="open = false" />
					</div>
				</div>
			</div>
		</AppResponsivePanel>
	</div>
</template>
