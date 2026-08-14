<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type Envelope<T> = { data: T };
type Printer = { id: string; name: string; station_id: string | null; station_name: string | null; address: string; paper_width: number; sort_order: number; is_active: number };
type Station = { id: string; name: string };
type Agent = { id: string; name: string; last_seen_at: string | null; is_active: number; created_at: string };
type PrintJob = { id: string; kind: string; status: string; attempts: number; error: string | null; created_at: string; completed_at: string | null; printer_name: string | null; station_name: string | null };

const { apiFetch } = useApiClient();
const { currentStoreId, can } = useAuthSession();
const { locale } = useI18n();
const toast = useAppToast();

function copyFor(activeLocale: string) {
	if (activeLocale === "en") {
		return {
			settings: "Settings", title: "Kitchen printers", description: "Send kitchen slips straight to the printers in the kitchen instead of the browser.",
			reload: "Reload", printers: "Printers", printersHint: "Each printer serves one station. Leave the station empty on the printer that should catch everything not assigned elsewhere.",
			addPrinter: "Add printer", editPrinter: "Edit printer", emptyPrinters: "No printers yet",
			emptyPrintersHint: "Until a printer is added, the till keeps printing kitchen slips through the browser.",
			name: "Name", address: "Address (host:port)", addressHint: "Thermal printers are usually 192.168.1.50:9100", station: "Station",
			stationAll: "Everything not assigned elsewhere", paperWidth: "Paper width", active: "In use",
			agents: "Print agents", agentsHint: "The small program on the shop PC that collects jobs and sends them to the printers.",
			addAgent: "Create agent", agentName: "Agent name", emptyAgents: "No agents yet", lastSeen: "Last seen", never: "Never",
			tokenTitle: "Agent token", tokenHint: "Copy it into the agent's config file now — it is not shown again.", copy: "Copy", copied: "Copied",
			jobs: "Recent print jobs", emptyJobs: "Nothing printed yet", retry: "Retry", attempts: "{count} attempts",
			statusPending: "Waiting", statusPrinting: "Printing", statusDone: "Done", statusFailed: "Failed",
			kindKitchen: "Kitchen slip", kindVoid: "Cancellation", save: "Save", cancel: "Cancel", delete: "Delete", close: "Close",
			saved: "Saved", saveFailed: "Could not save", loadFailed: "Could not load printer settings", deleted: "Deleted", retried: "Queued again",
			noPermission: "You do not have permission to change printing settings.",
		};
	}
	if (activeLocale === "th") {
		return {
			settings: "ตั้งค่า", title: "เครื่องพิมพ์ครัว", description: "ส่งใบครัวเข้าเครื่องพิมพ์ในครัวโดยตรง แทนการพิมพ์ผ่านเบราว์เซอร์",
			reload: "โหลดใหม่", printers: "เครื่องพิมพ์", printersHint: "เครื่องพิมพ์หนึ่งตัวรับผิดชอบหนึ่งสถานี ตัวที่ไม่ระบุสถานีจะรับทุกอย่างที่ไม่มีเครื่องอื่นรับ",
			addPrinter: "เพิ่มเครื่องพิมพ์", editPrinter: "แก้ไขเครื่องพิมพ์", emptyPrinters: "ยังไม่มีเครื่องพิมพ์",
			emptyPrintersHint: "ถ้ายังไม่เพิ่ม ระบบจะพิมพ์ใบครัวผ่านเบราว์เซอร์เหมือนเดิม",
			name: "ชื่อ", address: "ที่อยู่ (host:port)", addressHint: "เครื่องพิมพ์ความร้อนมักเป็น 192.168.1.50:9100", station: "สถานี",
			stationAll: "รับทุกอย่างที่ไม่มีเครื่องอื่นรับ", paperWidth: "ความกว้างกระดาษ", active: "เปิดใช้งาน",
			agents: "Print agent", agentsHint: "โปรแกรมเล็ก ๆ บนคอมที่ร้าน ทำหน้าที่ดึงงานพิมพ์ไปส่งเครื่องพิมพ์",
			addAgent: "สร้าง agent", agentName: "ชื่อ agent", emptyAgents: "ยังไม่มี agent", lastSeen: "ติดต่อล่าสุด", never: "ยังไม่เคย",
			tokenTitle: "Token ของ agent", tokenHint: "คัดลอกไปใส่ไฟล์ config ตอนนี้เลย ระบบจะไม่แสดงอีก", copy: "คัดลอก", copied: "คัดลอกแล้ว",
			jobs: "งานพิมพ์ล่าสุด", emptyJobs: "ยังไม่มีการพิมพ์", retry: "สั่งพิมพ์ใหม่", attempts: "ลองแล้ว {count} ครั้ง",
			statusPending: "รอพิมพ์", statusPrinting: "กำลังพิมพ์", statusDone: "สำเร็จ", statusFailed: "ล้มเหลว",
			kindKitchen: "ใบครัว", kindVoid: "ใบยกเลิก", save: "บันทึก", cancel: "ยกเลิก", delete: "ลบ", close: "ปิด",
			saved: "บันทึกแล้ว", saveFailed: "บันทึกไม่สำเร็จ", loadFailed: "โหลดการตั้งค่าเครื่องพิมพ์ไม่สำเร็จ", deleted: "ลบแล้ว", retried: "ส่งเข้าคิวอีกครั้งแล้ว",
			noPermission: "คุณไม่มีสิทธิ์แก้ไขการตั้งค่าการพิมพ์",
		};
	}
	return {
		settings: "ຕັ້ງຄ່າ", title: "ເຄື່ອງພິມຄົວ", description: "ສົ່ງໃບຄົວເຂົ້າເຄື່ອງພິມໃນຄົວໂດຍກົງ ແທນການພິມຜ່ານເບຣົາເຊີ",
		reload: "ໂຫຼດໃໝ່", printers: "ເຄື່ອງພິມ", printersHint: "ເຄື່ອງພິມໜຶ່ງໜ່ວຍຮັບຜິດຊອບໜຶ່ງສະຖານີ ໜ່ວຍທີ່ບໍ່ລະບຸສະຖານີຈະຮັບທຸກຢ່າງທີ່ບໍ່ມີເຄື່ອງອື່ນຮັບ",
		addPrinter: "ເພີ່ມເຄື່ອງພິມ", editPrinter: "ແກ້ໄຂເຄື່ອງພິມ", emptyPrinters: "ຍັງບໍ່ມີເຄື່ອງພິມ",
		emptyPrintersHint: "ຖ້າຍັງບໍ່ເພີ່ມ ລະບົບຈະພິມໃບຄົວຜ່ານເບຣົາເຊີເໝືອນເດີມ",
		name: "ຊື່", address: "ທີ່ຢູ່ (host:port)", addressHint: "ເຄື່ອງພິມຄວາມຮ້ອນມັກເປັນ 192.168.1.50:9100", station: "ສະຖານີ",
		stationAll: "ຮັບທຸກຢ່າງທີ່ບໍ່ມີເຄື່ອງອື່ນຮັບ", paperWidth: "ຄວາມກວ້າງເຈ້ຍ", active: "ເປີດໃຊ້ງານ",
		agents: "Print agent", agentsHint: "ໂປຣແກຣມນ້ອຍໆຢູ່ຄອມທີ່ຮ້ານ ເຮັດໜ້າທີ່ດຶງງານພິມໄປສົ່ງເຄື່ອງພິມ",
		addAgent: "ສ້າງ agent", agentName: "ຊື່ agent", emptyAgents: "ຍັງບໍ່ມີ agent", lastSeen: "ຕິດຕໍ່ລ່າສຸດ", never: "ຍັງບໍ່ເຄີຍ",
		tokenTitle: "Token ຂອງ agent", tokenHint: "ກັອບປີ້ໄປໃສ່ໄຟລ໌ config ດຽວນີ້ ລະບົບຈະບໍ່ສະແດງອີກ", copy: "ກັອບປີ້", copied: "ກັອບປີ້ແລ້ວ",
		jobs: "ງານພິມລ່າສຸດ", emptyJobs: "ຍັງບໍ່ມີການພິມ", retry: "ສັ່ງພິມໃໝ່", attempts: "ລອງແລ້ວ {count} ຄັ້ງ",
		statusPending: "ລໍພິມ", statusPrinting: "ກຳລັງພິມ", statusDone: "ສຳເລັດ", statusFailed: "ລົ້ມເຫຼວ",
		kindKitchen: "ໃບຄົວ", kindVoid: "ໃບຍົກເລີກ", save: "ບັນທຶກ", cancel: "ຍົກເລີກ", delete: "ລົບ", close: "ປິດ",
		saved: "ບັນທຶກແລ້ວ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ", loadFailed: "ໂຫຼດການຕັ້ງຄ່າເຄື່ອງພິມບໍ່ສຳເລັດ", deleted: "ລົບແລ້ວ", retried: "ສົ່ງເຂົ້າຄິວອີກຄັ້ງແລ້ວ",
		noPermission: "ທ່ານບໍ່ມີສິດແກ້ໄຂການຕັ້ງຄ່າການພິມ",
	};
}
const copy = computed(() => copyFor(locale.value));

