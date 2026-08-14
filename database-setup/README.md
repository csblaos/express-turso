# O KhaiDee+ Database Setup

เครื่องมือแยกจาก Backend และ Frontend สำหรับสร้าง อัปเดต ตรวจสอบ หรือ reset
Turso/libSQL และ SQLite ให้พร้อมใช้กับ O KhaiDee+

## Requirements

- Node.js 18 ขึ้นไป
- npm
- Turso Database URL และ Auth token ถ้าใช้ฐานข้อมูล remote

## ติดตั้ง

```bash
cd database-setup
npm install
```

เลือกใช้ได้สองแบบ:

1. CLI: สร้าง `config.json` แล้วรันคำสั่ง npm
2. Local Setup UI: รัน `npm run ui` แล้วกรอกข้อมูลใน Browser โดยไม่ต้องสร้าง `config.json`

## ตั้งค่า CLI

```bash
cp config.example.json config.json
```

แก้ `config.json` ให้ชี้ไปที่ Database เป้าหมายและกำหนดบัญชีผู้ดูแล:

```json
{
  "database": {
    "url": "libsql://your-database-name-your-org.turso.io",
    "authToken": "your-turso-auth-token"
  },
  "systemAdmin": {
    "name": "Platform Operator",
    "username": "ops",
    "email": "ops@example.com",
    "password": "secret123",
    "locale": "lo"
  },
  "superadmin": {
    "name": "Store Owner",
    "username": "owner",
    "email": "owner@example.com",
    "password": "secret456",
    "locale": "lo"
  }
}
```

`config.json` มี token และรหัสผ่าน จึงถูก ignore และต้องไม่ commit เข้า Git

### SQLite local

SQLite ใช้ URL ขึ้นต้นด้วย `file:` และไม่ต้องใช้ Auth token:

```json
{
  "database": {
    "url": "file:./okhaidee.db",
    "authToken": ""
  }
}
```

## กฎของบัญชีผู้ดูแล

CLI ทุกคำสั่งต้องมีบล็อก `systemAdmin` หรือ `superadmin` อย่างน้อยหนึ่งบล็อกใน `config.json`
แม้คำสั่ง `check` และ `migrate` จะไม่สร้างบัญชีใหม่ก็ตาม

| Config block | `system_role` | ขอบเขตการใช้งาน |
| --- | --- | --- |
| `systemAdmin` | `system_admin` | ผู้ดูแลแพลตฟอร์ม ใช้ `/system-admin` และเข้า workspace ของร้านไม่ได้ |
| `superadmin` | `superadmin` | เจ้าของกิจการ สร้างร้านและจัดการพนักงาน เข้า `/system-admin` ไม่ได้ |

กฎ validation:

- `name` ห้ามว่าง
- `username` มี 3–32 ตัว ต้องขึ้นต้นด้วยตัวอักษรหรือตัวเลข และใช้ได้เฉพาะ `a-z`, `0-9`, `.`, `_`
- username จะถูกแปลงเป็นตัวพิมพ์เล็ก
- `email` ต้องมี `@`
- `password` ขั้นต่ำ 6 ตัวอักษร
- ถ้าระบุทั้งสองบัญชี email และ username ต้องไม่ซ้ำกันโดยไม่สนตัวพิมพ์เล็ก-ใหญ่
- `locale` ค่าเริ่มต้นคือ `lo`

ถ้าไม่มี System Admin หน้า `/system-admin` จะไม่มีผู้เข้าใช้งาน และ `npm run check` จะแสดงคำเตือน

## คำสั่ง

### `npm run init`

เหมาะกับ Database ใหม่:

- สร้าง schema จาก `schema.sql`
- ใช้ migration ล่าสุดเพิ่มตาราง/คอลัมน์/ดัชนีที่ยังขาด
- สร้าง System Admin และ/หรือ Super Admin จาก `config.json`
- รันซ้ำได้โดยไม่ลบข้อมูล
- ถ้ามีบัญชี email เดิมอยู่แล้ว จะไม่เปลี่ยน username หรือรหัสผ่าน

```bash
npm run init
npm run check
```

บัญชีที่สร้างใหม่จะถูก hash รหัสผ่านด้วย bcrypt และตั้ง `must_change_password = 1`
เพื่อบังคับเปลี่ยนรหัสผ่านหลังเข้าระบบครั้งแรก

### `npm run migrate`

อัปเดต Database เดิมแบบ idempotent:

