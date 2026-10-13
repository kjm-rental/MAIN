import { accountMethods, availableMethods, respond } from "@/lib/paymongo/test-payments";
export async function GET() {
  try {
    const methods = await accountMethods();
    let onlineEnabled = false;
    try { await availableMethods(); onlineEnabled = true; } catch { /* preview only */ }
    return respond({ methods, onlineEnabled });
  } catch { return respond({ methods: [], onlineEnabled: false }); }
}
