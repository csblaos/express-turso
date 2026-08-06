<script setup lang="ts">
import { needsAuthOnboarding } from "~/utils/auth-onboarding";
const { login, currentAccess } = useAuthSession();
const appToast = useAppToast();
const route = useRoute();
const { t } = useI18n();

const form = reactive({
	email: "",
	password: "",
	remember: false,
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
	return t("loginPage.loginFailed");
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
			title: t("loginPage.loginFailed"),
			description: message,
			timeout: 3600,
		});
	} finally {
		submitting.value = false;
	}
}

</script>

<template>
	<main class="relative min-h-[100dvh] bg-[#f6f6f3]">
		<div class="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(45,199,99,0.13),_transparent_34%),radial-gradient(ellipse_at_bottom_left,_rgba(233,168,74,0.24),_transparent_58%),linear-gradient(180deg,_transparent_55%,_rgba(233,168,74,0.09)_100%)] dark:hidden" />
		<div class="relative grid min-h-[100dvh] lg:grid-cols-[minmax(0,1.1fr)_520px]">
			<section class="relative hidden overflow-hidden lg:flex">
				<div class="relative flex w-full flex-col p-8 xl:p-12">
					<div class="flex items-center gap-4">
						<div class="h-16 w-16 overflow-hidden rounded-3xl">
							<img src="/icons/icon-192.png" alt="App icon" class="h-full w-full object-cover" />
						</div>
						<div>
							<p class="text-xs uppercase tracking-[0.24em] text-stone-400">Retail POS</p>
							<h1 class="mt-1 text-2xl font-semibold tracking-[-0.04em] text-stone-950">O Khaidee<span class="text-primary-600">+</span></h1>
						</div>
					</div>

					<div class="flex flex-1 items-center py-10">
						<div class="max-w-2xl space-y-6">
						<div class="space-y-4">
							<h2 class="text-5xl leading-tight font-semibold tracking-[-0.05em] text-stone-950">
								{{ t('loginPage.heroTitle') }}
							</h2>
							<p class="max-w-xl text-base leading-7 text-stone-500">
								{{ t('loginPage.heroDescription') }}
							</p>
						</div>

						<div class="grid gap-4 sm:grid-cols-3">
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">POS</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">{{ t('loginPage.posTitle') }}</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('loginPage.posDescription') }}</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Inventory</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">{{ t('loginPage.inventoryTitle') }}</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('loginPage.inventoryDescription') }}</p>
							</UCard>
							<UCard class="border-0 bg-[#fffefd] shadow-sm ring-1 ring-[#e7e4dd]">
								<p class="text-xs uppercase tracking-[0.18em] text-stone-400">Reports</p>
								<p class="mt-3 text-2xl font-semibold text-stone-950">{{ t('loginPage.reportsTitle') }}</p>
								<p class="mt-2 text-sm leading-6 text-stone-500">{{ t('loginPage.reportsDescription') }}</p>
							</UCard>
							</div>
						</div>
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
									<UBadge color="neutral" variant="soft" :label="t('loginPage.signIn')" />
									<h2 class="mt-3 text-3xl font-semibold tracking-[-0.04em] text-stone-950">{{ t('loginPage.signInStore') }}</h2>
									</div>
								</div>

								<form class="space-y-4 px-4 sm:px-0" @submit.prevent="loginToPos">
									<div class="space-y-2">
										<label class="text-sm font-medium text-stone-700">{{ t('loginPage.emailOrUsername') }}</label>
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
									<label class="text-sm font-medium text-stone-700">{{ t('loginPage.password') }}</label>
									<div class="relative">
										<UInput
											v-model="form.password"
											:type="showPassword ? 'text' : 'password'"
											size="lg"
											color="neutral"
											icon="i-heroicons-lock-closed-20-solid"
											:placeholder="t('loginPage.password')"
											class="login-password-input w-full [&_input]:rounded-md [&_input]:border-[#e7e4dd] [&_input]:bg-[#fbfbf8] [&_input]:py-3.5 [&_input]:ps-13 [&_input]:pe-14 [&_input]:shadow-sm [&_span]:left-4 [&_span]:text-stone-400 [&_span_svg]:h-[18px] [&_span_svg]:w-[18px]"
										/>
										<AppButton
											color="neutral"
											variant="ghost"
											size="xs"
											tabindex="-1"
											class="absolute top-1/2 right-2.5 z-10 flex h-8.5 w-8.5 -translate-y-1/2 items-center justify-center rounded-md border border-transparent bg-transparent text-stone-500 hover:bg-white hover:text-stone-900 [&_svg]:h-[18px] [&_svg]:w-[18px]"
											:icon="showPassword ? 'i-heroicons-eye-slash-20-solid' : 'i-heroicons-eye-20-solid'"
											:aria-label="showPassword ? t('loginPage.hidePassword') : t('loginPage.showPassword')"
											:title="showPassword ? t('loginPage.hidePassword') : t('loginPage.showPassword')"
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
										<span>{{ t('loginPage.rememberDevice') }}</span>
									</label>
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
											{{ submitting ? t('loginPage.signingIn') : t('loginPage.signIn') }}
										</AppButton>
									</div>
								</form>
							</div>
						</UCard>
					</div>
				</section>
		</div>
	</main>
</template>

<style scoped>
/* The login card remains light even when the device prefers dark mode. Force
   password glyphs (including the browser-rendered dots) to stay readable on
   mobile WebKit, whose text-fill colour can otherwise inherit a transparent or
   light value from the browser/theme. */
.login-password-input :deep(input) {
	/* Keep entered password dots visible on mobile Safari without making them
	   look as heavy as normal body text. */
	color: #6b7280 !important;
	-webkit-text-fill-color: #6b7280 !important;
	caret-color: #6b7280;
	opacity: 1 !important;
}

/* Match the password dots placeholder with the Username/Email placeholder. */
.login-password-input :deep(input::placeholder) {
	color: #a8a29e !important;
	-webkit-text-fill-color: #a8a29e !important;
	font-family: "Google Sans Lao", "Avenir Next", "Segoe UI", sans-serif !important;
	opacity: 1;
}

/* Mobile Safari can fail to paint password bullets when the input inherits the
   Lao variable font. Use a system glyph and explicitly request disc masking. */
.login-password-input :deep(input[type="password"]) {
	font-family: Arial, sans-serif !important;
	-webkit-text-security: disc;
}
</style>
