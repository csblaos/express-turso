<script setup lang="ts">
// Camera barcode scanner, extracted so a page only has to say where the code
// should go. Mirrors the products page: ask for permission, let the user pick a
// camera when there is more than one, then read continuously until a code lands.
//
// Receipts carry a CODE128 of the order number, so scanning a printed bill is the
// fastest way back to it — the reason the barcode was put on the bill at all.
const open = defineModel<boolean>({ required: true });
const props = defineProps<{ hint?: string }>();
const emit = defineEmits<{ detected: [ string ] }>();

const { t } = useI18n();

const starting = ref(false);
const errorMessage = ref<string | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const permissionState = ref<"granted" | "denied" | "prompt" | "unknown">("unknown");
const devices = ref<Array<{ deviceId: string; label: string }>>([]);
const selectedDeviceId = ref("");
let controls: { stop?: () => void } | null = null;

function stopStream() {
	controls?.stop?.();
	controls = null;
	if (videoRef.value) videoRef.value.srcObject = null;
	starting.value = false;
}

async function refreshPermission() {
	if (!import.meta.client || typeof navigator.permissions?.query !== "function") {
		permissionState.value = "unknown";
		return;
	}
	try {
		const status = await navigator.permissions.query({ name: "camera" as never });
		permissionState.value = (status.state || "unknown") as typeof permissionState.value;
		status.onchange = () => { permissionState.value = (status.state || "unknown") as typeof permissionState.value; };
	} catch {
		permissionState.value = "unknown";
	}
}

async function refreshDevices() {
	if (!import.meta.client || !navigator.mediaDevices?.enumerateDevices) return;
	try {
		const found = await navigator.mediaDevices.enumerateDevices();
		devices.value = found
			.filter((device) => device.kind === "videoinput")
			.map((device, index) => ({ deviceId: device.deviceId, label: device.label || t("barcodeScanner.cameraNumber", { index: index + 1 }) }));
		if (!devices.value.some((device) => device.deviceId === selectedDeviceId.value)) {
			selectedDeviceId.value = devices.value[0]?.deviceId || "";
		}
	} catch {
		devices.value = [];
	}
}

async function start() {
	starting.value = true;
	errorMessage.value = null;
	await nextTick();
	try {
		const videoElement = videoRef.value;
		if (!videoElement) {
			starting.value = false;
			errorMessage.value = t("barcodeScanner.noVideoArea");
			return;
		}
		stopStream();
		const { BrowserMultiFormatReader } = await import("@zxing/browser");
		const reader = new BrowserMultiFormatReader();
		controls = await reader.decodeFromConstraints(
			{
				video: selectedDeviceId.value
					? { deviceId: { exact: selectedDeviceId.value } }
					: { facingMode: { ideal: "environment" } },
			},
			videoElement,
			(result, error, activeControls) => {
				if (result) {
					const text = typeof result.getText === "function" ? result.getText() : String((result as { text?: string }).text || "");
					if (text) {
						// Stop before emitting: the parent closes the panel, and a reader
						// left running would keep the camera light on.
						activeControls?.stop?.();
						controls = null;
						starting.value = false;
						open.value = false;
						emit("detected", text);
					}
					return;
				}
				// NotFoundException just means "nothing in frame yet", every frame.
				if (error && error.name !== "NotFoundException") errorMessage.value = t("barcodeScanner.readFailed");
			},
		);
		starting.value = false;
	} catch (error) {
		starting.value = false;
		errorMessage.value = error instanceof Error ? error.message : t("barcodeScanner.cameraFailed");
		await refreshPermission();
		await refreshDevices();
	}
}

async function requestPermissionAndStart() {
	try {
		const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
		// Release the probe stream; the reader opens its own.
		for (const track of stream.getTracks()) track.stop();
		await refreshPermission();
		await refreshDevices();
		await start();
	} catch {
		await refreshPermission();
		errorMessage.value = t("barcodeScanner.permissionDenied");
	}
}

async function changeCamera(deviceId: string) {
	selectedDeviceId.value = deviceId;
	await start();
}

watch(open, async (isOpen, wasOpen) => {
	if (isOpen === wasOpen) return;
	if (!isOpen) { stopStream(); return; }
	errorMessage.value = null;
	await refreshPermission();
	await refreshDevices();
	// Only auto-start when permission is already given, so opening the panel never
	// triggers a browser prompt the cashier did not ask for.
	if (permissionState.value === "granted") await start();
});

onBeforeUnmount(stopStream);
</script>

<template>
	<AppResponsivePanel
		v-model="open"
		:title="t('barcodeScanner.title')"
		:description="props.hint || t('barcodeScanner.hint')"
		desktop-width="520px"
		desktop-placement="center"
		compact-header
		close-button-size="sm"
	>
		<div class="space-y-3">
			<div v-if="permissionState !== 'granted'" class="rounded-md border border-amber-200 bg-amber-50 p-3">
				<p class="text-sm font-semibold text-amber-900">{{ t('barcodeScanner.permissionTitle') }}</p>
				<p class="mt-1 text-xs leading-5 text-amber-800">{{ t('barcodeScanner.permissionBody') }}</p>
				<AppButton
					class="mt-3"
					color="primary"
					variant="soft"
					size="sm"
					icon="i-heroicons-video-camera-20-solid"
					:label="t('barcodeScanner.allowCamera')"
					@click="requestPermissionAndStart"
				/>
			</div>

			<div v-else-if="devices.length > 1">
				<label class="text-xs font-medium text-stone-500">{{ t('barcodeScanner.chooseCamera') }}</label>
				<select
					:value="selectedDeviceId"
					class="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2 text-sm outline-none"
					@change="changeCamera(($event.target as HTMLSelectElement).value)"
				>
					<option v-for="camera in devices" :key="camera.deviceId" :value="camera.deviceId">{{ camera.label }}</option>
				</select>
			</div>

			<div v-if="permissionState === 'granted'" class="overflow-hidden rounded-md bg-stone-950 ring-1 ring-stone-900/10">
				<div class="relative aspect-[4/3] w-full">
					<video ref="videoRef" class="h-full w-full object-cover" muted playsinline />
					<div class="pointer-events-none absolute inset-0 flex items-center justify-center p-6">
						<div class="h-28 w-full max-w-sm rounded-md border-2 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.18)]" />
					</div>
				</div>
			</div>

			<p v-if="starting" class="text-sm text-stone-600">{{ t('barcodeScanner.starting') }}</p>
			<p v-else-if="errorMessage" class="text-sm text-rose-600">{{ errorMessage }}</p>

			<AppButton
				v-if="permissionState === 'granted'"
				block
				color="neutral"
				variant="soft"
				size="sm"
				icon="i-heroicons-arrow-path"
				:loading="starting"
				@click="start"
			>
				{{ t('barcodeScanner.restart') }}
			</AppButton>
		</div>
	</AppResponsivePanel>
</template>
