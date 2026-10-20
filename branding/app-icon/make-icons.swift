// Draws the Remembrancer icon (design "U5": a rounded white bookmark with two
// sound waves on brand blue) as PNG files. Units: the design is on a 130x130
// grid; everything is scaled from that.
import Foundation
import CoreGraphics
import ImageIO
import UniformTypeIdentifiers

func color(_ hex: UInt32, _ a: CGFloat = 1) -> CGColor {
    CGColor(srgbRed: CGFloat((hex >> 16) & 0xff) / 255, green: CGFloat((hex >> 8) & 0xff) / 255,
            blue: CGFloat(hex & 0xff) / 255, alpha: a)
}
let brandBlue: UInt32 = 0x2563eb

func bookmark() -> CGPath {
    let p = CGMutablePath()
    p.move(to: CGPoint(x: 31, y: 24)); p.addLine(to: CGPoint(x: 69, y: 24))
    p.addQuadCurve(to: CGPoint(x: 78, y: 33), control: CGPoint(x: 78, y: 24))
    p.addLine(to: CGPoint(x: 78, y: 99))
    p.addQuadCurve(to: CGPoint(x: 71, y: 103), control: CGPoint(x: 78, y: 108))
    p.addLine(to: CGPoint(x: 50, y: 88)); p.addLine(to: CGPoint(x: 29, y: 103))
    p.addQuadCurve(to: CGPoint(x: 22, y: 99), control: CGPoint(x: 22, y: 108))
    p.addLine(to: CGPoint(x: 22, y: 33))
    p.addQuadCurve(to: CGPoint(x: 31, y: 24), control: CGPoint(x: 22, y: 24))
    p.closeSubpath()
    return p
}
func wave(_ a: CGPoint, _ c: CGPoint, _ b: CGPoint) -> CGPath {
    let p = CGMutablePath(); p.move(to: a); p.addQuadCurve(to: b, control: c); return p
}

/// Draw the glyph (bookmark + waves) in a 130-unit frame placed at `origin`, scaled by `s`.
func drawGlyph(_ ctx: CGContext, origin: CGPoint, scale s: CGFloat, glyph: UInt32) {
    ctx.saveGState()
    ctx.translateBy(x: origin.x, y: origin.y); ctx.scaleBy(x: s, y: s)
    ctx.addPath(bookmark()); ctx.setFillColor(color(glyph)); ctx.fillPath()
    ctx.setLineWidth(6); ctx.setLineCap(.round)
    ctx.addPath(wave(CGPoint(x: 89, y: 51), CGPoint(x: 97, y: 65), CGPoint(x: 89, y: 79)))
    ctx.setStrokeColor(color(glyph)); ctx.strokePath()
    ctx.addPath(wave(CGPoint(x: 101, y: 40), CGPoint(x: 115, y: 65), CGPoint(x: 101, y: 90)))
    ctx.setStrokeColor(color(glyph, 0.7)); ctx.strokePath()
    ctx.restoreGState()
}

func makeImage(_ size: Int, opaque: Bool, _ draw: (CGContext) -> Void) -> CGImage {
    let ctx = CGContext(data: nil, width: size, height: size, bitsPerComponent: 8, bytesPerRow: 0,
                        space: CGColorSpace(name: CGColorSpace.sRGB)!,
                        bitmapInfo: (opaque ? CGImageAlphaInfo.noneSkipLast : CGImageAlphaInfo.premultipliedLast).rawValue)!
    // Flip so y grows downward, like the SVG design.
    ctx.translateBy(x: 0, y: CGFloat(size)); ctx.scaleBy(x: 1, y: -1)
    ctx.setShouldAntialias(true); ctx.interpolationQuality = .high
    draw(ctx)
    return ctx.makeImage()!
}
func save(_ image: CGImage, _ path: String) {
    let dest = CGImageDestinationCreateWithURL(URL(fileURLWithPath: path) as CFURL, UTType.png.identifier as CFString, 1, nil)!
    CGImageDestinationAddImage(dest, image, nil); CGImageDestinationFinalize(dest)
}

let out = CommandLine.arguments[1]
let full: CGFloat = 1024 / 130

// App icon: full-bleed square (iOS rounds the corners itself), no transparency.
save(makeImage(1024, opaque: true) { ctx in
    ctx.setFillColor(color(brandBlue)); ctx.fill(CGRect(x: 0, y: 0, width: 1024, height: 1024))
    drawGlyph(ctx, origin: .zero, scale: full, glyph: 0xffffff)
}, "\(out)/AppIcon-1024.png")

// Dark icon style: transparent background (iOS draws the dark background), glyph in light blue.
save(makeImage(1024, opaque: false) { ctx in
    drawGlyph(ctx, origin: .zero, scale: full, glyph: 0x60a5fa)
}, "\(out)/AppIcon-dark-1024.png")

// Tinted icon style: a light glyph on transparent; iOS colours it with the user's tint.
save(makeImage(1024, opaque: false) { ctx in
    drawGlyph(ctx, origin: .zero, scale: full, glyph: 0xffffff)
}, "\(out)/AppIcon-tinted-1024.png")

// Launch screen: white, with the icon (rounded square) centred. The image is
// shown "aspect fill" on any screen, so it's 2732 square with the icon in the
// middle, about a sixth of the height.
save(makeImage(2732, opaque: true) { ctx in
    ctx.setFillColor(color(0xffffff)); ctx.fill(CGRect(x: 0, y: 0, width: 2732, height: 2732))
    let side: CGFloat = 400, x = (2732 - side) / 2
    let rect = CGRect(x: x, y: x, width: side, height: side)
    ctx.addPath(CGPath(roundedRect: rect, cornerWidth: side * 29 / 130, cornerHeight: side * 29 / 130, transform: nil))
    ctx.setFillColor(color(brandBlue)); ctx.fillPath()
    drawGlyph(ctx, origin: CGPoint(x: x, y: x), scale: side / 130, glyph: 0xffffff)
}, "\(out)/splash-2732.png")
print("done")
