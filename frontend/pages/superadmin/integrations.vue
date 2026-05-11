<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type IntegrationCard = {
	id: string;
	title: string;
	description: string;
	icon: string;
	tone: "primary" | "success" | "warning" | "neutral";
	status: string;
	note: string;
};

const commerceChannels: IntegrationCard[] = [
	{
		id: "whatsapp",
		title: "WhatsApp",
		description: "เชื่อมแชตขายและ workflow ตอบกลับอัตโนมัติ",
		icon: "i-heroicons-chat-bubble-left-right-20-solid",
		tone: "success",
		status: "ยังไม่เชื่อม",
		note: "planned connector",
	},
	{
		id: "facebook",
		title: "Facebook",
		description: "รองรับ inbox, page messaging และ social commerce flow",
		icon: "i-heroicons-chat-bubble-oval-left-ellipsis-20-solid",
		tone: "primary",
		status: "ยังไม่เชื่อม",
		note: "planned connector",
	},
	{
		id: "tiktok",
		title: "TikTok",
		description: "เตรียมไว้สำหรับ social commerce และ order source mapping",
		icon: "i-heroicons-musical-note-20-solid",
		tone: "warning",
		status: "ยังไม่เชื่อม",
		note: "planned connector",
	},
];

const shippingPartners: IntegrationCard[] = [
	{
		id: "anousith",
		title: "Anousith",
		description: "โครงพร้อมสำหรับเชื่อม shipping label และ tracking status",
		icon: "i-heroicons-truck-20-solid",
		tone: "neutral",
		status: "sample",
		note: "UI placeholder",
	},
	{
		id: "houngaloun",
		title: "Houngaloun",
		description: "เตรียม flow สำหรับ dispatch และ rate sync ในอนาคต",
		icon: "i-heroicons-map-20-solid",
		tone: "neutral",
		status: "sample",
		note: "UI placeholder",
	},
	{
		id: "mixay",
		title: "Mixay",
		description: "วางพื้นที่สำหรับ order handoff และ courier tracking",
		icon: "i-heroicons-paper-airplane-20-solid",
		tone: "neutral",
		status: "sample",
		note: "UI placeholder",
	},
];

const summaryBlocks = [
	{ label: "Social channels", value: commerceChannels.length, note: "workspace สำหรับ social commerce" },
	{ label: "Shipping partners", value: shippingPartners.length, note: "placeholder ของขนส่งที่เตรียมเชื่อม" },
	{ label: "Connected now", value: 0, note: "รอบนี้เป็น sample UI เท่านั้น" },
	{ label: "API calls", value: 0, note: "ยังไม่มี third-party request ในหน้านี้" },
];

