import Cocoa
import Foundation

func renderEmoji(_ emoji: String, size: CGFloat) -> NSImage {
    let img = NSImage(size: NSSize(width: size, height: size))
    img.lockFocus()

    let fontSize = size * 0.82
    let attrs: [NSAttributedString.Key: Any] = [
        .font: NSFont.systemFont(ofSize: fontSize)
    ]
    let str = emoji as NSString
    let strSize = str.size(withAttributes: attrs)
    let pt = NSPoint(
        x: (size - strSize.width)  / 2,
        y: (size - strSize.height) / 2
    )
    str.draw(at: pt, withAttributes: attrs)
    img.unlockFocus()
    return img
}

func savePNG(_ image: NSImage, to path: String) {
    guard let tiff = image.tiffRepresentation,
          let bmp  = NSBitmapImageRep(data: tiff),
          let png  = bmp.representation(using: .png, properties: [:]) else {
        fputs("❌ Failed to encode \(path)\n", stderr); return
    }
    try? png.write(to: URL(fileURLWithPath: path))
}

let args = CommandLine.arguments
guard args.count >= 3 else {
    fputs("Usage: make_icon <emoji> <output.icns>\n", stderr); exit(1)
}
let emoji  = args[1]
let output = args[2]
let iconset = output.hasSuffix(".icns")
    ? String(output.dropLast(5)) + ".iconset"
    : output + ".iconset"

try? FileManager.default.removeItem(atPath: iconset)
try! FileManager.default.createDirectory(atPath: iconset, withIntermediateDirectories: true)

let sizes: [(Int, Int)] = [
    (16, 1), (16, 2),
    (32, 1), (32, 2),
    (128, 1), (128, 2),
    (256, 1), (256, 2),
    (512, 1), (512, 2),
]

for (pts, scale) in sizes {
    let px    = pts * scale
    let img   = renderEmoji(emoji, size: CGFloat(px))
    let label = scale == 1 ? "icon_\(pts)x\(pts).png" : "icon_\(pts)x\(pts)@2x.png"
    savePNG(img, to: "\(iconset)/\(label)")
}

let result = Process()
result.launchPath = "/usr/bin/iconutil"
result.arguments  = ["-c", "icns", iconset, "-o", output]
try! result.run()
result.waitUntilExit()

try? FileManager.default.removeItem(atPath: iconset)

if result.terminationStatus == 0 {
    print("✅ Icon created: \(output)")
} else {
    fputs("❌ iconutil failed\n", stderr); exit(1)
}
