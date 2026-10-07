// Shrink a photo on the device before uploading it. Phone photos are often
// 3–12 MB and 4000+ pixels wide; scaled to at most MAX_SIDE pixels and
// re-compressed they're usually a few hundred KB, so they upload far faster
// on a slow connection and load faster for everyone who views them.
//
// Left as they are: GIFs (re-encoding would drop the animation), files that
// are already small, anything the browser can't decode, and any result that
// isn't actually smaller. Photos keep their orientation (EXIF rotation is
// applied while decoding).
const MAX_SIDE = 1600;
const SMALL_ENOUGH = 300 * 1024;
const QUALITY = 0.85;

const toBlob = (canvas, type) => new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY));

export default async function shrinkImage(file) {
    if (!file || file.type === 'image/gif' || file.size <= SMALL_ENOUGH || typeof createImageBitmap !== 'function') {
        return file;
    }
    try {
        const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
        const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
        const width = Math.round(bitmap.width * scale);
        const height = Math.round(bitmap.height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(bitmap, 0, 0, width, height);
        if (bitmap.close) bitmap.close();

        // JPEG for photos. PNG and WebP may have transparent areas, which
        // JPEG would turn black, so they become WebP (keeps transparency);
        // browsers that can't write WebP (older Safari) hand back a PNG.
        const type = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/webp';
        const blob = await toBlob(canvas, type);
        if (!blob || blob.size >= file.size) return file;

        const ext = { 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/png': 'png' }[blob.type] || 'img';
        const name = (file.name || 'image').replace(/\.[^.]+$/, '') + '.' + ext;
        return new File([blob], name, { type: blob.type });
    } catch (e) {
        return file;
    }
}
