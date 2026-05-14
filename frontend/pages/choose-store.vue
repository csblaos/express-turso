<script setup lang="ts">
type StoreOption = {
	id: string;
	name: string;
	currency?: string;
};

type ApiEnvelope<T> = {
	success: true;
	requestId: string;
	data: T;
};

const { currentUser, currentAccess, currentStoreId, switchStore, logout, fetchMe } = useAuthSession();
const { apiFetch } = useApiClient();
const appToast = useAppToast();
const route = useRoute();

const storesPending = ref(true);
const confirmPending = ref(false);
const stores = ref<StoreOption[]>([]);
const selectedStoreId = ref("");
const pageError = ref<string | null>(null);

const redirectPath = computed(() => (
	typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
		? route.query.redirect
		: "/"
));

const needsOnboarding = computed(() => route.query.onboarding === "1");
const availableStoreCount = computed(() => availableStores.value.length);

const availableStores = computed(() => {
	const membershipStoreIds = Array.from(new Set((currentAccess.value?.memberships || []).map((membership) => membership.store_id)));
	const storesById = new Map(stores.value.map((store) => [ store.id, store ]));
	return membershipStoreIds.map((storeId) => ({
		id: storeId,
		name: storesById.get(storeId)?.name || storeId,
		currency: storesById.get(storeId)?.currency,
		role_name: currentAccess.value?.memberships?.find((membership) => membership.store_id === storeId)?.role_name || "",
		status: currentAccess.value?.memberships?.find((membership) => membership.store_id === storeId)?.status || "",
	}));
});

async function continueToWorkspace() {
	const targetPath = needsOnboarding.value ? "/onboarding" : redirectPath.value;
	return navigateTo(targetPath, { replace: true });
}

async function loadStores() {
	storesPending.value = true;
	pageError.value = null;
	try {
		if (!currentUser.value) {
			await fetchMe(undefined, false);
		}

		if (currentUser.value?.systemRole === "system_admin") {
			return continueToWorkspace();
		}

		try {
			const response = await apiFetch<ApiEnvelope<StoreOption[]>>("/stores");
			stores.value = response.data;
		} catch {
			stores.value = [];
		}

		if (availableStores.value.length <= 1) {
			selectedStoreId.value = availableStores.value[0]?.id || currentStoreId.value || "";
			return continueToWorkspace();
		}

		selectedStoreId.value = (
			availableStores.value.find((store) => store.id === currentStoreId.value)?.id
			|| availableStores.value[0]?.id
			|| ""
		);
	} catch (error) {
		pageError.value = error instanceof Error ? error.message : "โหลดรายการร้านไม่สำเร็จ";
	} finally {
		storesPending.value = false;
	}
}

async function confirmStore() {
	if (!selectedStoreId.value || confirmPending.value) return;

	confirmPending.value = true;
	pageError.value = null;
	try {
		if (selectedStoreId.value !== currentStoreId.value) {
			await switchStore(selectedStoreId.value);
		}
		appToast.success({
			title: "เลือกร้านแล้ว",
			description: availableStores.value.find((store) => store.id === selectedStoreId.value)?.name || selectedStoreId.value,
			timeout: 1800,
		});
		await continueToWorkspace();
	} catch (error) {
		pageError.value = error instanceof Error ? error.message : "เลือกร้านไม่สำเร็จ";
		appToast.error({
			title: "เลือกร้านไม่สำเร็จ",
			description: pageError.value,
			timeout: 3200,
		});
	} finally {
		confirmPending.value = false;
	}
}

async function handleLogout() {
	await logout();
	return navigateTo("/login", { replace: true });
}

onMounted(() => {
	void loadStores();
});
</script>

