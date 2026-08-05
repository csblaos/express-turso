<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";
import { resolveStoredImageUrl } from "~/utils/image";
import { publishCustomerDisplayBranding } from "~/composables/useCustomerDisplay";

type ApiEnvelope<T> = { success: true; requestId: string; data: T };
type StoreRecord = {
	id: string;
	name: string;
	logo_url?: string | null;
	currency?: string | null;
	customer_display_enabled: number;
	customer_display_ads: string | null;
	customer_display_ad_interval?: number | null;
	customer_display_banner_enabled?: number | null;
	customer_display_ad_url: string | null;
};

const MAX_ADS = 3;

const { apiFetch } = useApiClient();
const runtimeConfig = useRuntimeConfig();
const { locale } = useI18n();
const { currentUser, currentAccess, currentStoreId, can } = useAuthSession();
const toast = useAppToast();

const copy = computed(() => {
	if (locale.value === "lo") return {
		settings: "ຕັ້ງຄ່າ", title: "ໜ້າຈໍລູກຄ້າ", description: "ເປີດໜ້າຈໍທີ່ສອງສຳລັບລູກຄ້າ ແລະ ຕັ້ງຮູບໂຄສະນາ",
		enable: "ເປີດໃຊ້ໜ້າຈໍລູກຄ້າ", enableHint: "ເມື່ອເປີດ ຈະມີປຸ່ມເປີດໜ້າຈໍລູກຄ້າຢູ່ໜ້າຂາຍ",
		disabledNote: "ປິດຢູ່ ຈຶ່ງບໍ່ມີປຸ່ມເປີດໜ້າຈໍລູກຄ້າ",
		bannerEnable: "ສະແດງຮູບໂຄສະນາ", bannerEnableHint: "ປິດໄວ້ ໜ້າຈໍຈະສະແດງໂລໂກ້ ແລະ ຄຳຕ້ອນຮັບແທນ ຮູບທີ່ອັບໄວ້ຍັງຢູ່ຄືເກົ່າ",
		bannerOffNote: "ຕອນນີ້ສະແດງໂລໂກ້ ແລະ ຄຳຕ້ອນຮັບ",
		interval: "ສະຫຼັບຮູບທຸກ", intervalHint: "ມີຜົນເມື່ອມີຮູບຫຼາຍກວ່າ 1 ຮູບ",
		intervalManual: "ບໍ່ສະຫຼັບ", intervalSeconds: "{count} ວິນາທີ",
		linkTitle: "ລິ້ງໜ້າຈໍລູກຄ້າ", linkHint: "ເປີດລິ້ງນີ້ໃນໜ້າຈໍທີ່ສອງ ຫຼື ກົດປຸ່ມຮູບຈໍຢູ່ໜ້າຂາຍກໍ່ໄດ້",
		linkCopy: "ສຳເນົາລິ້ງ", linkCopied: "ສຳເນົາລິ້ງແລ້ວ", linkOpen: "ເປີດເລີຍ", linkCopyFailed: "ສຳເນົາບໍ່ສຳເລັດ",
		ads: "ຮູບໂຄສະນາ", adsHint: `ໃສ່ໄດ້ສູງສຸດ ${MAX_ADS} ຮູບ`,
		adsOptional: "ບໍ່ໃສ່ກໍ່ໄດ້ ຖ້າບໍ່ມີຈະສະແດງໂລໂກ້ຮ້ານແທນ",
		adsSize: "ແນະນຳຮູບແນວນອນ 16:9 ຂະໜາດ 1280 × 720 px ວາງເນື້ອຫາສຳຄັນໄວ້ກາງຮູບ",
		addImage: "ເພີ່ມຮູບ", full: `ຄົບ ${MAX_ADS} ຮູບແລ້ວ`,
		imageFailed: "ກຽມຮູບບໍ່ສຳເລັດ", saved: "ບັນທຶກແລ້ວ", saveFailed: "ບັນທຶກບໍ່ສຳເລັດ",
		removeTitle: "ລົບຮູບນີ້ບໍ?", removeBody: "ຮູບຈະຖືກລົບອອກຈາກບ່ອນເກັບຖາວອນ ກູ້ຄືນບໍ່ໄດ້",
		remove: "ລົບຮູບ", cancel: "ຍົກເລີກ",
		reload: "ໂຫຼດໃໝ່", loadFailed: "ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ", noPermission: "ທ່ານບໍ່ມີສິດແກ້ໄຂຮ້ານນີ້",
	};
	if (locale.value === "th") return {
		settings: "ตั้งค่า", title: "จอลูกค้า", description: "เปิดจอที่สองสำหรับลูกค้า และตั้งรูปโฆษณา",
		enable: "เปิดใช้จอลูกค้า", enableHint: "เมื่อเปิด จะมีปุ่มเปิดจอลูกค้าอยู่ที่หน้าขาย",
		disabledNote: "ปิดอยู่ จึงไม่มีปุ่มเปิดจอลูกค้า",
		bannerEnable: "แสดงรูปโฆษณา", bannerEnableHint: "ปิดไว้ จอจะแสดงโลโก้และคำต้อนรับแทน รูปที่อัปไว้ยังอยู่เหมือนเดิม",
		bannerOffNote: "ตอนนี้แสดงโลโก้และคำต้อนรับ",
		interval: "สลับรูปทุก", intervalHint: "มีผลเมื่อมีรูปมากกว่า 1 รูป",
		intervalManual: "ไม่สลับ", intervalSeconds: "{count} วินาที",
		linkTitle: "ลิงก์จอลูกค้า", linkHint: "เปิดลิงก์นี้บนจอที่สอง หรือกดปุ่มรูปจอที่หน้าขายก็ได้",
		linkCopy: "คัดลอกลิงก์", linkCopied: "คัดลอกลิงก์แล้ว", linkOpen: "เปิดเลย", linkCopyFailed: "คัดลอกไม่สำเร็จ",
		ads: "รูปโฆษณา", adsHint: `ใส่ได้สูงสุด ${MAX_ADS} รูป`,
		adsOptional: "ไม่ใส่ก็ได้ ถ้าไม่มีจะแสดงโลโก้ร้านแทน",
		adsSize: "แนะนำรูปแนวนอน 16:9 ขนาด 1280 × 720 px วางเนื้อหาสำคัญไว้กลางรูป",
		addImage: "เพิ่มรูป", full: `ครบ ${MAX_ADS} รูปแล้ว`,
		imageFailed: "เตรียมรูปไม่สำเร็จ", saved: "บันทึกแล้ว", saveFailed: "บันทึกไม่สำเร็จ",
		removeTitle: "ลบรูปนี้ใช่ไหม?", removeBody: "รูปจะถูกลบออกจากที่เก็บถาวร กู้คืนไม่ได้",
		remove: "ลบรูป", cancel: "ยกเลิก",
		reload: "โหลดใหม่", loadFailed: "โหลดข้อมูลไม่สำเร็จ", noPermission: "คุณไม่มีสิทธิ์แก้ไขร้านนี้",
	};
	return {
		settings: "Settings", title: "Customer display", description: "Turn on the second screen for customers and set its advert images",
		enable: "Enable customer display", enableHint: "When on, the POS shows a button that opens the customer screen",
		disabledNote: "Turned off, so the POS has no customer screen button",
		bannerEnable: "Show banner images", bannerEnableHint: "Turn off to show the shop logo and welcome instead; uploaded images are kept",
		bannerOffNote: "Currently showing the logo and welcome",
		interval: "Change image every", intervalHint: "Applies once there is more than one image",
		intervalManual: "Do not change", intervalSeconds: "{count} seconds",
		linkTitle: "Customer screen link", linkHint: "Open this on the second monitor, or use the screen button on the POS",
		linkCopy: "Copy link", linkCopied: "Link copied", linkOpen: "Open", linkCopyFailed: "Could not copy",
		ads: "Advert images", adsHint: `Up to ${MAX_ADS} images`,
		adsOptional: "Optional. Without any, the store logo is shown instead",
		adsSize: "Best as landscape 16:9 at 1280 × 720 px, with the important part centred",
		addImage: "Add image", full: `${MAX_ADS} images already added`,
		imageFailed: "Could not prepare image", saved: "Saved", saveFailed: "Could not save",
		removeTitle: "Remove this image?", removeBody: "It is deleted from storage permanently and cannot be restored",
		remove: "Remove", cancel: "Cancel",
		reload: "Reload", loadFailed: "Could not load settings", noPermission: "You do not have permission to update this store",
	};
});

