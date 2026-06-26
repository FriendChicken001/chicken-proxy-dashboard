# 🐔 Chicken Stealth — Proxy App Icon

ไอคอนไก่ใส่แว่นดำ ธีม proxy / intercept traffic
พื้นกรมท่าไล่เฉด + เส้นสัญญาณ intercept มุมบน

## โครงสร้างไฟล์

```
icon.svg                  ต้นฉบับเวกเตอร์ (มุมโค้ง, พื้นหลังโปร่งใสนอกมุม) — แก้ต่อได้
icon-square.svg           ต้นฉบับเวกเตอร์ (สี่เหลี่ยมเต็ม, ทึบ) สำหรับ iOS
favicon.ico               favicon เว็บ (16/32/48/64)
AppIcon.icns              ไอคอน macOS พร้อมใช้
AppIcon.iconset/          ชุด PNG ตามชื่อมาตรฐาน macOS (ไว้ gen .icns ใหม่)
png/                      PNG มุมโค้งโปร่งใส 16–1024 (ใช้ทั่วไป / เว็บ / Electron)
ios/                      PNG สี่เหลี่ยมทึบครบทุกขนาดของ iOS (App Store-safe, ไม่มี alpha)
```

## วิธีใช้

### iOS (Xcode)
ลากไฟล์ใน `ios/` เข้า Assets.xcassets > AppIcon ตามขนาด
หรือใช้ `Icon-1024-AppStore-1024.png` กับ single-size asset แล้วให้ Xcode ย่อเอง
หมายเหตุ: ไอคอน iOS ห้ามมี transparency — โฟลเดอร์ `ios/` เป็นแบบทึบแล้ว

### macOS
ใช้ `AppIcon.icns` ได้เลย
ถ้าอยากสร้าง .icns ใหม่จาก iconset บนเครื่อง Mac:
```bash
iconutil -c icns AppIcon.iconset -o AppIcon.icns
```

### เว็บ / favicon
```html
<link rel="icon" href="favicon.ico" sizes="any">
<link rel="icon" type="image/png" sizes="32x32" href="png/icon-32.png">
<link rel="apple-touch-icon" href="ios/Icon-180-iPhone-60@3x.png">
```

### Flutter (cardx-app)
ใช้ flutter_launcher_icons ชี้ไปที่ `png/icon-1024.png`:
```yaml
flutter_launcher_icons:
  android: true
  ios: true
  image_path: "png/icon-1024.png"
  adaptive_icon_background: "#1C1E38"
  adaptive_icon_foreground: "png/icon-1024.png"
```

### แก้ไขต่อ
เปิด `icon.svg` ใน Figma / Illustrator / Inkscape
สีหลัก: พื้น #2C2F58→#15172C · หงอน/เหนียง #E8392E · จะงอย #F6A623 · แว่น #15151D · เส้นขอบ #2A1C12

— สร้างจากเวกเตอร์ คมทุกขนาด
