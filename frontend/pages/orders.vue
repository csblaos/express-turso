<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type OrderStatus = "pending" | "confirmed" | "preparing" | "ready" | "completed" | "cancelled";
type FulfillmentType = "walk-in" | "pickup" | "delivery";
type PaymentStatus = "unpaid" | "partial" | "paid" | "refunded";

type OrderLine = {
	id: string;
	name: string;
	sku: string;
	qty: number;
	price: number;
	note?: string;
};

type OrderRecord = {
	id: string;
	orderNumber: string;
	customerName: string;
	channel: FulfillmentType;
	status: OrderStatus;
	paymentStatus: PaymentStatus;
	total: number;
	itemCount: number;
	createdAt: string;
	updatedAt: string;
	cashier: string;
	tableLabel?: string;
	phone?: string;
	note?: string;
	lines: OrderLine[];
};

const searchQuery = ref("");
const activeStatus = ref<"all" | OrderStatus>("all");
const activeChannel = ref<"all" | FulfillmentType>("all");
const activePaymentStatus = ref<"all" | PaymentStatus>("all");
const activeView = ref<"all" | "attention" | "completed">("all");
const detailOpen = ref(false);
const selectedOrderId = ref("");

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
	dateStyle: "medium",
	timeStyle: "short",
});
const moneyFormatter = new Intl.NumberFormat("th-TH", {
	style: "currency",
	currency: "THB",
	maximumFractionDigits: 0,
});

