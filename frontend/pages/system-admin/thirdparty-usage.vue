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
		note: "เตรียมช่องสำหรับ usage, request volume และ cost summary",
		coverage: "Shipping partner",
		usageHint: "รอ map field จาก provider API",
	},
	{
		id: "houngaloun",
		name: "Houngaloun",
		status: "pending",
		note: "เหมาะกับการเพิ่ม shipment count, failed sync และ last sync time",
		coverage: "Shipping partner",
		usageHint: "UI พร้อมรับ metrics ภายหลัง",
	},
	{
		id: "mixay",
		name: "Mixay",
		status: "ready-later",
		note: "วาง layout สำหรับ quota, orders used และ issue summary ไว้แล้ว",
		coverage: "Shipping partner",
		usageHint: "ต่อ API ได้โดยไม่ต้องเปลี่ยนโครงหน้า",
	},
];

const overviewCards = computed(() => [
	{
		id: "database",
		label: "Database storage",
		value: formatBytes(databaseSample.total.storage_bytes),
		note: `${formatNumber(databaseSample.total.rows_read)} rows read`,
		icon: "i-heroicons-circle-stack-20-solid",
	},
	{
		id: "redis",
		label: "Redis bandwidth cap",
		value: `${redisSample.db_monthly_bandwidth_limit} GB/mo`,
		note: `${formatNumber(redisSample.db_request_limit)} requests limit`,
		icon: "i-heroicons-bolt-20-solid",
	},
	{
		id: "storage",
		label: "Storage payload",
		value: formatBytes(Number(storageSample.result.payloadSize)),
		note: `${formatNumber(Number(storageSample.result.objectCount))} objects`,
		icon: "i-heroicons-cloud-20-solid",
	},
	{
		id: "shipping",
		label: "Shipping vendors",
		value: String(shippingVendors.length),
		note: "Anousith, Houngaloun, Mixay",
		icon: "i-heroicons-truck-20-solid",
	},
]);

function formatNumber(value: number) {
	return new Intl.NumberFormat("en-US").format(value);
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
	return new Intl.DateTimeFormat("th-TH", {
		dateStyle: "medium",
		timeStyle: "short",
	}).format(new Date(value));
}

function shippingStatusLabel(status: ShippingVendorCard["status"]) {
	return status === "pending" ? "Pending API" : "UI ready";
}