- ไม่ลบข้อมูล
- ไม่สร้างบัญชีผู้ดูแลใหม่
- เพิ่ม schema และ migration ที่ยังขาด
- ถ้าฐานเก่ายังไม่มี `users.username` จะเพิ่มคอลัมน์ สร้าง username จาก email และหลีกเลี่ยงค่าซ้ำก่อนสร้าง unique index

```bash
npm run check
npm run migrate
npm run check
```

### `npm run check`

ตรวจการเชื่อมต่อและสถานะโดยไม่แก้ไขข้อมูล:

- Database เป้าหมาย
- schema version ปัจจุบัน
- ตารางหรือคอลัมน์ที่ยังขาด
- จำนวนตาราง
- จำนวน System Admin และ Super Admin

```bash
npm run check
```

### `npm run reset`

> **อันตราย:** ลบ table, view, trigger, index และข้อมูลทั้งหมดใน Database เป้าหมาย กู้คืนจากเครื่องมือนี้ไม่ได้

CLI แสดง Database เป้าหมายและบังคับพิมพ์ `RESET <database label>` ให้ตรงก่อนลบ
หลังจากนั้นจะสร้าง schema และบัญชีผู้ดูแลจาก `config.json` ใหม่

```bash
npm run reset
```

## Local Setup UI

```bash
npm run ui
```

เปิด `http://127.0.0.1:4178` ในเครื่องเดียวกัน UI รองรับ desktop, tablet และ mobile

ถ้า port 4178 ถูกใช้อยู่:

```bash
SETUP_UI_PORT=4179 npm run ui
```

UI ทำได้ดังนี้:

- เลือก Turso/libSQL หรือ SQLite
- ตรวจ connection ด้วย Database URL/Auth token
- กรอก System Admin และ Super Admin
- รัน `init`, `migrate` หรือ `reset`
- คัดลอกผลการทำงาน

ปุ่ม **ตรวจสอบการเชื่อมต่อ** ตรวจเฉพาะ URL และ token ด้วย `SELECT 1`
โดยไม่ตรวจชื่อ username email หรือ password ของบัญชีผู้ดูแล
ข้อมูลบัญชีจะถูก validate เมื่อรัน action กับ Database

Reset ใน UI ต้องพิมพ์ `RESET <database URL>` ให้ตรงก่อส่ง request และ server จะตรวจซ้ำอีกครั้ง

### ความปลอดภัยของ UI

- รับฟังเฉพาะ `127.0.0.1` โดยค่าเริ่มต้น
- ไม่เขียน URL, token หรือรหัสผ่านลง disk
- request body ถูกจำกัดที่ 64 KiB
- action ที่แก้ไข Database ไม่ถูกรันซ้อนกันผ่าน UI
- ห้าม expose port นี้ผ่าน public proxy หรือเปิดให้เครือข่ายภายนอกเข้าถึง
- ปิด process ด้วย `Ctrl+C` เมื่อใช้งานเสร็จ

## เชื่อมต่อ Backend

หลัง `init` หรือ `migrate` สำเร็จ นำ URL และ token เดียวกันไปตั้งค่าใน `.env` ของ Backend:

```env
TURSO_DATABASE_URL=libsql://database-name-org.turso.io
TURSO_AUTH_TOKEN=TURSO_TOKEN
```

สำหรับ SQLite:

```env
DATABASE_URL=file:./database.db
```

จากนั้นเริ่ม Backend และ Frontend ได้ตามปกติ โดยบัญชีที่เครื่องมือสร้างจะถูกบังคับให้เปลี่ยนรหัสผ่าน
หลังเข้าระบบครั้งแรก

## ไฟล์สำคัญ

| ไฟล์ | หน้าที่ |
| --- | --- |
| `config.example.json` | ตัวอย่าง config สำหรับ CLI |
| `config.json` | config จริงในเครื่อง ถูก ignore จาก Git |
| `schema.sql` | schema หลักของระบบ |
| `migrations.mjs` | migration และการตรวจ schema version ล่าสุด |
| `setup.mjs` | validation, connect, init, migrate, check และ reset |
| `setup-ui.mjs` | Local Setup UI และ HTTP API บน `127.0.0.1` |

## ข้อควรระวัง Production

- Backup Database ก่อรัน `migrate` หรือ `reset`
- รัน `npm run check` ก่อนและหลัง migration
- ตรวจ Database URL/hostname ให้แน่ใจก่อ reset
- แม้ validation อนุญาตรหัสผ่านขั้นต่ำ 6 ตัว ควรใช้รหัสผ่านที่ยาวและคาดเดายากสำหรับ Production
- ห้าม commit `config.json`, `.env` หรือ token จริงเข้า Git
