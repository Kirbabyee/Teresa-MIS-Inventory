# EmailJS Account Activation Email Setup

This guide will help you configure EmailJS to send account activation invitation emails.

## Step 1: Create an EmailJS Account

1. Go to [emailjs.com](https://www.emailjs.com)
2. Click **Sign Up** and create a new account
3. Verify your email

## Step 2: Connect Your Email Service

1. Log in to your EmailJS dashboard
2. Go to **Email Services** in the sidebar
3. Click **Add Service**
4. Choose your email provider:
   - **Gmail** (Recommended - easiest setup)
   - **Outlook**
   - **SendGrid**
   - **Other SMTP providers**

### For Gmail:
1. Click **Gmail**
2. Authorize your Gmail account
3. Note the **Service ID** (format: `service_xxxxxx`)

### For Other Providers:
1. Choose your provider
2. Enter your SMTP credentials
3. Complete the setup and note your **Service ID**

## Step 3: Create an Email Template

1. In the EmailJS dashboard, go to **Email Templates**
2. Click **Create New Template**
3. Name it: `Account Activation Invite` (or your preferred name)
4. Configure the template:

### Email Subject:
```
Your {{company_name}} Account Activation Link
```

### Email Content (HTML):
```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #2E6F40 0%, #1a4d2e 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
    .content { background: #f8f9fa; padding: 30px; border-radius: 0 0 8px 8px; border: 1px solid #e0e0e0; }
    .card { background: white; padding: 20px; margin: 20px 0; border-radius: 6px; border-left: 4px solid #2E6F40; }
    .button { display: inline-block; background: #2E6F40; color: white; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
    .details { background: #f0f4f8; padding: 15px; border-radius: 6px; margin: 20px 0; font-size: 14px; }
    .details-item { margin: 8px 0; }
    .footer { font-size: 12px; color: #999; text-align: center; margin-top: 30px; }
    .warning { background: #fff3cd; border: 1px solid #ffc107; color: #856404; padding: 12px; border-radius: 4px; margin: 20px 0; font-size: 13px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1 style="margin: 0;">Welcome to {{company_name}}</h1>
    </div>
    
    <div class="content">
      <p>Hi {{to_name}},</p>
      
      <p>You've been invited to activate your {{company_name}} employee account. Click the button below to set your password and get started.</p>
      
      <center>
        <a href="{{invite_link}}" class="button">Activate Account</a>
      </center>
      
      <p style="text-align: center; margin: 20px 0; font-size: 13px; color: #666;">
        Or copy this link in your browser:<br>
        <code style="background: #f5f5f5; padding: 8px 12px; border-radius: 4px; word-break: break-all;">{{invite_link}}</code>
      </p>
      
      <div class="card">
        <strong>Your Assignment Details:</strong>
        <div class="details">
          {{#if role}}<div class="details-item"><strong>Position:</strong> {{role}}</div>{{/if}}
          {{#if department}}<div class="details-item"><strong>Department:</strong> {{department}}</div>{{/if}}
          {{#if project_site}}<div class="details-item"><strong>Project Site:</strong> {{project_site}}</div>{{/if}}
          {{#if assignment_summary}}<div class="details-item">{{assignment_summary}}</div>{{/if}}
        </div>
      </div>
      
      <div class="warning">
        <strong>⏰ Link Expiration:</strong> This activation link will expire in {{expires_in_days}} days. Make sure to activate your account before it expires.
      </div>
      
      <p style="margin-top: 30px; font-size: 14px;">
        If you didn't expect this email or have any questions, please contact us at <a href="mailto:{{support_email}}">{{support_email}}</a>
      </p>
      
      <p style="margin-top: 10px; font-size: 14px;">
        Best regards,<br>
        The {{company_name}} Team
      </p>
      
      <div class="footer">
        <p>This is an automated email. Please do not reply directly.</p>
      </div>
    </div>
  </div>
</body>
</html>
```

### Template Variables Used:
- `{{to_email}}` - Recipient email (mapped from `to_email` or `email`)
- `{{to_name}}` - Employee's display name
- `{{role}}` - Position/Role
- `{{department}}` - Department name
- `{{project_site}}` - Project site name
- `{{assignment_summary}}` - Summary of assignments
- `{{invite_link}}` - Full activation link with token
- `{{company_name}}` - Company name (Ark Industries)
- `{{support_email}}` - Support email address
- `{{expires_in_days}}` - Days until invite expires

5. Save the template and note its **Template ID** (format: `template_xxxxxx`)

## Step 4: Get Your EmailJS Credentials

1. Go to **Account** in the EmailJS dashboard
2. Under **API Keys**, find:
   - **Public Key** (starts with `***` in the dashboard)
   - Copy your **Service ID** from Email Services
   - Copy your **Template ID** from Email Templates

## Step 5: Update Environment Variables

Add the following to your `.env` file:

```env
# EmailJS Configuration
VITE_EMAILJS_SERVICE_ID=service_xxxxxxxxxxxxx
VITE_EMAILJS_TEMPLATE_ID_INVITE=template_xxxxxxxxxxxxx
VITE_EMAILJS_PUBLIC_KEY=xxxxxxxxxxxxxxxxxxxx_xxxxxxxxxxxxx

# Optional: Support email for activation emails
VITE_SUPPORT_EMAIL=support@arkindustries.com

# Optional: Public site URL (for generating activation links)
VITE_PUBLIC_SITE_URL=https://yourcompany.com
```

Replace the `xxx` values with your actual credentials from EmailJS.

## Step 6: Test the Setup

1. Restart your development server: `npm run dev`
2. Go to the Employees page
3. Create a new employee with an email address
4. The system will automatically send an activation email
5. Check the employee's email inbox for the invitation
6. Click the activation link to verify it works

## Troubleshooting

### "Missing EmailJS environment variables" error
- Make sure all required variables are in `.env`
- Restart your dev server after adding variables
- Check that variable names are exact (case-sensitive)

### "EmailJS template recipient is not configured" error
- In your EmailJS template, set the **To Email** field to: `{{to_email}}`
- Save the template and try again

### "Failed to send invite email" error
- Check your EmailJS dashboard for rate limits
- Verify your email service is properly connected
- Check the service status on emailjs.com

### Email not received
- Check spam/junk folder
- Verify email address is correct
- Check EmailJS activity log in dashboard
- Ensure template is saved and active

## Security Notes

- The invitation tokens are SHA-256 hashed before storage
- Links expire after 7 days by default
- Tokens can only be used once
- Each employee can request a new invite to be resent
- The activation URL only works for this specific app instance

## Email Variables Available

When an invite email is sent, the following variables are available in your template:

```javascript
{
  to_email: "employee@example.com",           // Email address
  to_name: "John Doe",                        // Employee name
  role: "Software Engineer",                  // Position
  department: "Engineering",                  // Department
  project_site: "Main Office",                // Project site
  position: "Software Engineer",              // Position (duplicate)
  assignment_summary: "Project Site: Main Office | Department: Engineering | Position: Software Engineer",
  invite_link: "https://yourapp.com/activate-account?token=abc123...",
  company_name: "Ark Industries",             // Your company
  support_email: "support@arkindustries.com",  // Support email
  expires_in_days: "7"                        // Days until expiry
}
```

## Next Steps

1. ✅ Create EmailJS account
2. ✅ Connect email service (Gmail/Outlook/etc)
3. ✅ Create email template with provided HTML
4. ✅ Get Service ID, Template ID, and Public Key
5. ✅ Add credentials to `.env`
6. ✅ Test with a new employee
7. ✅ Monitor email delivery in EmailJS dashboard

The activation flow is now complete! When employees are invited, they'll receive a professional email with an activation link that redirects them to your app's account activation page.
