# Turso DB Scripts

โฟลเดอร์นี้ออกแบบให้แยกจากแอป Express ได้ สามารถคัดลอกโฟลเดอร์ `turso-db` ไปไว้ที่อื่นแล้วใช้งานได้เลย ตราบใดที่เครื่องนั้นมี:

- `node`
- `npm`

## Files

- `export.mjs` export ฐานข้อมูล Turso ออกเป็น `.sql` dump
- `restore.mjs` restore dump กลับเข้า Turso
- `shared.mjs` ฟังก์ชันกลางสำหรับโหลด `config.json`, ต่อ DB, และ utility SQL dump
- `wipe-target-db.mjs` ลบ object ทั้งหมดใน target database เพื่อเตรียม restore
- `config.example.json` ตัวอย่างค่าตั้งต้น
- `package.json` dependency ของโฟลเดอร์นี้เอง

## Setup

1. คัดลอก `config.example.json` เป็น `config.json`
2. ใส่ `source.url` / `source.authToken` และ `target.url` / `target.authToken`
3. ติดตั้ง dependency ในโฟลเดอร์นี้:

```bash
npm install
```

## Config Example

```json
{
  "source": {
    "url": "libsql://express-db-iamlex.aws-ap-northeast-1.turso.io",
    "authToken": "your_source_token"
  },
  "target": {
    "url": "libsql://another-db-your-org.turso.io",
    "authToken": "your_target_token"
  },
  "backupDir": "./backups",
  "dumpFile": "./backups/latest.sql"
}
```

ค่าของ `backupDir` และ `dumpFile` จะอิงจากโฟลเดอร์ `script/turso-db` เสมอ ไม่ได้อิงจากตำแหน่งที่คุณสั่งรันคำสั่ง

## Export

export จาก `source.url` ใน `config.json`:

```bash
node export.mjs
```

สคริปต์จะเขียนไฟล์ไปที่ `dumpFile` ใน `config.json` ถ้าค่านี้ว่าง จะ fallback ไปสร้างไฟล์ timestamp ใน `backupDir`
ดังนั้นถ้าตั้ง `./backups/latest.sql` ไฟล์จะถูกเก็บที่ `script/turso-db/backups/latest.sql`

## Restore

restore เข้า DB ปลายทางจาก `target.url` ใน `config.json`:

```bash
node restore.mjs
```

สคริปต์จะอ่านไฟล์จาก `dumpFile` ใน `config.json`
ถ้า `dumpFile` ว่าง จะ fallback ไปที่ `script/turso-db/backups/latest.sql`

## Clean Target

ล้าง table, view, trigger, และ index ทั้งหมดใน target database:

```bash
npm run wipe:target-db
```

หรือ

```bash
node wipe-target-db.mjs
```

สคริปต์นี้เป็น destructive operation ใช้สำหรับเตรียม target database ก่อน restore

## Important Notes

- สคริปต์นี้รองรับ `libsql://...` และ `authToken` โดยตรง
- `restore.mjs` ใช้ได้เฉพาะกับ target database ที่สร้างไว้แล้วและมี `target.url` / `target.authToken`
- ถ้าจะ restore เข้า database เดิม ควรเป็น database ว่าง เพราะไฟล์ dump มีทั้ง schema และข้อมูล
- `wipe-target-db.mjs` จะลบ object ฝั่ง target ทั้งหมดก่อน restore ถ้าคุณเลือกใช้มัน
- `export.mjs` ใช้ `@libsql/client` เพื่ออ่าน schema และข้อมูลจาก DB ต้นทาง แล้วประกอบเป็น SQL dump
- `restore.mjs` แบบปกติใช้ `@libsql/client` และ `executeMultiple()` เพื่อรัน dump เข้า DB ปลายทาง
- อย่า commit `config.json` เพราะมี token จริงอยู่ในไฟล์
