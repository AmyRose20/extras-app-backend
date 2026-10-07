const { escapeHtml } = require('./email');

// Simple web pages the backend shows in a browser (Phase 3 Part 11):
// the Accept/Decline pages opened from emails, the sign-up page and the update-details page.
// Styled to match the app: dusk gradient, dark glass card, gold buttons, white text.
// bodyHtml must already be safe (escape any user text).
function pageLayout(title, bodyHtml) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="referrer" content="no-referrer">
  <title>${escapeHtml(title)} – Extras App</title>
  <style>
    * { box-sizing: border-box; }
    html { min-height: 100%; background: #1a1330; }
    body {
      margin: 0; padding: 24px 16px; min-height: 100vh; color: #fff;
      font-family: -apple-system, 'Segoe UI', Roboto, Arial, sans-serif;
      /* the same colours as the app's LinearGradient */
      background: linear-gradient(160deg, #1a1330 0%, #241d3d 28%, #2f3f52 52%, #3a5a63 68%, #c9772f 90%, #8a3a1e 100%) fixed;
    }
    .card {
      max-width: 560px; margin: 0 auto; overflow: hidden;
      background: rgba(12,10,22,0.55); border: 1px solid rgba(255,255,255,0.15); border-radius: 14px;
    }
    .brand {
      padding: 16px 22px; color: #d99c4a; font-weight: 700; font-size: 16px; letter-spacing: 0.5px;
      border-bottom: 1px solid rgba(255,255,255,0.12);
    }
    .content { padding: 22px; }
    h1 { font-size: 20px; font-weight: 700; letter-spacing: 0.5px; margin: 0 0 16px; }
    h2 { font-size: 16px; margin: 26px 0 8px; }
    p { line-height: 1.5; }
    .muted { color: rgba(255,255,255,0.72); font-size: 13px; }
    .status { background: rgba(255,255,255,0.08); border-left: 4px solid #d99c4a; padding: 10px 14px; border-radius: 8px; }
    .error { color: #ff9d9d; border-left-color: #ff9d9d; }
    table.details { width: 100%; border-collapse: collapse; margin: 12px 0; }
    table.details td { padding: 9px 0; border-bottom: 1px solid rgba(255,255,255,0.12); vertical-align: top; }
    table.details td.label { color: rgba(255,255,255,0.72); width: 38%; padding-right: 12px; }
    .actions form { margin: 0 0 10px; }
    .btn {
      display: block; width: 100%; padding: 15px; border: 0; border-radius: 12px;
      font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; text-decoration: none;
    }
    .btn-primary { background: #d99c4a; color: #1a1330; }
    .btn-secondary { background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.3); }
    .btn-danger { background: #dc2626; color: #fff; }
    label {
      display: block; margin: 16px 0 6px; font-size: 12px; font-weight: 700;
      text-transform: uppercase; letter-spacing: 0.4px; color: rgba(255,255,255,0.72);
    }
    input[type=text], input[type=email], input[type=password], input[type=date], input[type=tel], input[type=number], select {
      width: 100%; padding: 13px 14px; font-size: 16px; color: #fff;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px;
      color-scheme: dark; /* makes the date picker and dropdown arrow light, to suit the dark background */
    }
    input:disabled { opacity: 0.6; }
    select option { background: #241d3d; color: #fff; }
    input[type=file] { color: rgba(255,255,255,0.85); font-size: 14px; }
    input[type=checkbox], input[type=radio] { accent-color: #d99c4a; width: 18px; height: 18px; vertical-align: middle; }
    .checks label {
      display: inline-block; margin: 6px 16px 6px 0; font-size: 15px; font-weight: normal;
      text-transform: none; letter-spacing: 0; color: #fff;
    }
        /* Tick boxes shown as pills (chips): grey outline, gold when picked (Yes/No, availability) */
    .group {
      background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.12);
      border-radius: 12px; padding: 10px 12px 12px; margin-bottom: 10px;
    }
    .group-title { margin: 0 0 8px; font-size: 12px; color: rgba(255,255,255,0.6); }
    .chips { display: flex; flex-wrap: wrap; gap: 8px; }
    .chip {
      position: relative; display: inline-block; margin: 0; cursor: pointer;
      font-size: 14px; font-weight: 600; text-transform: none; letter-spacing: 0; color: #fff;
    }
    .chip input { position: absolute; opacity: 0; width: 1px; height: 1px; } /* hidden, but still sent with the form */
    .chip span {
      display: inline-block; padding: 8px 14px; border-radius: 20px;
      border: 1px solid rgba(255,255,255,0.3); background: rgba(255,255,255,0.06);
    }
    .chip input:checked + span { background: #d99c4a; border-color: #d99c4a; color: #1a1330; }
    .chip input:focus-visible + span { outline: 2px solid #fff; outline-offset: 2px; } /* shows where you are when using the keyboard */

    /* Dropdown you can tick several things in (skills, languages), like the app's pickers */
    .multi summary {
      list-style: none; cursor: pointer; position: relative; padding: 13px 40px 13px 14px; font-size: 16px; color: #fff;
      background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.2); border-radius: 12px;
    }
    .multi summary::-webkit-details-marker { display: none; } /* hide the browser's own little triangle */
    .multi summary::after {
      content: '\\25BE'; /* ▾ arrow (double backslash because this CSS is inside a JavaScript string) */
      position: absolute; right: 14px; top: 50%; transform: translateY(-50%); color: rgba(255,255,255,0.7);
    }
    .multi[open] summary::after { content: '\\25B4'; } /* ▴ when open */
    .multi[open] summary { border-color: #d99c4a; }
    .multi-summary.placeholder { color: rgba(255,255,255,0.5); }
    .multi-panel {
      margin-top: 6px; padding: 4px 14px 10px; max-height: 320px; overflow-y: auto;
      background: #241d3d; border: 1px solid rgba(255,255,255,0.15); border-radius: 12px;
    }
    .multi-panel .group-title { margin: 12px 0 2px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; }
    .tick {
      display: flex; align-items: center; gap: 10px; margin: 0; padding: 9px 2px; cursor: pointer;
      font-size: 15px; font-weight: normal; text-transform: none; letter-spacing: 0; color: #fff;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .tick input { accent-color: #d99c4a; width: 18px; height: 18px; margin: 0; }
    a { color: #d99c4a; }
  </style>
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