// Client-side trigger for the `send-borrow-email` Supabase Edge Function.
// Kept separate from the mailer itself so the browser never imports nodemailer.

interface BorrowEmailArgs {
  id?: string | number;
  borrower_name: string;
  borrower_email: string;
  items: Array<{
    label?: string;
    item_label?: string;
    item_name?: string;
    details?: Array<{ key?: string; value?: unknown; label?: string }>;
    quantity?: number;
  }>;
  expected_return_at?: string | null;
}

interface BorrowEmailResult {
  sent: boolean;
  reason?: string;
  messageId?: string;
}

const ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ??
  import.meta.env.VITE_SUPABASE_SERVICE_ROLE_KEY ??
  "";
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? "";

const EXCLUDED_DETAIL_KEYS = /^(tab|section)$/i;

const sanitizeItems = (
  raw: BorrowEmailArgs["items"],
): BorrowEmailArgs["items"] =>
  (raw ?? []).map((it) => {
    const details = Array.isArray(it.details)
      ? it.details.filter((d) => !EXCLUDED_DETAIL_KEYS.test(String(d.key ?? "")))
      : [];
    return { ...it, details };
  });

export const triggerBorrowStatusEmail = async (
  args: BorrowEmailArgs,
  decision: "APPROVED" | "REJECTED",
): Promise<BorrowEmailResult> => {
  const email = String(args.borrower_email ?? "").trim();
  if (!email) return { sent: false, reason: "no-recipient" };
  if (!SUPABASE_URL) return { sent: false, reason: "no-supabase-url" };

  try {
    const res = await fetch(
      `${SUPABASE_URL.replace(/\/$/, "")}/functions/v1/send-borrow-email`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(ANON_KEY ? { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` } : {}),
        },
        body: JSON.stringify({
          ...args,
          borrower_email: email,
          items: sanitizeItems(args.items),
          decision,
        }),
      },
    );
    let payload: Partial<BorrowEmailResult> = {};
    try {
      payload = (await res.json()) as Partial<BorrowEmailResult>;
    } catch {
      // ignore body parse errors
    }
    if (!res.ok) {
      return { sent: false, reason: payload.reason ?? `http-${res.status}` };
    }
    return { sent: true, messageId: payload.messageId };
  } catch (err) {
    return { sent: false, reason: String(err?.message ?? err) };
  }
};

export default triggerBorrowStatusEmail;
