# Installing CANVEXIA (PWA)

Three installable apps come out of one deployment. Each has its own manifest,
its own icon and its own start page, because the three audiences open the
product at three different screens.

| App | Who | Manifest | Opens on |
| --- | --- | --- | --- |
| **CANVEXIA HQ** | Our own ops team | `/hq.webmanifest` (static file) | `/hq` |
| **CANVEXIA** | An operator's admins and managers | `/partner.webmanifest` (route) | the portal Overview |
| **Field** | An operator's salespeople | `/partner-field.webmanifest` (route) | the check-in screen |

## Why the partner ones are routes and not files

The portal answers at two shapes of address:

```
partner.canvexia.com/partner/pipeline    CANVEXIA's own front door
cebu.canvexia.com/pipeline               an operator's branded host
```

Middleware adds the `/partner` prefix internally on the branded host, so the
page is identical and the URL is not. A static manifest has to pick one set of
paths. Picking `/partner` breaks the branded host: every URL an operator
browses there falls **outside** the scope, and an installed app hands an
out-of-scope link to the browser — so the first tap inside the app drops them
into a tab with a URL bar.

So `src/lib/partners/manifest.ts` builds the manifest from the `Host` header,
and the two route handlers under `src/app/*.webmanifest/` serve it. The paths
contain a dot, which is exactly what the middleware matcher excludes, so the
`/partner` prefix is never applied to the manifest request itself.

**A file in `public/` shadows a route of the same path.** If
`public/partner.webmanifest` or `public/partner-field.webmanifest` ever comes
back, the host-aware version becomes dead code and the branded host silently
breaks again. `tests/pwa/installable.test.ts` fails if either file exists.

HQ stays a static file: `/hq` passes through only on CANVEXIA's own host
(`ROOT_ONLY_PASS_THROUGH` in the middleware), so there is no address where its
paths are different.

## What makes it installable

Four things, all of which have to be true at once:

1. **A manifest** with `name`, `start_url`, `display: "standalone"` and 192px
   and 512px icons. Each layout declares its own via Next's `metadata.manifest`.
2. **A service worker with a fetch handler**, controlling the start_url.
   `public/sw.js` is served from the root, so its scope is `/` and one
   registration covers all three apps. `<ServiceWorkerRegister />` is mounted in
   the HQ layout, the partner layout and the field layout.
3. **HTTPS.** Vercel gives us this.
4. **An `id`.** Not required, but the portal and the field app share a scope, and
   a browser tells two installed apps apart by `id` (falling back to
   `start_url`). Without it, changing either start_url orphans whatever people
   already put on their home screens.

## The install button

Installable is not the same as installed. Chrome buries its own prompt behind a
`⋮` most people never open, and iOS Safari has no prompt at all.
`src/components/pwa/InstallApp.tsx` holds Chromium's `beforeinstallprompt` and
fires it from a visible button; on iOS it prints the three taps
(Share → Add to Home Screen → Add) instead of pretending a button will work.

It renders **nothing** when there is nothing to offer — already installed, a
browser that cannot install, or dismissed. Dismissal is remembered per app, so
saying "no thanks" to the portal does not also hide Field on the same phone.

It is mounted in the **main column** of both shells, not the sidebar: the
sidebar is `lg:flex` and a phone is the device anybody actually installs this
on.

## The offline fallback

`sw.js` serves a cached page when a navigation fails. That fallback used to be
`/cashier` for every path, which was fine while only Servd's cashier and kitchen
registered the worker. Now that `/hq` and `/partner` do, `offlineShell()` picks
the fallback from the path prefix — an offline CANVEXIA user lands on their own
surface, not on a restaurant till for a business they do not run.

Bump `VERSION` in `sw.js` when changing any of this, or installed clients keep
the old worker.