function toneClasses(tone: IntegrationCard["tone"]) {
	if (tone === "success") {
		return {
			tile: "bg-emerald-50 text-emerald-700 ring-emerald-200",
			badge: "success",
		};
	}
	if (tone === "warning") {
		return {
			tile: "bg-amber-50 text-amber-700 ring-amber-200",
			badge: "warning",
		};
	}
	if (tone === "primary") {
		return {
			tile: "bg-primary-50 text-primary-700 ring-primary-200",
			badge: "primary",
		};
	}

	return {
		tile: "bg-neutral-100 text-stone-700 ring-neutral-200",
		badge: "neutral",
	};
}
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		sidebar-description="workspace สำหรับ social, commerce และ shipping integrations ใต้ superadmin นี้"
	>
		<template #default="{ openSidebar }">
			<div class="grid min-h-[calc(100dvh-4.25rem)] grid-rows-[auto_minmax(0,1fr)] gap-3 lg:h-full lg:min-h-0">
				<AppPageHeader
					title="Integrations"
					description="พื้นที่เตรียมเชื่อม social commerce และ shipping partners ของ superadmin นี้ โดยรอบนี้ยังเป็น sample UI เท่านั้น"
					:tablet-layout="true"
					@menu="openSidebar"
				>
					<template #badges>
						<UBadge color="neutral" variant="soft" label="Sample UI only" />
						<UBadge color="warning" variant="soft" label="No live integration" />
					</template>
				</AppPageHeader>

				<div class="scrollbar-soft min-h-0 overflow-y-auto lg:pr-1">
					<div class="grid gap-3">
						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
							<div class="space-y-4">
								<div class="flex flex-wrap items-center justify-between gap-3">
									<div>
										<p class="text-sm font-semibold text-stone-950">Integration workspace</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">โน้ตสั้น: หน้านี้เป็นตัวอย่าง UI สำหรับวาง flow เชื่อมต่อในอนาคต ยังไม่ยิง API ภายนอก</p>
									</div>
									<div class="rounded-md bg-neutral-100 px-3 py-1 text-xs font-medium text-stone-500">
										Static preview
									</div>
								</div>

								<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
									<div
										v-for="block in summaryBlocks"
										:key="block.label"
										class="rounded-md border border-[#ece6dc] bg-neutral-50 px-4 py-3.5"
									>
										<p class="text-[11px] font-semibold uppercase tracking-[0.16em] text-stone-400">{{ block.label }}</p>
										<p class="mt-2 text-2xl font-semibold text-stone-950">{{ block.value }}</p>
										<p class="mt-1 text-xs leading-5 text-stone-500">{{ block.note }}</p>
									</div>
								</div>
							</div>
						</UCard>

						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
							<div class="space-y-4">
								<div>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Social commerce</p>
									<h2 class="mt-2 text-lg font-semibold text-stone-950">Channels ที่เตรียมไว้</h2>
									<p class="mt-1 text-sm leading-6 text-stone-500">ใช้เป็นพื้นที่วาง flow ของ WhatsApp, Facebook และ TikTok ก่อนเชื่อมจริง</p>
								</div>

								<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<div
										v-for="item in commerceChannels"
										:key="item.id"
										class="rounded-md border border-neutral-200 bg-white p-4"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1" :class="toneClasses(item.tone).tile">
												<UIcon :name="item.icon" class="h-5 w-5" />
											</div>
											<UBadge :color="toneClasses(item.tone).badge" variant="soft" :label="item.status" />
										</div>

										<div class="mt-4">
											<p class="text-sm font-semibold text-stone-950">{{ item.title }}</p>
											<p class="mt-1 text-sm leading-6 text-stone-500">{{ item.description }}</p>
										</div>

										<div class="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-xs text-stone-500">
											{{ item.note }}
										</div>
									</div>
								</div>
							</div>
						</UCard>

						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
							<div class="space-y-4">
								<div>
									<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Shipping</p>
									<h2 class="mt-2 text-lg font-semibold text-stone-950">Express partners</h2>
									<p class="mt-1 text-sm leading-6 text-stone-500">ใช้เป็น placeholder สำหรับเตรียม label, tracking และ dispatch integrations</p>
								</div>

								<div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
									<div
										v-for="item in shippingPartners"
										:key="item.id"
										class="rounded-md border border-neutral-200 bg-white p-4"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="flex h-11 w-11 shrink-0 items-center justify-center rounded-md ring-1" :class="toneClasses(item.tone).tile">
												<UIcon :name="item.icon" class="h-5 w-5" />
											</div>
											<UBadge :color="toneClasses(item.tone).badge" variant="soft" :label="item.status" />
										</div>

										<div class="mt-4">
											<p class="text-sm font-semibold text-stone-950">{{ item.title }}</p>
											<p class="mt-1 text-sm leading-6 text-stone-500">{{ item.description }}</p>
										</div>

										<div class="mt-4 rounded-md bg-neutral-50 px-3 py-2 text-xs text-stone-500">
											{{ item.note }}
										</div>
									</div>
								</div>
							</div>
						</UCard>

						<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
							<div class="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm leading-6 text-stone-600">
								คำแนะนำ: ใช้หน้านี้เป็น workspace preview ก่อน เมื่อเริ่มเชื่อมจริงค่อยเพิ่มสถานะ `connected`, `last sync`, `error`, และ action อย่าง `connect` หรือ `disconnect`
							</div>
						</UCard>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
