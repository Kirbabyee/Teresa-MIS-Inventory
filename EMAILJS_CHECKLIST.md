# ✅ EmailJS Setup Checklist

Follow these steps in order to get account activation emails working.

---

## 📋 STEP 1: Create EmailJS Account

- [ ] Go to https://www.emailjs.com
- [ ] Click "Sign Up"
- [ ] Create account with email/password
- [ ] Check your email for verification link
- [ ] Click verification link to activate account
- [ ] Login to EmailJS dashboard

**Status**: _________

---

## 🔗 STEP 2: Connect Email Service

Choose ONE email provider:

### Option A: Gmail (Recommended - Easiest)

- [ ] In EmailJS dashboard, go to **Email Services**
- [ ] Click **Add Service**
- [ ] Select **Gmail**
- [ ] Click **Connect with Gmail**
- [ ] Authorize your Gmail account
- [ ] Copy the **Service ID** (starts with `service_`)
  ```
  Service ID: _________________________________
  ```
- [ ] Save the service

### Option B: Outlook / Other Email

- [ ] In EmailJS dashboard, go to **Email Services**
- [ ] Click **Add Service**
- [ ] Select your email provider
- [ ] Enter SMTP credentials (username, password, host, port)
- [ ] Copy the **Service ID**
  ```
  Service ID: _________________________________
  ```
- [ ] Save the service

**Status**: _________

---

## 📧 STEP 3: Create Email Template

- [ ] In EmailJS dashboard, go to **Email Templates**
- [ ] Click **Create New Template**
- [ ] Enter template name: `Account Activation Invite`

### Configure Template Fields

#### Subject Line:
```
Your {{company_name}} Account Activation Link
```
- [ ] Copy subject above

#### To Email:
```
{{to_email}}
```
- [ ] IMPORTANT: Set this exactly as shown (not your email)

#### Email Content (HTML Body):

- [ ] Click **Code Editor** or **HTML** tab
- [ ] Copy the entire HTML from `EMAILJS_SETUP.md` (the long HTML section)
- [ ] Paste into the template body
- [ ] Click **Save Template**

#### Verify Template:
- [ ] Subject is correct
- [ ] To Email is `{{to_email}}`
- [ ] HTML content is in place
- [ ] Template shows as "Active"

- [ ] Copy the **Template ID** (starts with `template_`)
  ```
  Template ID: ________________________________
  ```

**Status**: _________

---

## 🔐 STEP 4: Get Your Credentials

### Service ID
- [ ] From: Email Services → Your service
  ```
  Service ID: _________________________________
  ```

### Template ID
- [ ] From: Email Templates → Your template
  ```
  Template ID: ________________________________
  ```

### Public Key
- [ ] Go to **Account** → **API Keys**
- [ ] Find **Public Key** section
- [ ] Copy the public key (long string with underscores)
  ```
  Public Key: _________________________________
  ```

**Important Notes:**
- Do NOT use Private Key
- Do NOT share these credentials publicly
- Keep them safe and only in `.env` files

**Status**: _________

---

## 🔧 STEP 5: Update Environment Variables

- [ ] Open your project's `.env` file
- [ ] Find the EmailJS section
- [ ] Replace the placeholder values with your credentials:

```env
# Replace service_xxxxxxxxxxxxx with your Service ID
VITE_EMAILJS_SERVICE_ID=service_xxxxxxxxxxxxx

# Replace template_xxxxxxxxxxxxx with your Template ID  
VITE_EMAILJS_TEMPLATE_ID_INVITE=template_xxxxxxxxxxxxx

# Replace the key with your Public Key
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx

# Optional: Your support email
VITE_SUPPORT_EMAIL=support@arkindustries.com

# Your app's base URL (for local testing)
VITE_PUBLIC_SITE_URL=http://localhost:5173
VITE_APP_BASE_URL=http://localhost:5173
```

**Before you continue:**
- [ ] All three variables (Service ID, Template ID, Public Key) are filled in
- [ ] No placeholder values remain (no more `xxx`)
- [ ] File is saved

**Status**: _________

---

## 🚀 STEP 6: Restart Development Server

Open terminal in your project folder and run:

```bash
npm run dev
```

