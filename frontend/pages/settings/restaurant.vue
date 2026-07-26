<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type Zone={id:string;name:string;sort_order:number;is_active:number;table_count:number};
type DiningTable={id:string;zone_id:string;name:string;code:string|null;capacity:number;sort_order:number;is_active:number;zone_name:string;order_id?:string|null};
type Envelope<T>={data:T};

const {apiFetch}=useApiClient();
const {currentStoreId}=useAuthSession();
const {t}=useI18n();
const toast=useAppToast();
const zones=ref<Zone[]>([]);const tables=ref<DiningTable[]>([]);const pending=ref(false);const saving=ref(false);
const reordering=ref(false);
const panelOpen=ref(false);const formKind=ref<"zone"|"table">("zone");const editingId=ref("");
const form=reactive({name:"",zone_id:"",code:"",capacity:2,is_active:true});
const deleteTarget=ref<{kind:"zone"|"table";id:string;name:string}|null>(null);
const zonesWithTables=computed(()=>zones.value.map(zone=>({...zone,tables:tables.value.filter(table=>table.zone_id===zone.id)})));
const draggedZoneId=ref("");
const draggedTableId=ref("");
const draggingOverZoneId=ref("");
const draggingOverTableId=ref("");
const panelTitle=computed(()=>t(`restaurantSettingsPage.panel.${editingId.value?"edit":"add"}${formKind.value==="zone"?"Zone":"Table"}`));

