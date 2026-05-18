<script setup lang="ts">
import { needsAuthOnboarding } from "~/utils/auth-onboarding";
const { login, currentAccess } = useAuthSession();
const appToast = useAppToast();
const route = useRoute();

const DEV_PASSWORD = "dev123456";
const DEV_LOGINS = [
	{
		label: "Alex",
		role: "preset_user",
		email: "alex@gmail.com",
		password: "1234567",
		description: "preset สำหรับทดสอบการเข้าสู่ระบบด้วยบัญชีของ Alex",
	},
	{
		label: "System Admin",
		role: "system_admin",
		email: "dev@codesabai.local",
		password: DEV_PASSWORD,
		description: "สิทธิ์ระดับระบบกลางสำหรับตรวจ flow admin ทั้งแพลตฟอร์ม",
	},
	{
		label: "Owner",
		role: "owner",
		email: "owner@codesabai.local",
		password: DEV_PASSWORD,
		description: "เจ้าของร้านสำหรับเช็กหน้ารายงาน, ตั้งค่า และการจัดการร้าน",
	},
	{
		label: "Manager",
		role: "manager",
		email: "manager@codesabai.local",
		password: DEV_PASSWORD,
		description: "ผู้จัดการร้านสำหรับตรวจ workflow กลางของร้าน",
	},
	{
		label: "Cashier",
		role: "cashier",
		email: "cashier@codesabai.local",
		password: DEV_PASSWORD,
		description: "แคชเชียร์สำหรับเช็กประสบการณ์ใช้งานฝั่ง POS",
	},
	{
		label: "Stock",
		role: "inventory_staff",
		email: "stock@codesabai.local",
		password: DEV_PASSWORD,
		description: "พนักงานสต็อกสำหรับเช็ก inventory และงานรับของ",
	},
] as const;

const form = reactive({
	email: DEV_LOGINS[0].email,
	password: DEV_LOGINS[0].password,
	remember: true,
});

const submitting = ref(false);
const showPassword = ref(false);

onMounted(() => {
	if (!import.meta.client) return;

	window.scrollTo({ top: 0, left: 0, behavior: "auto" });
	document.documentElement.scrollTop = 0;
	document.body.scrollTop = 0;
});

	function extractLoginErrorMessage(error: unknown) {
		if (typeof error === "object" && error) {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const data = (error as any).data as { message?: string; response?: { message?: string } } | undefined;

			if (data?.response?.message) return data.response.message;
			if (data?.message) return data.message;
		}

	if (error instanceof Error && error.message) return error.message;
	return "เข้าสู่ระบบไม่สำเร็จ";
}

function resolvePostLoginPath(systemRole?: string | null) {
	return typeof route.query.redirect === "string" && route.query.redirect.startsWith("/")
		? route.query.redirect
		: (systemRole === "system_admin" ? "/system-admin/dashboard" : "/");
}

async function loginToPos() {
	submitting.value = true;
	try {
		const response = await login({
			emailOrUsername: form.email,
			password: form.password,
			rememberMe: form.remember,
		});
		const membershipCount = currentAccess.value?.memberships?.length ?? 0;
		const shouldChooseStoreFirst = response.user.systemRole !== "system_admin" && membershipCount > 1;
		if (shouldChooseStoreFirst) {
			const redirectPath = resolvePostLoginPath(response.user.systemRole);
			const chooseStoreQuery: Record<string, string> = {
				redirect: redirectPath,
			};
			if (needsAuthOnboarding(response.user)) {
				chooseStoreQuery.onboarding = "1";
			}
			return navigateTo({
				path: "/choose-store",
				query: chooseStoreQuery,
			});
		}

		return navigateTo(needsAuthOnboarding(response.user) ? "/onboarding" : resolvePostLoginPath(response.user.systemRole));
	} catch (err) {
		const message = extractLoginErrorMessage(err);
		appToast.error({
			title: "เข้าสู่ระบบไม่สำเร็จ",
			description: message,
			timeout: 3600,
		});
	} finally {
		submitting.value = false;
	}
}

function fillDevLogin(loginPreset: (typeof DEV_LOGINS)[number]) {
	form.email = loginPreset.email;
	form.password = loginPreset.password;
	appToast.info({
		title: "เติมข้อมูลแล้ว",
		description: `${loginPreset.label} พร้อมเข้าสู่ระบบ`,
	});
}

