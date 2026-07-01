import nodemailer from "npm:nodemailer@6";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-app-session",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const jsonResponse = (payload: unknown, status = 200) =>
  new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const SMTP_HOST = Deno.env.get("SMTP_HOST") ?? "";
const SMTP_PORT = Number(Deno.env.get("SMTP_PORT") ?? 587);
const SMTP_USER = Deno.env.get("SMTP_USER") ?? "";
const SMTP_PASS = Deno.env.get("SMTP_PASS") ?? "";
const SMTP_FROM = Deno.env.get("SMTP_FROM") ?? "Teresa MIS <no-reply@teresamis.edu>";

const escapeHtml = (str: unknown) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value: unknown) => {
  if (!value) return "—";
  try {
    return new Date(String(value)).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
};

type ItemInput = {
  label?: unknown;
  item_label?: unknown;
  item_name?: unknown;
  details?: Array<{ key?: string; value?: unknown; label?: string }>;
  quantity?: unknown;
};

type RequestBody = {
  borrower_name?: string;
  borrower_email?: string;
  decision?: string;
  items?: ItemInput[];
  expected_return_at?: string | null;
  id?: string | number;
};

const itemLabel = (item: ItemInput) => {
  const raw = item.label ?? item.item_label ?? item.item_name ?? "Item";
  if (typeof raw === "object") {
    const obj = raw as { label?: string; value?: unknown };
    return obj?.label ?? obj?.value ?? "Item";
  }
  return String(raw);
};

const itemQty = (item: ItemInput) => {
  const fromDetails = (item.details ?? []).find(
    (d) => String(d?.key ?? "").toLowerCase() === "quantity",
  )?.value;
  return Number(fromDetails ?? item.quantity ?? 1);
};

const shell = ({
  heading,
  bodyHtml,
  borrowerName,
  referenceId,
}: {
  heading: string;
  bodyHtml: string;
  borrowerName: string;
  referenceId?: string | number;
}) => `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <meta name="supported-color-schemes" content="light" />
</head>
<body style="margin:0;padding:24px;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:580px;background-color:#ffffff;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden;">
        <tr><td style="background-color:#4a1111;padding:24px;text-align:center;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">TERESA MIS</p>
            <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;">Inventory & Borrowing System</p>
        </td></tr>
        <tr><td style="padding:24px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#1e293b;">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">Hi <strong style="color:#1e293b;">${escapeHtml(borrowerName)}</strong>,</p>
            ${
              referenceId
                ? `<div style="font-size:11px;font-family:monospace;color:#64748b;margin-top:4px;margin-bottom:24px;letter-spacing:0.5px;">REFERENCE ID: #${escapeHtml(String(referenceId))}</div>`
                : ""
            }
            ${bodyHtml}
        </td></tr>
        <tr><td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">This is an automated message from the Teresa MIS Borrowing System.<br />Do not reply to this email.</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

const renderEmail = (body: RequestBody) => {
  const items: ItemInput[] = Array.isArray(body.items) ? body.items : [];
  const itemRows = items
    .map((item) => {
      const label = itemLabel(item);
      const qty = itemQty(item);
      const details = Array.isArray(item.details) ? item.details : [];
      const rawBrand = details.find((d) =>
        String(d?.key ?? "").toLowerCase() === "brand"
      )?.value;
      const rawCondition = details.find((d) =>
        String(d?.key ?? "").toLowerCase() === "condition"
      )?.value;
      const sub = [rawBrand, rawCondition].filter(Boolean).join(" · ");
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(sub || "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:500;">${qty}</td>
      </tr>`;
    })
    .join("");

  const itemTable = items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0;"><thead><tr style="background-color:#f1f5f9;"><th align="left" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Item</th><th align="left" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Details</th><th align="right" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Qty</th></tr></thead><tbody>${itemRows}</tbody></table>`
    : `<p style="font-size:14px;color:#64748b;margin:12px 0;">(No items listed on this request.)</p>`;

  const upper = String(body.decision ?? "").toUpperCase();
  if (upper === "APPROVED") {
    return {
      subject: "Borrowing Request Authorization Confirmation",
      heading: "Borrowing Request Authorization Confirmation",
      bodyHtml: `
        <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">The administrative review for your recent borrowing request is complete. The items below are now authorized for distribution.</p>
        ${itemTable}
        ${
          body.expected_return_at
            ? `<div style="margin-top:20px;padding:14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;"><p style="margin:0;font-size:13px;color:#475569;line-height:1.5;"><strong>Return by:</strong> ${formatDate(body.expected_return_at)}</p></div>`
            : ""
        }
        <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.6;">Please retain this notice for your records. Thank you for using the Teresa MIS borrowing system.</p>`,
    };
  }

  return {
    subject: "Borrowing Request Advisory Notice",
    heading: "Borrowing Request Advisory Notice",
    bodyHtml: `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">Your recent borrowing request could not be authorized at this time. Please review the details below or check item availability at the kiosk.</p>
      ${itemTable}
      <div style="margin-top:20px;padding:14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;"><p style="margin:0;font-size:13px;color:#475569;line-height:1.5;"><strong>Next steps:</strong> item availability may have changed, or additional verification may be needed. Please visit the borrowing kiosk to check availability or re-submit your request with updated information.</p></div>
      <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.6;">If you have questions, please contact the administrator or visit the borrowing station.</p>`,
  };
};

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { status: 200, headers: corsHeaders });
  }

  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    return jsonResponse({ sent: false, reason: "smtp-not-configured" }, 200);
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonResponse({ sent: false, reason: "invalid-json" }, 400);
  }

  const to = String(body?.borrower_email ?? "").trim();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!to || !emailRe.test(to)) {
    return jsonResponse({ sent: false, reason: "no-recipient" }, 200);
  }

  const decision = String(body?.decision ?? "APPROVED").toUpperCase();
  const { subject, heading, bodyHtml } = renderEmail({
    ...body,
    decision: decision === "APPROVED" ? "APPROVED" : "REJECTED",
  });

  try {
    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_PORT === 465,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    const html = shell({
      heading,
      bodyHtml,
      borrowerName: String(body?.borrower_name ?? ""),
      referenceId: body?.id,
    });

    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      html,
    });
    console.log(`[send-borrow-email] ${decision} email sent to ${to} (id=${info.messageId})`);
    return jsonResponse({ sent: true, messageId: info.messageId }, 200);
  } catch (err) {
    console.error(`[send-borrow-email] send failed to ${to}:`, String(err));
    return jsonResponse({ sent: false, reason: "send-failed" }, 500);
  }
});