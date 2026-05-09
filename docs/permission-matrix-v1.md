# Permission Matrix v1

เอกสารนี้ใช้เป็นมาตรฐานกลางของสิทธิ์แบบ `resource.action` สำหรับระบบ POS

## Design Rules

1. ใช้คีย์รูปแบบ `resource.action`
2. แยก `view` ออกจาก `create/update/archive` ชัดเจน
3. ให้ใช้ `archive` แทน `delete` สำหรับข้อมูลธุรกิจหลัก
4. ทุก endpoint ต้องเช็ค permission ฝั่ง API เสมอ
5. ช่วง migration รองรับคีย์เก่าผ่าน compatibility alias

## Core Permissions

| Resource | View | Create | Update | Archive/Delete | Special |
| --- | --- | --- | --- | --- | --- |
| products | `products.view` | `products.create` | `products.update` | `products.archive` | `products.update_cost` |
| inventory | `inventory.view` | - | `inventory.adjust` | - | - |
| activity | `activity.view` | - | - | - | - |
| purchase_orders | `purchase_orders.view` | `purchase_orders.create` | `purchase_orders.update` | `purchase_orders.cancel` | `purchase_orders.receive` |
| reports | `reports.view` | - | - | - | `reports.export` |
| stores | `stores.view` | `stores.create` | `stores.update` | `stores.archive` | - |
| settings | `settings.view` | - | - | - | - |
| settings.users | `settings.users.view` | `settings.users.create` | `settings.users.update` | `settings.users.suspend` | `settings.users.assign_role`, `settings.users.reset_password` |
| settings.roles | `settings.roles.view` | `settings.roles.create` | `settings.roles.update` | `settings.roles.archive` | - |
| settings.store | `settings.store.view` | `settings.store.create` | `settings.store.update` | `settings.store.archive` | - |
| superadmin.users | `superadmin.users.view` | `superadmin.users.create` | `superadmin.users.update` | `superadmin.users.archive` | - |
| superadmin.stores | `superadmin.stores.view` | `superadmin.stores.create` | `superadmin.stores.update` | `superadmin.stores.archive` | - |
| superadmin.roles | `superadmin.roles.view` | `superadmin.roles.create` | `superadmin.roles.update` | `superadmin.roles.archive` | - |
| system_admin.clients | `system_admin.clients.view` | `system_admin.clients.create` | `system_admin.clients.update` | `system_admin.clients.delete` | - |
| system_admin.dashboard | `system_admin.dashboard.view` | - | - | - | - |
| system_admin.monitoring | `system_admin.monitoring.view` | - | - | - | - |
| system_admin.security | `system_admin.security.view` | - | - | - | - |
| system_admin.config | - | - | `system_admin.config.update` | - | - |

## Suggested Preset Roles

### Cashier
- `products.view`
- `inventory.view`
- `purchase_orders.view`

### Inventory Manager
- Cashier ทั้งหมด
- `inventory.adjust`
- `purchase_orders.create`
- `purchase_orders.receive`

### Store Manager
- Inventory Manager ทั้งหมด
- `products.create`
- `products.update`
- `products.archive`
- `settings.users.view`
- `settings.users.create`
- `settings.users.update`
- `settings.users.suspend`
- `settings.users.assign_role`
- `settings.users.reset_password`

### Superadmin
- `superadmin.users.*`
- `superadmin.stores.*`
- `superadmin.roles.*`
- `settings.roles.*`
- `settings.store.*`

### System Admin
- `system_admin.dashboard.view`
- `system_admin.monitoring.view`
- `system_admin.security.view`
- `system_admin.clients.*`
- `system_admin.config.update`

## Migration Notes

1. คีย์เก่า `manage_*`, `*.read`, `*.deactivate` ยังใช้งานได้ผ่าน compatibility
2. งานใหม่ให้ใช้คีย์ใหม่เท่านั้น
3. เมื่อ telemetry ยืนยันว่าไม่มีการใช้คีย์เก่าแล้ว ค่อยถอด compatibility
