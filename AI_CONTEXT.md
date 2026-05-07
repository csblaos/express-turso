# AI Context

ไฟล์นี้สรุป context แบบสั้นและใช้งานได้ทันทีสำหรับ AI agent หรือผู้พัฒนาที่เข้ามาทำงานต่อในโปรเจกต์นี้

## 1) ภาพรวมระบบ

- โปรเจกต์นี้เป็น full-stack แบบแยกส่วน
- Backend อยู่ที่ `src/` ใช้ Express + TypeScript + Turso + Redis
- Frontend อยู่ที่ `frontend/` ใช้ Nuxt 3 แบบ SSR
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
- Frontend ตอนนี้ pin เวอร์ชันไว้ที่ `nuxt@3.8.0` และ `nuxi@3.8.0`
- สาเหตุคือเครื่องพัฒนาปัจจุบันใช้ Node `18.20.8`
- ถ้าจะอัปเกรด Nuxt เป็นเวอร์ชันใหม่ ควรอัปเกรด Node เป็น 20+ ก่อน

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
- หน้าใหม่ของ backoffice เช่น products, orders, inventory, reports, settings, superadmin, system-admin ควรใช้ shell นี้ก่อนเสมอ
- อย่าสร้าง sidebar ใหม่ในหน้า ถ้าไม่ได้มีเหตุผลเฉพาะจริง ๆ

ใช้ร่วมกับ:

- `frontend/utils/app-nav.ts`
	- เป็น source เดียวของเมนู sidebar
	- ถ้าจะเพิ่มเมนูใหม่ ให้เพิ่มที่ไฟล์นี้ก่อน

### 9.2 Modal / drawer / bottom sheet

- ใช้ `frontend/components/AppResponsivePanel.vue` เป็นตัวกลางสำหรับ:
	- desktop: right drawer
	- mobile: bottom sheet
- อย่าสร้าง overlay shell ใหม่ซ้ำ ถ้าเป็น pattern เดียวกัน

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

### 9.4 Access tabs

- หน้าในกลุ่ม settings access ให้ใช้ `frontend/components/SettingsAccessTabs.vue`
- ตอนนี้ใช้กับ:
	- `frontend/pages/settings/access/users.vue`
	- `frontend/pages/settings/access/roles.vue`

### 9.5 Auth + API composables

- ใช้ `frontend/composables/useApiClient.ts` สำหรับ API ที่ต้องแนบ bearer token
- ใช้ `frontend/composables/useAuthSession.ts` สำหรับ:
	- current user
	- permissions
	- `can("permission.key")`
	- logout / refresh token flow

ห้ามใช้ `$fetch` ตรง ๆ กับ protected API ถ้ายังไม่ได้พิจารณา auth flow

### 9.6 Route protection

- หน้าในระบบหลัง login ถูกคุมด้วย `frontend/middleware/auth.global.ts`
- หน้า login เป็น standalone ที่ `frontend/pages/login.vue`
- ถ้าสร้างหน้าใหม่ใน backoffice ไม่ต้องทำ auth guard ใหม่ซ้ำ

## 10) กติกาเวลาสร้างหน้าใหม่

### ใช้ของเดิมก่อน

ถ้าหน้าใหม่เป็นหน้าในระบบหลัก ให้ใช้ชุดนี้ก่อน:

- shell: `AppSidebarShell.vue`
- nav: `app-nav.ts`
- overlay: `AppResponsivePanel.vue`
- auth state: `useAuthSession.ts`
- auth-aware fetch: `useApiClient.ts`

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
	- drawer shell ใหม่
	- logout modal ใหม่
	- API fetch wrapper ใหม่

## 11) แนวทางเร็วสำหรับ AI เมื่อสร้างหน้าใหม่

เช็กลำดับนี้ก่อนทุกครั้ง:

1. หน้านี้เป็นหน้า login หรือหน้าในระบบหลัก
2. ถ้าเป็นหน้าในระบบหลัก ใช้ `AppSidebarShell.vue`
3. ถ้ามี detail drawer/modal ใช้ `AppResponsivePanel.vue`
4. ถ้าต้องเรียก protected API ใช้ `useApiClient.ts`
5. ถ้าต้องซ่อน/disable ปุ่มตามสิทธิ์ ใช้ `useAuthSession.ts` และ `can(...)`
6. ถ้าต้องเพิ่มเมนูใหม่ แก้ `frontend/utils/app-nav.ts`

## 12) หมายเหตุสำคัญ

- หน้า legacy บางหน้าอาจยังมีโครงเฉพาะของตัวเองอยู่ แต่ทิศทางที่ถูกต้องคือค่อย ๆ ย้ายมาใช้ shared components
- ถ้า AI จะสร้างหน้าใหม่ อย่าอิงจาก pattern เก่าที่เขียน shell ซ้ำในแต่ละหน้า ให้ยึด shared components ด้านบนเป็นมาตรฐานล่าสุด
