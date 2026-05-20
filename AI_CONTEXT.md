# AI Context

ไฟล์นี้สรุป context แบบสั้นและใช้งานได้ทันทีสำหรับ AI agent หรือผู้พัฒนาที่เข้ามาทำงานต่อในโปรเจกต์นี้

## 1) ภาพรวมระบบ

- โปรเจกต์นี้เป็น full-stack แบบแยกส่วน
- Backend อยู่ที่ `src/` ใช้ Express + TypeScript + Turso + Redis
- Frontend อยู่ที่ `frontend/` ใช้ Nuxt 4 แบบ SSR
- API ของ backend ถูก mount ใต้ path `/api`
- หน้าเว็บ Nuxt เรียก backend ผ่าน `NUXT_PUBLIC_API_BASE`

## 2) โครงสร้างสำคัญ

- `src/Server.ts`: entrypoint ของ Express, โหลด env, register module-alias, connect DB/Redis, start server
- `src/App.ts`: ตั้งค่า Express middleware, `/healthz`, mount router `/api`, error handling
- `src/routers/*`: route layer
- `src/controllers/*`: controller layer
- `src/components/*`: business logic layer
- `src/interfaces/*`: data access layer
- `src/connections/*`: DB/Redis/external connection layer
- `frontend/nuxt.config.ts`: config หลักของ Nuxt
- `frontend/pages/index.vue`: หน้าแรกตัวอย่างที่เช็คสถานะ API

## 3) คำสั่งหลัก

- ติดตั้ง backend deps: `npm install`
- ติดตั้ง frontend deps: `npm --prefix frontend install`
- รันทั้งระบบ dev: `npm run dev`
- รัน backend อย่างเดียว: `npm run dev:api`
- รัน frontend อย่างเดียว: `npm run dev:web`
- build ทั้งระบบ: `npm run build`
- build backend: `npm run build:api`
- build frontend: `npm run build:web`

## 4) Port และ URL

- Backend dev default: `http://localhost:3000`
- Backend health: `http://localhost:3000/healthz`
- Backend API health: `http://localhost:3000/api/health`
- Frontend dev default: `http://localhost:3001`

## 5) Environment Variables

Backend ใช้ `.env`

- `NODE_ENV`
- `PORT`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `DATABASE_URL` สำหรับ local SQLite fallback
- `REDIS_DRIVER`
- `REDIS_URL`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

Frontend ใช้ `frontend/.env` หรือ env จาก platform

- `NUXT_PUBLIC_API_BASE`

ค่าที่ควรใช้ใน production:

- `NUXT_PUBLIC_API_BASE=https://api.your-domain.com/api`

## 6) ข้อจำกัดสำคัญ

- Backend ตอนนี้ build เป็น CommonJS ผ่าน TypeScript
- Frontend ตอนนี้ใช้ `Nuxt 4`
- ต้องใช้ Node `>= 20.19.0`
- แนะนำใช้ Node `22` หรือ `24`

## 7) แนวทางแก้ไขที่ควรรักษาไว้

- อย่าย้าย Nuxt เข้าไปรวมใน process เดียวกับ Express โดยไม่มีเหตุผลชัดเจน
- ให้ frontend และ backend deploy แยกกันเป็นคนละ service จะดูแลง่ายกว่า
- ให้ backend รับผิดชอบ DB/Redis ทั้งหมด
- ให้ frontend คุยกับ backend ผ่าน public API base เท่านั้น

## 8) Deployment Snapshot

- Backend production command: `npm start`
- Frontend production entry: `node .output/server/index.mjs` ภายใต้โฟลเดอร์ `frontend/`
- อ่านรายละเอียดเพิ่มใน `DEPLOYMENT.md`

## 9) Shared UI ที่ต้อง reuse ก่อนสร้างใหม่

ส่วนนี้สำคัญสำหรับ AI agent หรือผู้พัฒนาที่จะสร้างหน้าใหม่ใน `frontend/`

### 9.1 App shell / sidebar

