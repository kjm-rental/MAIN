# Telegram foundation — @KJMRentalBot

The server-only helper is `src/lib/telegram/bot.ts`. Telegram sends updates to
`POST /api/telegram/webhook`. Only `/start` and `/mybookings` in the configured owner’s private chat
receive static replies. These commands perform no Supabase queries, linking, or booking lookup. Owner notifications use the existing ADMIN outbox; see TELEGRAM_OWNER_NOTIFICATIONS.md.
Unknown commands, group chats, bots, and other update types are acknowledged and ignored.

## Configuration

Put these in KJM MAIN's ignored `.env.local` or the hosting platform's secret environment settings:

- `TELEGRAM_OWNER_CHAT_ID`: the authorized owner’s positive private chat ID. Other chats receive no replies.
- `TELEGRAM_BOT_TOKEN`: the token from BotFather for @KJMRentalBot.
- `TELEGRAM_WEBHOOK_SECRET`: a separate random secret, 32–256 characters using letters, digits, `_`, or `-`. Generate it with `openssl rand -hex 32`.

Never use `NEXT_PUBLIC_` for these. Restart the local server after setting them.
The endpoint rejects missing/mismatched headers and returns a generic 503 when
its secret is unconfigured. Provider failures also return generic errors without
logging token-bearing URLs, Telegram payloads, or customer data.

## Register the webhook yourself

Registration requires an externally reachable HTTPS endpoint. Localhost alone
cannot receive Telegram updates. For local development, point an HTTPS tunnel
at the existing MAIN server on port 3000. This task does not create a tunnel,
deploy the application, or register/change the bot's webhook.

After setting both secrets in `.env.local`, set `KJM_TELEGRAM_WEBHOOK_URL`
to your HTTPS origin plus `/api/telegram/webhook` and run the following from KJM MAIN.
Do not paste tokens into command arguments or enable shell tracing. This script
uses environment variables, does not print provider responses, and rejects redirects.

```sh
KJM_TELEGRAM_WEBHOOK_URL=https://your-https-host/api/telegram/webhook node --env-file=.env.local --input-type=module <<'JS'
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
const url = process.env.KJM_TELEGRAM_WEBHOOK_URL;
if (!token || !/^\d+:[A-Za-z0-9_-]+$/.test(token) || !secret || !/^[A-Za-z0-9_-]{32,256}$/.test(secret)) {
  throw new Error('Set both Telegram credentials in your environment first.');
}
if (!url || new URL(url).protocol !== 'https:') throw new Error('Set an HTTPS webhook URL.');
try {
  const response = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, secret_token: secret, allowed_updates: ['message'] }),
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });
  const result = await response.json();
  if (!response.ok || result.ok !== true) throw new Error();
  console.log('Webhook registered successfully.');
} catch {
  console.error('Webhook registration failed. Check credentials and HTTPS reachability.');
  process.exitCode = 1;
}
JS
```

Telegram uses `X-Telegram-Bot-Api-Secret-Token` for the supplied `secret_token`.
Registering replaces this bot's existing webhook. Pending updates are not dropped.
Official documentation: https://core.telegram.org/bots/api#setwebhook

## Before adding booking access

Add explicit customer sign-in and consent, expiring single-use linking tokens,
a verified Telegram-user/account binding, ownership checks and existing Supabase
RLS, unlinking, and durable update-ID deduplication. Do not link via a booking
reference, username, phone number, or `/start` argument alone. Never put secrets
or booking details in deep-link parameters. Current stateless replies can be
repeated if Telegram retries; no persistent deduplication is claimed.
