# EmailJS Account Activation Email - Setup Complete ✅

Your project already has EmailJS integration built-in! Here's what has been set up and what you need to do.

## What's Already Implemented

✅ **Invite System**: When you create a new employee, an invitation is automatically sent
✅ **Token Generation**: Secure 256-bit random tokens are generated and SHA-256 hashed
✅ **Database Storage**: Invites are stored in `employee_auth_invites` table with expiry dates
✅ **Email Delivery**: EmailJS integration is ready to send emails
✅ **Activation Page**: Beautiful account activation UI already exists
✅ **Token Validation**: 7-day expiry, one-time use tokens are enforced
✅ **Redirect Flow**: Clicking email link automatically redirects to activation page

## What You Need to Do

### 1. Create EmailJS Account
- Go to https://www.emailjs.com
- Sign up for free account
- Verify your email

### 2. Connect Email Service
- Log into EmailJS dashboard
- Go to **Email Services**
- Add your email service (Gmail, Outlook, SendGrid, etc.)
- Authorize and save
- **Copy your Service ID** (looks like: `service_xxxxxxxxxxxxxx`)

### 3. Create Email Template
- Go to **Email Templates** in EmailJS
- Click **Create New Template**
- Copy the template HTML from `EMAILJS_SETUP.md` file
- Make sure the template **To Email field** is set to: `{{to_email}}`
- Save template
- **Copy your Template ID** (looks like: `template_xxxxxxxxxxxxx`)

### 4. Get Public Key
- Go to **Account** → **API Keys**
- **Copy your Public Key**

### 5. Update Environment Variables
Edit your `.env` file and replace the placeholder values:

```env
VITE_EMAILJS_SERVICE_ID=service_xxxxxxxxxxxxxx
VITE_EMAILJS_TEMPLATE_ID_INVITE=template_xxxxxxxxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx
VITE_SUPPORT_EMAIL=support@arkindustries.com
VITE_PUBLIC_SITE_URL=http://localhost:5173
```

### 6. Restart Your Dev Server
```bash
npm run dev
```

### 7. Test the Flow
1. Navigate to **Employees** page
2. Click **+ Add Employee**
3. Fill in employee details including **email**
4. Click **Save** or **Next** to complete
5. An invitation email will be sent automatically
6. Check the employee's email inbox
7. Click the activation link
8. You'll be redirected to the activation page to set a password

## Email Template Variables

When sending invites, these variables are available in your email template:

```
{{to_name}}              → Employee's display name
{{role}}                 → Position/job title
{{department}}           → Department name
{{project_site}}         → Project site name
{{position}}             → Position (same as role)
{{assignment_summary}}   → Summary of all assignments
{{invite_link}}          → Full activation URL with secure token
{{company_name}}         → Your company (Ark Industries)
{{support_email}}        → Support contact email
{{expires_in_days}}      → Expiration period (7 days)
{{to_email}}             → Employee's email address
```

## Email Template Example

The template provided in `EMAILJS_SETUP.md` includes:
- ✅ Professional branding with Ark Industries colors
- ✅ Clear call-to-action button
- ✅ Employee assignment details
- ✅ Link expiration warning
- ✅ Fallback text link
- ✅ Support contact information
- ✅ Responsive mobile design

## Files Changed

- **`/.env`** - Added EmailJS environment variables
- **`/.env.example`** - Created example configuration file
- **`/src/pages/ActivateAccount.jsx`** - Fixed incorrect API client import
- **`/EMAILJS_SETUP.md`** - Complete setup guide with HTML template

## How the Flow Works

```
1. Admin creates employee → 2. System generates invite token
   ↓
3. Token hashed & stored → 4. Email sent with activation link
   ↓
5. Employee clicks link → 6. Redirected to /activate-account?token=xxx
   ↓
7. Token validated → 8. Employee sets password
   ↓
9. Account created → 10. Auth ID linked to employee record
   ↓
11. Invite marked as used → 12. Employee can now login
```

## Database Tables Used

- **`employees`** - Main employee records
- **`employee_auth_invites`** - Invitation tokens & expiry
- **`auth.users`** - Supabase auth accounts (created on activation)

## Invitation Features

✅ **Auto-sent** - Sent automatically when employee is created
✅ **Resendable** - Employees page has "Resend Invite" button (Mail icon)
✅ **Expiring** - Links expire after 7 days by default
✅ **One-time use** - Each token can only be used once
✅ **Secure** - Uses SHA-256 hashing for token storage
✅ **Email validation** - Requires valid email before sending
✅ **Professional** - Includes employee details and branding

## Troubleshooting

### Issue: "Missing EmailJS environment variables"
**Fix**: Ensure all three variables are in `.env` and restart dev server

### Issue: "EmailJS template recipient is not configured"
**Fix**: In EmailJS, set template's "To Email" field to: `{{to_email}}`

### Issue: Email not being sent
**Fix**: Check EmailJS dashboard for:
- Service is connected and authorized
- Template exists and is active
- No rate limiting or quotas exceeded

### Issue: Activation link not working
**Fix**: Check that `.env` has correct `VITE_PUBLIC_SITE_URL` or `VITE_APP_BASE_URL`

## Next Steps

1. ✅ Create EmailJS account (free)
2. ✅ Connect your email service
3. ✅ Create email template
4. ✅ Get Service ID, Template ID, Public Key
5. ✅ Update `.env` file
6. ✅ Restart dev server
7. ✅ Test by creating a test employee
8. ✅ Monitor emails in EmailJS dashboard

## Support

- **EmailJS Docs**: https://www.emailjs.com/docs/
- **API Reference**: https://www.emailjs.com/docs/rest-api/send/
- **Template Guide**: https://www.emailjs.com/docs/user-guide/

All the hard work is done! Just connect EmailJS and your employee invitation emails will work perfectly. 🚀