- ใช้ `frontend/components/AppSidebarShell.vue` สำหรับทุกหน้าในระบบหลัง login
- ใช้ `frontend/components/AppTopNavbar.vue` เป็น top navbar กลางที่อยู่ใน shell เดียวกัน
- ใช้ `frontend/components/AppPageHeader.vue` สำหรับ header ของแต่ละหน้า
- หน้าใหม่ของ backoffice เช่น products, orders, inventory, reports, settings, superadmin, system-admin ควรใช้ shell นี้ก่อนเสมอ
- อย่าสร้าง sidebar ใหม่ในหน้า ถ้าไม่ได้มีเหตุผลเฉพาะจริง ๆ
- อย่าสร้าง top navbar ใหม่ซ้ำ
- อย่าสร้าง page header pattern ใหม่ ถ้ายังเป็นโครง title + description + badges + actions แบบเดิม

ใช้ร่วมกับ:

- `frontend/utils/app-nav.ts`
	- เป็น source เดียวของเมนู sidebar
	- ถ้าจะเพิ่มเมนูใหม่ ให้เพิ่มที่ไฟล์นี้ก่อน

### 9.2 Modal / drawer / bottom sheet

- ใช้ `frontend/components/AppResponsivePanel.vue` เป็นตัวกลางสำหรับ:
	- desktop: right drawer
	- mobile: bottom sheet
- อย่าสร้าง overlay shell ใหม่ซ้ำ ถ้าเป็น pattern เดียวกัน
- มาตรฐานความกว้างบน desktop สำหรับ modal/panel กลุ่ม “สร้างข้อมูล” ให้ใช้ `desktop-width="680px"` (เช่น modal เพิ่มสินค้า)

หน้าที่ใช้แล้ว:

- `frontend/pages/activity.vue`
- `frontend/pages/settings/access/users.vue`
- `frontend/pages/settings/access/roles.vue`

ดังนั้นถ้าหน้าใหม่ต้องมี:

- detail panel
- create/edit drawer
- duplicate form
- reset password
- audit detail

ให้ใช้ `AppResponsivePanel.vue` ก่อนเสมอ

### 9.3 Logout confirm

- ใช้ `frontend/components/LogoutConfirmModal.vue`
- อย่าเขียน modal logout ซ้ำในแต่ละหน้า

### 9.4 Shared loading icon

- ใช้ `frontend/components/AppLoadingIcon.vue` เมื่อต้องการ icon ที่สลับระหว่างสถานะปกติและสถานะ loading
- component นี้รองรับ:
	- `loading`
	- `idleIcon`
	- `loadingIcon`
	- `sizeClass`
- ใช้กับปุ่มที่ต้องการ spinner แบบ icon หมุน เช่น login, save, refresh
- อย่าเขียน `UIcon + animate-spin + ternary icon` ซ้ำในแต่ละหน้า ถ้าเป็น pattern เดียวกัน

### 9.5 Access tabs

- หน้าในกลุ่ม settings access ให้ใช้ `frontend/components/SettingsAccessTabs.vue`
- ตอนนี้ใช้กับ:
	- `frontend/pages/settings/access/users.vue`
	- `frontend/pages/settings/access/roles.vue`

### 9.6 Auth + API composables

- ใช้ `frontend/composables/useApiClient.ts` สำหรับ API ที่ต้องแนบ bearer token
- ใช้ `frontend/composables/useAuthSession.ts` สำหรับ:
	- current user
	- permissions
	- `can("permission.key")`
	- logout / refresh token flow

ห้ามใช้ `$fetch` ตรง ๆ กับ protected API ถ้ายังไม่ได้พิจารณา auth flow

### 9.7 Route protection

- หน้าในระบบหลัง login ถูกคุมด้วย `frontend/middleware/auth.global.ts`
- หน้า login เป็น standalone ที่ `frontend/pages/login.vue`
- ถ้าสร้างหน้าใหม่ใน backoffice ไม่ต้องทำ auth guard ใหม่ซ้ำ

