<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type DatabaseUsageSample = {
	database: {
		uuid: string;
		instances: Array<{
			uuid: string;
			usage: {
				rows_read: number;
				rows_written: number;
				storage_bytes: number;
				bytes_synced: number;
			};
		}>;
		usage: {
			rows_read: number;
			rows_written: number;
			storage_bytes: number;
			bytes_synced: number;
		};
	};
	total: {
		rows_read: number;
		rows_written: number;
		storage_bytes: number;
		bytes_synced: number;
	};
};

type RedisUsageSample = {
	database_name: string;
	database_type: string;
	region: string;
	type: string;
	primary_region: string;
	state: string;
	endpoint: string;
	db_max_clients: number;
	db_max_bandwidth: number;
	db_resource_size: string;
	db_memory_threshold: number;
	db_monthly_bandwidth_limit: number;
	db_max_commands_per_second: number;
	db_request_limit: number;
};

type StorageUsageSample = {
	result: {
		end: string;
		payloadSize: string;
		metadataSize: string;
		objectCount: string;
		uploadCount: string;
		infrequentAccessPayloadSize: string;
		infrequentAccessMetadataSize: string;
		infrequentAccessObjectCount: string;
		infrequentAccessUploadCount: string;
	};
};

type ShippingVendorCard = {
	id: string;
	name: string;
	status: "pending" | "ready-later";
	note: string;
	coverage: string;
	usageHint: string;
};

const databaseSample: DatabaseUsageSample = {
	database: {
		uuid: "019dcd2c-9201-7b8a-b99f-6212cbf8bf60",
		instances: [
			{
				uuid: "fcbf88ff-9faf-4b7e-bffc-d87003cf0602",
				usage: {
					rows_read: 595741,
					rows_written: 5185,
					storage_bytes: 1839104,
					bytes_synced: 0,
				},
			},
		],
		usage: {
			rows_read: 595741,
			rows_written: 5185,
			storage_bytes: 1839104,
			bytes_synced: 0,
		},
	},
	total: {
		rows_read: 595741,
		rows_written: 5185,
		storage_bytes: 1839104,
		bytes_synced: 0,
	},
};

const redisSample: RedisUsageSample = {
	database_name: "csb-pos",
	database_type: "free",
	region: "global",
	type: "free",
	primary_region: "ap-southeast-1",
	state: "active",
	endpoint: "superb-grizzly-106172.upstash.io",
	db_max_clients: 10000,
	db_max_bandwidth: 524288000,
	db_resource_size: "S",
	db_memory_threshold: 67108864,
	db_monthly_bandwidth_limit: 50,
	db_max_commands_per_second: 10000,
	db_request_limit: 500000,
};

const storageSample: StorageUsageSample = {
	result: {
		end: "2026-05-13T00:30:00.000Z",
		payloadSize: "1314699",
		metadataSize: "1093",
		objectCount: "23",
		uploadCount: "0",
		infrequentAccessPayloadSize: "0",
		infrequentAccessMetadataSize: "0",
		infrequentAccessObjectCount: "0",
		infrequentAccessUploadCount: "0",
	},
};

const shippingVendors: ShippingVendorCard[] = [
	{
		id: "anousith",
		name: "Anousith",
		status: "pending",
		note: "ຈັດຕຽມພື້ນທີ່ສຳລັບ usage, ຈຳນວນຄຳຮ້ອງຂໍ ແລະ ສະຫຼຸບຄ່າໃຊ້ຈ່າຍ",
		coverage: "ຜູ້ໃຫ້ບໍລິການຂົນສົ່ງ",
		usageHint: "ລໍຖ້າ map field ຈາກ provider API",
	},
	{
		id: "houngaloun",
		name: "Houngaloun",
		status: "pending",
		note: "ເໝາະສຳລັບເພີ່ມຈຳນວນ shipment, failed sync ແລະ ເວລາ sync ຫຼ້າສຸດ",
		coverage: "ຜູ້ໃຫ້ບໍລິການຂົນສົ່ງ",
		usageHint: "UI ພ້ອມຮັບ metrics ໃນພາຍຫຼັງ",
	},
	{
		id: "mixay",
		name: "Mixay",
		status: "ready-later",
		note: "ຈັດ layout ສຳລັບ quota, orders used ແລະ issue summary ໄວ້ແລ້ວ",
		coverage: "ຜູ້ໃຫ້ບໍລິການຂົນສົ່ງ",
		usageHint: "ຕໍ່ API ໄດ້ໂດຍບໍ່ຕ້ອງປ່ຽນໂຄງໜ້າ",
	},
];

