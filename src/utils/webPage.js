const { escapeHtml } = require('./email');

// Simple web pages the backend shows in a browser (Phase 3 Part 11):
// the Accept/Decline pages opened from emails, the sign-up page and the update-details page.
// Styled to match the app: the styles live in public/styles.css (served at /static/styles.css).
// bodyHtml must already be safe (escape any user text).
function pageLayout(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)} – Extras App</title>
  <link rel="stylesheet" href="/static/styles.css">
</head>
<body>
  <div class="card">
    <div class="brand">Extras App</div>
    <div class="content">
      <h1>${escapeHtml(title)}</h1>
      ${bodyHtml}
    </div>
  </div>
</body>
</html>`;
}

// Sends a page. "no-store" stops the browser keeping a copy of it (the links carry private codes).
function sendPage(res, statusCode, title, bodyHtml) {
  res.status(statusCode).set('Cache-Control', 'no-store').type('html').send(pageLayout(title, bodyHtml));
}

module.exports = { pageLayout, sendPage };