const printers = ref<Printer[]>([]);
const stations = ref<Station[]>([]);
const agents = ref<Agent[]>([]);
const jobs = ref<PrintJob[]>([]);
const pending = ref(false);
const saving = ref(false);
const printerPanel = ref(false);
const editingId = ref("");
const form = reactive({ name: "", address: "", station_id: "", paper_width: 80, is_active: true });
const agentPanel = ref(false);
const agentName = ref("");
const issuedToken = ref("");
const tokenCopied = ref(false);
const canUpdate = computed(() => can("settings.printing.update"));

function statusLabel(status: string) {
	if (status === "done") return copy.value.statusDone;
	if (status === "printing") return copy.value.statusPrinting;
	if (status === "failed") return copy.value.statusFailed;
	return copy.value.statusPending;
}
function statusColor(status: string) {
	if (status === "done") return "success";
	if (status === "failed") return "error";
	if (status === "printing") return "info";
	return "neutral";
}
function timeLabel(value: string | null) {
	return value ? new Date(value).toLocaleString(locale.value) : copy.value.never;
}

async function load() {
	if (!currentStoreId.value) return;
	pending.value = true;
	try {
		const store = encodeURIComponent(currentStoreId.value);
		const [ printerResponse, agentResponse, jobResponse ] = await Promise.all([
			apiFetch<Envelope<Printer[]>>(`/print/printers?store_id=${store}`),
			apiFetch<Envelope<Agent[]>>(`/print/agents?store_id=${store}`),
			apiFetch<Envelope<PrintJob[]>>(`/print/jobs?store_id=${store}`),
		]);
		printers.value = printerResponse.data;
		agents.value = agentResponse.data;
		jobs.value = jobResponse.data;
		// Stations live behind the restaurant settings permission, which a printing
		// manager need not have. Without them the picker simply offers the catch-all.
		stations.value = await apiFetch<Envelope<{ stations: Station[] }>>(`/restaurant/stations?store_id=${store}`)
			.then((response) => response.data.stations)
			.catch(() => []);
	} catch (error) {
		toast.error({ title: copy.value.loadFailed, description: resolveApiErrorMessage(error) });
	} finally {
		pending.value = false;
	}
}