async function load(){if(!currentStoreId.value)return;pending.value=true;try{const [z,tablesResponse]=await Promise.all([apiFetch<Envelope<Zone[]>>(`/restaurant/zones?store_id=${encodeURIComponent(currentStoreId.value)}`),apiFetch<Envelope<DiningTable[]>>(`/restaurant/tables?store_id=${encodeURIComponent(currentStoreId.value)}`)]);zones.value=z.data;tables.value=tablesResponse.data;}catch(error){toast.error({title:t("restaurantSettingsPage.toast.loadFailed"),description:resolveApiErrorMessage(error)});}finally{pending.value=false;}}
function normalizeName(value:string){return value.trim().replace(/\s+/g," ").toLocaleLowerCase();}
function tableCodeFromName(value:string){return value.trim().replace(/\s+/g," ");}
function isDuplicateZoneName(name:string){const normalized=normalizeName(name);return zones.value.some(zone=>zone.id!==editingId.value&&normalizeName(zone.name)===normalized);}
function isDuplicateTableName(name:string,zoneId:string){const normalized=normalizeName(name);return tables.value.some(table=>table.id!==editingId.value&&table.zone_id===zoneId&&normalizeName(table.name)===normalized);}
function tableSubtitle(table:DiningTable){const code=table.code?.trim();const parts=[code&&normalizeName(code)!==normalizeName(table.name)?code:"",t("restaurantSettingsPage.seats",{count:table.capacity})].filter(Boolean);return parts.join(" · ");}
function nextZoneSortOrder(){return zones.value.length?Math.max(...zones.value.map(zone=>Number(zone.sort_order||0)))+1:1;}
function nextTableSortOrder(zoneId:string){const zoneTables=tables.value.filter(table=>table.zone_id===zoneId);return zoneTables.length?Math.max(...zoneTables.map(table=>Number(table.sort_order||0)))+1:1;}
function openZone(zone?:Zone){formKind.value="zone";editingId.value=zone?.id||"";Object.assign(form,{name:zone?.name||"",zone_id:"",code:"",capacity:2,is_active:zone?Boolean(zone.is_active):true});panelOpen.value=true;}
function openTable(table?:DiningTable,zoneId?:string){formKind.value="table";editingId.value=table?.id||"";Object.assign(form,{name:table?.name||"",zone_id:table?.zone_id||zoneId||zones.value[0]?.id||"",code:table?.code||"",capacity:table?.capacity||2,is_active:table?Boolean(table.is_active):true});panelOpen.value=true;}
async function save(){if(saving.value)return;if(!currentStoreId.value){toast.error({title:t("restaurantSettingsPage.toast.noStore")});return;}if(!form.name.trim()){toast.error({title:t("restaurantSettingsPage.toast.nameRequired")});return;}if(formKind.value==="zone"&&isDuplicateZoneName(form.name)){toast.error({title:t("restaurantSettingsPage.toast.duplicateZone"),description:t("restaurantSettingsPage.toast.duplicateZoneDescription")});return;}if(formKind.value==="table"&&!form.zone_id){toast.error({title:t("restaurantSettingsPage.toast.zoneRequired")});return;}if(formKind.value==="table"&&isDuplicateTableName(form.name,form.zone_id)){toast.error({title:t("restaurantSettingsPage.toast.duplicateTable"),description:t("restaurantSettingsPage.toast.duplicateTableDescription")});return;}saving.value=true;try{const base=formKind.value==="zone"?"/restaurant/zones":"/restaurant/tables";const url=editingId.value?`${base}/${editingId.value}`:base;const currentZone=editingId.value&&formKind.value==="zone"?zones.value.find(zone=>zone.id===editingId.value):null;const currentTable=editingId.value&&formKind.value==="table"?tables.value.find(table=>table.id===editingId.value):null;const sortOrder=editingId.value?Number((currentZone||currentTable)?.sort_order||0):(formKind.value==="zone"?nextZoneSortOrder():nextTableSortOrder(form.zone_id));await apiFetch(url,{method:editingId.value?"PUT":"POST",body:{store_id:currentStoreId.value,name:form.name.trim(),sort_order:sortOrder,is_active:form.is_active,...(formKind.value==="table"?{zone_id:form.zone_id,code:tableCodeFromName(form.name),capacity:form.capacity}:{})}});panelOpen.value=false;toast.success({title:editingId.value?t("restaurantSettingsPage.toast.saved"):t("restaurantSettingsPage.toast.created")});await load();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{saving.value=false;}}
async function remove(){if(!deleteTarget.value||!currentStoreId.value)return;saving.value=true;try{await apiFetch(`/restaurant/${deleteTarget.value.kind==="zone"?"zones":"tables"}/${deleteTarget.value.id}?store_id=${encodeURIComponent(currentStoreId.value)}`,{method:"DELETE"});deleteTarget.value=null;await load();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.deleteFailed"),description:resolveApiErrorMessage(error)});}finally{saving.value=false;}}
function reorderList<T>(items:T[],fromIndex:number,toIndex:number){const next=[...items];const [item]=next.splice(fromIndex,1);if(!item)return next;next.splice(toIndex,0,item);return next;}
async function persistZoneOrder(items:Zone[]){if(!currentStoreId.value)return;await Promise.all(items.map((zone,index)=>apiFetch(`/restaurant/zones/${zone.id}`,{method:"PUT",body:{store_id:currentStoreId.value,name:zone.name,sort_order:index+1,is_active:Boolean(zone.is_active)}})));}
async function persistTableOrder(items:DiningTable[]){if(!currentStoreId.value)return;await Promise.all(items.map((table,index)=>apiFetch(`/restaurant/tables/${table.id}`,{method:"PUT",body:{store_id:currentStoreId.value,zone_id:table.zone_id,name:table.name,code:table.code||null,capacity:table.capacity,sort_order:index+1,is_active:Boolean(table.is_active)}})));}
async function dropZone(targetId:string){const sourceId=draggedZoneId.value;draggedZoneId.value="";draggingOverZoneId.value="";if(!sourceId||sourceId===targetId||reordering.value)return;const fromIndex=zones.value.findIndex(zone=>zone.id===sourceId);const toIndex=zones.value.findIndex(zone=>zone.id===targetId);if(fromIndex<0||toIndex<0)return;const previous=[...zones.value];const next=reorderList(zones.value,fromIndex,toIndex).map((zone,index)=>({...zone,sort_order:index+1}));zones.value=next;reordering.value=true;try{await persistZoneOrder(next);toast.success({title:t("restaurantSettingsPage.toast.zoneOrderSaved")});}catch(error){zones.value=previous;toast.error({title:t("restaurantSettingsPage.toast.zoneOrderFailed"),description:resolveApiErrorMessage(error)});await load();}finally{reordering.value=false;}}
async function dropTable(target:DiningTable){const sourceId=draggedTableId.value;draggedTableId.value="";draggingOverTableId.value="";if(!sourceId||sourceId===target.id||reordering.value)return;const source=tables.value.find(table=>table.id===sourceId);if(!source||source.zone_id!==target.zone_id)return;const zoneTables=tables.value.filter(table=>table.zone_id===target.zone_id);const fromIndex=zoneTables.findIndex(table=>table.id===sourceId);const toIndex=zoneTables.findIndex(table=>table.id===target.id);if(fromIndex<0||toIndex<0)return;const previous=[...tables.value];const reordered=reorderList(zoneTables,fromIndex,toIndex).map((table,index)=>({...table,sort_order:index+1}));const reorderedIds=new Set(reordered.map(table=>table.id));tables.value=tables.value.map(table=>reordered.find(item=>item.id===table.id)||table).sort((a,b)=>a.zone_id===b.zone_id?Number(a.sort_order)-Number(b.sort_order):0);reordering.value=true;try{await persistTableOrder(reordered.filter(table=>reorderedIds.has(table.id)));toast.success({title:t("restaurantSettingsPage.toast.tableOrderSaved")});}catch(error){tables.value=previous;toast.error({title:t("restaurantSettingsPage.toast.tableOrderFailed"),description:resolveApiErrorMessage(error)});await load();}finally{reordering.value=false;}}
watch(currentStoreId,()=>void load(),{immediate:true});
</script>

<template>
	<AppSidebarShell
		:nav-items="appNavItems"
		:active-ids="['settings']"
		:sidebar-eyebrow="t('restaurantSettingsPage.eyebrow')"
		:sidebar-title="t('restaurantSettingsPage.title')"
		sidebar-compact-title="TABLE"
		:sidebar-description="t('restaurantSettingsPage.sidebarDescription')"
	>
		<template #default>
			<div class="grid gap-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:gap-4 lg:pb-3">
				<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="relative">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#ece6dc] px-4 py-3">
							<div class="flex items-start gap-3">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
									<UIcon name="i-heroicons-squares-2x2-20-solid" class="h-5 w-5" />
								</div>
								<div>
									<p class="text-sm font-semibold text-stone-950 dark:text-stone-50">{{ t("restaurantSettingsPage.title") }}</p>
									<p class="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
										{{ t("restaurantSettingsPage.headerDescription") }}
									</p>
								</div>
							</div>
							<div class="flex w-full flex-wrap gap-2 sm:w-auto sm:justify-end">
								<AppButton
									color="neutral"
									variant="soft"
									size="md"
									icon="i-heroicons-arrow-path-20-solid"
									:loading="pending"
									:disabled="pending || saving"
									:spin-icon-on-loading="true"
									@click="load"
								>
									{{ t("restaurantSettingsPage.reload") }}
								</AppButton>
								<AppButton
									color="primary"
									variant="solid"
									size="md"
									icon="i-heroicons-plus-20-solid"
									:disabled="pending"
									@click="openZone()"
								>
									{{ t("restaurantSettingsPage.addZone") }}
								</AppButton>
							</div>
						</div>

						<div v-if="pending" class="pointer-events-none absolute inset-x-0 -bottom-px z-10">
							<AppInlineLoadingBar container-class="bg-neutral-100 dark:bg-[#2a241d]" />
						</div>
					</div>

					<div class="space-y-3 p-4">
						<div v-if="!pending && !zones.length" class="rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-6 py-12 text-center">
							<div class="mx-auto flex h-12 w-12 items-center justify-center rounded-md border border-neutral-200 bg-white text-stone-400">
								<UIcon name="i-heroicons-squares-2x2-20-solid" class="h-6 w-6" />
							</div>
							<p class="mt-3 text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.emptyZones") }}</p>
							<p class="mt-1 text-sm text-stone-500">{{ t("restaurantSettingsPage.emptyZonesHint") }}</p>
							<AppButton class="mt-4" color="primary" variant="solid" icon="i-heroicons-plus-20-solid" @click="openZone()">
								{{ t("restaurantSettingsPage.addFirstZone") }}
							</AppButton>
						</div>

						<section
							v-for="zone in zonesWithTables"
							:key="zone.id"
							draggable="true"
							class="overflow-hidden rounded-md border bg-neutral-50 transition"
							:class="draggingOverZoneId===zone.id?'border-primary-300 ring-2 ring-primary-100':'border-neutral-200'"
							@dragstart="draggedZoneId=zone.id"
							@dragover.prevent="draggingOverZoneId=zone.id"
							@dragleave="draggingOverZoneId=''"
							@drop.prevent="dropZone(zone.id)"
							@dragend="draggedZoneId='';draggingOverZoneId=''"
						>
							<header class="flex flex-col gap-3 border-b border-[#ece6dc] bg-white px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
								<div class="flex min-w-0 items-center gap-3">
									<button
										type="button"
										class="flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-stone-400 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 active:cursor-grabbing"
										:title="t('restaurantSettingsPage.dragZone')"
									>
										<UIcon name="i-lucide-grip" class="h-5 w-5" />
									</button>
									<div class="flex flex-wrap items-center gap-2">
										<h2 class="truncate text-sm font-semibold text-stone-950">{{ zone.name }}</h2>
										<UBadge color="neutral" variant="soft">{{ t("restaurantSettingsPage.tableCount", { count: zone.tables.length }) }}</UBadge>
										<UBadge v-if="!zone.is_active" color="warning" variant="soft">{{ t("restaurantSettingsPage.inactive") }}</UBadge>
									</div>
								</div>
								<div class="flex flex-wrap gap-2">
									<AppButton size="sm" color="neutral" variant="soft" icon="i-heroicons-pencil-square-20-solid" @click="openZone(zone)">
										{{ t("restaurantSettingsPage.edit") }}
									</AppButton>
									<AppButton size="sm" color="primary" variant="soft" icon="i-heroicons-plus-20-solid" @click="openTable(undefined,zone.id)">
										{{ t("restaurantSettingsPage.addTable") }}
									</AppButton>
									<AppButton
										size="sm"
										color="error"
										variant="soft"
										icon="i-heroicons-trash-20-solid"
										@click="deleteTarget={kind:'zone',id:zone.id,name:zone.name}"
									/>
								</div>
							</header>

							<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
								<button
									v-for="table in zone.tables"
									:key="table.id"
									type="button"
									draggable="true"
									class="rounded-md border bg-white p-4 text-left shadow-sm transition hover:border-primary-300 hover:bg-primary-50/40"
									:class="draggingOverTableId===table.id?'border-primary-300 ring-2 ring-primary-100':'border-neutral-200'"
									@click="openTable(table)"
									@dragstart.stop="draggedTableId=table.id"
									@dragover.prevent.stop="draggingOverTableId=table.id"
									@dragleave.stop="draggingOverTableId=''"
									@drop.prevent.stop="dropTable(table)"
									@dragend.stop="draggedTableId='';draggingOverTableId=''"
								>
									<div class="flex items-start justify-between gap-3">
										<div class="flex min-w-0 items-start gap-3">
											<span
												class="mt-0.5 flex h-8 w-8 shrink-0 cursor-grab items-center justify-center rounded-md border border-neutral-200 bg-neutral-50 text-stone-400 transition hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700 active:cursor-grabbing"
												:title="t('restaurantSettingsPage.dragTable')"
												@click.stop
											>
												<UIcon name="i-lucide-grip" class="h-4 w-4" />
											</span>
											<div class="min-w-0">
												<p class="truncate text-sm font-semibold text-stone-950">{{ table.name }}</p>
												<p class="mt-1 text-xs text-stone-500">{{ tableSubtitle(table) }}</p>
											</div>
										</div>
										<UBadge :color="table.order_id?'warning':table.is_active?'success':'neutral'" variant="soft">
											{{ table.order_id?t("restaurantSettingsPage.inUse"):table.is_active?t("restaurantSettingsPage.available"):t("restaurantSettingsPage.closed") }}
										</UBadge>
									</div>
									<AppButton
										class="mt-3"
										size="xs"
										color="error"
										variant="ghost"
										icon="i-heroicons-trash-20-solid"
										:disabled="Boolean(table.order_id)"
										@click.stop="deleteTarget={kind:'table',id:table.id,name:table.name}"
									>
										{{ t("restaurantSettingsPage.deleteTable") }}
									</AppButton>
								</button>

								<button
									type="button"
									class="flex min-h-28 items-center justify-center rounded-md border border-dashed border-neutral-300 bg-white px-4 text-sm font-medium text-stone-500 transition hover:border-primary-300 hover:bg-primary-50/40 hover:text-primary-700"
									@click="openTable(undefined,zone.id)"
								>
									<span class="inline-flex items-center gap-2">
										<UIcon name="i-heroicons-plus-20-solid" class="h-4 w-4" />
										<span>{{ t("restaurantSettingsPage.addTableInZone", { zone: zone.name }) }}</span>
									</span>
								</button>
							</div>
						</section>
					</div>
				</div>
			</div>
		</template>
	</AppSidebarShell>

	<AppResponsivePanel
		v-model="panelOpen"
		:title="panelTitle"
		:description="t('restaurantSettingsPage.panel.description')"
		desktop-width="680px"
		compact-header
		full-bleed-header
		content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
	>
		<form class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900" @submit.prevent="save">
			<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2">
				<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
					<UFormField :label="t('restaurantSettingsPage.form.name')">
						<UInput
							v-model="form.name"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
							autofocus
							:placeholder="t('restaurantSettingsPage.form.namePlaceholder')"
						/>
					</UFormField>
				</div>

				<div v-if="formKind==='table'" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
					<div class="grid gap-4">
						<UFormField :label="t('restaurantSettingsPage.form.zone')">
							<USelect
								v-model="form.zone_id"
								class="w-full [&_button]:rounded-md [&_button]:border-neutral-200 [&_button]:bg-white [&_button]:py-2.5"
								:items="zones.map(z=>({label:z.name,value:z.id}))"
							/>
						</UFormField>
						<div class="grid gap-3">
							<UFormField :label="t('restaurantSettingsPage.form.capacity')">
								<UInput
									v-model.number="form.capacity"
									class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
									type="number"
									min="1"
								/>
							</UFormField>
						</div>
					</div>
				</div>

				<div v-if="editingId" class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
					<div class="rounded-md border border-neutral-200 bg-white px-4 py-3">
						<div class="flex items-center justify-between gap-4">
							<div>
								<p class="text-sm font-semibold text-stone-900">{{ t("restaurantSettingsPage.form.status") }}</p>
								<p class="mt-1 text-xs text-stone-500">{{ t("restaurantSettingsPage.form.statusHint") }}</p>
							</div>
							<UCheckbox v-model="form.is_active" :label="t('restaurantSettingsPage.form.active')" />
						</div>
					</div>
				</div>
			</div>

			<div
				class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]"
				:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
			>
				<div class="grid w-full grid-cols-2 gap-2">
					<AppButton color="neutral" variant="soft" size="md" :block="true" @click="panelOpen=false">
						{{ t("restaurantSettingsPage.cancel") }}
					</AppButton>
					<AppButton
						type="button"
						color="primary"
						variant="solid"
						size="md"
						icon="i-heroicons-check-20-solid"
						:block="true"
						:loading="saving"
						:spin-icon-on-loading="true"
						@click="save"
					>
						{{ t("restaurantSettingsPage.save") }}
					</AppButton>
				</div>
			</div>
		</form>
	</AppResponsivePanel>
	<AppResponsivePanel
		:model-value="Boolean(deleteTarget)"
		:title="t('restaurantSettingsPage.deleteConfirm.title')"
		:description="t('restaurantSettingsPage.deleteConfirm.description')"
		desktop-width="520px"
		content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
		@update:model-value="value=>{if(!value)deleteTarget=null}"
	>
		<div class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900">
			<div class="min-h-0 overflow-y-auto py-2">
				<div class="rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-stone-700">
					{{ t("restaurantSettingsPage.deleteConfirm.prompt") }} <strong class="font-semibold text-stone-950">{{ deleteTarget?.name }}</strong>?
				</div>
			</div>
			<div
				class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]"
				:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
			>
				<div class="grid w-full grid-cols-2 gap-2">
					<AppButton color="neutral" variant="soft" size="md" :block="true" @click="deleteTarget=null">
						{{ t("restaurantSettingsPage.cancel") }}
					</AppButton>
					<AppButton color="error" size="md" icon="i-heroicons-trash-20-solid" :block="true" :loading="saving" :spin-icon-on-loading="true" @click="remove">
						{{ t("restaurantSettingsPage.deleteConfirm.confirm") }}
					</AppButton>
				</div>
			</div>
		</div>
	</AppResponsivePanel>
</template>
