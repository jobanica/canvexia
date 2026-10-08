# Open Graph share-image font

The font the Open Graph share image (`../opengraph-image.tsx`) is drawn with.

`next/og` ships no font of its own: given a character it cannot draw, it
downloads one from Google Fonts at build time. That made the peso sign an empty
box, because the build container has no outbound access to Google Fonts.

The obvious fix — reading a `.ttf` from disk — fails on Vercel in a way it does
not fail locally. The image is rendered by the `/opengraph-image` function, but
**every page** also imports that module to build its `og:image` meta tag, and on
Vercel each route is bundled into its own serverless function. A `.ttf` traced
into the image function was missing from the page functions, so reading it there
threw `ENOENT` and blanked the title and all Open Graph tags on `/`, `/apply`
and `/login`.

So the font is **inlined as base64** in `font.ts`, which bundles into every
function the same way the rest of the code does. No filesystem, no tracing, no
network.

## Files

- `dejavu-sans-bold-subset.ttf` — the source asset: **DejaVu Sans Bold**, subset
  to the ~70 characters the image uses (letters, digits, space, full stop,
  comma, hyphen and ₱), 709 KB → 19 KB. Kept for inspection and regeneration; it
  is not imported at runtime.
- `font.ts` — that file, base64-encoded, which the image actually loads.

## Regenerating

Re-subset only if the image needs a character outside the current set:

```
python3 -c "
from fontTools import subset
opts = subset.Options(layout_features=['kern','liga'], drop_tables=['DSIG'])
font = subset.load_font('DejaVuSans-Bold.ttf', opts)
s = subset.Subsetter(options=opts)
s.populate(text='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789 .,-₱')
s.subset(font)
subset.save_font(font, 'dejavu-sans-bold-subset.ttf', opts)
"
```

Then refresh `font.ts` from it:

```
printf 'export const FONT_BASE64 =\n  "%s";\n' "$(base64 -w0 dejavu-sans-bold-subset.ttf)" > font.ts
```

(and restore the explanatory header comment at the top of `font.ts`).

## Licence

DejaVu fonts — Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.
Bitstream Vera is a trademark of Bitstream, Inc. DejaVu changes are in the
public domain. Released under the Bitstream Vera Fonts licence, which permits
reproduction and redistribution provided this notice is included:
<https://dejavu-fonts.github.io/License.html>