const storeId = computed(() => currentStoreId.value || currentAccess.value?.store_id || currentAccess.value?.memberships?.[0]?.store_id || "");
const elevated = computed(() => currentUser.value?.systemRole === "superadmin" || currentUser.value?.systemRole === "system_admin");
const canUpdate = computed(() => elevated.value || can("settings.store.update"));
// Only once the session is actually known - otherwise every refresh flashes a
// permission warning at people who do have the permission.
const canShowPermissionWarning = computed(() => (
	!loading.value && Boolean(currentUser.value || currentAccess.value) && !canUpdate.value
));
const loading = ref(true);
const saving = ref(false);
const preparingImage = ref(false);
const adInput = ref<HTMLInputElement | null>(null);
const error = ref("");
const enabled = ref(false);
const bannerEnabled = ref(true);
// 0 holds on one image; the rest are seconds between adverts.
const AD_INTERVAL_OPTIONS = [ 0, 5, 10, 15 ] as const;
const adInterval = ref(5);
const ads = ref<string[]>([]);
const pendingRemoveIndex = ref<number | null>(null);

function resolveAdUrl(value: string) {
	if (/^(https?:\/\/|data:|blob:)/i.test(value)) return value;
	const base = String(runtimeConfig.public.r2PublicBaseUrl || "").replace(/\/$/, "");
	return `${base}${value.startsWith("/") ? value : `/${value}`}`;
}

