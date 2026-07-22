<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";
import { resolveApiErrorMessage } from "~/utils/api-errors";

type Zone={id:string;name:string;sort_order:number;is_active:number;table_count:number};
type DiningTable={id:string;zone_id:string;name:string;code:string|null;capacity:number;sort_order:number;is_active:number;zone_name:string;order_id?:string|null};
type Envelope<T>={data:T};

const {apiFetch}=useApiClient();
const {currentStoreId}=useAuthSession();
const toast=useAppToast();
const zones=ref<Zone[]>([]);const tables=ref<DiningTable[]>([]);const pending=ref(false);const saving=ref(false);
const panelOpen=ref(false);const formKind=ref<"zone"|"table">("zone");const editingId=ref("");
const form=reactive({name:"",zone_id:"",code:"",capacity:2,sort_order:0,is_active:true});
const deleteTarget=ref<{kind:"zone"|"table";id:string;name:string}|null>(null);
const zonesWithTables=computed(()=>zones.value.map(zone=>({...zone,tables:tables.value.filter(table=>table.zone_id===zone.id)})));

async function load(){if(!currentStoreId.value)return;pending.value=true;try{const [z,t]=await Promise.all([apiFetch<Envelope<Zone[]>>(`/restaurant/zones?store_id=${encodeURIComponent(currentStoreId.value)}`),apiFetch<Envelope<DiningTable[]>>(`/restaurant/tables?store_id=${encodeURIComponent(currentStoreId.value)}`)]);zones.value=z.data;tables.value=t.data;}catch(error){toast.error({title:"โหลดโซนและโต๊ะไม่สำเร็จ",description:resolveApiErrorMessage(error)});}finally{pending.value=false;}}
function openZone(zone?:Zone){formKind.value="zone";editingId.value=zone?.id||"";Object.assign(form,{name:zone?.name||"",zone_id:"",code:"",capacity:2,sort_order:zone?.sort_order||0,is_active:zone?Boolean(zone.is_active):true});panelOpen.value=true;}
function openTable(table?:DiningTable,zoneId?:string){formKind.value="table";editingId.value=table?.id||"";Object.assign(form,{name:table?.name||"",zone_id:table?.zone_id||zoneId||zones.value[0]?.id||"",code:table?.code||"",capacity:table?.capacity||2,sort_order:table?.sort_order||0,is_active:table?Boolean(table.is_active):true});panelOpen.value=true;}
async function save(){if(!currentStoreId.value||!form.name.trim())return;saving.value=true;try{const base=formKind.value==="zone"?"/restaurant/zones":"/restaurant/tables";const url=editingId.value?`${base}/${editingId.value}`:base;await apiFetch(url,{method:editingId.value?"PUT":"POST",body:{store_id:currentStoreId.value,name:form.name.trim(),sort_order:form.sort_order,is_active:form.is_active,...(formKind.value==="table"?{zone_id:form.zone_id,code:form.code||null,capacity:form.capacity}:{})}});panelOpen.value=false;toast.success({title:editingId.value?"บันทึกการแก้ไขแล้ว":"เพิ่มข้อมูลแล้ว"});await load();}catch(error){toast.error({title:"บันทึกไม่สำเร็จ",description:resolveApiErrorMessage(error)});}finally{saving.value=false;}}
async function remove(){if(!deleteTarget.value||!currentStoreId.value)return;saving.value=true;try{await apiFetch(`/restaurant/${deleteTarget.value.kind==="zone"?"zones":"tables"}/${deleteTarget.value.id}?store_id=${encodeURIComponent(currentStoreId.value)}`,{method:"DELETE"});deleteTarget.value=null;await load();}catch(error){toast.error({title:"ลบไม่สำเร็จ",description:resolveApiErrorMessage(error)});}finally{saving.value=false;}}
watch(currentStoreId,()=>void load(),{immediate:true});
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['settings']" sidebar-eyebrow="Restaurant" sidebar-title="โซนและโต๊ะ" sidebar-compact-title="TABLE" sidebar-description="จัดรูปแบบพื้นที่รับประทานอาหารของร้าน">
		<template #default>
			<div class="space-y-4">
				<AppPageHeader title="โซนและโต๊ะ" description="สร้างโซนและโต๊ะไว้ล่วงหน้าเพื่อให้พนักงานเปิดออเดอร์จากหน้า POS" icon="i-heroicons-squares-2x2-20-solid">
					<template #actions><AppButton color="neutral" variant="soft" icon="i-heroicons-arrow-path" :loading="pending" @click="load">รีโหลด</AppButton><AppButton color="primary" icon="i-heroicons-plus" @click="openZone()">เพิ่มโซน</AppButton></template>
				</AppPageHeader>
				<AppInlineLoadingBar v-if="pending" />
				<div v-else-if="!zones.length" class="rounded-md border border-dashed border-neutral-300 bg-white p-12 text-center"><UIcon name="i-heroicons-squares-2x2" class="mx-auto size-10 text-stone-400"/><p class="mt-3 font-semibold">ยังไม่มีโซน</p><p class="mt-1 text-sm text-stone-500">เริ่มจากโซน A ห้องแอร์ หรือด้านนอก</p><AppButton class="mt-4" @click="openZone()">เพิ่มโซนแรก</AppButton></div>
				<section v-for="zone in zonesWithTables" :key="zone.id" class="overflow-hidden rounded-md border border-neutral-200 bg-white">
					<header class="flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-4 py-3"><div><div class="flex items-center gap-2"><h2 class="font-semibold text-stone-950">{{ zone.name }}</h2><UBadge color="neutral" variant="soft">{{ zone.tables.length }} โต๊ะ</UBadge><UBadge v-if="!zone.is_active" color="warning" variant="soft">ปิดใช้งาน</UBadge></div></div><div class="flex gap-2"><AppButton size="sm" color="neutral" variant="soft" @click="openZone(zone)">แก้ไข</AppButton><AppButton size="sm" color="primary" variant="soft" icon="i-heroicons-plus" @click="openTable(undefined,zone.id)">เพิ่มโต๊ะ</AppButton><AppButton size="sm" color="error" variant="soft" icon="i-heroicons-trash" @click="deleteTarget={kind:'zone',id:zone.id,name:zone.name}" /></div></header>
					<div class="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"><button v-for="table in zone.tables" :key="table.id" class="rounded-md border border-neutral-200 p-4 text-left transition hover:border-primary-300 hover:bg-primary-50/40" @click="openTable(table)"><div class="flex items-start justify-between"><div><p class="font-semibold text-stone-950">{{ table.name }}</p><p class="mt-1 text-xs text-stone-500">{{ table.code || 'ไม่มีรหัส' }} · {{ table.capacity }} ที่นั่ง</p></div><UBadge :color="table.order_id?'warning':table.is_active?'success':'neutral'" variant="soft">{{ table.order_id?'กำลังใช้':table.is_active?'พร้อมใช้':'ปิด' }}</UBadge></div><AppButton class="mt-3" size="xs" color="error" variant="ghost" :disabled="Boolean(table.order_id)" @click.stop="deleteTarget={kind:'table',id:table.id,name:table.name}">ลบโต๊ะ</AppButton></button><button class="min-h-28 rounded-md border border-dashed border-neutral-300 text-sm text-stone-500 hover:border-primary-300 hover:text-primary-700" @click="openTable(undefined,zone.id)">+ เพิ่มโต๊ะใน {{ zone.name }}</button></div>
				</section>
			</div>
		</template>
	</AppSidebarShell>

	<AppResponsivePanel v-model="panelOpen" :title="`${editingId?'แก้ไข':'เพิ่ม'}${formKind==='zone'?'โซน':'โต๊ะ'}`" description="กำหนดชื่อ ลำดับ และสถานะสำหรับหน้า POS" desktop-width="680px" compact-header full-bleed-header>
		<form class="space-y-4 p-1" @submit.prevent="save"><UFormField label="ชื่อ"><UInput v-model="form.name" class="w-full" autofocus placeholder="เช่น โซน A หรือ โต๊ะ A1" /></UFormField><template v-if="formKind==='table'"><UFormField label="โซน"><USelect v-model="form.zone_id" class="w-full" :items="zones.map(z=>({label:z.name,value:z.id}))" /></UFormField><div class="grid grid-cols-2 gap-3"><UFormField label="รหัส"><UInput v-model="form.code" class="w-full" placeholder="A1" /></UFormField><UFormField label="จำนวนที่นั่ง"><UInput v-model.number="form.capacity" class="w-full" type="number" min="1" /></UFormField></div></template><UFormField label="ลำดับ"><UInput v-model.number="form.sort_order" class="w-full" type="number" /></UFormField><UCheckbox v-if="editingId" v-model="form.is_active" label="เปิดใช้งาน"/><div class="flex justify-end gap-2 border-t pt-4"><AppButton color="neutral" variant="soft" @click="panelOpen=false">ยกเลิก</AppButton><AppButton type="submit" :loading="saving">บันทึก</AppButton></div></form>
	</AppResponsivePanel>
	<AppResponsivePanel :model-value="Boolean(deleteTarget)" title="ยืนยันการลบ" description="ข้อมูลที่ลบแล้วจะไม่แสดงในหน้า POS" desktop-width="520px" @update:model-value="value=>{if(!value)deleteTarget=null}"><div class="space-y-4"><p>ต้องการลบ <strong>{{ deleteTarget?.name }}</strong> หรือไม่?</p><div class="flex justify-end gap-2"><AppButton color="neutral" variant="soft" @click="deleteTarget=null">ยกเลิก</AppButton><AppButton color="error" :loading="saving" @click="remove">ยืนยันลบ</AppButton></div></div></AppResponsivePanel>
</template>
