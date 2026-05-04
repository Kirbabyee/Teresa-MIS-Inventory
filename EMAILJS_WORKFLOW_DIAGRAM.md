# EmailJS Account Activation Flow Diagram

## Complete Email Invitation Workflow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         EMPLOYEE INVITATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: EMPLOYEE CREATION
═══════════════════════════════════════════════════════════════════════════════
   Admin Dashboard
        │
        ▼
  ┌─────────────────────────────┐
  │  Add New Employee Form      │  ← Fill in name, email, dept, position
  │  - Name                     │
  │  - Email                    │
  │  - Department               │
  │  - Position                 │
  │  - Project Site             │
  └────────────┬────────────────┘
               │
               ▼
   EmployeeModal.jsx calls:
   createEmployeeInviteAndSendEmail()


STEP 2: TOKEN GENERATION & DATABASE
═══════════════════════════════════════════════════════════════════════════════
   employeeInvites.js
        │
        ├─→ Generate random 256-bit token
        │   token = randomInviteToken()
        │
        ├─→ Hash token with SHA-256
        │   tokenHash = await hashInviteToken(token)
        │
        └─→ Save to Supabase
            INSERT INTO employee_auth_invites:
            {
              employee_id: 123,
              email: "john@example.com",
              invite_token_hash: "abc123def456...",
              expires_at: "2025-05-11T10:30:00Z",  ← 7 days from now
              used_at: null
            }


STEP 3: EMAIL TEMPLATE PREPARATION
═══════════════════════════════════════════════════════════════════════════════
   Template Variables Created:
   ┌────────────────────────────────────────┐
   │  to_name: "John Doe"                   │
   │  role: "Software Engineer"             │
   │  department: "Engineering"             │
   │  project_site: "Main Office"           │
   │  invite_link: "https://app.com/..."    │
   │  company_name: "Ark Industries"        │
   │  support_email: "support@..."          │
   │  expires_in_days: "7"                  │
   └────────────────────────────────────────┘
               │
               ▼
   Template Rendered:
   ┌─────────────────────────────────┐
   │  Subject:                       │
   │  Your Ark Industries Account    │
   │  Activation Link                │
   │                                 │
   │  Body:                          │
   │  Hi John Doe,                   │
   │  You've been invited to join    │
   │  Engineering at Main Office...  │
   │                                 │
   │  [ACTIVATE ACCOUNT BUTTON]      │
   │  https://app.com/activate-...   │
   │  ...?token=abc123def456...      │
   │                                 │
   │  Link expires in 7 days         │
   │                                 │
   │  Support: support@...           │
   └─────────────────────────────────┘


STEP 4: EMAIL DELIVERY (EmailJS)
═══════════════════════════════════════════════════════════════════════════════
   emailjs.send(
      serviceId: "service_xxxxx",
      templateId: "template_xxxxx",
      params: {...},
      publicKey: "xxxxx"
   )
        │
        ├─→ Validate parameters
        ├─→ Connect to email service (Gmail/Outlook)
        └─→ Send email
             │
             ├─→ ✅ Success: Return to UI
             └─→ ❌ Failure: Cleanup & throw error


STEP 5: EMAIL SENT TO USER
═══════════════════════════════════════════════════════════════════════════════
   Employee's Inbox
   ┌─────────────────────────────────┐
   │ From: noreply@emailjs.com       │
   │ To: john@example.com            │
   │ Subject: Your Ark Industries... │
   │                                 │
   │ [Professional Email HTML]       │
   │ [Activation Button/Link]        │
   │                                 │
   │ https://app.com/activate-accou..│
   │ ?token=abc123def456...xyz789    │
   └─────────────────────────────────┘
             │
             ▼
   Employee opens email and clicks link
             │
             ▼
   Browser navigates to:
   /activate-account?token=abc123def456...


STEP 6: TOKEN VALIDATION
═══════════════════════════════════════════════════════════════════════════════
   ActivateAccount.jsx (useEffect)
        │
        ├─→ Extract token from URL params
        │   token = params.get("token")
        │
        ├─→ Hash the token (same method)
        │   tokenHash = await hashInviteToken(token)
        │
        └─→ Query database
            supabase.rpc("get_employee_invite_by_token", {
              p_token_hash: tokenHash
            })
                │
                ├─→ Check if invite exists
                ├─→ Check if NOT already used
                └─→ Check if NOT expired


STEP 7: DISPLAY ACTIVATION FORM
═══════════════════════════════════════════════════════════════════════════════
   ┌─────────────────────────────────────────┐
   │     ACTIVATE YOUR ACCOUNT               │
   │                                         │
   │  Email: john@example.com [disabled]     │
   │                                         │
   │  Password: [●●●●●●●]                   │
   │  ☑ Uppercase ☑ Lowercase ☑ Number      │
   │  ☑ Symbol ☑ 8+ characters               │
   │                                         │
   │  Confirm: [●●●●●●●]                    │
   │  ✓ Passwords match                      │
   │                                         │
   │  [   ACTIVATE ACCOUNT   ]               │
   └─────────────────────────────────────────┘
             │
             │ User enters password & confirms
             ▼
   Form validation:
   ✓ Password meets all requirements
   ✓ Passwords match
   ✓ Token is valid
             │
             ▼
   User clicks "ACTIVATE ACCOUNT"


