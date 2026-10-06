# Product image audit — background, framing, and the logo

Every product photo is corrected when it is served (`/api/product-image`), so a fix reaches the whole
catalogue at once and a newly added product is corrected on its first render with nothing to remember.
This is the measured result across all **69 products**, plus the short list that needs a human.

## What was actually wrong

Measured, not assumed — each source image was fetched and its border pixels sampled:

| Fault | Findings |
|---|---|
| Background not white | **4 images** were on a genuinely non-white sweep (one pure black, three tinted grey/cream) |
| Product painted over | The supplier-mark erasing boxes are fixed fractions of the frame. Where a product reached into one, the box wiped real artwork — a row of bottles lost part of its label |
| Logo over the product | The salon's mark was positioned as a fraction of the *product* frame, so on any product reaching the lower-left it landed **on** the artwork |
| No room around the product | No margin, so there was nowhere else for the mark to go |
| Broken or missing images | **15 products** with no usable image |

A caveat worth recording, because it produced a false alarm first time round: images whose background
is **transparent** initially looked like black backgrounds. A transparent pixel often carries RGB
`0,0,0`, so a naive border sample reads "black" when the file is in fact a cut-out that already renders
on white. Eleven images fell into this trap. The audit now tests alpha before colour.

## What the fix does

`lib/images/background.ts`, called from the image route:

1. **Whiten a non-white background** with a *border-seeded flood fill*. The background colour is
   estimated from the frame's edge, then only pixels **connected to the border** and matching it are
   replaced. Seeding from the edge is the point: a global "replace this colour" would also erase black
   text or a cream label *inside* the product, whereas a fill that has to reach a pixel from outside can
   never touch the product's interior.

2. **Never paint over the product.** Each supplier-mark region is measured first and cleared only if it
   is standing on background. A supplier logo may therefore survive — the correct trade, because a
   surviving logo is cosmetic and an erased product is a broken listing.

3. **Trim, then pad to a square** white canvas (`FRAME_MARGIN = 1.3`, roughly 11.5% clear on each side).
   This is what makes "not cropped" structural rather than hopeful, and it gives the logo a guaranteed
   white margin to sit in. The DOM badge is sized as a share of the container (`min(configured px, 8%)`,
   inset 1.5%) so it stays inside that band at **every** card size.

### Three guards, because one failure was severe

The first version erased a product outright: an image that is *flat carton artwork filling the frame*
has a border colour that **is the product's own surface**. That looked like a sweep, and the fill
whitened the packaging. Three independent guards now stop it, and each was verified against real images:

- **Centre check** — if the middle of the frame is mostly the same colour as the edge, there is no
  background here. (Caught the flat artwork.)
- **Escape check** — a fill covering more than 82% of the frame has escaped into the product. The fill
  runs on a scratch copy, so it is discarded rather than repaired. (Caught the same image via a second
  route, at 85%.)
- **Uniformity check** — a frame whose border pixels disagree is a photograph, not a sweep. Left alone.

## Results

| Outcome | Count |
|---|---|
| Background replaced with white | **4** |
| Already white | 34 |
| Already transparent (renders on white) | 11 |
| Left alone by design | 4 |
| Needs a human | **15** |

**Fixed automatically:** Anti-aging Day Cream, Anti-aging Night Cream, Rejuvina Lotion, Streax Hair Color.

Verified visually, not just numerically: the black-background jar went to a clean white sweep with no
halo and no lost edges, and on the four-bottle shot the "3%" label that the old erasing box had washed
out is now crisp with the logo sitting in clear white space beside it.

## Left alone on purpose — and why

These four cannot be fixed by colour work. A colour fill is the wrong tool, and guessing would risk the
product:

- **Moisturizer** and **Retinol** — a photographed scene behind the product, not a sweep. A fill cannot
  turn a room into white.
- **Well 10 Keratin Protein Shampoo** — the product fills the frame edge to edge; its own surface is what
  a border sample finds.
- **Whitening Day Cream** — flat carton artwork shot full-bleed. There is no background to replace.

Each needs either a differently shot source image, or a one-off AI cut-out. **Four images, not
sixty-nine.**

## Needs a human — 15 products

No image routine can fix these; they need a source image.

**No image URL set at all (9)**
`Custin Cream` · `Derma Sage` · `Derma Soothe Gel` · `Mild Foam Cleanser` · `Rice Face Wash` ·
`Rice Toner` · `Rose Water` · `Toner` · `Well 10 No Yellow Purple Shampoo`

**Link returns HTTP 404 — the supplier removed it (4)**
`Bridal Glow` · `Hydravitals Massage Cream` · `Miraki` · `Puravitals Cleanser`

**File is corrupt / unreadable (2)**
`4 Layer Anti-aging` · `Lacto Detan`

> One apparent failure in the first run — `Niacinamide Vitamin C Serum` — was a transient network error.
> A retry returned HTTP 200. Worth knowing before treating a single failed fetch as a broken link.

## One thing to expect

Some source images carry their own edge artefacts — a thin dark line or a shadow that the camera caught
at the frame's border. `Streax Hair Color` has black pixels **in the original**, so a faint line remains
after cleaning; the border still improved from 59% to 75% pure white. These are supplier photo-quality
problems rather than processing faults, and the only real fix is a better source.
