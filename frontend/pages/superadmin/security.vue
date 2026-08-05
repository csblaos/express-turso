<script setup lang="ts">
import { appNavItems } from "~/utils/app-nav";

type IssueKind = "store_without_team" | "suspended_user" | "password_change";
type Snapshot = {
	checked_at: string;
	summary: { stores_total: number; stores_without_members: number; users_suspended: number; users_must_change_password: number };
	issues: Array<{ kind: IssueKind; label: string; detail: string }>;
};

const { apiFetch } = useApiClient();
const { locale } = useI18n();
const pending = ref(true);
const snapshot = ref<Snapshot | null>(null);
const loadError = ref(false);

const copy = computed(() => locale.value === "lo" ? {
	title: "ກວດຄວາມພ້ອມລະບົບ", subtitle: "ສະແດງສະເພາະລາຍການທີ່ຄວນກວດສອບ", reload: "ໂຫຼດໃໝ່", updated: "ກວດເມື່ອ", ready: "ຮ້ານພ້ອມໃຊ້ງານ", attention: "ມີລາຍການຕ້ອງກວດ", issues: "ລາຍການທີ່ຄວນກວດ", issuesHint: "ລາຍການນີ້ອ່ານຈາກຂໍ້ມູນຮ້ານ ແລະ ບັນຊີປັດຈຸບັນ", allClear: "ບໍ່ພົບລາຍການທີ່ຕ້ອງແກ້ໄຂ", allClearHint: "ທຸກຮ້ານມີທີມ ແລະ ບໍ່ມີບັນຊີຖືກລະງັບ ຫຼື ຄ້າງປ່ຽນລະຫັດຜ່ານ", checks: "ລາຍການທີ່ກວດ", team: "ທີມຮ້ານ", teamOk: "ທຸກຮ້ານມີສະມາຊິກ", suspended: "ບັນຊີຖືກລະງັບ", password: "ປ່ຽນລະຫັດຜ່ານ", store_without_team: "ຮ້ານນີ້ຍັງບໍ່ມີສະມາຊິກໃນທີມ", suspended_user: "ບັນຊີນີ້ຖືກລະງັບ", password_change: "ບັນຊີນີ້ຄ້າງປ່ຽນລະຫັດຜ່ານ", failed: "ໂຫຼດຂໍ້ມູນກວດຄວາມພ້ອມບໍ່ສຳເລັດ", tryAgain: "ລອງໃໝ່",
} : locale.value === "th" ? {
	title: "ตรวจความพร้อมระบบ", subtitle: "แสดงเฉพาะรายการที่ควรตรวจสอบ", reload: "โหลดใหม่", updated: "ตรวจเมื่อ", ready: "ร้านพร้อมใช้งาน", attention: "มีรายการที่ต้องตรวจ", issues: "รายการที่ควรตรวจสอบ", issuesHint: "รายการนี้อ่านจากข้อมูลร้านและบัญชีปัจจุบัน", allClear: "ไม่พบรายการที่ต้องแก้ไข", allClearHint: "ทุกร้านมีทีม และไม่มีบัญชีถูกระงับหรือค้างเปลี่ยนรหัสผ่าน", checks: "สิ่งที่ระบบตรวจ", team: "ทีมร้าน", teamOk: "ทุกร้านมีสมาชิก", suspended: "บัญชีถูกระงับ", password: "ต้องเปลี่ยนรหัสผ่าน", store_without_team: "ร้านนี้ยังไม่มีสมาชิกในทีม", suspended_user: "บัญชีนี้ถูกระงับ", password_change: "บัญชีนี้ค้างเปลี่ยนรหัสผ่าน", failed: "โหลดข้อมูลตรวจความพร้อมไม่สำเร็จ", tryAgain: "ลองใหม่",
} : {
	title: "System readiness", subtitle: "Only items that need attention are shown", reload: "Reload", updated: "Checked", ready: "Store is ready", attention: "Items need attention", issues: "Items to review", issuesHint: "These items come from the current store and account data", allClear: "No action is needed", allClearHint: "Every store has a team and no account is suspended or awaiting a password change", checks: "What is checked", team: "Store teams", teamOk: "Every store has a member", suspended: "Suspended accounts", password: "Password changes", store_without_team: "This store has no team member yet", suspended_user: "This account is suspended", password_change: "This account must change its password", failed: "Unable to load readiness data", tryAgain: "Try again",
});

const checks = computed(() => {
	const summary = snapshot.value?.summary;
	if (!summary) return [];
	return [
		{ label: copy.value.team, value: summary.stores_without_members, ok: summary.stores_without_members === 0, okText: copy.value.teamOk },
		{ label: copy.value.suspended, value: summary.users_suspended, ok: summary.users_suspended === 0, okText: copy.value.allClear },
		{ label: copy.value.password, value: summary.users_must_change_password, ok: summary.users_must_change_password === 0, okText: copy.value.allClear },
	];
});