<template>
	<main class="min-h-[100dvh] bg-[#f6f6f3]">
		<div class="relative min-h-[100dvh] overflow-hidden">
			<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(201,119,69,0.12),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(151,83,44,0.08),_transparent_24%)]" />
			<div class="relative mx-auto flex min-h-[100dvh] w-full max-w-6xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8 lg:py-8">
				<header class="flex items-start justify-between gap-4 rounded-md border border-[#e7e4dd] bg-[#fffefd] px-4 py-3 sm:px-5">
					<div class="flex min-w-0 items-center gap-3">
						<div class="h-12 w-12 overflow-hidden rounded-md ring-1 ring-[#e7e4dd]">
							<img src="/icons/icon-192.png" alt="App icon" class="h-full w-full object-cover" />
						</div>
						<div class="min-w-0">
							<p class="text-[11px] uppercase tracking-[0.22em] text-stone-400">Workspace Selection</p>
							<h1 class="truncate text-lg font-semibold tracking-[-0.03em] text-stone-950 sm:text-xl">Choose your store</h1>
							<p class="mt-1 hidden text-sm text-stone-500 sm:block">{{ currentUser?.name || currentUser?.email || "บัญชีนี้" }}</p>
						</div>
					</div>
					<AppButton
						color="neutral"
						variant="soft"
						size="sm"
						icon="i-heroicons-arrow-left-on-rectangle-20-solid"
						class="shrink-0 whitespace-nowrap rounded-md"
						@click="handleLogout"
					>
						ออกจากระบบ
					</AppButton>
				</header>

				<div class="grid flex-1 items-start gap-6 py-4 lg:grid-cols-[minmax(0,0.88fr)_minmax(0,1.12fr)] lg:gap-8 lg:py-8">
					<section class="hidden lg:flex lg:min-h-full lg:flex-col lg:justify-between">
						<div class="space-y-5">
							<UBadge color="primary" variant="soft" label="Multi-store access" />
							<div class="space-y-4">
								<h2 class="max-w-xl text-4xl leading-tight font-semibold tracking-[-0.05em] text-stone-950">
									เลือกร้านที่จะใช้เป็น workspace ของรอบนี้
								</h2>
								<p class="max-w-xl text-base leading-7 text-stone-500">
									หน้าแรกหลัง login ควรชัดและตรงจุดที่สุด จึงให้เลือกร้านก่อนเข้าแอปจริง เพื่อให้สินค้า สต็อก รายงาน และสิทธิ์ทั้งหมดอยู่ใน context ที่ถูกต้องตั้งแต่ต้น
								</p>
							</div>

							<div class="grid gap-4 sm:grid-cols-2">
								<div class="rounded-md border border-[#e7e4dd] bg-[#fffefd] p-5">
									<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Store scope</p>
									<p class="mt-3 text-2xl font-semibold text-stone-950">ตรงร้านตั้งแต่แรก</p>
									<p class="mt-2 text-sm leading-6 text-stone-500">ลดโอกาสเปิดร้านผิด, ลดการสลับ context ซ้ำ และทำให้ข้อมูลหน้าถัดไปพร้อมใช้งานทันที</p>
								</div>
								<div class="rounded-md border border-[#e7e4dd] bg-[#fffefd] p-5">
									<p class="text-xs uppercase tracking-[0.18em] text-stone-400">After login</p>
									<p class="mt-3 text-2xl font-semibold text-stone-950">ยังเปลี่ยนได้ภายหลัง</p>
									<p class="mt-2 text-sm leading-6 text-stone-500">หลังเข้าแอปแล้ว คุณยังเปลี่ยนร้านได้จากเมนูโปรไฟล์ จึงไม่ต้องกังวลว่าจะถูกล็อกไว้ร้านเดียว</p>
								</div>
							</div>
						</div>

						<div class="rounded-md border border-dashed border-[#ddd7cb] bg-[#f9f7f2] px-5 py-4 text-sm text-stone-500">
							<div class="flex items-center justify-between gap-3">
								<span>Available stores</span>
								<span class="font-semibold text-stone-700">{{ availableStoreCount }}</span>
							</div>
						</div>
					</section>

					<section class="space-y-4">
						<div class="rounded-md border border-[#e7e4dd] bg-[#fffefd] p-4 sm:hidden">
							<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400">Available stores</p>
							<h2 class="mt-2 text-2xl font-semibold tracking-[-0.04em] text-stone-950">เลือกร้านก่อนเข้าใช้งาน</h2>
							<p class="mt-2 text-sm leading-6 text-stone-500">
								เลือกหนึ่งร้านเพื่อเข้าแอปก่อน และยังเปลี่ยนร้านได้ภายหลังจากเมนูโปรไฟล์
							</p>
						</div>

						<div class="rounded-md border border-[#e7e4dd] bg-[#fffefd]">
							<div class="flex items-start justify-between gap-4 border-b border-[#efece4] px-4 py-4 sm:px-5">
								<div class="min-w-0">
									<p class="hidden text-xs font-semibold uppercase tracking-[0.18em] text-stone-400 sm:block">Available stores</p>
									<h3 class="text-lg font-semibold tracking-[-0.03em] text-stone-950 sm:mt-2 sm:text-2xl">
										{{ currentUser?.name || currentUser?.email || "บัญชีนี้" }}
									</h3>
									<p class="mt-1 text-sm leading-6 text-stone-500">
										{{ availableStoreCount }} ร้านที่เข้าถึงได้ในบัญชีนี้
									</p>
								</div>
								<UBadge color="neutral" variant="soft" :label="`${availableStoreCount} stores`" />
							</div>

							<div class="space-y-3 px-4 py-4 sm:px-5">
								<div v-if="storesPending" class="space-y-3">
									<div v-for="index in 3" :key="index" class="h-20 animate-pulse rounded-md bg-[#f6f2ec]" />
								</div>

								<div
									v-else-if="pageError"
									class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700"
								>
									{{ pageError }}
								</div>

								<div v-else class="space-y-3">
									<button
										v-for="store in availableStores"
										:key="store.id"
										type="button"
										class="flex w-full items-start justify-between gap-4 rounded-md border px-4 py-4 text-left transition"
										:class="store.id === selectedStoreId ? 'border-primary-300 bg-primary-50 text-primary-700' : 'border-[#e7e4dd] bg-white text-stone-700 hover:border-primary-200 hover:bg-primary-50/60 hover:text-primary-700'"
										@click="selectedStoreId = store.id"
									>
										<div class="min-w-0">
											<div class="flex flex-wrap items-center gap-2">
												<p class="truncate text-base font-semibold">{{ store.name }}</p>
												<UBadge color="neutral" variant="soft" :label="store.role_name || 'Member'" />
											</div>
											<p class="mt-1 truncate text-xs" :class="store.id === selectedStoreId ? 'text-primary-600' : 'text-stone-400'">
												{{ store.id }}
											</p>
											<div class="mt-3 flex flex-wrap items-center gap-2">
												<UBadge color="neutral" variant="soft" :label="store.status || 'active'" />
												<UBadge v-if="store.currency" color="primary" variant="soft" :label="store.currency" />
											</div>
										</div>
										<div class="flex shrink-0 items-center gap-2">
											<span v-if="store.id === selectedStoreId" class="hidden text-xs font-semibold text-primary-600 sm:inline">Selected</span>
											<UIcon
												:name="store.id === selectedStoreId ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-building-storefront-20-solid'"
												class="mt-1 h-5 w-5"
											/>
										</div>
									</button>
								</div>
							</div>

							<div class="border-t border-[#efece4] px-4 py-4 sm:px-5">
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-arrow-right-20-solid"
									:loading="confirmPending"
									:spin-icon-on-loading="true"
									:disabled="storesPending || confirmPending || !selectedStoreId"
									:block="true"
									class="min-h-12 rounded-md font-semibold"
									@click="confirmStore"
								>
									{{ confirmPending ? "กำลังเข้าสู่ร้าน" : "เข้าร้านนี้" }}
								</AppButton>
							</div>
						</div>
					</section>
				</div>
			</div>
		</div>
	</main>
</template>