function openPrinter(printer?: Printer) {
	editingId.value = printer?.id || "";
	form.name = printer?.name || "";
	form.address = printer?.address || "";
	form.station_id = printer?.station_id || "";
	form.paper_width = Number(printer?.paper_width || 80);
	form.is_active = printer ? Boolean(printer.is_active) : true;
	printerPanel.value = true;
}

async function savePrinter() {
	if (saving.value || !currentStoreId.value) return;
	if (!form.name.trim() || !form.address.trim()) return;
	saving.value = true;
	try {
		await apiFetch(editingId.value ? `/print/printers/${editingId.value}` : "/print/printers", {
			method: editingId.value ? "PUT" : "POST",
			body: {
				store_id: currentStoreId.value,
				name: form.name.trim(),
				address: form.address.trim(),
				station_id: form.station_id || null,
				paper_width: form.paper_width,
				is_active: form.is_active,
				sort_order: editingId.value ? Number(printers.value.find((printer) => printer.id === editingId.value)?.sort_order || 0) : printers.value.length + 1,
			},
		});
		printerPanel.value = false;
		toast.success({ title: copy.value.saved });
		await load();
	} catch (error) {
		toast.error({ title: copy.value.saveFailed, description: resolveApiErrorMessage(error) });
	} finally {
		saving.value = false;
	}
}