function shippingStatusColor(status: ShippingVendorCard["status"]) {
	return status === "pending" ? "warning" : "primary";
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['system-thirdparty-usage']"
		sidebar-eyebrow="System"
		sidebar-title="System Admin"
		sidebar-compact-title="SYS"
		sidebar-description="overview สำหรับ third-party resource usage และ provider usage ที่จะต่อ API ภายหลัง"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Third-party Usage"
					description="หน้า preview สำหรับดู database, redis, storage และ shipping provider usage โดยใช้ sample data ชั่วคราวก่อนเชื่อม API จริง"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #badges>
						<UBadge color="warning" variant="soft" label="Static preview" />
						<UBadge color="primary" variant="soft" label="No API yet" />
					</template>
				</AppPageHeader>

				<div class="grid min-h-0 grid-rows-[minmax(0,1fr)] gap-3">
					<div class="min-h-0 overflow-hidden rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
						<div class="flex h-full min-h-0 flex-col">
							<div class="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b border-[#ece6dc] px-4 py-2.5">
								<div>
									<p class="text-sm font-semibold text-stone-950">Third-party usage</p>
									<p class="mt-1 hidden text-xs text-stone-500 lg:block">preview layout สำหรับ third-party resources และ shipping vendors ก่อนต่อ API จริง</p>
								</div>
								<div class="flex flex-wrap items-center gap-2">
									<UBadge color="warning" variant="soft" label="Static preview" />
									<UBadge color="primary" variant="soft" label="No API yet" />
								</div>
							</div>

							<div class="min-h-0 flex-1 overflow-auto pb-[calc(5.25rem+env(safe-area-inset-bottom))] lg:pb-0">
								<div class="grid gap-4 p-4 xl:grid-cols-2">
									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 xl:col-span-2">
										<div class="space-y-4">
											<div>
												<h2 class="text-lg font-semibold text-stone-950">Usage overview</h2>
												<p class="mt-1 text-xs leading-5 text-stone-500">สรุปตัวเลขสำคัญที่ system admin มักอยากกวาดตาดูเร็ว ๆ ก่อนลงรายละเอียด</p>
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
													<h2 class="text-lg font-semibold text-stone-950">Database usage</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ตัวอย่างจาก Turso usage summary</p>
												</div>
												<UBadge color="primary" variant="soft" label="Sample data" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Rows read</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(databaseSample.total.rows_read) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Rows written</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(databaseSample.total.rows_written) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Storage</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(databaseSample.total.storage_bytes) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Bytes synced</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(databaseSample.total.bytes_synced) }}</p>
												</div>
											</div>
											<div class="rounded-md border border-neutral-200 bg-white px-3 py-3">
												<p class="text-xs font-semibold uppercase tracking-[0.16em] text-stone-400">Current instance</p>
												<p class="mt-2 text-sm font-medium text-stone-900">{{ databaseSample.database.instances[0]?.uuid }}</p>
												<p class="mt-1 text-xs text-stone-500">Database UUID {{ databaseSample.database.uuid }}</p>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Redis usage</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">ภาพรวมจาก Upstash plan และ usage caps</p>
												</div>
												<UBadge color="primary" variant="soft" :label="redisSample.state" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Database</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.database_name }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Plan</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.database_type }} / size {{ redisSample.db_resource_size }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Primary region</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ redisSample.primary_region }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Max clients</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(redisSample.db_max_clients) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Bandwidth cap</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(redisSample.db_max_bandwidth) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Memory threshold</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(redisSample.db_memory_threshold) }}</p>
												</div>
											</div>
											<div class="flex flex-wrap items-center gap-2 text-xs text-stone-500">
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">Requests {{ formatNumber(redisSample.db_request_limit) }}</span>
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">Commands/sec {{ formatNumber(redisSample.db_max_commands_per_second) }}</span>
												<span class="rounded-full bg-neutral-100 px-2.5 py-1">Monthly bandwidth {{ redisSample.db_monthly_bandwidth_limit }} GB</span>
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Storage usage</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">sample จาก storage billing snapshot ล่าสุด</p>
												</div>
												<UBadge color="primary" variant="soft" label="Snapshot" />
											</div>
											<div class="grid gap-3 sm:grid-cols-2">
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Payload size</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(Number(storageSample.result.payloadSize)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Metadata size</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatBytes(Number(storageSample.result.metadataSize)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Objects</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(Number(storageSample.result.objectCount)) }}</p>
												</div>
												<div class="rounded-md bg-neutral-50 px-3 py-3.5">
													<p class="text-xs text-stone-500">Uploads</p>
													<p class="mt-1 text-base font-semibold text-stone-900">{{ formatNumber(Number(storageSample.result.uploadCount)) }}</p>
												</div>
											</div>
											<div class="rounded-md border border-dashed border-neutral-200 bg-neutral-50 px-3 py-3 text-xs text-stone-500">
												Snapshot ล่าสุด {{ formatDateTime(storageSample.result.end) }} และตอนนี้ infrequent access ยังเป็น 0 ทุกตัว
											</div>
										</div>
									</UCard>

									<UCard class="rounded-md border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200">
										<div class="space-y-4">
											<div class="flex items-center justify-between gap-3">
												<div>
													<h2 class="text-lg font-semibold text-stone-950">Shipping express</h2>
													<p class="mt-1 text-xs leading-5 text-stone-500">basic UI สำหรับ provider usage ที่จะต่อจริงภายหลัง</p>
												</div>
												<UBadge color="warning" variant="soft" label="UI only" />
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
															<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">Usage note</p>
															<p class="mt-1 text-sm text-stone-700">{{ vendor.note }}</p>
														</div>
														<div class="rounded-md bg-neutral-50 px-3 py-2.5">
															<p class="text-[11px] uppercase tracking-[0.14em] text-stone-400">Next data</p>
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
