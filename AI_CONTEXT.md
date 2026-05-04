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
