# Servd — Every feature and what it costs

One page listing everything Servd does, split into what's free and what's a paid
unlock, with the one-time fee for each.

All amounts are Philippine Pesos (₱). **Last updated:** 7 September 2026 —
every figure below was read from the live `platform_settings.featurePrices`
on that date, not from an earlier version of this page.

> These are the prices configured today. The owner can change any of them — or
> stop selling a feature entirely — at **Super-admin → Feature pricing**, with no
> deploy. If an account's own billing screen shows a different number, that
> screen is right.

---

## 1. The short version

| | Price | Billing |
|---|---|---|
| Everything in §2 | ₱0 | Free forever, never gated |
| Activate online ordering | **₱499** | One time |
| Each extra branch | **₱499** | One time, per branch |
| Feature unlocks | ₱500 – ₱2,000 | One time, per feature |

**Every unlock bought once, owned for good.** Total if an account bought all 15
unlocks: **₱11,700**, plus the ₱499 activation.

**There is no recurring charge.** Nothing in the product bills monthly today.

---

## 2. Free — ₱0, never gated

Not a trial, and not tied to a plan. These ship with every account and there is
no toggle that can take them away:

**Ordering & service**
- QR dine-in ordering
- Counter / takeout QR with order numbers
- 1 table QR code
- Cashier POS
- Kitchen display
- Split payments, split bills and tips
- Void / edit with manager approval
- Dietary tags

**Printing**
- Thermal receipt printing at the till
- Optional **separate kitchen printer**, so a shop with no kitchen display gets
  the ticket printed in the kitchen automatically when the cashier accepts an
  order — over the network bridge, cloud polling, or **Bluetooth**

**Customers**
- Feedback capture and Google review prompts

**Staff**
- 3 staff accounts

---

## 3. One-time activation — ₱499

Turns the ordering page on. A restaurant builds its preview free, sees its own
page working, and pays only when it's ready to take real orders.

**Extra branches are the same ₱499, per branch.** One login manages them all and
the owner switches between them inside the admin dashboard. A branch that hasn't
been paid for can be created but **cannot be switched into** until activation
clears. Added at **Admin → Branches**, paid through Xendit.

---

## 4. One-time feature unlocks

### Ordering & service

| Feature | Fee | What it does |
|---|---|---|
| Unlimited tables & QR codes | **₱700** | Print a QR for every table instead of just one, so diners order from where they're sitting |
| Visual floor plan & table status | **₱500** | See the room as a map — which tables are seated, waiting on food, or ready to clear |
| Reservations & waitlist | **₱500** | Take bookings and run a waitlist, with the table held on your floor plan |

The **online ordering website + delivery** is no longer a separate unlock. It is
what the ₱499 activation in §3 turns on, and it ships with every plan.

### Payments

| Feature | Fee | What it does |
|---|---|---|
| Gift cards & store credit | **₱500** | Sell gift cards and store credit, and redeem them at the till |

### Marketing & growth

| Feature | Fee | What it does |
|---|---|---|
| Customer book + CSV export | **₱500** | Every customer who has ordered, with their history and address — exportable |
| Promotions, promo codes & happy hours | **₱500** | Discounts and happy-hour pricing that apply themselves at checkout |
| Loyalty & rewards | **₱700** | Points and rewards that bring regulars back, tracked on every order |

### Operations & back office

| Feature | Fee | What it does |
|---|---|---|
| Data export (sales, orders, menu) | **₱500** | Download your sales, orders and menu as spreadsheets |
| Audit log (who changed what) | **₱500** | A record of who changed what — voids, discounts, price edits, refunds |
| Offline mode | **₱500** | Keep taking orders when the internet drops; everything syncs once it's back |
| Accounting (sales, VAT, P&L) | **₱1,500** | Sales, VAT and profit worked out for you, with expenses and cost of goods |
| Inventory, COGS, low-stock & reorder | **₱1,500** | Count stock, cost your recipes, and get told before you run out |
| HR, attendance & payroll | **₱2,000** | Attendance, shifts and payroll for your staff |

### Branding

| Feature | Fee | What it does |
|---|---|---|
| Custom domain | **₱500** | Run your ordering site on your own web address instead of a Servd link |
| Full white-label | **₱800** | Removes "Powered by Servd" so the site is entirely yours |

### Sorted by price

| Fee | Features |
|---|---|
| ₱500 | Visual floor plan · Reservations & waitlist · Gift cards & store credit · Promotions & happy hours · Customer book + CSV export · Data export · Audit log · Offline mode · Custom domain |
| ₱700 | Unlimited tables & QR codes · Loyalty & rewards |
| ₱800 | Full white-label |
| ₱1,500 | Accounting · Inventory, COGS & reorder |
| ₱2,000 | HR, attendance & payroll |

---

## 5. Not sold as one-time unlocks

| Feature | Why not |
|---|---|
| **Social content scheduler** | **Switched off — not sold.** It was priced at ₱499/month; that subscription is not currently offered and no account is on it |
| **SMS marketing** | Metered — every text costs real money, so it runs on credits |
| **AI menu import** | **Switched off** — burns API credits per import. Partner demos get 1 scan per demo restaurant |
| **Online payments (card gateway)** | **Retired.** It redirected the diner off-site to pay by card; customers found the extra hop confusing. They scan the shop's own GCash / Maya / bank QR instead, which ships with online ordering. Accounts that already bought it keep it; it is never sold again |

---

## 6. How buying works

**Unlocks happen where the feature is.** An owner who opens a locked screen gets
an unlock card **on that page**, showing that one feature, what it does and its
price — not the whole billing catalogue. The locked item stays in the sidebar
with a padlock and links to its real page, so nothing is hidden and nothing is
overwhelming. **Admin → Billing & features** still lists everything for anyone
who wants the full view.

**Unlocks are per branch.** Each branch is its own tenant, so a two-branch
account that wants inventory in both pays ₱1,500 twice.

**What "Powered by Servd" means in practice.** Accounts opened from 21 August
2026 carry a small "Powered by Servd" line — with the deployment's own
address, from NEXT_PUBLIC_APP_URL — at the foot of
their ordering website and their table/QR menu, plus the Servd splash after a
QR scan. **Accounts that were already trading before that date are
grandfathered** — nothing was added to their pages. The ₱800 white-label
unlock removes all of it, for any account, however long they have been on
Servd: the footer, the QR splash, and the line in their own dashboard.

**Servd takes no cut of sales.** Customers pay by scanning the restaurant's own
GCash, Maya or bank QR and attaching the reference; the money lands directly in
the restaurant's account. No gateway, no gateway fee, no commission.

See [`servd-pricing.md`](./servd-pricing.md) for the customer-facing wording,
the partner programme and the common pricing questions.
