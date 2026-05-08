<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type MetricCard = {
	id: string;
	label: string;
	value: string;
	change: string;
	tone: "success" | "warning" | "info" | "neutral";
};

type PaymentMix = {
	id: string;
	label: string;
	amount: string;
	percent: number;
	colorClass: string;
};

type TopProduct = {
	id: string;
	name: string;
	sku: string;
	qty: number;
	revenue: string;
	trend: string;
};

type LowStockItem = {
	id: string;
	name: string;
	remaining: number;
	threshold: number;
	status: string;
};

type HourlyPoint = {
	hour: string;
	value: number;
};

type StaffRank = {
	id: string;
	name: string;
	orders: number;
	sales: string;
	avgTicket: string;
};

const activeRange = ref<"today" | "week" | "month">("today");
const activeBranch = ref("all");
const activeReportView = ref<"sales" | "products" | "operations">("sales");

const metricCards = computed<MetricCard[]>(() => {
	if (activeRange.value === "today") {
		return [
			{ id: "sales", label: "ยอดขายวันนี้", value: "฿48,920", change: "+12.4%", tone: "success" },
			{ id: "orders", label: "จำนวนบิล", value: "186", change: "+8 บิล", tone: "info" },
			{ id: "avg", label: "บิลเฉลี่ย", value: "฿263", change: "+฿14", tone: "warning" },
			{ id: "refund", label: "ยกเลิก/คืนเงิน", value: "3 รายการ", change: "คงที่", tone: "neutral" },
		];
	}

	if (activeRange.value === "week") {
		return [
			{ id: "sales", label: "ยอดขาย 7 วัน", value: "฿312,440", change: "+9.2%", tone: "success" },
			{ id: "orders", label: "จำนวนบิล", value: "1,084", change: "+72 บิล", tone: "info" },
			{ id: "avg", label: "บิลเฉลี่ย", value: "฿288", change: "+฿11", tone: "warning" },
			{ id: "refund", label: "ยกเลิก/คืนเงิน", value: "12 รายการ", change: "-1 รายการ", tone: "neutral" },
		];
	}

	return [
		{ id: "sales", label: "ยอดขาย 30 วัน", value: "฿1,284,600", change: "+15.8%", tone: "success" },
		{ id: "orders", label: "จำนวนบิล", value: "4,012", change: "+264 บิล", tone: "info" },
		{ id: "avg", label: "บิลเฉลี่ย", value: "฿320", change: "+฿26", tone: "warning" },
		{ id: "refund", label: "ยกเลิก/คืนเงิน", value: "41 รายการ", change: "+4 รายการ", tone: "neutral" },
	];
});

const paymentMix: PaymentMix[] = [
	{ id: "cash", label: "เงินสด", amount: "฿18,240", percent: 37, colorClass: "bg-[#c97745]" },
	{ id: "qr", label: "QR / โอน", amount: "฿20,180", percent: 41, colorClass: "bg-[#73b06f]" },
	{ id: "card", label: "บัตร", amount: "฿7,540", percent: 15, colorClass: "bg-[#729ad8]" },
	{ id: "other", label: "อื่น ๆ", amount: "฿2,960", percent: 7, colorClass: "bg-[#b6ada1]" },
];

const topProducts: TopProduct[] = [
	{ id: "1", name: "ลาเต้เย็น", sku: "CF-LAT-16", qty: 84, revenue: "฿7,980", trend: "+14%" },
	{ id: "2", name: "ชาไทยนมสด", sku: "TE-THM-16", qty: 70, revenue: "฿6,300", trend: "+9%" },
	{ id: "3", name: "อเมริกาโน่", sku: "CF-AMR-16", qty: 62, revenue: "฿4,960", trend: "+6%" },
	{ id: "4", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 49, revenue: "฿4,165", trend: "+18%" },
	{ id: "5", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 38, revenue: "฿3,990", trend: "-3%" },
	];