- [ ] Terminal shows "Local: http://localhost:5173"
- [ ] No errors about missing environment variables
- [ ] Server is running

**Status**: _________

---

## 🧪 STEP 7: Test the Complete Flow

### Test Email Sending:

1. [ ] Open your app in browser (http://localhost:5173)
2. [ ] Navigate to **Employees** page
3. [ ] Click **+ Add Employee** button
4. [ ] Fill in the form:
   - **Employee Code**: TEST001
   - **First Name**: Test
   - **Last Name**: User
   - **Email**: YOUR_REAL_EMAIL_ADDRESS (use your own email to test)
   - **Department**: Select any
   - **Position**: Select any
   - **Status**: Select any

5. [ ] Click **Save Employee** or **Next Step**
6. [ ] You should see a success message (no error about EmailJS)
7. [ ] Check your email inbox (might be in spam folder)
8. [ ] Look for email from "Ark Industries" or "noreply@emailjs.com"

**Email Should Have:**
- [ ] Your name as greeting
- [ ] Your department and position
- [ ] Activation button/link
- [ ] Company branding (green colors)
- [ ] Support email address
- [ ] Expiration notice (7 days)

**Status**: _________

### Test Activation Link:

1. [ ] In the email, click the **"Activate Account"** button
   - OR copy and paste the link shown
2. [ ] Browser should redirect to: `/activate-account?token=abc123...`
3. [ ] You should see the account activation form
4. [ ] Form shows your email address
5. [ ] Password requirements are visible:
   - [ ] At least 8 characters
   - [ ] Uppercase letter
   - [ ] Lowercase letter
   - [ ] Number
   - [ ] Symbol
6. [ ] Enter a password meeting all requirements:
   ```
   Example: TestPassword123!
   ```
7. [ ] Confirm password
8. [ ] You should see checkmarks for each requirement
9. [ ] "Passwords match" message appears
10. [ ] Click **"Activate Account"** button
11. [ ] See success message: "Your account has been activated"
12. [ ] After ~1.5 seconds, redirected to login page
13. [ ] You can now see the login form

**Status**: _________

---

## 🔑 STEP 8: Verify User Can Login

- [ ] On login page, enter:
  - **Email**: TEST_USER_EMAIL
  - **Password**: TestPassword123! (what you set)
- [ ] Click login
- [ ] You should successfully login
- [ ] Verify you see the dashboard or app

**Status**: _________

---

## ✨ STEP 9: Monitor Email Delivery (Optional)

Track email sending in EmailJS:

- [ ] Log into EmailJS dashboard
- [ ] Go to **Monitoring** section
- [ ] You should see:
  - [ ] Emails sent count
  - [ ] Delivery success
  - [ ] Any failures
  - [ ] Each email with timestamp

**Status**: _________

---

## 🎉 Complete! All Done

You've successfully set up account activation emails! 

### What Now Works:

✅ Admin creates new employee with email  
✅ System automatically generates secure invite token  
✅ Professional email sent with activation link  
✅ Employee clicks link and is taken to activation page  
✅ Employee sets secure password  
✅ Account is created and linked to employee record  
✅ Employee can now login  

### Next Steps:

1. **Test with real employees**: Try inviting actual team members
2. **Customize email template**: Adjust colors, content, branding if needed
3. **Check spam settings**: Help users check spam folder for first emails
4. **Resend invites**: Test the "Resend Invite" button (mail icon in Employees table)
5. **Monitor EmailJS**: Keep an eye on email sending stats in dashboard

### Resending Invites:

If an employee needs a new invite link:
1. Go to **Employees** page
2. Find the employee
3. Click the **📧 Mail** icon
4. New invite will be sent automatically

### Support:

- **EmailJS Help**: https://www.emailjs.com/docs/
- **Troubleshooting**: See `EMAILJS_SETUP.md` file
- **Workflow Diagram**: See `EMAILJS_WORKFLOW_DIAGRAM.md` file

---

## 📝 Notes

Write down any issues or customizations:

```
_________________________________________________________________

_________________________________________________________________

_________________________________________________________________

_________________________________________________________________
```

---

**Setup Started**: _______________  
**Setup Completed**: _______________  
**First Test**: _______________  

🎯 **You're all set!** Account activation emails are now live!
