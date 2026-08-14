<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type Zone={id:string;name:string;sort_order:number;is_active:number;table_count:number};
type Station={id:string;name:string;sort_order:number;is_active:number;category_count:number};
type StationCategory={id:string;name:string;station_id:string|null;send_to_kitchen:number};
type KitchenProduct={id:string;name:string;sku:string;send_to_kitchen:number|null;category_name:string|null;category_send_to_kitchen:number};
type DiningTable={id:string;zone_id:string;name:string;code:string|null;capacity:number;sort_order:number;is_active:number;zone_name:string;order_id?:string|null};
type Envelope<T>={data:T};
type StoreSettings={id:string;pickup_queue_enabled?:number;business_day_start_minutes?:number;kitchen_delivery_mode?:string};

const {apiFetch}=useApiClient();
const {currentStoreId}=useAuthSession();
const {t}=useI18n();
const toast=useAppToast();
const zones=ref<Zone[]>([]);const tables=ref<DiningTable[]>([]);const pending=ref(false);const saving=ref(false);
const pickupQueueEnabled=ref(false);const queueSettingSaving=ref(false);
const businessDayStart=ref("00:00");const businessDaySaving=ref(false);
const kitchenMode=ref("paper");const kitchenModeSaving=ref(false);
const kitchenModes=["paper","screen","both","none"] as const;
const kitchenScreenUsed=computed(()=>kitchenMode.value==="screen"||kitchenMode.value==="both");
const kitchenScreenOrigin=computed(()=>import.meta.client?window.location.origin:"");
const reordering=ref(false);
const panelOpen=ref(false);const formKind=ref<"zone"|"table">("zone");const editingId=ref("");
const form=reactive({name:"",zone_id:"",code:"",capacity:2,is_active:true});
const deleteTarget=ref<{kind:"zone"|"table"|"station";id:string;name:string}|null>(null);
const stations=ref<Station[]>([]);const stationCategories=ref<StationCategory[]>([]);
const stationPanelOpen=ref(false);const stationEditingId=ref("");const stationSaving=ref(false);
const stationForm=reactive({name:"",category_ids:[] as string[]});
// Read from the categories themselves rather than a per-station list: the server
// owns the assignment, and a category can only ever be on one station.
const stationCategoryNames=computed(()=>(id:string)=>stationCategories.value.filter(category=>category.station_id===id).map(category=>category.name));
const unassignedCategories=computed(()=>stationCategories.value.filter(category=>!category.station_id&&Number(category.send_to_kitchen)!==0));
const kitchenProducts=ref<KitchenProduct[]>([]);
const productSearch=ref("");
const routingPendingId=ref("");
let productSearchTimer:ReturnType<typeof setTimeout>|null=null;
// What a product ends up doing once its own answer and its category's are both
// taken into account — the same rule the printer and the kitchen queue apply.
function productKitchenState(product:KitchenProduct){return product.send_to_kitchen===null?(Number(product.category_send_to_kitchen)!==0?"inherit-on":"inherit-off"):(Number(product.send_to_kitchen)!==0?"on":"off");}
const zonesWithTables=computed(()=>zones.value.map(zone=>({...zone,tables:tables.value.filter(table=>table.zone_id===zone.id)})));
const draggedZoneId=ref("");
const draggedTableId=ref("");
const draggingOverZoneId=ref("");
const draggingOverTableId=ref("");
const panelTitle=computed(()=>t(`restaurantSettingsPage.panel.${editingId.value?"edit":"add"}${formKind.value==="zone"?"Zone":"Table"}`));

