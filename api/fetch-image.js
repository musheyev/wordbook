// Download an image from a web address a user gave us, so we can keep our own
// copy (user-word-images.js). Fetching an address on someone's behalf is
// risky — they could point the server at a machine on its own network — so:
//
//   - only http and https;
//   - the address it actually connects to must be a public internet address:
//     the check runs inside the connection's DNS lookup, so a name can't
//     resolve to a public address for a check and a private one for the
//     connection (DNS rebinding);
//   - redirects are followed by hand (at most MAX_REDIRECTS), each one
//     checked the same way;
//   - at most MAX_BYTES are read, with a time limit;
//   - the result must actually be a PNG, JPEG, GIF or WebP (checked from its
//     bytes, not the server's Content-Type).
const http = require("http");
const https = require("https");
const dns = require("dns");
const net = require("net");
const { sniffType } = require("./images");

const MAX_BYTES = 12 * 1024 * 1024;
const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10000;   // the connection may go quiet this long
const TOTAL_MS = 20000;     // a whole download may take this long

/** An error whose message can be shown to the user as is. */
class FetchImageError extends Error {}

// Addresses that aren't the public internet: this machine, private networks,
// link-local (incl. cloud metadata services), carrier-grade NAT, multicast
// and reserved ranges.
const blocked = new net.BlockList();
[
    ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8],
    ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.0.0.0", 24], ["192.168.0.0", 16],
    ["198.18.0.0", 15], ["224.0.0.0", 3],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, "ipv4"));
[
    ["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
].forEach(([address, prefix]) => blocked.addSubnet(address, prefix, "ipv6"));

function isPublicAddress(address, family) {
    // An IPv4 address written as IPv6 (::ffff:10.0.0.1) is checked as IPv4.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return !blocked.check(mapped[1], "ipv4");
    return !blocked.check(address, family === 6 || net.isIPv6(address) ? "ipv6" : "ipv4");
}

// dns.lookup, refusing any non-public result. Used as the connection's
// `lookup`, so the address checked is the one connected to. Node asks either
// for one address or (when trying IPv4 and IPv6 in parallel) for all of
// them; a name with any non-public address is refused outright.
function safeLookup(hostname, options, callback) {
    const refuse = () => callback(new FetchImageError("That address isn't a public website."));
    if (options && options.all) {
        dns.lookup(hostname, options, (err, addresses) => {
            if (err) return callback(err);
            if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address, a.family))) return refuse();
            callback(null, addresses);
        });
        return;
    }
    dns.lookup(hostname, options, (err, address, family) => {
        if (err) return callback(err);
        if (!isPublicAddress(address, family)) return refuse();
        callback(null, address, family);
    });
}

function parseUrl(raw) {
    let url;
    try {
        url = new URL(String(raw || "").trim());
    } catch {
        throw new FetchImageError("That doesn't look like a web address.");
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new FetchImageError("Use an http or https address.");
    }
    if (url.username || url.password) {
        throw new FetchImageError("Use an address without a username or password.");
    }
    // A literal IP address skips DNS, so check it here.
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (net.isIP(host) && !isPublicAddress(host)) {
        throw new FetchImageError("That address isn't a public website.");
    }
    return url;
}

// One request: resolves to { redirect } or { buffer }. `timeout` below only
// fires when the connection goes quiet; the deadline also stops a server
// that keeps sending slowly.
function requestOnce(url) {
    let deadline;
    let req;
    return new Promise((resolve, reject) => {
        deadline = setTimeout(() => {
            req.destroy(new FetchImageError("That address took too long to answer."));
        }, TOTAL_MS);
        const lib = url.protocol === "https:" ? https : http;
        req = lib.get(url, {
            lookup: safeLookup,
            timeout: TIMEOUT_MS,
            headers: { "User-Agent": "Remembrancer image fetch", "Accept": "image/*" },
        }, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                res.resume();
                return resolve({ redirect: new URL(res.headers.location, url).toString() });
            }
            if (res.statusCode !== 200) {
                res.resume();
                return reject(new FetchImageError(`That address answered with an error (${res.statusCode}).`));
            }
            const declared = Number(res.headers["content-length"]);
            if (declared > MAX_BYTES) {
                res.destroy();
                return reject(new FetchImageError("That image is larger than 12 MB."));
            }
            const parts = [];
            let size = 0;
            res.on("data", (chunk) => {
                size += chunk.length;
                if (size > MAX_BYTES) {
                    res.destroy();
                    reject(new FetchImageError("That image is larger than 12 MB."));
                    return;
                }
                parts.push(chunk);
            });
            res.on("end", () => resolve({ buffer: Buffer.concat(parts) }));
            res.on("error", reject);
        });
        req.on("timeout", () => req.destroy(new FetchImageError("That address took too long to answer.")));
        req.on("error", (err) => reject(err instanceof FetchImageError ? err
            : new FetchImageError("Couldn't reach that address.")));
    }).finally(() => clearTimeout(deadline));
}

/**
 * @param {string} rawUrl the address the user gave
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 * @throws {FetchImageError} with a message fit for the user
 */
async function fetchImage(rawUrl) {
    let url = parseUrl(rawUrl);
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const result = await requestOnce(url);
        if (result.redirect) {
            url = parseUrl(result.redirect);
            continue;
        }
        const contentType = sniffType(result.buffer);
        if (!contentType) {
            throw new FetchImageError("That address isn't a PNG, JPEG, GIF or WebP image.");
        }
        return { buffer: result.buffer, contentType };
    }
    throw new FetchImageError("That address redirects too many times.");
}

module.exports = { fetchImage, FetchImageError, isPublicAddress };