### 9.8 Current backoffice style baseline

- ถ้าผู้ใช้สั่งว่า `do same style` หรือ `same style as latest page` โดยไม่ได้ระบุหน้าอื่นชัดเจน
	- ให้ยึด `frontend/pages/settings/categories.vue` เป็น baseline ล่าสุด
- baseline นี้ครอบคลุม pattern หลักของหน้า backoffice:
	- `AppSidebarShell` + `AppPageHeader`
	- overview stats card ด้านบน
	- list container แบบ bordered section
	- list header bar พร้อม summary pill ด้านขวา
	- scrollable list body
	- sticky pagination footer
	- `AppResponsivePanel` สำหรับ create/edit/delete flows
	- ปุ่มใน modal ใช้ shared loading icon style ผ่าน `AppButton` + `icon` + `spin-icon-on-loading`
	- delete confirm ใช้ modal confirm ในระบบ ไม่ใช้ browser `alert` / `confirm`
	- ปุ่ม save/update ควร disabled จนกว่าข้อมูลจะเปลี่ยนจริง
- ถ้าผู้ใช้บอกให้ `same style as /superadmin/users`
	- ให้ตีความว่าต้องออกมาใกล้เคียง baseline ของ `settings/categories` ด้วย เพราะหน้านี้ถูกเก็บให้ align กับ users pattern แล้ว

## 10) กติกาเวลาสร้างหน้าใหม่

### ใช้ของเดิมก่อน

ถ้าหน้าใหม่เป็นหน้าในระบบหลัก ให้ใช้ชุดนี้ก่อน:

- shell: `AppSidebarShell.vue`
- top navbar: `AppTopNavbar.vue` ผ่าน shell
- page header: `AppPageHeader.vue`
- nav: `app-nav.ts`
- overlay: `AppResponsivePanel.vue`
- loading icon: `AppLoadingIcon.vue`
- auth state: `useAuthSession.ts`
- auth-aware fetch: `useApiClient.ts`

### Reuse rules แบบบังคับ

ถ้าพฤติกรรมหรือโครงหน้าตาเหมือนของเดิม ให้ reuse ก่อนเสมอ

- หน้าในระบบหลัง login:
	- ต้องเริ่มจาก `AppSidebarShell.vue`
- หน้าใหม่ที่มี title/description/actions:
	- ต้องเช็ก `AppPageHeader.vue` ก่อน
- modal / drawer / bottom sheet:
	- ต้องเช็ก `AppResponsivePanel.vue` ก่อน
- loading icon บนปุ่ม:
	- ต้องเช็ก `AppLoadingIcon.vue` ก่อน
- logout confirm:
	- ต้องใช้ `LogoutConfirmModal.vue`
- protected API:
	- ต้องใช้ `useApiClient.ts`
- permission visibility:
	- ต้องใช้ `useAuthSession.ts` และ `can(...)`
- sidebar menu:
	- ต้องแก้ผ่าน `frontend/utils/app-nav.ts`

### ควรสร้าง component ใหม่เมื่อไร

ค่อยสร้าง component ใหม่เมื่อ:

- content ภายในมีโครงเฉพาะจริง ๆ
- มีการใช้ซ้ำอย่างน้อย 2 หน้า
- shared component เดิมไม่พอโดยไม่ต้อง hack class/props มากเกินไป

ตัวอย่าง:

- สร้างใหม่ได้:
	- `UserPermissionMatrix.vue`
	- `RoleFormFields.vue`
	- `ReportMetricCard.vue`
- ไม่ควรสร้างใหม่:
	- sidebar ใหม่
	- top navbar ใหม่
	- page header ใหม่
	- drawer shell ใหม่
	- loading icon spinner logic ใหม่
	- logout modal ใหม่
	- API fetch wrapper ใหม่

## 11) แนวทางเร็วสำหรับ AI เมื่อสร้างหน้าใหม่

เช็กลำดับนี้ก่อนทุกครั้ง:

