# O KhaiDee+ Database Setup

เครื่องมือนี้ทำงานแยกจาก Backend และ Frontend ใช้เตรียม Turso หรือ SQLite
ให้พร้อมเชื่อมต่อกับระบบ O KhaiDee+

## ติดตั้งและตั้งค่า

```bash
cd database-setup
npm install
cp config.example.json config.json
```

แก้ `config.json` ให้เป็น Database เป้าหมายและบัญชีผู้ดูแลที่ต้องการ
ไฟล์นี้มี Token และรหัสผ่าน จึงถูก ignore และไม่ถูกบันทึกลง Git

## บัญชีผู้ดูแลสองระดับ

ระบบแยกสองบทบาทนี้ขาดจากกัน คนละสิทธิ์ คนละหน้าจอ:

| บล็อกใน config | `system_role` | ใช้ทำอะไร |
| --- | --- | --- |
| `systemAdmin` | `system_admin` | ผู้ให้บริการ ดูแล `/system-admin` (monitoring, security, จัดการลูกค้า, config) เข้าหน้าร้านไม่ได้ |
| `superadmin` | `superadmin` | เจ้าของกิจการฝั่งลูกค้า เปิดร้าน จัดการพนักงานและสิทธิ์ เข้า `/system-admin` ไม่ได้ |

ระบุบล็อกไหนก็ได้หรือทั้งสองบล็อก แต่ต้องมีอย่างน้อยหนึ่ง และอีเมล/username
ต้องไม่ซ้ำกันโดยไม่สนตัวพิมพ์เล็ก-ใหญ่ username ใช้ 3–32 ตัวอักษร โดยใช้ได้เฉพาะ
`a-z`, `0-9`, `.` และ `_` เท่านั้น รหัสผ่านต้องยาวอย่างน้อย 12 ตัวอักษร

ถ้าไม่สร้าง `systemAdmin` ไว้เลย จะไม่มีใครเข้าหน้า `/system-admin` ได้
เพราะไม่มีช่องทางอื่นสร้างบัญชีระดับนี้ — `npm run check` จะเตือนให้เมื่อยังไม่มี

บทบาทระดับร้านเริ่มต้นจะถูกสร้างอัตโนมัติเมื่อมีการสร้างร้าน ได้แก่ `Owner`,
`Store Admin`, `Manager`, `Cashier` และ `Inventory Staff` โดย `Store Admin`
ใช้สำหรับผู้ช่วยที่ต้องจัดการผู้ใช้ภายในร้าน แต่ไม่ควรได้รับสิทธิ์ระดับ `superadmin`
ของระบบ

Turso ใช้ URL แบบ `libsql://...` พร้อม Token ส่วน SQLite ใช้:

```json
{
  "database": {
    "url": "file:./okhaidee.db",
    "authToken": ""
  }
}
```

## Database ใหม่

```bash
npm run check
npm run init
```

`init` สร้าง schema และบัญชีผู้ดูแลตาม `config.json` สามารถรันซ้ำได้โดยไม่ลบข้อมูล
และจะไม่เปลี่ยน username หรือรหัสผ่านของบัญชีที่มีอยู่แล้ว หากเป็นฐานเก่าที่ยังไม่มี
คอลัมน์ `username` สคริปต์จะเพิ่มคอลัมน์และสร้าง username จากอีเมลให้ก่อนสร้าง unique
index เพื่อให้รันต่อได้อย่างปลอดภัย

## Setup UI บนเครื่องผู้ดูแล

หากไม่ต้องการกรอก `config.json` หรือรันคำสั่งด้วยตัวเอง สามารถเปิด wizard แบบ responsive
สำหรับ desktop, tablet และ mobile ได้:

```bash
npm run ui
```

จากนั้นเปิด `http://127.0.0.1:4178` บนเครื่องเดียวกัน UI จะให้กรอก URL/token, ข้อมูล
System Admin และ Super Admin, ตรวจสอบการเชื่อมต่อ, ตั้งค่าฐานใหม่ หรือ reset ฐานทั้งหมด
ก่อน reset ต้องพิมพ์ `RESET <database URL>` เพื่อยืนยัน

UI รับฟังเฉพาะ `127.0.0.1` และไม่เขียน token/password ลง disk แต่ยังควรปิดหน้าต่างเมื่อเสร็จ
และห้าม expose port นี้ผ่าน proxy หรือ public network

## ล้าง Database เดิมแล้วเริ่มใหม่

```bash
npm run reset
```

ระบบจะให้พิมพ์ชื่อ Database เพื่อยืนยัน แล้วลบข้อมูลทั้งหมด สร้าง schema ใหม่
และสร้างบัญชีผู้ดูแลตาม `config.json` การดำเนินการนี้ย้อนกลับไม่ได้

## เชื่อม Backend

หลัง setup สำเร็จ ให้นำ URL และ Token เดียวกันไปใส่ `.env` ของ Backend:

```env
TURSO_DATABASE_URL=libsql://database-name-org.turso.io
TURSO_AUTH_TOKEN=TURSO_TOKEN
```

จากนั้นรัน Backend และ Frontend ตามปกติ ไม่ต้องแก้ source code โดยทุกบัญชีที่สคริปต์สร้าง
จะถูกบังคับให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบครั้งแรก

## ตัวอย่างบัญชีใน config

```json
{
  "systemAdmin": {
    "name": "Platform Operator",
    "username": "ops",
    "email": "ops@example.com",
    "password": "replace-with-a-strong-password",
    "locale": "lo"
  }
}
```

ไฟล์ schema ไม่เก็บบัญชีหรือรหัสผ่านไว้ในตัวเอง บัญชีจะถูกสร้างจาก `config.json` เท่านั้น
เพื่อไม่ให้ credential หลุดเข้า Git