async function copyDevLogin(loginPreset: (typeof DEV_LOGINS)[number]) {
	const payload = `email: ${loginPreset.email}\npassword: ${loginPreset.password}`;

	try {
		if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
			await navigator.clipboard.writeText(payload);
			appToast.success({
				title: "คัดลอกบัญชีแล้ว",
				description: `${loginPreset.label} ถูกคัดลอกแล้ว`,
			});
			return;
		}
	} catch {
		// fall through to the fallback message below
	}

	appToast.error({
		title: "คัดลอกอัตโนมัติไม่สำเร็จ",
		description: `${loginPreset.email} / ${loginPreset.password}`,
		timeout: 4200,
	});
}
</script>

<template>
	<main class="min-h-[100dvh] bg-[#f6f6f3]">
		<div class="grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.1fr)_520px]">
			<section class="relative hidden overflow-hidden lg:flex">
				<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(201,119,69,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(151,83,44,0.10),_transparent_24%)]" />
				<div class="relative flex w-full flex-col justify-between p-8 xl:p-12">
					<div class="flex items-center gap-4">
						<div class="h-16 w-16 overflow-hidden rounded-3xl">
							<img src="/icons/icon-192.png" alt="App icon" class="h-full w-full object-cover" />
						</div>
						<div>
							<p class="text-xs uppercase tracking-[0.24em] text-stone-400">Retail POS</p>
							<h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Codesabai Commerce</h1>
						</div>
					</div>

					<div class="max-w-2xl space-y-6">
						<UBadge color="primary" variant="soft" label="Login preview" />
						<div class="space-y-4">
							<h2 class="text-5xl leading-tight font-semibold tracking-[-0.05em] text-stone-950">
								ระบบขายหน้าร้าน, สินค้า, สต็อก และรายงานในหน้าจอเดียวกัน
							</h2>
							<p class="max-w-xl text-base leading-7 text-stone-500">
								หน้า login นี้แยกออกจากแอปหลักเพื่อให้ flow ชัดเจนขึ้น เมื่อเข้าสู่ระบบแล้วจึงค่อยพาเข้า shell ของ POS
								และ backoffice
							</p>
						</div>

						<div class="grid gap-4 sm:grid-cols-3">
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">POS</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">ขายเร็ว</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">สแกน, ค้นหา, เพิ่มลงบิล และชำระเงินได้จาก flow เดียว</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Inventory</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">คุมสต็อก</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">ดูคงเหลือ, ปรับยอด และเช็กความเคลื่อนไหวสต็อกได้ชัดเจน</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Reports</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">ดูรายงาน</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">สรุปยอดขาย, top products, staff ranking และสัญญาณหน้างาน</p>
							</UCard>
						</div>
					</div>

					<div class="flex items-center justify-between text-sm text-stone-400">
						<p>Development login</p>
						<p>เชื่อม auth API แล้ว</p>
					</div>
				</div>
			</section>

			<section class="flex min-h-[100dvh] items-center justify-center px-0 py-4 sm:px-6 sm:py-6 lg:px-8">
					<div class="w-full max-w-[440px]">
						<UCard class="border-0 rounded-none bg-[#fffefd] shadow-xl ring-1 ring-[#e7e4dd] sm:rounded-md">
							<div class="space-y-6">
								<div class="space-y-4 px-4 pt-4 text-center sm:px-0 sm:pt-0 lg:text-left">
									<div class="mx-auto h-16 w-16 overflow-hidden rounded-3xl lg:mx-0">
										<img src="/icons/icon-192.png" alt="App icon" class="h-full w-full object-cover" />
									</div>
								<div>
									<UBadge color="neutral" variant="soft" label="เข้าสู่ระบบ" />
									<h2 class="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">เข้าสู่ระบบร้านค้า</h2>
									<p class="mt-2 text-sm leading-6 text-stone-500">
										โหมด dev จะ prefill บัญชีทดสอบไว้ให้และสามารถเข้าสู่ระบบผ่าน backend auth API ได้ทันที
									</p>
									</div>
								</div>

								<form class="space-y-4 px-4 sm:px-0" @submit.prevent="loginToPos">
									<div class="space-y-2">
										<label class="text-sm font-medium text-stone-700">อีเมลหรือชื่อผู้ใช้</label>
										<UInput
										v-model="form.email"
										size="lg"
										color="neutral"
										icon="i-heroicons-user-20-solid"
										placeholder="manager@store.com"
										class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3.5 [&_input]:ps-13 [&_input]:pe-4.5 [&_input]:shadow-sm [&_span]:left-4 [&_span]:text-stone-400 [&_span_svg]:h-[18px] [&_span_svg]:w-[18px]"
									/>
								</div>

								<div class="space-y-2">
									<label class="text-sm font-medium text-stone-700">รหัสผ่าน</label>
									<div class="relative">
										<UInput
											v-model="form.password"
											:type="showPassword ? 'text' : 'password'"
											size="lg"
											color="neutral"
											icon="i-heroicons-lock-closed-20-solid"
											placeholder="••••••••"
											class="w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3.5 [&_input]:ps-13 [&_input]:pe-14 [&_input]:shadow-sm [&_span]:left-4 [&_span]:text-stone-400 [&_span_svg]:h-[18px] [&_span_svg]:w-[18px]"
										/>
										<AppButton
											color="neutral"
											variant="ghost"
											size="xs"
											tabindex="-1"
											class="absolute top-1/2 right-2.5 z-10 flex h-8.5 w-8.5 -translate-y-1/2 items-center justify-center rounded-md border border-transparent bg-transparent text-stone-500 hover:bg-white hover:text-stone-900 [&_svg]:h-[18px] [&_svg]:w-[18px]"
											:icon="showPassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
											:aria-label="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
											:title="showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'"
											@click="showPassword = !showPassword"
										/>
									</div>
								</div>
								<div class="flex items-center justify-between gap-3 pt-1">
									<label class="flex items-center gap-2 text-sm text-stone-500">
										<input
											v-model="form.remember"
											type="checkbox"
											class="h-4 w-4 rounded border-[#d6d3d1] text-[#c97745] focus:ring-[#c97745]"
										/>
										<span>จดจำอุปกรณ์นี้</span>
									</label>
									<button type="button" class="text-sm font-medium text-[#97532c] transition hover:text-[#7d4322]">
										ลืมรหัสผ่าน
										</button>
									</div>

									<div class="space-y-3 pt-2">
										<AppButton
											type="submit"
											color="primary"
											variant="solid"
											size="md"
											icon="i-heroicons-arrow-right-20-solid"
											:loading="submitting"
											:spin-icon-on-loading="true"
											:disabled="submitting"
											:block="true"
											class="min-h-11 font-semibold shadow-sm"
										>
											{{ submitting ? "กำลังเข้าสู่ระบบ" : "เข้าสู่ระบบ" }}
										</AppButton>
										<AppButton
											to="/"
											color="neutral"
											variant="soft"
											size="md"
											icon="i-heroicons-home-20-solid"
											:block="true"
											class="min-h-11 font-medium"
										>
											ข้ามไปหน้า POS
										</AppButton>
									</div>
								</form>

								<div class="space-y-3 rounded-none border-y border-[#f0e0d3] bg-[#fbf1ea] px-4 py-4 text-sm text-stone-600 sm:rounded-md sm:border">
									<div class="flex items-start justify-between gap-4">
										<div>
											<p class="font-medium text-stone-800">บัญชี dev ตาม role</p>
										<p class="mt-1 leading-6 text-stone-500">ใช้ปุ่ม Fill เพื่อเติมลงฟอร์มทันที หรือ Copy เพื่อคัดลอก credential สำหรับทดสอบ role ต่าง ๆ</p>
									</div>
									<UBadge color="primary" variant="soft" :label="`${DEV_LOGINS.length} roles`" />
								</div>

								<div class="space-y-3">
									<div
										v-for="loginPreset in DEV_LOGINS"
										:key="loginPreset.email"
										class="rounded-md bg-white/80 p-3 ring-1 ring-[#ead7c7]"
									>
										<div class="flex items-start justify-between gap-3">
											<div class="min-w-0">
												<div class="flex items-center gap-2">
													<p class="text-sm font-semibold text-stone-900">{{ loginPreset.label }}</p>
													<UBadge color="neutral" variant="soft" :label="loginPreset.role" />
												</div>
													<p class="mt-1 text-xs leading-5 text-stone-500">{{ loginPreset.description }}</p>
													<p class="mt-2 text-xs text-stone-700">{{ loginPreset.email }}</p>
												</div>
												<div class="flex shrink-0 items-center gap-2">
													<AppButton color="neutral" variant="soft" size="sm" @click="copyDevLogin(loginPreset)">
														Copy
													</AppButton>
													<AppButton color="primary" variant="soft" size="sm" @click="fillDevLogin(loginPreset)">
														Fill
													</AppButton>
												</div>
											</div>
										</div>
									</div>
								</div>
							</div>
						</UCard>
					</div>
				</section>
		</div>
	</main>
</template>
