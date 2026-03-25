import type { IdentityConfig } from './content-script';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function buildNewTabHtml(identity: IdentityConfig): string {
  const escapedName = escapeHtml(identity.profileName);
  const escapedSubtitle = escapeHtml(identity.subtitle);
  const escapedId = escapeHtml(identity.profileId);
  const accentColor = escapeHtml(identity.accentColor);
  const shortId = escapeHtml(identity.profileId.slice(0, 8));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapedName} - Pro5 Workspace</title>
    <style>
      :root {
        --accent: ${accentColor};
        --bg: #07111f;
        --panel: rgba(7, 17, 31, 0.72);
        --text: #f8fafc;
        --muted: rgba(226, 232, 240, 0.76);
        --border: rgba(148, 163, 184, 0.18);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        font-family: "Segoe UI", Arial, sans-serif;
        color: var(--text);
        background:
          radial-gradient(circle at top left, rgba(59, 130, 246, 0.28), transparent 34%),
          radial-gradient(circle at top right, rgba(16, 185, 129, 0.16), transparent 28%),
          linear-gradient(180deg, #0f172a 0%, var(--bg) 100%);
        display: grid;
        place-items: center;
        padding: 28px;
      }
      .shell {
        width: min(920px, 100%);
        border-radius: 28px;
        border: 1px solid var(--border);
        background: var(--panel);
        backdrop-filter: blur(18px);
        box-shadow: 0 28px 90px rgba(2, 6, 23, 0.42);
        overflow: hidden;
      }
      .hero {
        padding: 36px;
        display: grid;
        gap: 18px;
      }
      .eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        font-size: 13px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .dot {
        width: 12px;
        height: 12px;
        border-radius: 999px;
        background: var(--accent);
        box-shadow: 0 0 0 4px rgba(255,255,255,0.08);
      }
      h1 {
        margin: 0;
        font-size: clamp(34px, 7vw, 72px);
        line-height: 0.94;
      }
      .subtitle {
        font-size: 18px;
        color: var(--muted);
        max-width: 56ch;
      }
      .meta-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
        gap: 14px;
        margin-top: 6px;
      }
      .meta-card {
        border-radius: 18px;
        padding: 16px;
        border: 1px solid var(--border);
        background: rgba(15, 23, 42, 0.46);
      }
      .meta-label {
        font-size: 12px;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--muted);
      }
      .meta-value {
        margin-top: 8px;
        font-size: 18px;
        font-weight: 700;
      }
      .hint {
        margin-top: 10px;
        padding: 18px 20px;
        border-radius: 20px;
        border: 1px solid rgba(59, 130, 246, 0.18);
        background: linear-gradient(135deg, rgba(59, 130, 246, 0.18), rgba(15, 23, 42, 0.4));
        color: rgba(241, 245, 249, 0.92);
      }
      .hint strong {
        color: white;
      }
    </style>
  </head>
  <body>
    <main class="shell" id="pro5-profile-newtab" data-profile-id="${escapedId}">
      <section class="hero">
        <div class="eyebrow"><span class="dot"></span> Pro5 profile identity</div>
        <h1>${escapedName}</h1>
        <div class="subtitle">${escapedSubtitle}</div>
        <div class="meta-grid">
          <article class="meta-card">
            <div class="meta-label">Profile ID</div>
            <div class="meta-value">${shortId}</div>
          </article>
          <article class="meta-card">
            <div class="meta-label">Workspace mode</div>
            <div class="meta-value">Isolated browser</div>
          </article>
          <article class="meta-card">
            <div class="meta-label">Recognition</div>
            <div class="meta-value">Always on</div>
          </article>
        </div>
        <div class="hint">
          <strong>You are inside profile ${escapedName}.</strong>
          Keep this window for the matching account, proxy, and session to avoid cross-profile mistakes.
        </div>
      </section>
    </main>
  </body>
</html>`;
}
