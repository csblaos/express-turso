# O KhaiDee+ Database Setup

เครื่องมือนี้ทำงานแยกจาก Backend และ Frontend ใช้เตรียม Turso หรือ SQLite
ให้พร้อมเชื่อมต่อกับระบบ O KhaiDee+

## ติดตั้งและตั้งค่า

```bash
cd database-setup
npm install
cp config.example.json config.json
```

แก้ `config.json` ให้เป็น Database เป้าหมายและบัญชี Super Admin ที่ต้องการ
ไฟล์นี้มี Token และรหัสผ่าน จึงถูก ignore และไม่ถูกบันทึกลง Git

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

`init` สร้าง schema และ Super Admin สามารถรันซ้ำได้โดยไม่ลบข้อมูล
และจะไม่เปลี่ยนรหัสผ่านของบัญชีที่มีอยู่แล้ว

## ล้าง Database เดิมแล้วเริ่มใหม่

```bash
npm run reset
```

ระบบจะให้พิมพ์ชื่อ Database เพื่อยืนยัน แล้วลบข้อมูลทั้งหมด สร้าง schema ใหม่
และสร้าง Super Admin ตาม `config.json` การดำเนินการนี้ย้อนกลับไม่ได้

## เชื่อม Backend

หลัง setup สำเร็จ ให้นำ URL และ Token เดียวกันไปใส่ `.env` ของ Backend:

```env
TURSO_DATABASE_URL=libsql://database-name-org.turso.io
TURSO_AUTH_TOKEN=TURSO_TOKEN
```

จากนั้นรัน Backend และ Frontend ตามปกติ ไม่ต้องแก้ source code โดย Super Admin
จะถูกบังคับให้เปลี่ยนรหัสผ่านหลังเข้าสู่ระบบครั้งแรก