const overviewCards = computed(() => [
	{
		id: "database",
		label: "ພື້ນທີ່ຖານຂໍ້ມູນ",
		value: formatBytes(databaseSample.total.storage_bytes),
		note: `${formatNumber(databaseSample.total.rows_read)} ແຖວທີ່ອ່ານ`,
		icon: "i-heroicons-circle-stack-20-solid",
	},
	{
		id: "redis",
		label: "ຂີດຈຳກັດແບນວິດ Redis",
		value: `${redisSample.db_monthly_bandwidth_limit} GB/mo`,
		note: `${formatNumber(redisSample.db_request_limit)} ຂີດຈຳກັດຄຳຮ້ອງຂໍ`,
		icon: "i-heroicons-bolt-20-solid",
	},
	{
		id: "storage",
		label: "ຂະໜາດຂໍ້ມູນ Storage",
		value: formatBytes(Number(storageSample.result.payloadSize)),
		note: `${formatNumber(Number(storageSample.result.objectCount))} ວັດຖຸ`,
		icon: "i-heroicons-cloud-20-solid",
	},
	{
		id: "shipping",
		label: "ຜູ້ໃຫ້ບໍລິການຂົນສົ່ງ",
		value: String(shippingVendors.length),
		note: "Anousith, Houngaloun, Mixay",
		icon: "i-heroicons-truck-20-solid",
	},
]);

function formatNumber(value: number) {
	return new Intl.NumberFormat("lo-LA").format(value);
}

function formatBytes(value: number) {
	if (!Number.isFinite(value) || value <= 0) return "0 B";
	const units = [ "B", "KB", "MB", "GB", "TB" ];
	let size = value;
	let unitIndex = 0;
	while (size >= 1024 && unitIndex < units.length - 1) {
		size /= 1024;
		unitIndex += 1;
	}
	return `${size >= 10 || unitIndex === 0 ? size.toFixed(0) : size.toFixed(1)} ${units[unitIndex]}`;
}

