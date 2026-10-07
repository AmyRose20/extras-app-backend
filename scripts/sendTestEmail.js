// Sends a test email to check the Brevo SMTP settings in .env work.
// Run from the backend folder:  node scripts/sendTestEmail.js you@example.com
// (If you leave the address out, it sends to EMAIL_FROM_ADDRESS.)
require('dotenv').config();
const { sendEmail, emailLayout, verifyEmailConnection } = require('../src/utils/email');

async function main() {
  const to = process.argv[2] || process.env.EMAIL_FROM_ADDRESS;

  console.log('Checking the SMTP login...');
  await verifyEmailConnection();
  console.log('Login OK. Sending a test email to', to);

  const info = await sendEmail({
    to,
    subject: 'Extras App test email',
    text: 'If you can read this, email sending from the Extras App backend works!',
    html: emailLayout('Test email', '<p>If you can read this, email sending from the Extras App backend works! 🎬</p>'),
  });

  console.log('Sent! Message id:', info.messageId);
}

main().catch((err) => {
  console.error('Sending failed:', err.message);
  process.exit(1);
});