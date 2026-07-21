<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type Entry = { id: string; titleKey: string; descriptionKey: string; icon: string; to: string; availability: "ready" | "soon" };

const entries: Entry[] = [
	["overview", "i-heroicons-chart-pie", "/superadmin/overview"],
	["globalConfig", "i-heroicons-adjustments-horizontal", "/superadmin/global-config"],
	["users", "i-heroicons-users", "/superadmin/users"],
	["roles", "i-heroicons-shield-check", "/superadmin/roles"],
	["stores", "i-heroicons-building-storefront", "/superadmin/stores"],
	["security", "i-heroicons-shield-check", "/superadmin/security"],
	["quotas", "i-heroicons-swatch", "/superadmin/quotas"],
	["integrations", "i-heroicons-link", "/superadmin/integrations"],
	["branchConfig", "i-heroicons-building-office-2", "/superadmin/branch"],
].map(([id, icon, to]) => ({ id: id!, titleKey: `superadmin.entries.${id}.title`, descriptionKey: `superadmin.entries.${id}.description`, icon: icon!, to: to!, availability: "ready" }));

const coreEntries = computed(() => entries.filter((entry) => entry.availability === "ready"));
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['superadmin']"
		sidebar-eyebrow="Superadmin"
		sidebar-title="Superadmin"
		sidebar-compact-title="SUP"
		:sidebar-description="$t('superadmin.sidebarDescription')"
	>
		<template #default>
			<div class="min-w-0 space-y-3 lg:grid lg:h-full lg:min-h-0 lg:grid-rows-[auto_minmax(0,1fr)] lg:space-y-0 lg:gap-4">
				<div class="scrollbar-soft min-h-0 min-w-0 space-y-3 overflow-x-hidden overflow-y-auto lg:pr-1">
					<UCard class="rounded-none border-0 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] ring-1 ring-neutral-200 sm:rounded-md">
						<div class="space-y-3 sm:space-y-4">
							<div>
								<h2 class="text-lg font-semibold text-stone-950 lg:hidden">{{ $t('superadmin.shortTitle') }}</h2>
								<h2 class="mt-2 hidden text-lg font-semibold text-stone-950 sm:text-xl lg:block">{{ $t('superadmin.title') }}</h2>
								<p class="mt-2 hidden max-w-3xl text-sm leading-6 text-stone-500 lg:block">{{ $t('superadmin.description') }}</p>
							</div>

							<div class="grid gap-2.5 sm:gap-3 md:grid-cols-2 xl:grid-cols-3">
								<NuxtLink
									v-for="entry in coreEntries"
									:key="entry.id"
									:to="entry.to || '/superadmin'"
									class="min-w-0 rounded-md border border-neutral-200 bg-white px-3 py-3 transition hover:border-emerald-200 hover:bg-emerald-50/40 dark:hover:border-emerald-400/40 dark:hover:bg-emerald-500/10 sm:p-4"
								>
									<div class="flex items-center gap-3 sm:items-start sm:justify-between">
										<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700 ring-1 ring-primary-200 dark:bg-emerald-400/10 dark:text-emerald-300 dark:ring-emerald-400/20 sm:h-11 sm:w-11">
											<UIcon :name="entry.icon" class="h-4.5 w-4.5 sm:h-5 sm:w-5" />
										</div>
										<div class="min-w-0 flex-1">
											<div class="flex min-w-0 flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-2">
												<h2 class="truncate text-sm font-semibold text-stone-900">{{ $t(entry.titleKey) }}</h2>
												<UBadge
													:color="entry.availability === 'ready' ? 'success' : 'neutral'"
													variant="soft"
													:label="$t(`settings.${entry.availability}`)"
													class="shrink-0"
												/>
											</div>
											<p class="mt-1 block w-full truncate text-xs leading-5 text-stone-500 sm:mt-2 sm:text-sm sm:leading-6">{{ $t(entry.descriptionKey) }}</p>
										</div>
									</div>
								</NuxtLink>
							</div>
						</div>
					</UCard>

				</div>
			</div>
		</template>
	</AppSidebarShell>
</template>