async function removePrinter(printer: Printer) {
	if (!currentStoreId.value) return;
	try {
		await apiFetch(`/print/printers/${printer.id}?store_id=${encodeURIComponent(currentStoreId.value)}`, { method: "DELETE" });
		toast.success({ title: copy.value.deleted, description: printer.name });
		await load();
	} catch (error) { toast.error({ title: copy.value.saveFailed, description: resolveApiErrorMessage(error) }); }
}

async function createAgent() {
	if (saving.value || !currentStoreId.value || !agentName.value.trim()) return;
	saving.value = true;
	try {
		const response = await apiFetch<Envelope<{ agent: Agent; token: string }>>("/print/agents", {
			method: "POST", body: { store_id: currentStoreId.value, name: agentName.value.trim() },
		});
		agentPanel.value = false;
		agentName.value = "";
		tokenCopied.value = false;
		issuedToken.value = response.data.token;
		await load();
	} catch (error) {
		toast.error({ title: copy.value.saveFailed, description: resolveApiErrorMessage(error) });
	} finally {
		saving.value = false;
	}
}

async function removeAgent(agent: Agent) {
	if (!currentStoreId.value) return;
	try {
		await apiFetch(`/print/agents/${agent.id}?store_id=${encodeURIComponent(currentStoreId.value)}`, { method: "DELETE" });
		toast.success({ title: copy.value.deleted, description: agent.name });
		await load();
	} catch (error) { toast.error({ title: copy.value.saveFailed, description: resolveApiErrorMessage(error) }); }
}

async function retryJob(job: PrintJob) {
	if (!currentStoreId.value) return;
	try {
		await apiFetch(`/print/jobs/${job.id}/retry`, { method: "POST", body: { store_id: currentStoreId.value } });
		toast.success({ title: copy.value.retried });
		await load();
	} catch (error) { toast.error({ title: copy.value.saveFailed, description: resolveApiErrorMessage(error) }); }
}

async function copyToken() {
	try {
		await navigator.clipboard.writeText(issuedToken.value);
		tokenCopied.value = true;
	} catch { tokenCopied.value = false; }
}