STEP 8: CREATE AUTH ACCOUNT
═══════════════════════════════════════════════════════════════════════════════
   ActivateAccount.jsx calls:
   supabase.auth.signUp({
      email: "john@example.com",
      password: "SecurePass123!",
      options: {
         data: { employee_id: 123 }
      }
   })
        │
        ├─→ Supabase creates auth user
        ├─→ Password hashed and stored
        └─→ User metadata set with employee_id


STEP 9: LINK AUTH TO EMPLOYEE
═══════════════════════════════════════════════════════════════════════════════
   Update employees table:
   UPDATE employees
   SET auth_id = "user_uuid_from_supabase"
   WHERE id = 123
        │
        ▼
   Creates connection between:
   - auth.users (authentication)
   - employees (employee data)


STEP 10: MARK INVITE AS USED
═══════════════════════════════════════════════════════════════════════════════
   Update invite record:
   supabase.rpc("consume_employee_invite", {
      p_token_hash: tokenHash
   })
        │
        ▼
   UPDATE employee_auth_invites
   SET used_at = NOW()
   WHERE invite_token_hash = tokenHash
        │
        ▼
   Now token cannot be used again


STEP 11: SUCCESS & REDIRECT
═══════════════════════════════════════════════════════════════════════════════
   Show success message:
   ┌─────────────────────────────────┐
   │  ✓ Account Activated            │
   │  You can now sign in            │
   │  [  Go To Login  ]              │
   └─────────────────────────────────┘
             │
             │ After 1.5 seconds
             ▼
   Redirect to /login
        │
        ▼
   Employee can now login with:
   Email: john@example.com
   Password: SecurePass123!


AUTHENTICATION COMPLETE
═══════════════════════════════════════════════════════════════════════════════
   Employee can now:
   ✓ Login to the application
   ✓ Access their dashboard
   ✓ View and update their profile
   ✓ Perform role-based functions


═══════════════════════════════════════════════════════════════════════════════
                            DATA FLOW SUMMARY
═══════════════════════════════════════════════════════════════════════════════

┌──────────────┐
│   DATABASE   │  Stores:
│   Supabase   │  - Employees
└──────────────┘  - Invites
       ▲           - Auth Users
       │
       │ 1. Insert invite token (hashed)
       │ 2. Update employee with auth_id
       │ 3. Mark invite as used
       │
┌──────────────┐
│  EMAIL.JS    │  Sends:
│   Service    │  - Formatted HTML email
└──────────────┘  - With activation link
       ▲
       │ Template variables
       │
┌──────────────┐
│ GMAIL/OUTLOOK│  Delivers:
│   Provider   │  - Email to employee
└──────────────┘
       ▲
       │
┌──────────────┐
│   EMPLOYEE   │  Receives:
│   MAILBOX    │  - Professional invitation
└──────────────┘  - With secure link
       │
       │ Clicks link
       ▼
┌──────────────┐
│   REACT APP  │  Shows:
│   Browser    │  - Activation form
└──────────────┘  - Password requirements
       │
       │ Submits password
       ▼
┌──────────────┐
│  SUPABASE    │  Creates:
│   AUTH       │  - Auth user account
└──────────────┘  - Secure session


═══════════════════════════════════════════════════════════════════════════════
                         SECURITY FEATURES
═══════════════════════════════════════════════════════════════════════════════

✓ Token Generation:    256-bit random (crypto.getRandomValues)
✓ Token Storage:       SHA-256 hashed (never stored in plaintext)
✓ Token Expiry:        7 days (configurable)
✓ One-Time Use:        used_at timestamp prevents reuse
✓ Email Validation:    Only valid emails receive invites
✓ URL Parameter:       Token in query string only, not stored
✓ Link Format:         /activate-account?token=xxx (clean URL)
✓ Password Policy:     8+ chars, uppercase, lowercase, number, symbol
✓ Password Hashing:    Supabase handles bcrypt hashing
✓ Session Management:  Supabase auth handles JWT tokens

═══════════════════════════════════════════════════════════════════════════════
                          ERROR HANDLING
═══════════════════════════════════════════════════════════════════════════════

Invalid Token:
  "This activation link is invalid."
  → Likely typo in link or wrong link

Already Used:
  "This activation link was already used."
  → Employee already activated, request new invite

Expired:
  "This activation link has expired."
  → Link older than 7 days, request new invite

Invalid Password:
  "Please meet all password requirements."
  → Password doesn't match policy

Passwords Don't Match:
  "Password and confirm password do not match."
  → Typo or copy-paste error

Email Service Error:
  "Failed to send invite email"
  → Check EmailJS configuration and credentials

═══════════════════════════════════════════════════════════════════════════════
```

## Quick Status Check

```
✅ Setup Completed:
   [X] Token generation & hashing
   [X] Database storage
   [X] Email sending infrastructure
   [X] Activation form & validation
   [X] Token verification & expiry
   [X] Auth account creation
   [X] Employee linking
   [X] One-time use enforcement

⏳ User Must Do:
   [ ] Create EmailJS account
   [ ] Connect email service
   [ ] Create email template
   [ ] Add credentials to .env
   [ ] Restart dev server
   [ ] Test flow

🎯 Expected Behavior:
   1. Create employee with email
   2. Email sent automatically
   3. User clicks link in email
   4. Sets password in app
   5. Account activated
   6. Can login and use app
```
