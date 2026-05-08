# Deployment Guide

เอกสารนี้อธิบายวิธี deploy โปรเจกต์นี้ในรูปแบบที่ตรงกับโครงสร้างปัจจุบัน:

- Backend: Express + TypeScript
- Frontend: Nuxt 4 SSR
- Database: Turso
- Cache/Queue-ish store: Redis local ใน dev หรือ Upstash ใน production

## 1) แนวทางที่ควรใช้

แนะนำให้ deploy แยก 2 services:

1. Backend service สำหรับ Express API
2. Frontend service สำหรับ Nuxt SSR

เหตุผล:

- แยก lifecycle ของ build และ deploy ได้ง่าย
- scale backend/frontend แยกกันได้
- config env ชัดเจนกว่า
- ไม่ต้องบังคับให้ Express ทำหน้าที่เป็น custom server ของ Nuxt

โครงสร้าง domain ที่เหมาะ:

- Frontend: `https://www.example.com`
- Backend: `https://api.example.com`

และตั้งค่า:

- `NUXT_PUBLIC_API_BASE=https://api.example.com/api`

## 2) Backend Deployment

### Build และ start

รันที่ root ของ repo:

```bash
npm install
npm run build:api
npm start
```

คำสั่ง runtime จริงคือ:

```bash
node dist/Server.js
```

### สิ่งที่ backend ต้องมีใน production

ต้องตั้ง env อย่างน้อย:

```dotenv
NODE_ENV=production
PORT=3000
TURSO_DATABASE_URL=libsql://your-db-name-your-org.turso.io
TURSO_AUTH_TOKEN=your_turso_token
REDIS_DRIVER=upstash
UPSTASH_REDIS_REST_URL=https://your-upstash-instance.upstash.io
UPSTASH_REDIS_REST_TOKEN=your_upstash_token
```

หมายเหตุ:

- ถ้าใช้ local Redis บนเครื่อง deploy ได้ ก็สามารถตั้ง `REDIS_DRIVER=local` และ `REDIS_URL=redis://...`
- แต่สำหรับ production ที่ deploy แบบ managed/service-based ปกติ `upstash` เหมาะกว่า

### Health check ที่ควรใช้

- `GET /healthz`
- `GET /api/health`

ถ้า platform ต้องการ health check path ให้ใช้ `/healthz`

## 3) Frontend Deployment

### Build และ start

รันในโฟลเดอร์ `frontend/`:

```bash
npm install
npm run build
node .output/server/index.mjs
```

หรือจาก root:

```bash
npm --prefix frontend install
npm run build:web
node frontend/.output/server/index.mjs
```

### สิ่งที่ frontend ต้องมีใน production

```dotenv
NUXT_PUBLIC_API_BASE=https://api.example.com/api
PORT=3001
```

หมายเหตุ:

- Nitro รองรับ `PORT` หรือ `NITRO_PORT`
- ถ้า platform inject `PORT` อัตโนมัติ ให้ใช้ค่านั้นได้เลย
- อย่าใช้ `npm run preview` เป็น production command หลัก

## 4) Reverse Proxy / Domain Routing

ถ้ามี reverse proxy เช่น Nginx, Caddy หรือ load balancer ของ platform:

- route `www.example.com` ไป Nuxt frontend
- route `api.example.com` ไป Express backend

นี่เป็นแบบที่สะอาดที่สุดสำหรับโปรเจกต์นี้

ถ้าจำเป็นต้องอยู่ domain เดียว:

- `example.com` -> frontend
- `example.com/api/*` -> backend

แต่แบบนี้ต้องตั้ง reverse proxy ให้ส่ง `/api` ไป backend โดยไม่ rewrite ผิด

## 5) ตัวอย่างลำดับ deploy จริง

### แบบแยก 2 services

1. Deploy backend ก่อน
2. ตรวจสอบว่า `https://api.example.com/healthz` ตอบปกติ
3. ตั้ง `NUXT_PUBLIC_API_BASE=https://api.example.com/api` ให้ frontend
4. Deploy frontend
5. ตรวจสอบหน้าเว็บและ API call จาก browser

## 6) Platform-Agnostic Checklist

### Backend

- Runtime เป็น Node.js
- install deps ที่ root repo
- build command: `npm run build:api`
- start command: `npm start`
- มี env ของ Turso และ Redis ครบ

### Frontend

- Runtime เป็น Node.js
- working directory เป็น `frontend`
- install command: `npm install`
- build command: `npm run build`
- start command: `node .output/server/index.mjs`
- มี `NUXT_PUBLIC_API_BASE` ถูกต้อง

### Vercel settings ที่ควรใช้

ถ้า deploy frontend นี้บน Vercel ให้ตั้งค่า project แบบนี้:

- Root Directory: `frontend`
- Framework Preset: `Nuxt.js`
- Install Command: `npm install`
- Build Command: `npm run build`
- Node.js Version: `22.x`

และต้องมี environment variable อย่างน้อย:

```dotenv
NUXT_PUBLIC_API_BASE=https://api.example.com/api
```

ข้อสำคัญ:

- ถ้าไม่ตั้ง `NUXT_PUBLIC_API_BASE` ใน production ตอนนี้ frontend จะ fallback เป็น `/api`
- fallback นี้ช่วยไม่ให้ SSR ชี้ไป `localhost`
- แต่ถ้า frontend กับ backend ไม่ได้อยู่ domain เดียวกันหรือไม่มี proxy `/api` -> backend ก็ยังต้องตั้ง env นี้ให้ถูกอยู่ดี

อาการที่พบบ่อยบน Vercel:

- deploy จาก repo root แทน `frontend`
- ใช้ Node ต่ำกว่า `20.19`
- ลืมตั้ง `NUXT_PUBLIC_API_BASE`

ทั้ง 3 อย่างนี้ทำให้ runtime พังหรือขึ้น 500 ได้

## 7) เรื่องเวอร์ชัน Node

สถานะปัจจุบันของ repo นี้:

- Frontend ปัจจุบันใช้ `Nuxt 4`
- ต้องใช้ Node `>= 20.19.0`
- แนะนำ Node `22`

ไฟล์ที่ช่วยบอกเวอร์ชัน:

- repo root: `.nvmrc`
- frontend: `frontend/.nvmrc`

## 8) ทางเลือก deployment ที่ไม่แนะนำตอนนี้

### เอา Nuxt ไป static generate อย่างเดียว

ทำได้เฉพาะตอนที่ frontend ไม่ต้องพึ่ง SSR

ตอนนี้ frontend ถูกตั้งเป็น SSR และเหมาะกับ Node server มากกว่า

### เอา Express กับ Nuxt ไปรวม process เดียว

ทำได้ แต่ไม่คุ้มสำหรับโครงสร้างนี้ เพราะ:

- backend ปัจจุบันเป็น CommonJS TypeScript app
- Nuxt ฝั่ง production เป็น Nitro/ESM server output
- การรวมกันเพิ่มความซับซ้อนเรื่อง runtime และ startup มากกว่าประโยชน์