function formatDateTime(value: string) {
	return new Intl.DateTimeFormat("lo-LA", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function shippingStatusLabel(status: ShippingVendorCard["status"]) {
	return status === "pending" ? "ລໍຖ້າ API" : "UI ພ້ອມໃຊ້";
}

function shippingStatusColor(status: ShippingVendorCard["status"]) {
	return status === "pending" ? "warning" : "primary";
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-thirdparty-usage']"
		sidebar-eyebrow="ລະບົບ"
		sidebar-title="ຜູ້ດູແລລະບົບ"
		sidebar-compact-title="SYS"
		sidebar-description="ພາບລວມການໃຊ້ງານ resource ພາກສ່ວນທີສາມ ແລະ provider ທີ່ຈະຕໍ່ API ໃນພາຍຫຼັງ"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
					<AppPageHeader
						title="ການໃຊ້ງານພາກສ່ວນທີສາມ"
						description="ໜ້າພຣີວິວສຳລັບເບິ່ງການໃຊ້ງານ database, Redis, storage ແລະ ຜູ້ໃຫ້ບໍລິການຂົນສົ່ງ ກ່ອນເຊື່ອມ API ຈິງ"
						:title-badge="false"
						compact
						body-class="px-3 py-2.5 sm:px-4 sm:py-3"
						:tablet-layout="true"
					@menu="openSidebar"
				>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">ການໃຊ້ງານພາກສ່ວນທີສາມ</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">ໂຄງໜ້າຕົວຢ່າງສຳລັບ resource ພາກສ່ວນທີສາມ ແລະ ຜູ້ຂົນສົ່ງ ກ່ອນຕໍ່ API ຈິງ</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<UBadge color="warning" variant="soft" label="ຕົວຢ່າງໜ້າ" />
									<UBadge color="primary" variant="soft" label="ຍັງບໍ່ມີ API" />
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div class="grid gap-4 p-4 xl:grid-cols-2">
									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
											<h2 class="text-lg font-semibold text-stone-950">ພາບລວມການໃຊ້ງານ</h2>
											<p class="mt-1 text-xs leading-5 text-stone-500">ສະຫຼຸບຕົວເລກສຳຄັນທີ່ຜູ້ດູແລລະບົບຄວນເບິ່ງຢ່າງໄວກ່ອນເຂົ້າເບິ່ງລາຍລະອຽດ</p>
											</div>
											<div class="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
												<div
													v-for="card in overviewCards"
													:key="card.id"
													class="rounded-md bg-neutral-50 px-3 py-3.5"
												>
													<div class="flex items-center justify-between gap-3">
														<p class="text-xs text-stone-500">{{ card.label }}</p>
														<UIcon :name="card.icon" class="h-4 w-4 text-stone-400" />
													</div>
													<p class="mt-2 text-lg font-semibold text-stone-900">{{ card.value }}</p>
													<p class="mt-1 text-xs text-stone-500">{{ card.note }}</p>
												</div>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">ການໃຊ້ງານຖານຂໍ້ມູນ</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ຕົວຢ່າງຈາກ Turso usage summary</p>
												</div>
												<UBadge color="primary" variant="soft" label="ຂໍ້ມູນຕົວຢ່າງ" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ແຖວທີ່ອ່ານ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(databaseSample.total.rows_read) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ແຖວທີ່ບັນທຶກ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(databaseSample.total.rows_written) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ພື້ນທີ່ຈັດເກັບ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(databaseSample.total.storage_bytes) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຂໍ້ມູນທີ່ sync</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(databaseSample.total.bytes_synced) }}</p>
												</div>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-3 py-3">
												<p class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Instance ປັດຈຸບັນ</p>
												<p class="mt-2 text-sm font-medium text-stone-900">{{ databaseSample.database.instances[0]?.uuid }}</p>
												<p class="mt-1 text-xs text-stone-500">UUID ຖານຂໍ້ມູນ {{ databaseSample.database.uuid }}</p>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">ການໃຊ້ງານ Redis</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ພາບລວມຈາກ Upstash plan ແລະ ຂີດຈຳກັດການໃຊ້ງານ</p>
												</div>
												<UBadge color="primary" variant="soft" :label="redisSample.state" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຖານຂໍ້ມູນ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.database_name }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ແຜນໃຊ້ງານ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.database_type }} / size {{ redisSample.db_resource_size }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ພາກພື້ນຫຼັກ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.primary_region }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ລູກຄ້າສູງສຸດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(redisSample.db_max_clients) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຂີດຈຳກັດແບນວິດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(redisSample.db_max_bandwidth) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຂີດຈຳກັດໜ່ວຍຄວາມຈຳ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(redisSample.db_memory_threshold) }}</p>
												</div>
											</div>
											<div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">ຄຳຮ້ອງຂໍ {{ formatNumber(redisSample.db_request_limit) }}</span>
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">ຄຳສັ່ງ/ວິນາທີ {{ formatNumber(redisSample.db_max_commands_per_second) }}</span>
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">ແບນວິດລາຍເດືອນ {{ redisSample.db_monthly_bandwidth_limit }} GB</span>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">ການໃຊ້ງານ Storage</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ຂໍ້ມູນຕົວຢ່າງຈາກ storage billing snapshot ຫຼ້າສຸດ</p>
												</div>
												<UBadge color="primary" variant="soft" label="Snapshot" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຂະໜາດຂໍ້ມູນ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(Number(storageSample.result.payloadSize)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ຂະໜາດ Metadata</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(Number(storageSample.result.metadataSize)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ວັດຖຸ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(Number(storageSample.result.objectCount)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">ການອັບໂຫຼດ</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(Number(storageSample.result.uploadCount)) }}</p>
												</div>
											</div>
											<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3 text-xs text-stone-500">
												Snapshot ຫຼ້າສຸດ {{ formatDateTime(storageSample.result.end) }} ແລະ ຕອນນີ້ infrequent access ຍັງເປັນ 0 ທຸກລາຍການ
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">ຂົນສົ່ງດ່ວນ</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">UI ພື້ນຖານສຳລັບການໃຊ້ງານ provider ທີ່ຈະຕໍ່ຈິງໃນພາຍຫຼັງ</p>
												</div>
												<UBadge color="warning" variant="soft" label="UI ເທົ່ານັ້ນ" />
											</div>
											<div class="space-y-3">
												<div
													v-for="vendor in shippingVendors"
													:key="vendor.id"
													class="rounded-md border border-neutral-200 bg-white px-3 py-3"
												>
													<div class="flex flex-wrap items-center justify-between gap-2">
														<div>
															<p class="text-sm font-semibold text-stone-900">{{ vendor.name }}</p>
															<p class="mt-1 text-xs text-stone-500">{{ vendor.coverage }}</p>
														</div>
														<UBadge :color="shippingStatusColor(vendor.status)" variant="soft" :label="shippingStatusLabel(vendor.status)" />
													</div>
													<div class="mt-3 grid gap-2 sm:grid-cols-2">
														<div class="rounded-md bg-neutral-50 px-3 py-2.5">
																	<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ໝາຍເຫດການໃຊ້ງານ</p>
															<p class="mt-1 text-sm text-stone-700">{{ vendor.note }}</p>
														</div>
														<div class="rounded-md bg-neutral-50 px-3 py-2.5">
																	<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">ຂໍ້ມູນທີ່ຈະເພີ່ມ</p>
															<p class="mt-1 text-sm text-stone-700">{{ vendor.usageHint }}</p>
														</div>
													</div>
												</div>
											</div>
										</div>
									</UCard>
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
