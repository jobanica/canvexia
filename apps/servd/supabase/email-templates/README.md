# Branded auth emails (Servd)

Supabase sends the **signup confirmation email**, so its look is configured in
the Supabase dashboard — not in app code. This folder holds the branded HTML to
paste in.

## Apply the templates

Supabase Dashboard → **Authentication → Emails** (Email Templates). For each
template below, select it, paste the matching file's contents into the message
body, and **Save**. They already use Supabase's `{{ .ConfirmationURL }}`
variable, so the buttons work as-is.

| Supabase template       | File                                                   | Suggested subject                |
| ----------------------- | ------------------------------------------------------ | -------------------------------- |
| Confirm signup          | [`confirm-signup.html`](./confirm-signup.html)         | `Confirm your email · Servd`     |
| Reset password          | [`reset-password.html`](./reset-password.html)         | `Reset your password · Servd`    |
| Magic Link              | [`magic-link.html`](./magic-link.html)                 | `Your sign-in link · Servd`      |
| Change email address    | [`change-email.html`](./change-email.html)             | `Confirm your new email · Servd` |

All four share the same branded layout, so every auth email matches.

## Make the email come "from" your brand (sender name)

By default Supabase emails come from its shared mail server. To send from your
own brand/domain:

1. Supabase Dashboard → **Project Settings → Authentication → SMTP Settings**.
2. Enable **Custom SMTP** and enter your provider's details (e.g. Resend,
   Postmark, SendGrid, Amazon SES).
3. Set **Sender name** to `Servd` and **Sender email** to an address on your
   verified domain (e.g. `no-reply@servd.app`).
4. Save. New confirmation emails now arrive branded and from your domain (and
   are far less likely to land in spam than the default shared sender).

## Notes

- The confirm link redirects to `${NEXT_PUBLIC_APP_URL}/login` (set in the
  signup action), so after confirming, owners land on the login page.
- Custom SMTP also raises Supabase's low default rate limit on auth emails,
  which matters once you have real signup volume.
