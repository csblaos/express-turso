<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type SettingsEntry = {
	id: string;
	titleKey: string;
	descriptionKey: string;
	icon: string;
	to?: string;
	availability: "ready" | "soon";
};

type SettingsSection = {
	id: string;
	eyebrowKey: string;
	titleKey: string;
	descriptionKey: string;
	entries: SettingsEntry[];
};

const route = useRoute();
const isSettingsHub = computed(() => route.path === "/settings");

const readyTone = {
	card: "border-neutral-200 bg-white transition-all hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-[#3c3429] dark:bg-[#1c1814] dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10",
	icon: "bg-primary-50 text-primary-700 ring-primary-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
};

const plannedTone = {
	card: "border-neutral-200 bg-white transition-all hover:border-emerald-200 hover:bg-emerald-50/40 dark:border-[#3c3429] dark:bg-[#1c1814] dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10",
	icon: "bg-primary-50 text-primary-700 ring-primary-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20",
};

function linkedEntries(section: SettingsSection) {
	return section.entries.filter((entry) => Boolean(entry.to));
}

function staticEntries(section: SettingsSection) {
	return section.entries.filter((entry) => !entry.to);
}

function entryTone(entry: SettingsEntry) {
	return entry.availability === "ready" ? readyTone : plannedTone;
}

const settingsSections: SettingsSection[] = [
	{
		id: "main",
		eyebrowKey: "nav.settings",
		titleKey: "settings.title",
		descriptionKey: "settings.description",
		entries: [
			...([ "profile", "language", "security", "users", "categories", "units", "notifications", "pdf", "stores", "storeProfile", "storeFinance", "stockPolicy", "storePayments", "shipping", "branchSwitch", "branchConfig" ] as const).map((key, index) => ({
				id: key, titleKey: `settings.entries.${key}.title`, descriptionKey: `settings.entries.${key}.description`,
				icon: [ "i-heroicons-user-circle", "i-heroicons-language", "i-heroicons-shield-check", "i-heroicons-users", "i-heroicons-tag", "i-heroicons-scale", "i-heroicons-bell", "i-heroicons-document-text", "i-heroicons-building-storefront", "i-heroicons-building-storefront", "i-heroicons-banknotes", "i-heroicons-adjustments-horizontal", "i-heroicons-credit-card", "i-heroicons-truck", "i-heroicons-arrows-right-left", "i-heroicons-adjustments-horizontal" ][index]!,
				to: [ "/profile", "/settings/language", undefined, "/settings/users", "/settings/categories", "/settings/units", undefined, undefined, undefined, undefined, "/settings/store-finance", "/settings/stock", "/settings/store-payments", undefined, undefined, undefined ][index],
				availability: ([ 2, 6, 7, 8, 9, 13, 14, 15 ].includes(index) ? "soon" : "ready") as "ready" | "soon",
			})),
		],
	},
];
</script>

<template>
	<AppSidebarShell
		v-if="isSettingsHub"
		:nav-items="appNavItems"
		:active-ids="['settings']"
		sidebar-eyebrow="Settings"
		:sidebar-title="$t('settings.title')"
		sidebar-compact-title="CFG"
		:sidebar-description="$t('settings.description')"
	>
		<template #default>
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<div class="scrollbar-soft min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:pr-1">
					<UCard
						v-for="section in settingsSections"
						:key="section.id"
						class="min-w-0 max-w-full rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 dark:bg-[#1c1814] dark:shadow-[0_8px_24px_rgba(0,0,0,0.28)] dark:ring-[#3c3429] sm:rounded-md"
					>
						<div class="space-y-3 sm:space-y-4">
							<div>
								<p class="text-[11px] font-semibold uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">{{ $t(section.eyebrowKey) }}</p>
								<h2 class="mt-2 text-lg font-semibold text-stone-950 dark:text-stone-100 sm:text-xl">{{ $t(section.titleKey) }}</h2>
								<p class="mt-2 max-w-3xl text-sm leading-6 text-stone-500 dark:text-stone-400 lg:hidden">{{ $t(section.descriptionKey) }}</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<NuxtLink
									v-for="entry in linkedEntries(section)"
									:key="entry.id"
									:to="entry.to"
									class="min-w-0 rounded-md border px-3 py-3 transition sm:p-4"
									:class="entryTone(entry).card"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 sm:h-11 sm:w-11" :class="entryTone(entry).icon">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h3 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{{ $t(entry.titleKey) }}</h3>
												<UBadge
													:color="entry.availability === 'ready' ? 'success' : 'neutral'"
													variant="soft"
													:label="$t(`settings.${entry.availability}`)"
													class="shrink-0"
												/>
											</div>
											<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 dark:text-stone-400 sm:mt-2 sm:text-sm sm:leading-6">{{ $t(entry.descriptionKey) }}</p>
										</div>
									</div>
								</NuxtLink>

								<div
									v-for="entry in staticEntries(section)"
									:key="entry.id"
									class="min-w-0 rounded-md border px-3 py-3 transition sm:p-4"
									:class="entryTone(entry).card"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md ring-1 sm:h-11 sm:w-11" :class="entryTone(entry).icon">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h3 class="truncate text-sm font-semibold text-stone-900 dark:text-stone-100">{{ $t(entry.titleKey) }}</h3>
												<UBadge
													:color="entry.availability === 'ready' ? 'success' : 'neutral'"
													variant="soft"
													:label="$t(`settings.${entry.availability}`)"
													class="shrink-0"
												/>
											</div>
											<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 dark:text-stone-400 sm:mt-2 sm:text-sm sm:leading-6">{{ $t(entry.descriptionKey) }}</p>
										</div>
									</div>
								</div>
							</div>
						</div>
					</UCard>
				</div>
			</div>
		</template>
	</AppSidebarShell>

	<NuxtPage v-else />
</template>