const lowStockItems: LowStockItem[] = [
	{ id: "1", name: "ชามัทฉะคลาวด์", remaining: 9, threshold: 12, status: "ต่ำกว่าจุดเตือน" },
	{ id: "2", name: "ครอฟเฟิลเนยสด", remaining: 6, threshold: 8, status: "ใกล้หมด" },
	{ id: "3", name: "เมล็ดกาแฟคั่วพิเศษ 250 กรัม", remaining: 3, threshold: 5, status: "ต้องเติมสต็อก" },
	{ id: "4", name: "นมโอ๊ตสำหรับเพิ่ม", remaining: 0, threshold: 4, status: "หมดสต็อก" },
];

const hourlySales: HourlyPoint[] = [
	{ hour: "08:00", value: 18 },
	{ hour: "09:00", value: 32 },
	{ hour: "10:00", value: 46 },
	{ hour: "11:00", value: 62 },
	{ hour: "12:00", value: 78 },
	{ hour: "13:00", value: 72 },
	{ hour: "14:00", value: 58 },
	{ hour: "15:00", value: 64 },
	{ hour: "16:00", value: 55 },
	{ hour: "17:00", value: 43 },
	];

const staffRanks: StaffRank[] = [
	{ id: "1", name: "Lina Punk", orders: 48, sales: "฿12,860", avgTicket: "฿268" },
	{ id: "2", name: "Noy Chan", orders: 42, sales: "฿10,920", avgTicket: "฿260" },
	{ id: "3", name: "Ked Phone", orders: 37, sales: "฿9,480", avgTicket: "฿256" },
	{ id: "4", name: "Ann Dee", orders: 29, sales: "฿7,140", avgTicket: "฿246" },
];

function metricToneClass(tone: MetricCard["tone"]) {
	if (tone === "success") return "text-emerald-700 bg-emerald-50 ring-emerald-100";
	if (tone === "warning") return "text-orange-700 bg-orange-50 ring-orange-100";
	if (tone === "info") return "text-blue-700 bg-blue-50 ring-blue-100";
	return "text-stone-600 bg-stone-50 ring-stone-200";
}