// Built from the current origin so it is localhost in development and the real
// domain in production without any extra configuration.
const displayUrl = computed(() => {
	const origin = import.meta.client ? window.location.origin : "";
	const query = storeId.value ? `?store=${encodeURIComponent(storeId.value)}` : "";
	return `${origin}/customer-display${query}`;
});

function hydrate(store: StoreRecord) {
	enabled.value = Number(store.customer_display_enabled || 0) !== 0;
	bannerEnabled.value = Number(store.customer_display_banner_enabled ?? 1) !== 0;
	adInterval.value = Number(store.customer_display_ad_interval ?? 5);
	let parsed: string[] = [];
	const stored = store.customer_display_ads;
	if (typeof stored === "string" && stored.trim()) {
		try {
			const raw = JSON.parse(stored);
			if (Array.isArray(raw)) parsed = raw.filter((item): item is string => typeof item === "string" && Boolean(item));
		} catch {
			parsed = [];
		}
	} else if (store.customer_display_ad_url) {
		// Carry over the single advert from before the gallery existed. Only when
		// the gallery was never saved, otherwise a deleted image would come back.
		parsed = [ store.customer_display_ad_url ];
	}
	ads.value = parsed.slice(0, MAX_ADS);

	// The display screen has no API access of its own and only learns the shop
	// from a POS broadcast. Opening the link from here with no POS window running
	// would otherwise show a nameless screen with the system logo, so seed the
	// cache the screen reads on load.
	// Announced, not just cached: a display already open on the second monitor
	// has to follow a settings change without being closed and reopened.
	publishCustomerDisplayBranding(store.id || storeId.value, {
		storeName: store.name || "",
		storeLogo: resolveStoredImageUrl(store.logo_url || "", String(runtimeConfig.public.r2PublicBaseUrl || "")) || "",
		currency: String(store.currency || "LAK"),
		adImages: bannerEnabled.value ? ads.value.map(resolveAdUrl) : [],
		adIntervalSeconds: adInterval.value,
	});
}

