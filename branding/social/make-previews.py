"""
Link-preview images ("og:image") for the two websites, 1200x630 pixels: the
picture iMessage, WhatsApp, Facebook, Slack and X show with a shared link.

    og-wordbook.png      makeyourwordbook.com   a book with a folded corner:
                                                lines of text, read aloud
                                                (sound waves)
    og-remembrancer.png  myremembrancer.com     the app icon's bookmark and
                                                sound waves (app-icon/icon.svg)

Both are brand blue (#2563eb, the website's accent) with the site's name, its
tagline (the landing page's headline) and its address. Drawn at twice the
size and scaled down, so curves and text come out smooth.

Run from anywhere:  python3 branding/social/make-previews.py
Needs Pillow (pip install pillow) and macOS's Avenir Next font.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
W, H = 1200, 630
S = 2  # drawing scale; the result is scaled back down by S
BLUE = (37, 99, 235)
WHITE = (255, 255, 255)
SOFT = (190, 208, 249)  # white at 70% over the blue (the icon's outer wave)
MID = (110, 150, 240)  # the outer wave on the white book cover
AVENIR = "/System/Library/Fonts/Avenir Next.ttc"
DEMI_BOLD, MEDIUM, REGULAR = 2, 5, 7  # font indexes inside Avenir Next.ttc

# Each symbol's extent in the 130 grid (left, top, right, bottom), so both can
# be drawn the same height and centred in the same spot.
BOUNDS = {"book": (24, 20, 105, 110), "bookmark": (22, 24, 115, 108)}
GLYPH_HEIGHT = 260
GLYPH_CENTER = (265, 320)

SITES = [
    {"file": "og-wordbook.png", "glyph": "book", "name": "Make Your Wordbook",
     "tagline": "Look it up. Make it yours.", "address": "makeyourwordbook.com"},
    {"file": "og-remembrancer.png", "glyph": "bookmark", "name": "Remembrancer",
     "tagline": "Write it down. Remember it.", "address": "myremembrancer.com"},
]


def font(index, size):
    return ImageFont.truetype(AVENIR, size * S, index=index)


def quad(p0, c, p1, steps=24):
    """Points along a quadratic curve from p0 to p1 (control point c)."""
    return [((1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t * t * p1[0],
             (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t * t * p1[1])
            for t in (i / steps for i in range(steps + 1))]


class Glyph:
    """Draws in the icon's 130x130 grid, placed at (x, y) and `size` px wide."""

    def __init__(self, draw, x, y, size):
        self.d, self.x, self.y, self.k = draw, x * S, y * S, size * S / 130

    def pt(self, p):
        return (self.x + p[0] * self.k, self.y + p[1] * self.k)

    def polygon(self, points, fill):
        self.d.polygon([self.pt(p) for p in points], fill=fill)

    def curve(self, points, fill, width):
        """A thick, round-ended stroke: a dot stamped at every point (smoother
        than a polyline's joints). Pass densely sampled points."""
        r = width * self.k / 2
        for p in map(self.pt, points):
            self.d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=fill)

    def rounded(self, box, r, fill):
        (x0, y0), (x1, y1) = self.pt(box[:2]), self.pt(box[2:])
        self.d.rounded_rectangle([x0, y0, x1, y1], radius=r * self.k, fill=fill)

    def text(self, center, s, size, fill):
        f = ImageFont.truetype(AVENIR, round(size * self.k), index=DEMI_BOLD)
        self.d.text(self.pt(center), s, font=f, fill=fill, anchor="mm")


def bookmark(g):
    """The Remembrancer app icon: a rounded bookmark with two sound waves."""
    outline = ([(31, 24), (69, 24)] + quad((69, 24), (78, 24), (78, 33)) + [(78, 99)]
               + quad((78, 99), (78, 108), (71, 103)) + [(50, 88), (29, 103)]
               + quad((29, 103), (22, 108), (22, 99)) + [(22, 33)]
               + quad((22, 33), (22, 24), (31, 24)))
    g.polygon(outline, WHITE)
    g.curve(quad((89, 51), (97, 65), (89, 79), steps=400), WHITE, 6)
    g.curve(quad((101, 40), (115, 65), (101, 90), steps=400), SOFT, 6)


def book(g):
    """Make Your Wordbook: a book with its top-right corner folded down, and on
    its cover lines of text with sound waves: your words, read aloud. The
    waves match the Remembrancer icon's."""
    g.rounded((24, 20, 104, 110), 9, WHITE)
    g.polygon([(36, 20), (40, 20), (40, 110), (36, 110)], SOFT)  # spine crease
    g.polygon([(86, 20), (105, 20), (105, 39)], BLUE)  # corner folded away...
    g.polygon([(86, 20), (86, 33), (92, 39), (105, 39)], SOFT)  # ...and its back
    for y, w in [(57, 24), (65, 18), (73, 24), (81, 14)]:  # lines of text
        g.curve([(50 + w * t / 200, y) for t in range(201)], BLUE, 4.5)
    g.curve(quad((80, 60), (84.5, 69), (80, 78), steps=400), BLUE, 5)
    g.curve(quad((88.1, 54.6), (95.3, 69), (88.1, 83.4), steps=400), MID, 5)


def fit(draw, s, index, size, max_width):
    """The largest font size up to `size` at which `s` fits in max_width."""
    while size > 20:
        f = font(index, size)
        if draw.textlength(s, font=f) <= max_width * S:
            return f
        size -= 2
    return font(index, size)


def make(site):
    img = Image.new("RGB", (W * S, H * S), BLUE)
    d = ImageDraw.Draw(img)
    x0, y0, x1, y1 = BOUNDS[site["glyph"]]
    k = GLYPH_HEIGHT / (y1 - y0)  # px per grid unit
    g = Glyph(d, GLYPH_CENTER[0] - (x0 + x1) / 2 * k, GLYPH_CENTER[1] - (y0 + y1) / 2 * k, 130 * k)
    (book if site["glyph"] == "book" else bookmark)(g)

    left, right = 490, W - 70
    d.text((left * S, 215 * S), site["name"], font=fit(d, site["name"], DEMI_BOLD, 80, right - left),
           fill=WHITE, anchor="ls")
    d.text((left * S, 300 * S), site["tagline"], font=fit(d, site["tagline"], MEDIUM, 46, right - left),
           fill=WHITE, anchor="ls")
    d.text((left * S, 520 * S), site["address"], font=font(REGULAR, 32), fill=SOFT, anchor="ls")

    out = HERE / site["file"]
    img.resize((W, H), Image.LANCZOS).save(out, optimize=True)
    print(f"{out.name}  {out.stat().st_size // 1024} KB")


if __name__ == "__main__":
    for s in SITES:
        make(s)