const orders = ref<OrderRecord[]>([
	{
		id: "1",
		orderNumber: "A-102",
		customerName: "ลูกค้าทั่วไป",
		channel: "walk-in",
		status: "preparing",
		paymentStatus: "paid",
		total: 422,
		itemCount: 4,
		createdAt: "2026-05-06T09:20:00.000Z",
		updatedAt: "2026-05-06T09:29:00.000Z",
		cashier: "Lina Punk",
		tableLabel: "โต๊ะ 6",
		note: "ไม่ใส่น้ำตาลในรายการชา",
		lines: [
			{ id: "1", name: "ลาเต้เย็น", sku: "CF-LAT-16", qty: 2, price: 95 },
			{ id: "2", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
			{ id: "3", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 1, price: 105 },
			{ id: "4", name: "Service", sku: "SV-0001", qty: 1, price: 42 },
		],
	},
	{
		id: "2",
		orderNumber: "D-214",
		customerName: "Mina Phone",
		channel: "delivery",
		status: "confirmed",
		paymentStatus: "paid",
		total: 560,
		itemCount: 5,
		createdAt: "2026-05-06T08:54:00.000Z",
		updatedAt: "2026-05-06T09:10:00.000Z",
		cashier: "Noy Chan",
		phone: "020 55 221 889",
		note: "โทรก่อนถึง",
		lines: [
			{ id: "1", name: "ชาไทยนมสด", sku: "TE-THM-16", qty: 2, price: 90 },
			{ id: "2", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 2, price: 105 },
			{ id: "3", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
		],
	},
	{
		id: "3",
		orderNumber: "P-078",
		customerName: "Anya Dee",
		channel: "pickup",
		status: "ready",
		paymentStatus: "partial",
		total: 280,
		itemCount: 3,
		createdAt: "2026-05-06T07:42:00.000Z",
		updatedAt: "2026-05-06T08:01:00.000Z",
		cashier: "Ked Phone",
		phone: "020 77 339 221",
		lines: [
			{ id: "1", name: "อเมริกาโน่", sku: "CF-AMR-16", qty: 2, price: 80 },
			{ id: "2", name: "ชามัทฉะคลาวด์", sku: "TE-MAT-16", qty: 1, price: 120 },
		],
	},
	{
		id: "4",
		orderNumber: "A-101",
		customerName: "ลูกค้าทั่วไป",
		channel: "walk-in",
		status: "completed",
		paymentStatus: "paid",
		total: 180,
		itemCount: 2,
		createdAt: "2026-05-06T06:55:00.000Z",
		updatedAt: "2026-05-06T07:04:00.000Z",
		cashier: "Ann Dee",
		lines: [
			{ id: "1", name: "ลาเต้เย็น", sku: "CF-LAT-16", qty: 1, price: 95 },
			{ id: "2", name: "ครอฟเฟิลเนยสด", sku: "BK-CRF-01", qty: 1, price: 85 },
		],
	},
	{
		id: "5",
		orderNumber: "D-213",
		customerName: "Khamla Sip",
		channel: "delivery",
		status: "cancelled",
		paymentStatus: "refunded",
		total: 210,
		itemCount: 2,
		createdAt: "2026-05-06T05:15:00.000Z",
		updatedAt: "2026-05-06T05:26:00.000Z",
		cashier: "Lina Punk",
		note: "ลูกค้ายกเลิกก่อนจัดส่ง",
		lines: [
			{ id: "1", name: "ยูซุโซดา", sku: "TE-YUZ-16", qty: 2, price: 105 },
		],
	},
]);

const filteredOrders = computed(() => {
	const query = searchQuery.value.trim().toLowerCase();

	return orders.value.filter((order) => {
		const matchesQuery = !query || [
			order.orderNumber,
			order.customerName,
			order.cashier,
			order.phone || "",
		].some((value) => value.toLowerCase().includes(query));

		const matchesStatus = activeStatus.value === "all" || order.status === activeStatus.value;
		const matchesChannel = activeChannel.value === "all" || order.channel === activeChannel.value;
		const matchesPayment = activePaymentStatus.value === "all" || order.paymentStatus === activePaymentStatus.value;

		const matchesView =
			activeView.value === "all"
			|| (activeView.value === "attention" && ["pending", "confirmed", "preparing", "ready"].includes(order.status))
			|| (activeView.value === "completed" && ["completed", "cancelled"].includes(order.status));

		return matchesQuery && matchesStatus && matchesChannel && matchesPayment && matchesView;
	});
});

const selectedOrder = computed(() =>
	filteredOrders.value.find((order) => order.id === selectedOrderId.value)
	?? filteredOrders.value[0]
	?? null,
);

const totalOrders = computed(() => orders.value.length);
const openOrders = computed(() => orders.value.filter((order) => ["pending", "confirmed", "preparing", "ready"].includes(order.status)).length);
const deliveryOrders = computed(() => orders.value.filter((order) => order.channel === "delivery").length);
const avgTicket = computed(() => {
	if (!orders.value.length) return 0;
	return Math.round(orders.value.reduce((sum, order) => sum + order.total, 0) / orders.value.length);
});

watch(filteredOrders, (value) => {
	if (!value.length) {
		selectedOrderId.value = "";
		detailOpen.value = false;
		return;
	}
	if (!value.some((order) => order.id === selectedOrderId.value)) {
		selectedOrderId.value = value[0].id;
	}
}, { immediate: true });

function formatDate(value: string) {
	try {
		return dateFormatter.format(new Date(value));
	} catch {
		return value;
	}
}

function formatMoney(value: number) {
	return moneyFormatter.format(value || 0);
}

function statusColor(status: OrderStatus) {
	if (status === "completed") return "green";
	if (status === "ready") return "blue";
	if (status === "cancelled") return "red";
	if (status === "preparing") return "orange";
	return "gray";
}

function paymentColor(status: PaymentStatus) {
	if (status === "paid") return "green";
	if (status === "partial") return "orange";
	if (status === "refunded") return "red";
	return "gray";
}

function channelLabel(channel: FulfillmentType) {
	if (channel === "walk-in") return "หน้าร้าน";
	if (channel === "pickup") return "รับกลับ";
	return "เดลิเวอรี";
}

function statusLabel(status: OrderStatus) {
	if (status === "pending") return "รอรับออเดอร์";
	if (status === "confirmed") return "ยืนยันแล้ว";
	if (status === "preparing") return "กำลังเตรียม";
	if (status === "ready") return "พร้อมส่งมอบ";
	if (status === "completed") return "เสร็จสิ้น";
	return "ยกเลิก";
}

function paymentLabel(status: PaymentStatus) {
	if (status === "unpaid") return "ยังไม่ชำระ";
	if (status === "partial") return "ชำระบางส่วน";
	if (status === "paid") return "ชำระแล้ว";
	return "คืนเงินแล้ว";
}

function openDetail(orderId: string) {
	selectedOrderId.value = orderId;
	detailOpen.value = true;
}

function closeDetail() {
	detailOpen.value = false;
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['orders']"
		sidebar-eyebrow="Orders"
		sidebar-title="ออเดอร์"
		sidebar-compact-title="ORD"
		sidebar-description="ภาพรวมออเดอร์, สถานะการขาย, ช่องทางรับสินค้า และคิวที่ต้องติดตาม"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<UCard class="border-0 bg-white shadow-lg ring-1 ring-[#e7e4dd] lg:sticky lg:top-0 lg:z-20">
					<div class="space-y-4">
						<div class="flex items-start gap-3">
							<UButton
								color="gray"
								variant="soft"
								size="lg"
								class="justify-center lg:hidden"
								icon="i-heroicons-bars-3-20-solid"
								aria-label="เปิดเมนู"
								title="เปิดเมนู"
								@click="openSidebar"
							/>
							<div class="min-w-0">
								<div class="flex flex-wrap items-center gap-2">
									<UBadge color="orange" variant="soft" label="ออเดอร์" />
									<UBadge color="gray" variant="soft" label="UI mock" />
								</div>
								<h1 class="mt-3 text-2xl font-semibold tracking-[-0.04em] text-stone-950">จัดการออเดอร์</h1>
								<p class="mt-1 text-sm text-stone-500">รอบนี้เป็น UI อย่างเดียวก่อน โฟกัสที่งานค้นหา, ติดตามสถานะ, และเปิดรายละเอียดออเดอร์อย่างรวดเร็ว</p>
							</div>
						</div>

						<div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_auto_auto_auto]">
							<div class="relative">
								<UIcon name="i-heroicons-magnifying-glass-20-solid" class="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-stone-400" />
								<input
									v-model="searchQuery"
									type="text"
									placeholder="ค้นหาเลขออเดอร์, ลูกค้า, เบอร์โทร หรือแคชเชียร์"
									class="w-full rounded-2xl border border-[#e7e4dd] bg-white py-3 pl-11 pr-10 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]"
								>
								<button
									v-if="searchQuery"
									type="button"
									class="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-stone-400 transition hover:bg-[#f5f5f4] hover:text-stone-700"
									@click="searchQuery = ''"
								>
									<UIcon name="i-heroicons-x-mark-20-solid" class="h-4 w-4" />
								</button>
							</div>

							<select v-model="activeStatus" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option value="all">ทุกสถานะ</option>
								<option value="pending">รอรับออเดอร์</option>
								<option value="confirmed">ยืนยันแล้ว</option>
								<option value="preparing">กำลังเตรียม</option>
								<option value="ready">พร้อมส่งมอบ</option>
								<option value="completed">เสร็จสิ้น</option>
								<option value="cancelled">ยกเลิก</option>
							</select>

							<select v-model="activeChannel" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option value="all">ทุกช่องทาง</option>
								<option value="walk-in">หน้าร้าน</option>
								<option value="pickup">รับกลับ</option>
								<option value="delivery">เดลิเวอรี</option>
							</select>

							<select v-model="activePaymentStatus" class="rounded-2xl border border-[#e7e4dd] bg-white px-4 py-3 text-sm text-stone-900 shadow-sm outline-none transition focus:border-[#d9d5cd] focus:ring-2 focus:ring-[#f3c7a7]">
								<option value="all">ทุกการชำระ</option>
								<option value="unpaid">ยังไม่ชำระ</option>
								<option value="partial">ชำระบางส่วน</option>
								<option value="paid">ชำระแล้ว</option>
								<option value="refunded">คืนเงินแล้ว</option>
							</select>
						</div>

						<div class="flex flex-wrap gap-2">
							<UButton :color="activeView === 'all' ? 'orange' : 'gray'" :variant="activeView === 'all' ? 'solid' : 'soft'" label="ทั้งหมด" @click="activeView = 'all'" />
							<UButton :color="activeView === 'attention' ? 'orange' : 'gray'" :variant="activeView === 'attention' ? 'solid' : 'soft'" label="ต้องติดตาม" @click="activeView = 'attention'" />
							<UButton :color="activeView === 'completed' ? 'orange' : 'gray'" :variant="activeView === 'completed' ? 'solid' : 'soft'" label="เสร็จสิ้น/ยกเลิก" @click="activeView = 'completed'" />
						</div>

						<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">ออเดอร์ทั้งหมด</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ totalOrders }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">คิวเปิดอยู่</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ openOrders }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">เดลิเวอรี</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ deliveryOrders }}</p>
							</div>
							<div class="rounded-2xl border border-[#e7e4dd] bg-[#fffefd] p-4">
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">บิลเฉลี่ย</p>
								<p class="mt-2 text-2xl font-semibold text-stone-950">{{ formatMoney(avgTicket) }}</p>
							</div>
						</div>
					</div>
				</UCard>

				<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto lg:pr-1">
					<div
						v-for="order in filteredOrders"
						:key="order.id"
						class="rounded-[24px] border border-[#e7e4dd] bg-white p-4 shadow-sm transition hover:shadow-md"
						:class="selectedOrderId === order.id ? 'ring-2 ring-[#f3c7a7]' : ''"
					>
						<button type="button" class="w-full text-left" @click="openDetail(order.id)">
							<div class="flex flex-wrap items-start justify-between gap-4">
								<div class="min-w-0">
									<div class="flex flex-wrap items-center gap-2">
										<UBadge :color="statusColor(order.status)" variant="soft" :label="statusLabel(order.status)" />
										<UBadge :color="paymentColor(order.paymentStatus)" variant="soft" :label="paymentLabel(order.paymentStatus)" />
										<UBadge color="gray" variant="soft" :label="channelLabel(order.channel)" />
									</div>
									<p class="mt-3 text-base font-semibold text-stone-950">{{ order.orderNumber }} · {{ order.customerName }}</p>
									<p class="mt-1 text-sm text-stone-500">
										{{ order.cashier }}
										<span v-if="order.phone">· {{ order.phone }}</span>
										<span v-if="order.tableLabel">· {{ order.tableLabel }}</span>
									</p>
									<p v-if="order.note" class="mt-2 text-xs text-stone-400">{{ order.note }}</p>
								</div>

								<div class="grid gap-3 text-right sm:grid-cols-4 sm:text-left">
									<div>
										<p class="text-xs text-stone-400">จำนวนสินค้า</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ order.itemCount }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">ยอดรวม</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatMoney(order.total) }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">สร้างเมื่อ</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatDate(order.createdAt) }}</p>
									</div>
									<div>
										<p class="text-xs text-stone-400">อัปเดตล่าสุด</p>
										<p class="mt-1 text-sm font-semibold text-stone-900">{{ formatDate(order.updatedAt) }}</p>
									</div>
								</div>
							</div>
						</button>
					</div>

					<UCard v-if="!filteredOrders.length" class="border border-dashed border-[#d9d5cd] bg-[#fbfbf8] shadow-none">
						<div class="space-y-3 py-12 text-center">
							<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-white text-stone-400 ring-1 ring-[#e7e4dd]">
								<UIcon name="i-heroicons-receipt-percent" class="h-6 w-6" />
							</div>
							<div>
								<p class="text-sm font-medium text-stone-900">ไม่พบออเดอร์ที่ตรงกับเงื่อนไข</p>
								<p class="mt-1 text-sm text-stone-500">ลองล้างคำค้นหรือเปลี่ยน filter ด้านบน</p>
							</div>
						</div>
					</UCard>
				</div>
			</div>

			<Transition
				enter-active-class="transition duration-200 ease-out"
				enter-from-class="opacity-0"
				enter-to-class="opacity-100"
				leave-active-class="transition duration-150 ease-in"
				leave-from-class="opacity-100"
				leave-to-class="opacity-0"
			>
				<div
					v-if="detailOpen"
					class="fixed inset-0 z-[58] bg-[rgba(28,25,23,0.42)] backdrop-blur-[2px]"
					@click="closeDetail"
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
					v-if="detailOpen && selectedOrder"
					class="fixed inset-x-0 bottom-0 z-[59] max-h-[88vh] rounded-t-[28px] bg-[#fffefd] shadow-2xl ring-1 ring-[#e7e4dd] lg:inset-y-0 lg:right-0 lg:left-auto lg:h-full lg:max-h-none lg:w-[460px] lg:rounded-none lg:rounded-l-[28px]"
				>
					<div class="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)_auto] p-4 text-stone-900">
						<div class="border-b border-[#e7e4dd] pb-4">
							<div class="flex items-start justify-between gap-3">
								<div>
									<p class="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-400">Order detail</p>
									<h2 class="mt-2 text-lg font-semibold tracking-[-0.04em] text-stone-950">รายละเอียดออเดอร์</h2>
								</div>
								<UButton
									color="gray"
									variant="soft"
									size="xs"
									icon="i-heroicons-x-mark-20-solid"
									aria-label="ปิดรายละเอียดออเดอร์"
									title="ปิดรายละเอียดออเดอร์"
									@click="closeDetail"
								/>
							</div>

							<div class="mt-4 rounded-[24px] bg-[#fbfbf8] p-3 ring-1 ring-[#e7e4dd]">
								<div class="flex items-start gap-3">
									<div class="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#fbf1ea] text-[#97532c] ring-1 ring-[#efd7c6]">
										<UIcon name="i-heroicons-receipt-percent" class="h-6 w-6" />
									</div>
									<div class="min-w-0 flex-1">
										<div class="flex flex-wrap items-start justify-between gap-2">
											<div class="min-w-0">
												<h3 class="truncate text-lg font-semibold text-stone-950">{{ selectedOrder.orderNumber }}</h3>
												<p class="mt-1 truncate text-sm text-stone-500">{{ selectedOrder.customerName }}</p>
											</div>
											<UBadge :color="statusColor(selectedOrder.status)" variant="soft" :label="statusLabel(selectedOrder.status)" />
										</div>

										<div class="mt-3 flex flex-wrap gap-2">
											<UBadge :color="paymentColor(selectedOrder.paymentStatus)" variant="soft" :label="paymentLabel(selectedOrder.paymentStatus)" />
											<UBadge color="gray" variant="soft" :label="channelLabel(selectedOrder.channel)" />
											<UBadge color="gray" variant="soft" :label="selectedOrder.cashier" />
										</div>
									</div>
								</div>
							</div>
						</div>

						<div class="scrollbar-soft min-h-0 space-y-3 overflow-y-auto py-4 pr-1">
							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<h3 class="text-sm font-semibold text-stone-950">สรุปข้อมูลหลัก</h3>
								<dl class="mt-4 space-y-3 text-sm">
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">ช่องทาง</dt>
										<dd class="text-right font-medium text-stone-900">{{ channelLabel(selectedOrder.channel) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">สร้างเมื่อ</dt>
										<dd class="text-right font-medium text-stone-900">{{ formatDate(selectedOrder.createdAt) }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4 border-b border-[#ece6dc] pb-3">
										<dt class="text-stone-500">จำนวนสินค้า</dt>
										<dd class="text-right font-medium text-stone-900">{{ selectedOrder.itemCount }}</dd>
									</div>
									<div class="flex items-start justify-between gap-4">
										<dt class="text-stone-500">ยอดรวม</dt>
										<dd class="text-right font-medium text-stone-900">{{ formatMoney(selectedOrder.total) }}</dd>
									</div>
								</dl>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<div class="flex items-center justify-between gap-2">
									<h3 class="text-sm font-semibold text-stone-950">รายการสินค้าในบิล</h3>
									<UBadge color="gray" variant="soft" :label="`${selectedOrder.lines.length} รายการ`" />
								</div>

								<div class="mt-4 space-y-3">
									<div
										v-for="line in selectedOrder.lines"
										:key="line.id"
										class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-900">{{ line.name }}</p>
												<p class="mt-1 text-xs text-stone-500">{{ line.sku }} · {{ line.qty }} x {{ formatMoney(line.price) }}</p>
												<p v-if="line.note" class="mt-2 text-xs text-stone-400">{{ line.note }}</p>
											</div>
											<p class="text-sm font-semibold text-stone-900">{{ formatMoney(line.qty * line.price) }}</p>
										</div>
									</div>
								</div>
							</div>

							<div class="rounded-[24px] bg-[#fbfbf8] p-4 ring-1 ring-[#e7e4dd]">
								<h3 class="text-sm font-semibold text-stone-950">หมายเหตุและข้อมูลติดต่อ</h3>
								<div class="mt-4 space-y-3 text-sm text-stone-600">
									<div class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]">
										<p class="text-xs text-stone-400">ลูกค้า</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.customerName }}</p>
									</div>
									<div class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]">
										<p class="text-xs text-stone-400">เบอร์โทร</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.phone || "-" }}</p>
									</div>
									<div class="rounded-2xl bg-white px-4 py-3 ring-1 ring-[#e7e4dd]">
										<p class="text-xs text-stone-400">หมายเหตุ</p>
										<p class="mt-1 font-medium text-stone-900">{{ selectedOrder.note || "-" }}</p>
									</div>
								</div>
							</div>
						</div>

						<div class="border-t border-[#e7e4dd] pt-4">
							<div class="grid grid-cols-2 gap-2">
								<UButton color="gray" variant="soft" size="lg" label="พิมพ์บิล" />
								<UButton color="orange" variant="solid" size="lg" label="อัปเดตสถานะ" />
							</div>
						</div>
					</div>
				</div>
			</Transition>
		</template>
	</AppSidebarShell>
</template>
