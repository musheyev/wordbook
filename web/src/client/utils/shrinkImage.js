// Shrink a photo on the device before uploading it. Phone photos are often
// 3–12 MB and 4000+ pixels wide; scaled to at most MAX_SIDE pixels and
// re-compressed they're usually a few hundred KB, so they upload far faster
// on a slow connection and load faster for everyone who views them.
//
// Screenshots (PNG) are different: their small text blurs when they're
// scaled down, and the user wants them at their real size. So a PNG up to
// SCREENSHOT_KEEP is uploaded exactly as it is. A bigger one is still
// shrunk, to SCREENSHOT_MAX_SIDE (twice a photo's), because the server
// runs on AWS Lambda, which can't take or send back much more than ~4.5 MB
// of image in one request.
//
// Left as they are: GIFs (re-encoding would drop the animation), files that
// are already small, anything the browser can't decode, and any result that
// isn't actually smaller. Photos keep their orientation (EXIF rotation is
// applied while decoding).
const MAX_SIDE = 1600;
const SMALL_ENOUGH = 300 * 1024;
const SCREENSHOT_KEEP = 3.5 * 1024 * 1024;
const SCREENSHOT_MAX_SIDE = 3200;
const QUALITY = 0.85;

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

export default async function shrinkImage(file) {
    if (!file || file.type === 'image/gif' || file.size <= SMALL_ENOUGH || typeof createImageBitmap !== 'function') {
        return file;
    }
    const screenshot = file.type === 'image/png';
    if (screenshot && file.size <= SCREENSHOT_KEEP) return file;
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        // JPEG for photos. PNG and WebP may have transparent areas, which
        // JPEG would turn black, so they become WebP (keeps transparency);
        // browsers that can't write WebP (older Safari) hand back a PNG.
        const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        // Draw the picture at most `maxSide` pixels on its longest side.
        const encode = (maxSide) => {
            const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
            const canvas = document.createElement('canvas');
            canvas.width = Math.round(bitmap.width * scale);
            canvas.height = Math.round(bitmap.height * scale);
            canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
            return toBlob(canvas, type);
        };
        // A big PNG first tries the screenshot size; if that's still too big
        // to upload (a photo saved as PNG, say), it gets a photo's size.
        let blob = await encode(screenshot ? SCREENSHOT_MAX_SIDE : MAX_SIDE);
        if (screenshot && blob && blob.size > SCREENSHOT_KEEP) blob = await encode(MAX_SIDE);
        if (bitmap.close) bitmap.close();
        if (!blob || blob.size >= file.size) return file;

        const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[blob.type] || 'img';
        const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext;
        return new File([blob], name, { type: blob.type });
    } catch (e) {
        return file;
    }
}