function minutesToTime(value:number){const minutes=Math.min(1439,Math.max(0,Number(value)||0));return `${String(Math.floor(minutes/60)).padStart(2,"0")}:${String(minutes%60).padStart(2,"0")}`;}
function timeToMinutes(value:string){const [hours,minutes]=value.split(":").map(Number);return hours*60+minutes;}
async function load(){if(!currentStoreId.value)return;pending.value=true;try{const [z,tablesResponse,storeResponse,stationsResponse]=await Promise.all([apiFetch<Envelope<Zone[]>>(`/restaurant/zones?store_id=${encodeURIComponent(currentStoreId.value)}`),apiFetch<Envelope<DiningTable[]>>(`/restaurant/tables?store_id=${encodeURIComponent(currentStoreId.value)}`),apiFetch<Envelope<StoreSettings>>(`/stores/${encodeURIComponent(currentStoreId.value)}`),apiFetch<Envelope<{stations:Station[];categories:StationCategory[]}>>(`/restaurant/stations?store_id=${encodeURIComponent(currentStoreId.value)}`)]);zones.value=z.data;tables.value=tablesResponse.data;pickupQueueEnabled.value=Number(storeResponse.data.pickup_queue_enabled||0)!==0;businessDayStart.value=minutesToTime(Number(storeResponse.data.business_day_start_minutes||0));kitchenMode.value=String(storeResponse.data.kitchen_delivery_mode||"paper");stations.value=stationsResponse.data.stations;stationCategories.value=stationsResponse.data.categories;await loadKitchenRouting();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.loadFailed"),description:resolveApiErrorMessage(error)});}finally{pending.value=false;}}
async function loadKitchenRouting(){if(!currentStoreId.value)return;try{const response=await apiFetch<Envelope<{stations:Station[];categories:StationCategory[];products:KitchenProduct[]}>>(`/restaurant/kitchen-routing?store_id=${encodeURIComponent(currentStoreId.value)}&search=${encodeURIComponent(productSearch.value.trim())}`);stations.value=response.data.stations;stationCategories.value=response.data.categories;kitchenProducts.value=response.data.products;}catch(error){toast.error({title:t("restaurantSettingsPage.toast.loadFailed"),description:resolveApiErrorMessage(error)});}}
function queueProductSearch(){if(productSearchTimer)clearTimeout(productSearchTimer);productSearchTimer=setTimeout(()=>void loadKitchenRouting(),250);}
async function setCategoryKitchen(category:StationCategory,sendToKitchen:boolean){if(!currentStoreId.value||routingPendingId.value)return;routingPendingId.value=category.id;const previous=Number(category.send_to_kitchen);category.send_to_kitchen=sendToKitchen?1:0;try{await apiFetch(`/restaurant/kitchen-routing/categories/${category.id}`,{method:"PUT",body:{store_id:currentStoreId.value,send_to_kitchen:sendToKitchen?1:0}});await loadKitchenRouting();}catch(error){category.send_to_kitchen=previous;toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{routingPendingId.value="";}}
async function setProductKitchen(product:KitchenProduct,value:number|null){if(!currentStoreId.value||routingPendingId.value)return;routingPendingId.value=product.id;try{await apiFetch(`/restaurant/kitchen-routing/products/${product.id}`,{method:"PUT",body:{store_id:currentStoreId.value,send_to_kitchen:value}});await loadKitchenRouting();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{routingPendingId.value="";}}
function openStation(station?:Station){stationEditingId.value=station?.id||"";stationForm.name=station?.name||"";stationForm.category_ids=station?stationCategories.value.filter(category=>category.station_id===station.id).map(category=>category.id):[];stationPanelOpen.value=true;}
function toggleStationCategory(categoryId:string,selected:boolean){stationForm.category_ids=selected?[...new Set([...stationForm.category_ids,categoryId])]:stationForm.category_ids.filter(id=>id!==categoryId);}
async function saveStation(){if(stationSaving.value)return;if(!currentStoreId.value){toast.error({title:t("restaurantSettingsPage.toast.noStore")});return;}if(!stationForm.name.trim()){toast.error({title:t("restaurantSettingsPage.toast.nameRequired")});return;}stationSaving.value=true;try{const sortOrder=stationEditingId.value?Number(stations.value.find(station=>station.id===stationEditingId.value)?.sort_order||0):stations.value.length+1;await apiFetch(stationEditingId.value?`/restaurant/stations/${stationEditingId.value}`:"/restaurant/stations",{method:stationEditingId.value?"PUT":"POST",body:{store_id:currentStoreId.value,name:stationForm.name.trim(),sort_order:sortOrder,category_ids:stationForm.category_ids}});stationPanelOpen.value=false;toast.success({title:stationEditingId.value?t("restaurantSettingsPage.toast.saved"):t("restaurantSettingsPage.toast.created")});await load();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{stationSaving.value=false;}}
async function savePickupQueueSetting(enabled:boolean){if(!currentStoreId.value||queueSettingSaving.value)return;pickupQueueEnabled.value=enabled;queueSettingSaving.value=true;try{const response=await apiFetch<Envelope<StoreSettings>>(`/stores/${encodeURIComponent(currentStoreId.value)}`,{method:"PUT",body:{pickup_queue_enabled:enabled?1:0}});pickupQueueEnabled.value=Number(response.data.pickup_queue_enabled||0)!==0;toast.success({title:t("restaurantSettingsPage.toast.queueSettingSaved")});}catch(error){pickupQueueEnabled.value=!enabled;toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{queueSettingSaving.value=false;}}
async function saveBusinessDaySetting(){if(!currentStoreId.value||businessDaySaving.value)return;businessDaySaving.value=true;try{const response=await apiFetch<Envelope<StoreSettings>>(`/stores/${encodeURIComponent(currentStoreId.value)}`,{method:"PUT",body:{business_day_start_minutes:timeToMinutes(businessDayStart.value)}});businessDayStart.value=minutesToTime(Number(response.data.business_day_start_minutes||0));toast.success({title:t("restaurantSettingsPage.toast.businessDaySaved")});}catch(error){toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{businessDaySaving.value=false;}}
async function saveKitchenMode(mode:string){if(!currentStoreId.value||kitchenModeSaving.value)return;const previous=kitchenMode.value;kitchenMode.value=mode;kitchenModeSaving.value=true;try{const response=await apiFetch<Envelope<StoreSettings>>(`/stores/${encodeURIComponent(currentStoreId.value)}`,{method:"PUT",body:{kitchen_delivery_mode:mode}});kitchenMode.value=String(response.data.kitchen_delivery_mode||mode);toast.success({title:t("restaurantSettingsPage.toast.saved")});}catch(error){kitchenMode.value=previous;toast.error({title:t("restaurantSettingsPage.toast.saveFailed"),description:resolveApiErrorMessage(error)});}finally{kitchenModeSaving.value=false;}}
async function copyStationScreenLink(station?:Station){const link=`${kitchenScreenOrigin.value}/kitchen${station?`?station=${station.id}`:""}`;try{await navigator.clipboard.writeText(link);toast.success({title:t("restaurantSettingsPage.stations.linkCopied"),description:link});}catch{toast.error({title:t("restaurantSettingsPage.stations.linkCopyFailed"),description:link});}}
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
async function remove(){if(!deleteTarget.value||!currentStoreId.value)return;saving.value=true;try{const path=deleteTarget.value.kind==="zone"?"zones":deleteTarget.value.kind==="station"?"stations":"tables";await apiFetch(`/restaurant/${path}/${deleteTarget.value.id}?store_id=${encodeURIComponent(currentStoreId.value)}`,{method:"DELETE"});deleteTarget.value=null;await load();}catch(error){toast.error({title:t("restaurantSettingsPage.toast.deleteFailed"),description:resolveApiErrorMessage(error)});}finally{saving.value=false;}}
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
		:sidebar-title="t('restaurantSettingsPage.pageTitle')"
		sidebar-compact-title="TABLE"
		:sidebar-description="t('restaurantSettingsPage.sidebarDescription')"
	>
		<template #default>
			<div class="grid gap-3 pb-[calc(5.75rem+env(safe-area-inset-bottom))] lg:gap-4 lg:pb-3">
			<section id="pickup-queue" class="scroll-mt-4 flex flex-col gap-4 rounded-none border border-emerald-200 bg-emerald-50/40 p-4 shadow-sm sm:rounded-md sm:flex-row sm:items-center sm:justify-between">
				<div class="flex min-w-0 items-start gap-3">
					<span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-emerald-100 text-emerald-700"><UIcon name="i-lucide-list-ordered" class="size-5" /></span>
					<div>
						<div class="flex flex-wrap items-center gap-2">
							<h2 class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.pickupQueue") }}</h2>
							<UBadge :color="pickupQueueEnabled ? 'success' : 'neutral'" variant="soft">{{ t(pickupQueueEnabled ? "restaurantSettingsPage.queueEnabled" : "restaurantSettingsPage.queueDisabled") }}</UBadge>
						</div>
						<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.pickupQueueHint") }}</p>
					</div>
				</div>
				<label class="flex min-h-11 shrink-0 cursor-pointer items-center justify-between gap-3 rounded-md border border-emerald-200 bg-white px-3 py-2 sm:justify-start" :class="(pending || queueSettingSaving) && 'cursor-wait opacity-70'">
					<span class="text-sm font-medium text-stone-800">{{ t("restaurantSettingsPage.enablePickupQueue") }}</span>
					<USwitch :model-value="pickupQueueEnabled" :disabled="pending || queueSettingSaving" @update:model-value="savePickupQueueSetting(Boolean($event))" />
				</label>
			</section>
			<section id="kitchen-stations" class="scroll-mt-4 rounded-none border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-md">
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
					<div class="flex min-w-0 items-start gap-3">
						<span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-amber-50 text-amber-700"><UIcon name="i-lucide-chef-hat" class="size-5" /></span>
						<div>
							<h2 class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.stations.title") }}</h2>
							<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.stations.hint") }}</p>
						</div>
					</div>
					<AppButton class="shrink-0" size="md" color="primary" variant="soft" icon="i-heroicons-plus-20-solid" :disabled="pending" @click="openStation()">
						{{ t("restaurantSettingsPage.stations.add") }}
					</AppButton>
				</div>
				<!-- One answer decides whether slips print, whether the kitchen queue is
				     offered at all, and therefore whether anyone is expected to tick a
				     round off. Asked here because it is about how the kitchen works, not
				     about how paper is formatted. -->
				<div class="mt-4 rounded-md border border-neutral-200 bg-neutral-50 p-3">
					<p class="text-sm font-semibold text-stone-900">{{ t("restaurantSettingsPage.delivery.title") }}</p>
					<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.delivery.hint") }}</p>
					<div class="mt-3 grid gap-2 sm:grid-cols-2">
						<button
							v-for="mode in kitchenModes"
							:key="mode"
							type="button"
							class="rounded-md border px-3 py-2.5 text-left transition disabled:opacity-60"
							:class="kitchenMode === mode ? 'border-emerald-500 bg-emerald-50 ring-1 ring-emerald-200' : 'border-neutral-200 bg-white hover:border-emerald-200'"
							:disabled="pending || kitchenModeSaving"
							@click="saveKitchenMode(mode)"
						>
							<span class="flex items-center gap-2 text-sm font-semibold text-stone-900">
								<UIcon :name="{ paper: 'i-heroicons-printer', screen: 'i-heroicons-tv', both: 'i-heroicons-square-2-stack', none: 'i-heroicons-no-symbol' }[mode]" class="size-4" />
								{{ t(`restaurantSettingsPage.delivery.modes.${mode}.title`) }}
							</span>
							<span class="mt-1 block text-xs leading-5 text-stone-500">{{ t(`restaurantSettingsPage.delivery.modes.${mode}.description`) }}</span>
						</button>
					</div>
					<!-- The address to type into the tablet standing in the kitchen. -->
					<div v-if="kitchenScreenUsed" class="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2">
						<code class="min-w-0 flex-1 truncate font-mono text-xs text-stone-700">{{ kitchenScreenOrigin }}/kitchen</code>
						<AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-clipboard-document" @click="copyStationScreenLink()">{{ t("restaurantSettingsPage.stations.copyLink") }}</AppButton>
					</div>
				</div>

				<div v-if="!pending && !stations.length" class="mt-4 rounded-md border border-dashed border-neutral-300 bg-neutral-50 px-6 py-8 text-center">
					<p class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.stations.empty") }}</p>
					<p class="mt-1 text-sm text-stone-500">{{ t("restaurantSettingsPage.stations.emptyHint") }}</p>
					<AppButton class="mt-4" color="primary" variant="solid" icon="i-heroicons-plus-20-solid" @click="openStation()">
						{{ t("restaurantSettingsPage.stations.addFirst") }}
					</AppButton>
				</div>
				<div v-else-if="stations.length" class="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
					<div v-for="station in stations" :key="station.id" class="rounded-md border border-neutral-200 bg-neutral-50 p-3">
						<div class="flex items-start justify-between gap-2">
							<div class="min-w-0">
								<p class="truncate text-sm font-semibold text-stone-950">{{ station.name }}</p>
								<p class="mt-0.5 text-xs text-stone-500">{{ t("restaurantSettingsPage.stations.categoryCount", { count: Number(station.category_count || 0) }) }}</p>
							</div>
							<div class="flex shrink-0 gap-1">
								<AppButton size="xs" color="neutral" variant="soft" icon="i-heroicons-pencil-square-20-solid" :aria-label="t('restaurantSettingsPage.stations.edit')" @click="openStation(station)" />
								<AppButton size="xs" color="error" variant="soft" icon="i-heroicons-trash-20-solid" :aria-label="t('restaurantSettingsPage.deleteConfirm.confirm')" @click="deleteTarget={kind:'station',id:station.id,name:station.name}" />
							</div>
						</div>
						<div v-if="stationCategoryNames(station.id).length" class="mt-2 flex flex-wrap gap-1">
							<UBadge v-for="name in stationCategoryNames(station.id)" :key="name" color="neutral" variant="soft">{{ name }}</UBadge>
						</div>
						<p v-else class="mt-2 text-xs text-amber-700">{{ t("restaurantSettingsPage.stations.noCategories") }}</p>
						<!-- Its own screen address: the tablet at the grill opens this and
						     never has to read the bar's drinks. -->
						<AppButton v-if="kitchenScreenUsed" class="mt-2" size="xs" color="neutral" variant="soft" icon="i-heroicons-tv" @click="copyStationScreenLink(station)">{{ t("restaurantSettingsPage.stations.copyStationLink") }}</AppButton>
					</div>
				</div>
				<!-- Named so nobody has to guess why a dish came out on the "Other" slip. -->
				<div v-if="stations.length && unassignedCategories.length" class="mt-3 rounded-md border border-amber-200 bg-amber-50/60 p-3">
					<p class="text-xs font-semibold text-amber-900">{{ t("restaurantSettingsPage.stations.unassigned") }}</p>
					<p class="mt-0.5 text-xs text-amber-800">{{ t("restaurantSettingsPage.stations.unassignedHint") }}</p>
					<div class="mt-2 flex flex-wrap gap-1">
						<UBadge v-for="category in unassignedCategories" :key="category.id" color="warning" variant="soft">{{ category.name }}</UBadge>
					</div>
				</div>

				<!-- Whether the kitchen hears about a dish at all. A bottle taken from
				     the counter fridge is sold and stocked like anything else; it simply
				     has no business on a kitchen slip. -->
				<div class="mt-4 border-t border-neutral-200 pt-4">
					<h3 class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.routing.title") }}</h3>
					<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.routing.hint") }}</p>
					<p v-if="!stationCategories.length" class="mt-3 text-sm text-stone-500">{{ t("restaurantSettingsPage.routing.noCategories") }}</p>
					<div v-else class="mt-3 grid gap-2 sm:grid-cols-2">
						<label
							v-for="category in stationCategories"
							:key="category.id"
							class="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-neutral-200 bg-neutral-50 px-3 py-2"
						>
							<span class="min-w-0">
								<span class="block truncate text-sm font-medium text-stone-800">{{ category.name }}</span>
								<span class="text-[11px] text-stone-500">{{ Number(category.send_to_kitchen) !== 0 ? t("restaurantSettingsPage.routing.sends") : t("restaurantSettingsPage.routing.skips") }}</span>
							</span>
							<USwitch
								:model-value="Number(category.send_to_kitchen) !== 0"
								:disabled="Boolean(routingPendingId)"
								@update:model-value="value => setCategoryKitchen(category, Boolean(value))"
							/>
						</label>
					</div>

					<div class="mt-4">
						<p class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.routing.overrides") }}</p>
						<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.routing.overridesHint") }}</p>
						<UInput
							v-model="productSearch"
							class="mt-2 w-full sm:max-w-sm"
							icon="i-heroicons-magnifying-glass"
							:placeholder="t('restaurantSettingsPage.routing.searchProduct')"
							@update:model-value="queueProductSearch"
						/>
						<p v-if="!kitchenProducts.length" class="mt-3 text-sm text-stone-500">{{ t("restaurantSettingsPage.routing.noOverrides") }}</p>
						<div v-else class="mt-3 space-y-2">
							<div v-for="product in kitchenProducts" :key="product.id" class="flex flex-wrap items-center justify-between gap-2 rounded-md border border-neutral-200 bg-white px-3 py-2">
								<div class="min-w-0">
									<p class="truncate text-sm font-medium text-stone-900">{{ product.name }}</p>
									<p class="text-[11px] text-stone-500">{{ product.category_name || t("restaurantSettingsPage.routing.noCategory") }} · {{ product.sku }}</p>
								</div>
								<div class="flex shrink-0 gap-1">
									<AppButton
										v-for="option in [
											{ key: 'inherit', value: null, label: t('restaurantSettingsPage.routing.followCategory') },
											{ key: 'on', value: 1, label: t('restaurantSettingsPage.routing.always') },
											{ key: 'off', value: 0, label: t('restaurantSettingsPage.routing.never') },
										]"
										:key="option.key"
										size="xs"
										:color="(option.value === null && product.send_to_kitchen === null) || (option.value !== null && Number(product.send_to_kitchen) === option.value) ? 'primary' : 'neutral'"
										:variant="(option.value === null && product.send_to_kitchen === null) || (option.value !== null && Number(product.send_to_kitchen) === option.value) ? 'solid' : 'soft'"
										:disabled="Boolean(routingPendingId)"
										@click="setProductKitchen(product, option.value)"
									>
										{{ option.label }}
									</AppButton>
								</div>
								<p class="w-full text-[11px]" :class="productKitchenState(product).endsWith('off') ? 'text-amber-700' : 'text-emerald-700'">
									{{ productKitchenState(product).endsWith("off") ? t("restaurantSettingsPage.routing.resultSkips") : t("restaurantSettingsPage.routing.resultSends") }}
								</p>
							</div>
						</div>
					</div>
				</div>
			</section>
			<section id="business-day" class="scroll-mt-4 flex flex-col gap-4 rounded-none border border-neutral-200 bg-white p-4 shadow-sm sm:rounded-md sm:flex-row sm:items-center sm:justify-between">
				<div class="flex min-w-0 items-start gap-3">
					<span class="flex size-10 shrink-0 items-center justify-center rounded-md bg-sky-50 text-sky-700"><UIcon name="i-lucide-clock-3" class="size-5" /></span>
					<div>
						<h2 class="text-sm font-semibold text-stone-950">{{ t("restaurantSettingsPage.businessDay.title") }}</h2>
						<p class="mt-1 text-xs leading-5 text-stone-600">{{ t("restaurantSettingsPage.businessDay.description") }}</p>
						<p class="mt-1 text-xs leading-5 text-stone-500">{{ t("restaurantSettingsPage.businessDay.example") }}</p>
					</div>
				</div>
				<div class="flex shrink-0 items-end gap-2">
					<label class="grid gap-1 text-xs font-medium text-stone-600">
						<span>{{ t("restaurantSettingsPage.businessDay.startTime") }}</span>
						<input v-model="businessDayStart" type="time" step="900" class="h-10 rounded-md border border-neutral-200 bg-white px-3 text-sm text-stone-900 outline-none focus:border-primary-300 focus:ring-2 focus:ring-primary-200">
					</label>
					<AppButton color="primary" :loading="businessDaySaving" :disabled="pending || businessDaySaving" @click="saveBusinessDaySetting">{{ t("restaurantSettingsPage.businessDay.save") }}</AppButton>
				</div>
			</section>
				<div class="rounded-none border border-neutral-200 bg-white shadow-[0_8px_24px_rgba(31,28,24,0.06)] sm:rounded-md">
					<div class="relative">
						<div class="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-[#ece6dc] px-4 py-3">
							<div class="flex items-start gap-3">
								<div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-400/20 dark:bg-emerald-500/10 dark:text-emerald-200">
									<UIcon name="i-heroicons-squares-2x2-20-solid" class="h-5 w-5" />
								</div>
								<div>
									<p class="text-sm font-semibold text-stone-950 dark:text-stone-50">{{ t("restaurantSettingsPage.pageTitle") }}</p>
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
		v-model="stationPanelOpen"
		:title="stationEditingId ? t('restaurantSettingsPage.stations.edit') : t('restaurantSettingsPage.stations.addTitle')"
		:description="t('restaurantSettingsPage.stations.panelDescription')"
		desktop-width="600px"
		compact-header
		full-bleed-header
		content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"
	>
		<form class="grid h-full min-h-0 grid-rows-[minmax(0,1fr)_auto] text-stone-900" @submit.prevent="saveStation">
			<div class="scrollbar-soft min-h-0 space-y-4 overflow-y-auto py-2">
				<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
					<UFormField :label="t('restaurantSettingsPage.stations.name')">
						<UInput
							v-model="stationForm.name"
							class="w-full [&_input]:rounded-md [&_input]:border-neutral-200 [&_input]:bg-white [&_input]:py-2.5"
							autofocus
							:placeholder="t('restaurantSettingsPage.stations.namePlaceholder')"
						/>
					</UFormField>
				</div>
				<div class="rounded-md border border-neutral-200 bg-neutral-50 p-4">
					<p class="text-sm font-semibold text-stone-900">{{ t("restaurantSettingsPage.stations.categories") }}</p>
					<p class="mt-1 text-xs leading-5 text-stone-500">{{ t("restaurantSettingsPage.stations.categoriesHint") }}</p>
					<div class="mt-3 grid gap-2 sm:grid-cols-2">
						<label
							v-for="category in stationCategories"
							:key="category.id"
							class="flex cursor-pointer items-center justify-between gap-3 rounded-md border border-neutral-200 bg-white px-3 py-2"
						>
							<span class="min-w-0 truncate text-sm text-stone-800">
								{{ category.name }}
								<!-- Says out loud that ticking this box takes the category off the
								     station it is on today. -->
								<em v-if="category.station_id && category.station_id !== stationEditingId" class="text-[11px] not-italic text-amber-700">· {{ stations.find(station => station.id === category.station_id)?.name }}</em>
							</span>
							<input
								type="checkbox"
								class="h-5 w-5 shrink-0 rounded border-neutral-300 text-emerald-600 focus:ring-emerald-500"
								:checked="stationForm.category_ids.includes(category.id)"
								@change="toggleStationCategory(category.id, ($event.target as HTMLInputElement).checked)"
							>
						</label>
					</div>
					<p v-if="!stationCategories.length" class="mt-3 text-sm text-stone-500">{{ t("restaurantSettingsPage.stations.noCategories") }}</p>
				</div>
			</div>
			<div
				class="-mx-5 shrink-0 border-t border-[#ece6dc] bg-[rgba(255,254,253,0.98)] px-5 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-8px_24px_rgba(31,28,24,0.06)] backdrop-blur-sm dark:border-[#3a332a] dark:bg-[rgba(34,29,24,0.98)] dark:shadow-[0_-8px_24px_rgba(0,0,0,0.28)]"
				:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"
			>
				<div class="grid w-full grid-cols-2 gap-2">
					<AppButton color="neutral" variant="soft" size="md" :block="true" @click="stationPanelOpen=false">
						{{ t("restaurantSettingsPage.cancel") }}
					</AppButton>
					<AppButton type="button" color="primary" variant="solid" size="md" icon="i-heroicons-check-20-solid" :block="true" :loading="stationSaving" :spin-icon-on-loading="true" @click="saveStation">
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