function formatDate(value: string) {
	return new Intl.DateTimeFormat(locale.value === "lo" ? "lo-LA" : locale.value === "th" ? "th-TH" : "en-US", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function loadReadiness() {
	pending.value = true;
	loadError.value = false;
	try {
		const response = await apiFetch<{ data: Snapshot }>("/superadmin/security");
		snapshot.value = response.data;
	} catch {
		loadError.value = true;
	} finally {
		pending.value = false;
	}
}

onMounted(() => void loadReadiness());
</script>

<template>
	<AppSidebarShell :nav-items="appNavItems" :active-ids="['superadmin']" sidebar-eyebrow="Super Admin" sidebar-title="Super Admin" sidebar-compact-title="SUP" :sidebar-description="copy.subtitle">
		<template #default="{ openSidebar }">
			<div class="grid w-full min-w-0 gap-3 pb-4">
				<AppPageHeader :title-badge="false" compact title="" body-class="px-3 py-2.5 sm:px-4 sm:py-3" @menu="openSidebar">
					<div class="flex min-h-10 items-center justify-between gap-3"><div><h1 class="text-base font-semibold text-stone-950">{{ copy.title }}</h1><p class="mt-0.5 text-xs text-stone-500">{{ copy.subtitle }}</p></div><AppButton color="neutral" variant="soft" size="md" icon="i-heroicons-arrow-path-20-solid" :label="copy.reload" :loading="pending" :spin-icon-on-loading="true" @click="loadReadiness" /></div>
				</AppPageHeader>

				<div v-if="pending && !snapshot" class="grid gap-3">
					<div class="rounded-md border border-stone-200 bg-white px-4 py-3 shadow-sm">
						<USkeleton class="h-4 w-40 rounded-md bg-stone-200" />
						<USkeleton class="mt-2 h-3 w-64 max-w-full rounded-md bg-stone-100" />
					</div>
					<div class="rounded-md border border-stone-200 bg-white p-4 shadow-sm">
						<USkeleton class="h-5 w-44 rounded-md bg-stone-200" />
						<USkeleton class="mt-2 h-3 w-72 max-w-full rounded-md bg-stone-100" />
						<div class="mt-5 space-y-3"><div v-for="item in 3" :key="item" class="rounded-md border border-stone-100 p-3"><USkeleton class="h-4 w-32 rounded-md bg-stone-200" /><USkeleton class="mt-2 h-3 w-56 max-w-full rounded-md bg-stone-100" /></div></div>
					</div>
					<div class="grid gap-3 md:grid-cols-3"><div v-for="item in 3" :key="item" class="rounded-md border border-stone-200 bg-white p-4 shadow-sm"><USkeleton class="h-4 w-24 rounded-md bg-stone-200" /><USkeleton class="mt-4 h-7 w-10 rounded-md bg-stone-100" /><USkeleton class="mt-3 h-3 w-20 rounded-md bg-stone-100" /></div></div>
				</div>
				<div v-else-if="loadError" class="rounded-md border border-rose-200 bg-rose-50 p-8 text-center"><p class="font-semibold text-rose-900">{{ copy.failed }}</p><AppButton class="mt-4" :label="copy.tryAgain" @click="loadReadiness" /></div>
				<template v-else-if="snapshot">
					<div class="flex flex-wrap items-center justify-between gap-3 rounded-md border border-stone-200 bg-white px-4 py-3"><div><p class="font-semibold text-stone-950">{{ copy.title }}</p><p class="mt-1 text-xs text-stone-500">{{ copy.updated }} {{ formatDate(snapshot.checked_at) }}</p></div><span class="rounded-md px-3 py-1.5 text-sm font-semibold" :class="snapshot.issues.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'">{{ snapshot.issues.length ? copy.attention : copy.ready }}</span></div>
					<UCard><div class="flex items-start justify-between gap-4"><div><h2 class="font-semibold text-stone-950">{{ copy.issues }}</h2><p class="mt-1 text-xs text-stone-500">{{ copy.issuesHint }}</p></div><UBadge :color="snapshot.issues.length ? 'warning' : 'success'" variant="soft" :label="String(snapshot.issues.length)" /></div><div v-if="snapshot.issues.length" class="mt-4 divide-y divide-stone-100"><div v-for="issue in snapshot.issues" :key="`${issue.kind}-${issue.label}`" class="flex items-start gap-3 py-3 first:pt-0 last:pb-0"><UIcon name="i-heroicons-exclamation-triangle-20-solid" class="mt-0.5 size-5 shrink-0 text-amber-500"/><div><p class="font-medium text-stone-900">{{ issue.label }}</p><p class="mt-0.5 text-sm text-stone-600">{{ copy[issue.kind] }}</p><p v-if="issue.detail && issue.kind !== 'store_without_team'" class="mt-0.5 text-xs text-stone-400">{{ issue.detail }}</p></div></div></div><div v-else class="mt-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-5"><p class="font-medium text-emerald-900">{{ copy.allClear }}</p><p class="mt-1 text-sm text-emerald-800">{{ copy.allClearHint }}</p></div></UCard>
					<div><h2 class="mb-3 text-sm font-semibold text-stone-900">{{ copy.checks }}</h2><div class="grid gap-3 md:grid-cols-3"><div v-for="check in checks" :key="check.label" class="rounded-md border border-stone-200 bg-white p-4"><div class="flex items-center justify-between gap-3"><p class="text-sm font-medium text-stone-700">{{ check.label }}</p><UIcon :name="check.ok ? 'i-heroicons-check-circle-20-solid' : 'i-heroicons-exclamation-triangle-20-solid'" :class="check.ok ? 'text-emerald-500' : 'text-amber-500'" class="size-5" /></div><p class="mt-3 text-2xl font-semibold text-stone-950">{{ check.value }}</p><p class="mt-1 text-xs text-stone-500">{{ check.ok ? check.okText : copy.attention }}</p></div></div></div>
				</template>
			</div>
		</template>
	</AppSidebarShell>
</template>
