<script setup lang="ts">
const { login } = useAuthSession();

const form = reactive({
	email: "",
	password: "",
	branch: "main",
	remember: true,
});

const submitting = ref(false);
const error = ref("");

async function loginToPos() {
	submitting.value = true;
	error.value = "";
	try {
		await login({
			emailOrUsername: form.email,
			password: form.password,
			rememberMe: form.remember,
		});
		return navigateTo("/");
	} catch (err) {
		error.value = err instanceof Error ? err.message : "เข้าสู่ระบบไม่สำเร็จ";
	} finally {
		submitting.value = false;
	}
}
</script>

<template>
	<main class="min-h-screen bg-[#f6f6f3]">
		<div class="grid min-h-screen lg:grid-cols-[minmax(0,1.1fr)_520px]">
			<section class="relative hidden overflow-hidden lg:flex">
				<div class="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(201,119,69,0.16),_transparent_32%),radial-gradient(circle_at_bottom_right,_rgba(151,83,44,0.10),_transparent_24%)]" />
				<div class="relative flex w-full flex-col justify-between p-8 xl:p-12">
					<div class="flex items-center gap-4">
						<div class="flex h-16 w-16 items-center justify-center rounded-3xl bg-[#f8e9de] text-2xl font-semibold text-[#97532c] shadow-sm ring-1 ring-[#efd7c6]">
							P
						</div>
						<div>
							<p class="text-xs uppercase tracking-[0.24em] text-stone-400">Retail POS</p>
							<h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-stone-950">Codesabai Commerce</h1>
						</div>
					</div>

					<div class="max-w-2xl space-y-6">
						<UBadge color="orange" variant="soft" label="Login preview" />
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
						<p>UI preview only</p>
						<p>ยังไม่เชื่อม auth API</p>
					</div>
				</div>
			</section>

			<section class="flex min-h-screen items-center justify-center px-4 py-6 sm:px-6 lg:px-8">
				<div class="w-full max-w-[440px]">
					<UCard class="border-0 bg-[#fffefd] shadow-xl ring-1 ring-[#e7e4dd]">
						<div class="space-y-6">
							<div class="space-y-4 text-center lg:text-left">
								<div class="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-[#f8e9de] text-2xl font-semibold text-[#97532c] shadow-sm ring-1 ring-[#efd7c6] lg:mx-0">
									P
								</div>
								<div>
									<UBadge color="gray" variant="soft" label="เข้าสู่ระบบ" />
									<h2 class="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">เข้าสู่ระบบร้านค้า</h2>
									<p class="mt-2 text-sm leading-6 text-stone-500">
										หน้าทดลองสำหรับเข้าใช้งาน POS system โดยยังไม่เชื่อม logic การยืนยันตัวตน
									</p>
								</div>
							</div>

							<form class="space-y-4" @submit.prevent="loginToPos">
								<div class="space-y-2">
									<label class="text-sm font-medium text-stone-700">อีเมลหรือชื่อผู้ใช้</label>
									<UInput
										v-model="form.email"
										size="lg"
										color="gray"
										icon="i-heroicons-user-20-solid"
										placeholder="manager@store.com"
										class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:shadow-sm"
									/>
								</div>

								<div class="space-y-2">
									<label class="text-sm font-medium text-stone-700">รหัสผ่าน</label>
									<UInput
										v-model="form.password"
										type="password"
										size="lg"
										color="gray"
										icon="i-heroicons-lock-closed-20-solid"
										placeholder="••••••••"
										class="w-full [&_input]:rounded-2xl [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3 [&_input]:shadow-sm"
									/>
								</div>

								<div class="space-y-2">
									<label class="text-sm font-medium text-stone-700">สาขา</label>
									<select
										v-model="form.branch"
										class="w-full rounded-2xl border border-[#e7e4dd] bg-[#fbfbf8] px-4 py-3 text-sm font-medium text-stone-700 shadow-sm outline-none transition focus:border-[#d4b8a5] focus:bg-white"
									>
										<option value="main">สาขาท่าเดื่อ</option>
										<option value="delivery">ครัวเดลิเวอรี</option>
										<option value="warehouse">คลังกลาง</option>
									</select>
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
									<UButton
										type="submit"
										color="orange"
										size="lg"
										block
										icon="i-heroicons-arrow-right-circle-20-solid"
										class="justify-center rounded-2xl py-3 font-semibold shadow-sm"
										:loading="submitting"
										:disabled="submitting"
										label="เข้าสู่ระบบ"
									/>
									<UButton
										to="/"
										color="gray"
										variant="soft"
										size="lg"
										block
										class="justify-center rounded-2xl py-3 font-medium"
										label="ข้ามไปหน้า POS"
									/>
								</div>
							</form>

							<p v-if="error" class="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
								{{ error }}
							</p>

							<div class="rounded-2xl border border-[#f0e0d3] bg-[#fbf1ea] px-4 py-3 text-sm text-stone-600">
								<p class="font-medium text-stone-800">โหมดตัวอย่าง</p>
								<p class="mt-1 leading-6">ตอนนี้ปุ่มเข้าสู่ระบบจะเรียก backend auth API จริงแล้ว แต่ยังไม่ได้ผูก route guard ทั้งระบบครบทุกหน้า</p>
							</div>
						</div>
					</UCard>
				</div>
			</section>
		</div>
	</main>
</template>