1. หน้านี้เป็นหน้า login หรือหน้าในระบบหลัก
2. ถ้าเป็นหน้าในระบบหลัก ใช้ `AppSidebarShell.vue`
3. ถ้าหน้านี้มี header มาตรฐาน ใช้ `AppPageHeader.vue`
4. ถ้ามี detail drawer/modal ใช้ `AppResponsivePanel.vue`
5. ถ้ามี loading icon บนปุ่ม ใช้ `AppLoadingIcon.vue`
6. ถ้าต้องเรียก protected API ใช้ `useApiClient.ts`
7. ถ้าต้องซ่อน/disable ปุ่มตามสิทธิ์ ใช้ `useAuthSession.ts` และ `can(...)`
8. ถ้าต้องเพิ่มเมนูใหม่ แก้ `frontend/utils/app-nav.ts`
9. ถ้าผู้ใช้บอกว่า `same style`
	- default ไปที่ `frontend/pages/settings/categories.vue` ก่อน ยกเว้นผู้ใช้ระบุหน้าอ้างอิงอื่นชัดเจน

## 12) หมายเหตุสำคัญ

- หน้า legacy บางหน้าอาจยังมีโครงเฉพาะของตัวเองอยู่ แต่ทิศทางที่ถูกต้องคือค่อย ๆ ย้ายมาใช้ shared components
- ถ้า AI จะสร้างหน้าใหม่ อย่าอิงจาก pattern เก่าที่เขียน shell ซ้ำในแต่ละหน้า ให้ยึด shared components ด้านบนเป็นมาตรฐานล่าสุด

## 13) Current product + PO context

- สไตล์ฐานที่ต้องยึดตอนนี้คือ `/products`, `/inventory`, และหน้า PO ที่ปรับแล้วให้ใกล้เคียงกัน
- modal หลักของสินค้า/PO ใช้ `desktop-width="680px"` เป็นค่าเริ่มต้น และใช้ header/footer แบบเต็มขอบ
- pattern ของ modal/drawer ด้วย `AppResponsivePanel.vue` (สำคัญ):
	- ใส่ `content-class="flex h-full flex-col !overflow-y-hidden overflow-hidden"` แล้วสร้าง layout ภายในเป็น `grid-rows-[minmax(0,1fr)_auto]`
	- body scroll ใช้ `scrollbar-soft min-h-0 overflow-y-auto px-0 py-2 sm:px-0 sm:py-2`
	- footer ใช้ full-width bar + ยกขึ้นเหนือคีย์บอร์ดด้วย `:style="{ transform: 'translateY(calc(-1 * var(--app-panel-keyboard-inset)))' }"`
- ตัวเลขเงินทั้งระบบแสดงเป็น `100₭ / 100฿ / 100$` ไม่แสดง `LAK / THB / USD` ต่อท้ายจำนวนเงิน
- PO flow:
	- `Draft` แก้ได้เต็ม
	- `Draft` ใน modal รายละเอียดมี action `ยืนยันสั่งซื้อ` ที่ footer
	- `Ordered` แก้ได้เฉพาะต้นทุน / rate / shipping / other cost
	- `Received` ล็อกข้อมูล
	- รองรับ `receive now / partial / later`
- `ยังไม่รับตอนนี้` ตอนนี้เปลี่ยนสถานะเป็น `arrived` เพื่อบอกว่า PO มาถึงแล้วแต่ยังไม่ตัด stock
- Store finance now has `cost_method` (`average` / `fifo`) and keeps change history; POS selling stays unchanged
- PO detail ควรเปิดเร็วที่สุด และใช้ inline loading bar ใต้ header card เท่านั้น
- sensitive multi-step writes ต้องใช้ libSQL write transaction เดียว (`db.transaction("write")`) เสมอ เช่น `PO create`, `PO receive`, `inventory adjust`, และ `store currency rate update`
- ถ้าผู้ใช้บอกว่า `same style` โดยไม่ระบุหน้าอื่น ให้ยึด layout จาก `/products` และ `/inventory` เป็นหลัก