async function load() {
	if (!storeId.value) return;
	loading.value = true;
	error.value = "";
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(storeId.value)}`);
		hydrate(response.data);
	} catch (cause) {
		error.value = resolveApiErrorMessage(cause, copy.value.loadFailed);
	} finally {
		loading.value = false;
	}
}

// Every change writes straight away. A separate save step here only created a
// state where the screen and the settings disagreed until someone remembered
// to press it.
async function persist(next: { enabled?: boolean; ads?: string[]; bannerEnabled?: boolean; adInterval?: number }) {
	if (!canUpdate.value || !storeId.value) return;
	const previous = { enabled: enabled.value, ads: [ ...ads.value ], bannerEnabled: bannerEnabled.value, adInterval: adInterval.value };
	if (next.enabled !== undefined) enabled.value = next.enabled;
	if (next.ads) ads.value = next.ads;
	if (next.bannerEnabled !== undefined) bannerEnabled.value = next.bannerEnabled;
	if (next.adInterval !== undefined) adInterval.value = next.adInterval;
	saving.value = true;
	error.value = "";
	try {
		const response = await apiFetch<ApiEnvelope<StoreRecord>>(`/stores/${encodeURIComponent(storeId.value)}`, {
			method: "PUT",
			body: {
				customer_display_enabled: enabled.value ? 1 : 0,
				customer_display_ads: ads.value,
				customer_display_banner_enabled: bannerEnabled.value ? 1 : 0,
				customer_display_ad_interval: adInterval.value,
			},
		});
		hydrate(response.data);
		toast.success({ title: copy.value.saved });
	} catch (cause) {
		enabled.value = previous.enabled;
		ads.value = previous.ads;
		bannerEnabled.value = previous.bannerEnabled;
		adInterval.value = previous.adInterval;
		error.value = resolveApiErrorMessage(cause, copy.value.saveFailed);
		toast.error({ title: copy.value.saveFailed, description: error.value });
	} finally {
		saving.value = false;
	}
}

async function copyDisplayUrl() {
	try {
		await navigator.clipboard.writeText(displayUrl.value);
		toast.success({ title: copy.value.linkCopied, description: displayUrl.value });
	} catch {
		toast.error({ title: copy.value.linkCopyFailed, description: displayUrl.value });
	}
}

function openDisplayUrl() {
	if (!import.meta.client) return;
	// Matches the POS opener: the bill shows more lines on a taller window.
	const width = Math.max(1024, Math.round((window.screen?.availWidth || 1024) * 0.9));
	const height = Math.max(768, Math.round((window.screen?.availHeight || 768) * 0.9));
	window.open(displayUrl.value, "pos-customer-display", `width=${width},height=${height},left=0,top=0`);
}

function openAdPicker() {
	if (!canUpdate.value || loading.value || preparingImage.value || ads.value.length >= MAX_ADS) return;
	adInput.value?.click();
}

function readFileAsDataUrl(file: Blob) {
	return new Promise<string>((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => resolve(String(reader.result || ""));
		reader.onerror = () => reject(reader.error || new Error(copy.value.imageFailed));
		reader.readAsDataURL(file);
	});
}

// The advert fills a whole panel on the second screen, so it keeps more detail
// than the logo pipeline allows while staying inside the 3 MB upload limit.
async function prepareAd(file: File) {
	const bitmap = await createImageBitmap(file);
	const maxSize = 1280;
	const ratio = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
	const canvas = document.createElement("canvas");
	canvas.width = Math.max(1, Math.round(bitmap.width * ratio));
	canvas.height = Math.max(1, Math.round(bitmap.height * ratio));
	const context = canvas.getContext("2d");
	if (!context) {
		bitmap.close();
		throw new Error(copy.value.imageFailed);
	}
	context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
	bitmap.close();
	const qualities = [ 0.88, 0.78, 0.68, 0.58 ];
	let output: Blob | null = null;
	for (const quality of qualities) {
		output = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", quality));
		if (output && output.size <= 3 * 1024 * 1024) break;
	}
	if (!output || output.size > 3 * 1024 * 1024) throw new Error(copy.value.imageFailed);
	return readFileAsDataUrl(output);
}

async function onAdSelected(event: Event) {
	const input = event.target as HTMLInputElement;
	const files = Array.from(input.files || []);
	input.value = "";
	if (!files.length) return;
	preparingImage.value = true;
	try {
		const room = MAX_ADS - ads.value.length;
		const prepared: string[] = [];
		for (const file of files.slice(0, room)) prepared.push(await prepareAd(file));
		if (prepared.length) await persist({ ads: [ ...ads.value, ...prepared ] });
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : copy.value.imageFailed;
		toast.error({ title: copy.value.imageFailed, description: message });
	} finally {
		preparingImage.value = false;
	}
}

async function confirmRemove() {
	const index = pendingRemoveIndex.value;
	pendingRemoveIndex.value = null;
	if (index === null) return;
	await persist({ ads: ads.value.filter((_, position) => position !== index) });
}

watch(storeId, (value) => { if (value) void load(); }, { immediate: true });
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="copy.settings"
		:sidebar-title="copy.title"
		sidebar-compact-title="DISP"
		:sidebar-description="copy.description"
	>
		<template #default="{ openSidebar }">
			<div class="space-y-4 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:pb-4">
				<AppPageHeader :title="copy.title" :description="copy.description" :title-badge="false" actions-align="center" compact @menu="openSidebar">
					<template #actions>
						<AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path-20-solid" :loading="loading || saving" :disabled="loading" @click="load">
							{{ copy.reload }}
						</AppButton>
					</template>
				</AppPageHeader>

				<p v-if="canShowPermissionWarning" class="rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-800">{{ copy.noPermission }}</p>
				<p v-if="error" class="rounded-md bg-error-50 px-4 py-3 text-sm text-error">{{ error }}</p>

				<UCard>
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-stone-900">{{ copy.enable }}</p>
							<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.enableHint }}</p>
						</div>
						<button
							type="button"
							class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50"
							:class="enabled ? 'bg-primary-600' : 'bg-stone-200'"
							:disabled="!canUpdate || saving"
							@click="persist({ enabled: !enabled })"
						>
							<span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" :class="enabled ? 'translate-x-5' : 'translate-x-0.5'" />
						</button>
					</div>
					<p v-if="!enabled" class="mt-3 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-500">{{ copy.disabledNote }}</p>
				</UCard>

				<UCard v-if="enabled">
					<div class="flex items-start justify-between gap-4">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-stone-900">{{ copy.bannerEnable }}</p>
							<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.bannerEnableHint }}</p>
						</div>
						<button
							type="button"
							class="relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition disabled:opacity-50"
							:class="bannerEnabled ? 'bg-primary-600' : 'bg-stone-200'"
							:disabled="!canUpdate || saving"
							@click="persist({ bannerEnabled: !bannerEnabled })"
						>
							<span class="inline-block h-5 w-5 rounded-full bg-white shadow-sm transition" :class="bannerEnabled ? 'translate-x-5' : 'translate-x-0.5'" />
						</button>
					</div>
					<p v-if="!bannerEnabled" class="mt-3 rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-500">{{ copy.bannerOffNote }}</p>

					<div v-if="bannerEnabled" class="mt-4 border-t border-stone-200 pt-4">
						<p class="text-sm font-semibold text-stone-900">{{ copy.interval }}</p>
						<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.intervalHint }}</p>
						<div class="mt-3 flex flex-wrap gap-2">
							<button
								v-for="option in AD_INTERVAL_OPTIONS"
								:key="option"
								type="button"
								class="rounded-md border px-3 py-1.5 text-sm font-medium transition disabled:opacity-50"
								:class="adInterval === option ? 'border-primary-600 bg-primary-600 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-primary-200'"
								:disabled="!canUpdate || saving"
								@click="persist({ adInterval: option })"
							>
								{{ option === 0 ? copy.intervalManual : copy.intervalSeconds.replace('{count}', String(option)) }}
							</button>
						</div>
					</div>
				</UCard>

				<UCard v-if="enabled">
					<p class="text-sm font-semibold text-stone-900">{{ copy.linkTitle }}</p>
					<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.linkHint }}</p>
					<div class="mt-3 flex flex-wrap items-center gap-2">
						<code class="min-w-0 flex-1 truncate rounded-md bg-stone-50 px-3 py-2 text-xs text-stone-700 ring-1 ring-stone-200">{{ displayUrl }}</code>
						<AppButton color="neutral" variant="soft" size="sm" icon="i-heroicons-clipboard-document-20-solid" @click="copyDisplayUrl">{{ copy.linkCopy }}</AppButton>
						<AppButton color="primary" variant="soft" size="sm" icon="i-heroicons-arrow-top-right-on-square-20-solid" @click="openDisplayUrl">{{ copy.linkOpen }}</AppButton>
					</div>
				</UCard>

				<UCard>
					<div class="flex items-start justify-between gap-3">
						<div class="min-w-0">
							<p class="text-sm font-semibold text-stone-900">{{ copy.ads }}</p>
							<p class="mt-1 text-xs leading-5 text-stone-500">{{ copy.adsHint }}</p>
							<p class="mt-1 text-xs leading-5 text-stone-400">{{ copy.adsOptional }}</p>
							<p class="mt-1 text-xs leading-5 text-stone-400">{{ copy.adsSize }}</p>
						</div>
						<span class="shrink-0 rounded-full bg-stone-100 px-2.5 py-1 text-xs text-stone-600">{{ ads.length }} / {{ MAX_ADS }}</span>
					</div>

					<input ref="adInput" type="file" accept="image/*" multiple class="hidden" @change="onAdSelected">

					<div class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
						<div v-for="(ad, index) in ads" :key="`${ad}-${index}`" class="group relative overflow-hidden rounded-md border border-neutral-200 bg-neutral-50">
							<img :src="resolveAdUrl(ad)" alt="" class="aspect-video w-full object-cover">
							<span class="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-xs font-medium text-white">{{ index + 1 }}</span>
							<button
								type="button"
								class="absolute right-2 top-2 grid size-8 place-items-center rounded-full bg-white/90 text-stone-600 shadow-sm transition hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
								:disabled="!canUpdate || saving"
								@click="pendingRemoveIndex = index"
							>
								<UIcon name="i-heroicons-trash-20-solid" class="size-4" />
							</button>
						</div>

						<button
							v-if="ads.length < MAX_ADS"
							type="button"
							class="flex aspect-video w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-neutral-300 bg-neutral-50 text-stone-400 transition hover:border-primary-300 hover:bg-primary-50 hover:text-primary-600 disabled:opacity-50"
							:disabled="!canUpdate || preparingImage || saving"
							@click="openAdPicker"
						>
							<UIcon :name="preparingImage ? 'i-heroicons-arrow-path-20-solid' : 'i-heroicons-photo-20-solid'" class="size-7" :class="preparingImage ? 'animate-spin' : ''" />
							<span class="text-sm font-medium">{{ copy.addImage }}</span>
							<span class="px-3 text-center text-[11px] leading-4 text-stone-400">16:9 · 1280 × 720 px</span>
						</button>
					</div>

					<p v-if="ads.length >= MAX_ADS" class="mt-3 text-xs text-stone-400">{{ copy.full }}</p>
				</UCard>
			</div>

			<AppConfirmDialog
				:open="pendingRemoveIndex !== null"
				:title="copy.removeTitle"
				:description="copy.removeBody"
				:confirm-label="copy.remove"
				:cancel-label="copy.cancel"
				tone="danger"
				@cancel="pendingRemoveIndex = null"
				@confirm="confirmRemove"
			/>
		</template>
	</AppSidebarShell>
</template>
