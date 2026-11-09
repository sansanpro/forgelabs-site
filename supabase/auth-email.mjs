// Sets the Studio's sign-in emails on the Supabase project: sending through Google Workspace
// (smtp.gmail.com) instead of Supabase's test mailer, which only reaches the project's team, and
// the subjects and templates in supabase/templates/.
//
//   node --env-file=.env.local supabase/auth-email.mjs
//
// .env.local: SUPABASE_ACCESS_TOKEN and SMTP_APP_PASSWORD (a Google app password for
// SMTP_USER), optionally SMTP_USER (default hassan@forgelaboratory.net) and SMTP_FROM (a "Send
// mail as" address of that account, default SMTP_USER). Secrets are never printed.
import { readFileSync } from 'node:fs';

const REF = 'cuijqoorjgvlyiyizgxi';
const dir = new URL('./templates/', import.meta.url);
const tpl = (f) => readFileSync(new URL(f, dir), 'utf8');
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) throw new Error('SUPABASE_ACCESS_TOKEN must be set');

const config = {
  mailer_subjects_confirmation: 'Confirm your email for App Ad Studio',
  mailer_templates_confirmation_content: tpl('confirmation.html'),
  mailer_subjects_recovery: 'Reset your App Ad Studio password',
  mailer_templates_recovery_content: tpl('recovery.html'),
  mailer_subjects_email_change: 'Confirm your new email for App Ad Studio',
  mailer_templates_email_change_content: tpl('email_change.html'),
};
const pass = (process.env.SMTP_APP_PASSWORD || '').replace(/\s+/g, '');  // Google shows it in groups of four
// Supabase only allows custom templates on a free project once it sends through your own server
if (!pass) { console.error('Add SMTP_APP_PASSWORD to .env.local first: Supabase only takes templates with custom SMTP.'); process.exit(1); }
const user = process.env.SMTP_USER || 'hassan@forgelaboratory.net';
Object.assign(config, {
  smtp_host: 'smtp.gmail.com', smtp_port: '465', smtp_user: user, smtp_pass: pass,
  smtp_admin_email: process.env.SMTP_FROM || user, smtp_sender_name: 'ForgeLabs App Ad Studio',
  smtp_max_frequency: 30,      // seconds between emails to one address
  rate_limit_email_sent: 100,  // per hour for the project; Workspace allows about 2,000 a day
});

const r = await fetch(`https://api.supabase.com/v1/projects/${REF}/config/auth`, {
  method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify(config),
});
if (!r.ok) throw new Error(`Supabase answered ${r.status}: ${(await r.text()).slice(0, 300)}`);
const c = await r.json();
console.log('templates set:', c.mailer_subjects_confirmation, '/', c.mailer_subjects_recovery);
console.log(`sending through ${c.smtp_host} as ${c.smtp_sender_name} <${c.smtp_admin_email}>, ${c.rate_limit_email_sent} an hour`);
