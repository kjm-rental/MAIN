# Cloudflare Turnstile setup

1. In Cloudflare Dashboard, open **Turnstile**, select **Add widget**, name it for KJM, and add every exact production/staging hostname that will serve KJM MAIN. Choose **Managed** mode.
2. Copy the generated **site key** and **secret key** separately. They are not interchangeable.
3. Put only the site key in KJM MAIN's local/deployment environment as `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Restart or redeploy MAIN after changing it.
4. In Supabase Dashboard for project `slevojynuumrvgiznmxk`, open **Authentication → Bot and Abuse Protection**, enable CAPTCHA, select Cloudflare Turnstile, and enter the Turnstile secret key there. Do not put this secret in KJM MAIN, KJM ADMIN, source control, or a `NEXT_PUBLIC_*` variable.
5. In **Authentication → Rate Limits**, set anonymous sign-ins to 10 per hour per IP. Verify the dashboard retained that value.
6. Before enabling anonymous sign-ins, verify a missing/invalid CAPTCHA token is rejected and a valid challenge can create a guest session. Then enable **Allow anonymous sign-ins**.

KJM MAIN passes the widget token to `supabase.auth.signInAnonymously({ options: { captchaToken } })`. Supabase Auth validates it server-side using the secret configured in the Supabase dashboard. If the public site key is missing, new guest booking submission remains blocked.
