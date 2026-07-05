import nodemailer from "nodemailer";

// ──────────────────────────────────────────────────────────────────────────────
// Borrowing Status Email Notification Utility
// Handles transactional emails for APPROVED / REJECTED borrowing requests.
// ──────────────────────────────────────────────────────────────────────────────

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || "Teresa MIS <no-reply@teresamis.edu>";

// Reused across calls — created lazily
let transporter = null;

const getTransporter = () => {
  if (transporter) return transporter;
  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
};

// ── Helpers ────────────────────────────────────────────────────────────────

const escapeHtml = (str) =>
  String(str ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");

const formatDate = (value) => {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
  } catch {
    return String(value);
  }
};

const itemLabel = (item) => {
  const raw = item.label || item.item_label || item.item_name || "Item";
  if (typeof raw === "object") return raw?.label || raw?.value || "Item";
  return String(raw);
};

const itemQty = (item) => {
  const fromDetails = (item.details || []).find(
    (d) => String(d.key || "").toLowerCase() === "quantity"
  )?.value;
  return Number(fromDetails || item.quantity || 1);
};

// ── Shell template (wraps every variant) ──────────────────────────────────

const shell = ({ heading, bodyHtml, borrowerName, borrowId }) => `<!DOCTYPE html>
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

        <!-- Brand bar -->
        <tr>
          <td style="background-color:#4a1111;padding:24px;text-align:center;">
            <p style="margin:0;font-size:18px;font-weight:700;color:#ffffff;letter-spacing:0.5px;">TERESA MIS</p>
            <p style="margin:4px 0 0;font-size:11px;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;">Inventory & Borrowing System</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:24px;">
            <h1 style="margin:0 0 12px;font-size:20px;font-weight:600;color:#1e293b;">${escapeHtml(heading)}</h1>
            <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
              Hi <strong style="color:#1e293b;">${escapeHtml(borrowerName)}</strong>,
            </p>
            ${
              borrowId
                ? `<div style="font-size:11px;font-family:monospace;color:#64748b;margin-top:4px;margin-bottom:24px;letter-spacing:0.5px;">Borrow ID: #${escapeHtml(String(borrowId))}</div>`
                : ""
            }
            ${bodyHtml}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:20px 32px;background-color:#f8fafc;border-top:1px solid #e2e8f0;text-align:center;">
            <p style="margin:0;font-size:12px;color:#94a3b8;line-height:1.5;">
              This is an automated message from the Teresa MIS Borrowing System.<br />Do not reply to this email.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

// ────────────────────────────────────────────────────────────────────────────
// sendBorrowStatusEmail(borrowerData, decision) → { success: Boolean }
// ────────────────────────────────────────────────────────────────────────────

export const sendBorrowStatusEmail = async (borrowerData, decision) => {
  // ── Validate ───────────────────────────────────────────────────────────
  const { borrower_name, borrower_email, items = [], expected_return_at = null } = borrowerData || {};

  if (!borrower_email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(borrower_email)) {
    console.warn("[email] sendBorrowStatusEmail: missing or invalid borrower_email, skipping.");
    return { success: false, reason: "no-recipient" };
  }

  const upper = String(decision || "").toUpperCase();
  if (upper !== "APPROVED" && upper !== "REJECTED") {
    console.warn(`[email] sendBorrowStatusEmail: invalid decision "${decision}", must be APPROVED or REJECTED.`);
    return { success: false, reason: "invalid-decision" };
  }

  // ── Build item table ───────────────────────────────────────────────────
  const itemRows = items
    .map((item) => {
      const label = itemLabel(item);
      const qty = itemQty(item);
      const rawBrand = (item.details || []).find(
        (d) => String(d.key || "").toLowerCase() === "brand"
      )?.value;
      const rawCondition = (item.details || []).find(
        (d) => String(d.key || "").toLowerCase() === "condition"
      )?.value;
      const sub = [rawBrand || null, rawCondition || null].filter(Boolean).join(" · ");
      return `<tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;">${escapeHtml(label)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:12px;color:#64748b;">${escapeHtml(sub || "—")}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-size:13px;color:#1e293b;text-align:right;font-weight:500;">${qty}</td>
      </tr>`;
    })
    .join("");

  const itemTable = items.length
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:1px solid #e2e8f0;border-radius:6px;overflow:hidden;margin:12px 0;">
        <thead>
          <tr style="background-color:#f1f5f9;">
            <th align="left" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Item</th>
            <th align="left" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Details</th>
            <th align="right" style="padding:10px 12px;font-size:11px;color:#475569;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e2e8f0;">Qty</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>`
    : `<p style="font-size:14px;color:#64748b;margin:12px 0;">(No items listed on this request.)</p>`;

  // ── Branch-specific content ───────────────────────────────────────────
  let subject, heading, bodyHtml;

  if (upper === "APPROVED") {
    subject = "Borrowing Request Authorization Confirmation";
    heading = "Borrowing Request Authorization Confirmation";
    bodyHtml = `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
        The administrative review for your recent borrowing request is complete. The items below are now authorized for distribution.
      </p>
      ${itemTable}
      ${
        expected_return_at
          ? `<div style="margin-top:20px;padding:14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
              <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">
                <strong>Return by:</strong> ${formatDate(expected_return_at)}
              </p>
            </div>`
          : ""
      }
      <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.6;">
        Please retain this notice for your records. Thank you for using the Teresa MIS borrowing system.
      </p>`;
  } else {
    subject = "Borrowing Request Advisory Notice";
    heading = "Borrowing Request Advisory Notice";
    bodyHtml = `
      <p style="margin:0 0 20px;font-size:14px;color:#475569;line-height:1.6;">
        Your recent borrowing request could not be authorized at this time. Please review the details below or check item availability at the kiosk.
      </p>
      ${itemTable}
      <div style="margin-top:20px;padding:14px;background-color:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
        <p style="margin:0;font-size:13px;color:#475569;line-height:1.5;">
          <strong>Next steps:</strong> item availability may have changed, or additional verification may be needed. Please visit the borrowing kiosk to check availability or re-submit your request with updated information.
        </p>
      </div>
      <p style="margin:20px 0 0;font-size:14px;color:#475569;line-height:1.6;">
        If you have questions, please contact the administrator or visit the borrowing station.
      </p>`;
  }

  const html = shell({
    heading,
    bodyHtml,
    borrowerName: borrower_name,
    borrowId: borrowerData?.borrow_id ?? borrowerData?.borrowId ?? borrowerData?.id,
  });

  // ── Send ───────────────────────────────────────────────────────────────
  try {
    const tx = getTransporter();
    const info = await tx.sendMail({
      from: SMTP_FROM,
      to: borrower_email,
      subject,
      html,
    });
    console.info(`[email] ${upper} email sent to ${borrower_email} (id=${info.messageId})`);
    return { success: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[email] Failed to send ${upper} email to ${borrower_email}:`, err?.message || err);
    return { success: false, reason: "send-failed", error: err?.message };
  }
};

export default sendBorrowStatusEmail;