function barHeight(value: number) {
	return `${Math.max(14, value)}%`;
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['reports']"
		sidebar-eyebrow="Reports"
		sidebar-title="รายงาน"
		sidebar-compact-title="REP"
		sidebar-description="ภาพรวมยอดขาย, สินค้าขายดี, วิธีชำระเงิน และสัญญาณเชิงปฏิบัติการสำหรับ owner/manager"
	>
		<template #default="{ openSidebar }">
			<section class="min-w-0 flex-1 px-0 py-3 sm:py-4 lg:min-h-0 lg:overflow-hidden">
				<div class="space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-3">
					<AppPageHeader
						title="แดชบอร์ดรายงาน"
						description="สรุปยอดขาย สินค้าขายดี วิธีชำระเงิน และสัญญาณเชิงปฏิบัติการ"
						@menu="openSidebar"
					>
						<div class="grid gap-3 xl:grid-cols-[auto_auto_minmax(0,1fr)_auto]">
							<div class="flex flex-wrap gap-2">
								<UButton :color="activeRange === 'today' ? 'primary' : 'neutral'" :variant="activeRange === 'today' ? 'solid' : 'soft'" size="md" class="rounded-md" label="วันนี้" @click="activeRange = 'today'" />
								<UButton :color="activeRange === 'week' ? 'primary' : 'neutral'" :variant="activeRange === 'week' ? 'solid' : 'soft'" size="md" class="rounded-md" label="7 วัน" @click="activeRange = 'week'" />
								<UButton :color="activeRange === 'month' ? 'primary' : 'neutral'" :variant="activeRange === 'month' ? 'solid' : 'soft'" size="md" class="rounded-md" label="30 วัน" @click="activeRange = 'month'" />
							</div>

							<div class="flex flex-wrap gap-2">
								<UButton :color="activeReportView === 'sales' ? 'primary' : 'neutral'" :variant="activeReportView === 'sales' ? 'solid' : 'soft'" size="md" class="rounded-md" label="ยอดขาย" @click="activeReportView = 'sales'" />
								<UButton :color="activeReportView === 'products' ? 'primary' : 'neutral'" :variant="activeReportView === 'products' ? 'solid' : 'soft'" size="md" class="rounded-md" label="สินค้า" @click="activeReportView = 'products'" />
								<UButton :color="activeReportView === 'operations' ? 'primary' : 'neutral'" :variant="activeReportView === 'operations' ? 'solid' : 'soft'" size="md" class="rounded-md" label="ปฏิบัติการ" @click="activeReportView = 'operations'" />
							</div>

							<div class="grid gap-3 sm:grid-cols-2">
								<select v-model="activeBranch" class="rounded-md border border-neutral-200 bg-white px-4 py-2.5 text-sm text-stone-900 shadow-sm outline-none transition focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
									<option value="all">ทุกสาขา</option>
									<option value="main">สาขาท่าเดื่อ</option>
									<option value="mall">สาขาศูนย์การค้า</option>
								</select>
								<div class="rounded-md border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm text-stone-500">
									ช่วงที่เลือก: {{ activeRange === "today" ? "วันนี้" : activeRange === "week" ? "7 วันล่าสุด" : "30 วันล่าสุด" }}
								</div>
							</div>

							<div class="flex flex-wrap gap-2 xl:justify-end">
								<UButton color="neutral" variant="soft" size="md" class="rounded-md" icon="i-heroicons-arrow-down-tray" label="ส่งออก PDF" />
								<UButton color="neutral" variant="soft" size="md" class="rounded-md" icon="i-heroicons-table-cells" label="ส่งออก Excel" />
							</div>
						</div>
					</AppPageHeader>

					<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto lg:pr-1">
						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<div
								v-for="metric in metricCards"
								:key="metric.id"
								class="rounded-none border border-neutral-200 bg-white p-4 shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md"
							>
								<div class="flex items-start justify-between gap-3">
									<div>
										<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ metric.label }}</p>
										<p class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">{{ metric.value }}</p>
									</div>
									<div class="rounded-full px-2.5 py-1 text-xs font-medium ring-1" :class="metricToneClass(metric.tone)">
										{{ metric.change }}
									</div>
								</div>
							</div>
						</div>

						<div class="grid gap-3 xl:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Sales trend</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">ยอดขายตามช่วงเวลา</h2>
										</div>
										<UBadge color="neutral" variant="soft" label="Mock chart" />
									</div>

									<div class="grid h-[280px] grid-cols-10 items-end gap-3 rounded-md bg-neutral-50 p-4 ring-1 ring-neutral-200">
										<div v-for="point in hourlySales" :key="point.hour" class="flex h-full flex-col justify-end gap-2">
											<div class="relative flex-1 overflow-hidden rounded-md bg-white ring-1 ring-[#ece6dc]">
												<div class="absolute inset-x-1 bottom-1 rounded-md bg-gradient-to-t from-[#c97745] to-[#f3c7a7]" :style="{ height: barHeight(point.value) }" />
											</div>
											<p class="text-center text-[11px] font-medium text-stone-500">{{ point.hour }}</p>
										</div>
									</div>
								</div>
							</UCard>

							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Payment mix</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">สัดส่วนวิธีชำระเงิน</h2>
										</div>
										<UBadge color="neutral" variant="soft" label="4 ช่องทาง" />
									</div>

									<div class="space-y-3">
										<div class="flex h-4 overflow-hidden rounded-full bg-[#f3f2ee]">
											<div
												v-for="item in paymentMix"
												:key="item.id"
												:class="item.colorClass"
												:style="{ width: `${item.percent}%` }"
											/>
										</div>

										<div class="space-y-3">
											<div v-for="item in paymentMix" :key="item.id" class="rounded-md border border-neutral-200 bg-[#fffefd] px-4 py-3">
												<div class="flex items-center justify-between gap-3">
													<div class="flex items-center gap-3">
														<div class="h-3 w-3 rounded-full" :class="item.colorClass" />
														<p class="text-sm font-medium text-stone-900">{{ item.label }}</p>
													</div>
													<p class="text-sm font-semibold text-stone-900">{{ item.amount }}</p>
												</div>
												<p class="mt-1 text-xs text-stone-500">{{ item.percent }}%</p>
											</div>
										</div>
									</div>
								</div>
							</UCard>
						</div>

						<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Top products</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">สินค้าขายดี</h2>
										</div>
										<UBadge color="primary" variant="soft" label="Top 5" />
									</div>

									<div class="space-y-3">
										<div
											v-for="product in topProducts"
											:key="product.id"
											class="rounded-md border border-neutral-200 bg-[#fffefd] px-4 py-3"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ product.name }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ product.sku }} · ขาย {{ product.qty }} หน่วย</p>
												</div>
												<div class="text-right">
													<p class="text-sm font-semibold text-stone-900">{{ product.revenue }}</p>
													<p class="mt-1 text-xs" :class="product.trend.startsWith('+') ? 'text-emerald-600' : 'text-rose-600'">{{ product.trend }}</p>
												</div>
											</div>
										</div>
									</div>
								</div>
							</UCard>

							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Staff rank</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">ผลงานพนักงานขาย</h2>
										</div>
										<UBadge color="neutral" variant="soft" label="ตามจำนวนบิล" />
									</div>

									<div class="space-y-3">
										<div
											v-for="staff in staffRanks"
											:key="staff.id"
											class="grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded-md border border-neutral-200 bg-[#fffefd] px-4 py-3"
										>
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ staff.name }}</p>
												<p class="mt-1 text-xs text-stone-500">{{ staff.orders }} บิล · บิลเฉลี่ย {{ staff.avgTicket }}</p>
											</div>
											<p class="text-sm font-semibold text-stone-900">{{ staff.sales }}</p>
										</div>
									</div>
								</div>
							</UCard>
						</div>

						<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(320px,0.8fr)]">
							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Operational signals</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">สัญญาณหน้างานที่ควรติดตาม</h2>
										</div>
										<UBadge color="primary" variant="soft" label="Mock insight" />
									</div>

									<div class="grid gap-3 md:grid-cols-3">
										<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
											<p class="text-sm font-semibold text-stone-900">ชั่วโมงพีค</p>
											<p class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">12:00</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">ออเดอร์หนาแน่นสุดในช่วงกลางวัน ควรเตรียมพนักงานประจำจุดชำระ</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
											<p class="text-sm font-semibold text-stone-900">ช่องทางชำระหลัก</p>
											<p class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">QR / โอน</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">คิดเป็น 41% ของยอดขายช่วงที่เลือก เหมาะกับการเน้น QR counter flow</p>
										</div>
										<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
											<p class="text-sm font-semibold text-stone-900">สินค้าต้องเติมสต็อก</p>
											<p class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">4 SKU</p>
											<p class="mt-1 text-xs leading-5 text-stone-500">ควรสร้าง purchase order หรือ receive plan ก่อนรอบขายถัดไป</p>
										</div>
									</div>
								</div>
							</UCard>

							<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
								<div class="space-y-4">
									<div class="flex items-center justify-between gap-3">
										<div>
											<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Low stock</p>
											<h2 class="mt-2 text-lg font-semibold text-stone-950">รายการใกล้หมด</h2>
										</div>
										<UBadge color="error" variant="soft" :label="`${lowStockItems.length} รายการ`" />
									</div>

									<div class="space-y-3">
										<div
											v-for="item in lowStockItems"
											:key="item.id"
											class="rounded-md border border-neutral-200 bg-[#fffefd] px-4 py-3"
										>
											<div class="flex items-start justify-between gap-3">
												<div class="min-w-0">
													<p class="truncate text-sm font-semibold text-stone-900">{{ item.name }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ item.status }}</p>
												</div>
												<div class="text-right">
													<p class="text-sm font-semibold text-stone-900">{{ item.remaining }}</p>
													<p class="mt-1 text-xs text-stone-500">เตือนที่ {{ item.threshold }}</p>
												</div>
											</div>
										</div>
									</div>
								</div>
							</UCard>
						</div>
					</div>
				</div>
			</section>
		</template>
	</AppSidebarShell>
</template>
