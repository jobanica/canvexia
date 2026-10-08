# `dejavu-sans-bold-subset.ttf`

The font the Open Graph share image is drawn with.

`next/og` ships no font of its own: given a character it cannot draw, it
downloads one from Google Fonts at build time. That meant the peso sign came
out as an empty box, because the build container has no outbound access to
Google Fonts — and a build that needs a third-party download to render
correctly is a build that will eventually fail quietly.

So the font is committed. It is **DejaVu Sans Bold**, subset to the ~70
characters the image uses (letters, digits, space, full stop, comma, hyphen and
₱), which takes it from 709 KB to 19 KB. Regenerate it with `fonttools` if the
image ever needs a character outside that set:

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

## Licence

DejaVu fonts — Copyright (c) 2003 by Bitstream, Inc. All Rights Reserved.
Bitstream Vera is a trademark of Bitstream, Inc. DejaVu changes are in the
public domain. Released under the Bitstream Vera Fonts licence, which permits
reproduction and redistribution provided this notice is included:
<https://dejavu-fonts.github.io/License.html>
