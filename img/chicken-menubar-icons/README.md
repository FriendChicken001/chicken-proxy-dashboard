# 🐔 Chicken Proxy — macOS Menu Bar Icons

ไอคอน status bar 2 สถานะ แนวเดียวกับ App Icon (Stealth)
ไก่หงอนหัวใจ — เอกลักษณ์เดียวกับแบรนด์

- **Active** — ไก่ใส่แว่น ทึบตัน = proxy กำลังทำงาน
- **Paused** — ไก่เส้นขอบกลวง หลับตา + z = พัก proxy

## สำคัญ: เป็น Template Image
ไฟล์เป็นขาวดำโปร่งใส (template) — macOS จะ tint สีให้เอง
ดำอัตโนมัติบนแถบสว่าง / ขาวบนแถบมืด ห้ามใส่สีเอง

## ไฟล์
```
Template-PNG/
  ProxyActiveTemplate.png        18×18  (@1x)
  ProxyActiveTemplate@2x.png     36×36  (@2x, จอ Retina)
  ProxyActiveTemplate-22.png     22×22  (สำหรับแถบสูง 22pt)
  ProxyActiveTemplate-22@2x.png  44×44
  ProxyPausedTemplate.*          เหมือนกันสำหรับสถานะพัก
svg/                              ต้นฉบับเวกเตอร์ แก้ต่อได้ (กริด 36×36)
preview.png                       ตัวอย่างบนแถบสว่าง/มืด
```
ขนาดหลักที่ใช้คือคู่ 18 / 36 (@1x / @2x)

## วิธีใช้ (AppKit / NSStatusItem)
```swift
let statusItem = NSStatusBar.system.statusItem(withLength: NSStatusItem.variableLength)

func setProxy(active: Bool) {
    let name = active ? "ProxyActiveTemplate" : "ProxyPausedTemplate"
    let img = NSImage(named: name)
    img?.isTemplate = true          // สำคัญ: ให้ระบบ tint เอง
    statusItem.button?.image = img
}
```
ใส่ไฟล์ใน Assets.xcassets ตั้งชื่อ image set ลงท้าย "Template"
หรือเปิด Render As: Template Image ใน Attributes inspector
Xcode จะรวม @1x/@2x ให้อัตโนมัติ

## SwiftUI (MenuBarExtra, macOS 13+)
```swift
MenuBarExtra {
    // เมนู
} label: {
    Image(isRunning ? "ProxyActiveTemplate" : "ProxyPausedTemplate")
        .renderingMode(.template)
}
```

## แก้ไขต่อ
เปิดไฟล์ใน svg/ (Figma / Illustrator / Inkscape)
glyph ออกแบบบนกริด 36×36 มี padding พอดีสำหรับแถบเมนู