watch(currentStoreId, () => void load(), { immediate: true });
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="copy.settings"
		:sidebar-title="copy.title"
		sidebar-compact-title="PRN"
		:sidebar-description="copy.description"
	>
		<template #default>
			<div class="min-w-0 space-y-4">
				<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
					<div class="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
						<div>
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">{{ copy.settings }}</p>
							<h1 class="mt-2 text-xl font-bold text-stone-950">{{ copy.title }}</h1>
							<p class="mt-1 text-sm leading-6 text-stone-500">{{ copy.description }}</p>
						</div>
						<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="pending" @click="load">{{ copy.reload }}</AppButton>
					</div>
				</UCard>

				<UAlert v-if="!canUpdate" color="warning" variant="soft" icon="i-heroicons-lock-closed" :title="copy.noPermission" />

				<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<h2 class="text-base font-semibold text-stone-950">{{ copy.printers }}</h2>
							<p class="mt-1 text-sm leading-6 text-stone-500">{{ copy.printersHint }}</p>
						</div>
						<AppButton class="shrink-0" color="primary" variant="soft" icon="i-heroicons-plus-20-solid" :disabled="!canUpdate" @click="openPrinter()">{{ copy.addPrinter }}</AppButton>
					</div>
					<div v-if="!printers.length" class="mt-4 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-6 py-8 text-center">
						<p class="text-sm font-semibold text-stone-950">{{ copy.emptyPrinters }}</p>
						<p class="mt-1 text-sm text-stone-500">{{ copy.emptyPrintersHint }}</p>
					</div>
					<div v-else class="mt-4 grid gap-3 sm:grid-cols-2">
						<div v-for="printer in printers" :key="printer.id" class="rounded-md border border-neutral-200 bg-neutral-50 p-3">
							<div class="flex items-start justify-between gap-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-semibold text-stone-950">{{ printer.name }}</p>
									<p class="mt-0.5 truncate font-mono text-xs text-stone-500">{{ printer.address }} · {{ printer.paper_width }}mm</p>
									<UBadge class="mt-2" :color="printer.station_name ? 'primary' : 'neutral'" variant="soft">
										{{ printer.station_name || copy.stationAll }}
									</UBadge>
									<UBadge v-if="!printer.is_active" class="ml-1 mt-2" color="warning" variant="soft">{{ copy.active }}: —</UBadge>
								</div>
								<div class="flex shrink-0 gap-1">
									<AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-pencil-square-20-solid" :disabled="!canUpdate" :aria-label="copy.editPrinter" @click="openPrinter(printer)" />
									<AppButton size="xs" color="error" variant="soft" icon="i-heroicons-trash-20-solid" :disabled="!canUpdate" :aria-label="copy.delete" @click="removePrinter(printer)" />
								</div>
							</div>
						</div>
					</div>
				</UCard>

				<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
					<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
						<div>
							<h2 class="text-base font-semibold text-stone-950">{{ copy.agents }}</h2>
							<p class="mt-1 text-sm leading-6 text-stone-500">{{ copy.agentsHint }}</p>
						</div>
						<AppButton class="shrink-0" color="primary" variant="soft" icon="i-heroicons-plus-20-solid" :disabled="!canUpdate" @click="agentPanel = true">{{ copy.addAgent }}</AppButton>
					</div>
					<p v-if="!agents.length" class="mt-4 text-sm text-stone-500">{{ copy.emptyAgents }}</p>
					<div v-else class="mt-4 space-y-2">
						<div v-for="agent in agents" :key="agent.id" class="flex items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-stone-950">{{ agent.name }}</p>
								<p class="mt-0.5 text-xs text-stone-500">{{ copy.lastSeen }}: {{ timeLabel(agent.last_seen_at) }}</p>
							</div>
							<AppButton size="xs" color="error" variant="soft" icon="i-heroicons-trash-20-solid" :disabled="!canUpdate" :aria-label="copy.delete" @click="removeAgent(agent)" />
						</div>
					</div>
				</UCard>

				<UCard class="rounded-md border-0 bg-white shadow-sm ring-1 ring-neutral-200">
					<h2 class="text-base font-semibold text-stone-950">{{ copy.jobs }}</h2>
					<p v-if="!jobs.length" class="mt-3 text-sm text-stone-500">{{ copy.emptyJobs }}</p>
					<div v-else class="mt-3 overflow-x-auto">
						<table class="w-full min-w-[640px] text-sm">
							<tbody class="divide-y divide-neutral-100">
								<tr v-for="job in jobs" :key="job.id">
									<td class="py-2 pr-3">
										<p class="font-medium text-stone-900">{{ job.kind === "void" ? copy.kindVoid : copy.kindKitchen }}</p>
										<p class="text-xs text-stone-500">{{ [job.printer_name, job.station_name].filter(Boolean).join(" · ") }}</p>
									</td>
									<td class="py-2 pr-3 text-xs text-stone-500">{{ timeLabel(job.created_at) }}</td>
									<td class="py-2 pr-3">
										<UBadge :color="statusColor(job.status)" variant="soft">{{ statusLabel(job.status) }}</UBadge>
										<!-- The reason a slip never reached the kitchen belongs next to the
										     slip, not in a server log nobody at the shop can read. -->
										<p v-if="job.error" class="mt-1 max-w-xs truncate text-xs text-red-600" :title="job.error">{{ job.error }}</p>
									</td>
									<td class="py-2 text-right">
										<AppButton v-if="job.status !== 'done'" size="xs" color="neutral" variant="soft" icon="i-heroicons-arrow-path" :disabled="!canUpdate" @click="retryJob(job)">{{ copy.retry }}</AppButton>
									</td>
								</tr>
							</tbody>
						</table>
					</div>
				</UCard>
			</div>
		</template>
	</AppSidebarShell>

	<AppResponsivePanel v-model="printerPanel" :title="editingId ? copy.editPrinter : copy.addPrinter" desktop-width="560px">
		<div class="space-y-4">
			<UFormField :label="copy.name">
				<UInput v-model="form.name" class="w-full" autofocus />
			</UFormField>
			<UFormField :label="copy.address" :hint="copy.addressHint">
				<UInput v-model="form.address" class="w-full" placeholder="192.168.1.50:9100" />
			</UFormField>
			<UFormField :label="copy.station">
				<USelect
					v-model="form.station_id"
					class="w-full"
					:items="[{ label: copy.stationAll, value: '' }, ...stations.map((station) => ({ label: station.name, value: station.id }))]"
				/>
			</UFormField>
			<UFormField :label="copy.paperWidth">
				<USelect v-model="form.paper_width" class="w-full" :items="[{ label: '80mm', value: 80 }, { label: '58mm', value: 58 }]" />
			</UFormField>
			<UCheckbox v-model="form.is_active" :label="copy.active" />
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="printerPanel = false">{{ copy.cancel }}</AppButton>
				<AppButton color="primary" block icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canUpdate" @click="savePrinter">{{ copy.save }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>

	<AppResponsivePanel v-model="agentPanel" :title="copy.addAgent" desktop-width="520px">
		<div class="space-y-4">
			<UFormField :label="copy.agentName">
				<UInput v-model="agentName" class="w-full" autofocus placeholder="counter-pc" />
			</UFormField>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block @click="agentPanel = false">{{ copy.cancel }}</AppButton>
				<AppButton color="primary" block icon="i-heroicons-check-20-solid" :loading="saving" :disabled="!canUpdate" @click="createAgent">{{ copy.save }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>

	<AppResponsivePanel :model-value="Boolean(issuedToken)" :title="copy.tokenTitle" desktop-width="560px" @update:model-value="value => { if (!value) issuedToken = '' }">
		<div class="space-y-4">
			<UAlert color="warning" variant="soft" icon="i-heroicons-exclamation-triangle" :title="copy.tokenHint" />
			<code class="block break-all rounded-md border border-neutral-200 bg-neutral-50 p-3 font-mono text-sm text-stone-900">{{ issuedToken }}</code>
			<div class="grid grid-cols-2 gap-2">
				<AppButton color="neutral" variant="soft" block icon="i-heroicons-clipboard-document" @click="copyToken">{{ tokenCopied ? copy.copied : copy.copy }}</AppButton>
				<AppButton color="primary" block @click="issuedToken = ''">{{ copy.close }}</AppButton>
			</div>
		</div>
	</AppResponsivePanel>
</template>
