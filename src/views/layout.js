import { html, raw } from 'hono/html';

// Base HTML shell. `ctx` carries { settings, user, title, base, flash }.
export function layout(ctx, body) {
  const s = ctx.settings || {};
  const brand = s.primary_color || '#1f5a6b';
  const churchName = s.church_name || 'GraceDesk';

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ctx.title ? `${ctx.title} - ${churchName}` : churchName}</title>
  <link rel="icon" href="/icons/icon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="stylesheet" href="/css/app.css" />
  <style>:root { --brand: ${raw(brand)}; --brand-ink: color-mix(in srgb, ${raw(brand)} 78%, #000); }</style>
  <script>try{var t=localStorage.getItem('gd-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
</head>
<body>
  ${header(ctx)}
  ${ctx.flash ? flashBanner(ctx.flash) : ''}
  <main class="main"><div class="container">${body}</div></main>
  ${footer(ctx)}
  <script>
    if ('serviceWorker' in navigator) { navigator.serviceWorker.register('/sw.js').catch(function(){}); }
    function gdToggleTheme(){var el=document.documentElement;var cur=el.getAttribute('data-theme')||(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light');var next=cur==='dark'?'light':'dark';el.setAttribute('data-theme',next);try{localStorage.setItem('gd-theme',next);}catch(e){}}
  </script>
</body>
</html>`;
}

function header(ctx) {
  const s = ctx.settings || {};
  const user = ctx.user;
  const base = ctx.base || '';
  const home = base || '/';
  return html`
  <header class="site-header">
    <div class="container">
      <a href="${home}" class="brandmark">
        ${s.church_logo_key
          ? html`<img src="${base}/logo" alt="" />`
          : s.church_name
            ? html`<span class="mark" aria-hidden="true">${initial(s.church_name)}</span>`
            : html`<img src="/icons/icon.svg" alt="" />`}
        <span>${s.church_name || 'GraceDesk'}</span>
      </a>
      <nav class="nav">
        ${base && user
          ? html`
            <a href="${base}/dashboard">Dashboard</a>
            ${user.is_admin ? html`<a href="${base}/admin">Admin</a>` : ''}
            <a href="${base}/logout">Log out</a>`
          : base
            ? html`<a href="${base}/login">Log in</a>`
            : html`<a href="/find">Find your church</a><a href="/signup">Set up a church</a>`}
      </nav>
    </div>
  </header>`;
}

function flashBanner(flash) {
  const cls = flash.type === 'error' ? 'alert-error' : flash.type === 'success' ? 'alert-ok' : 'alert-info';
  return html`<div class="container" style="padding-top:1rem"><div class="alert ${cls}">${flash.message}</div></div>`;
}

function footer(ctx) {
  const s = ctx.settings || {};
  const base = ctx.base || '';
  const year = new Date().getFullYear();
  return html`
  <footer class="site-footer">
    <div class="container">
      <div class="links">
        ${s.church_email ? html`<a href="mailto:${s.church_email}">${s.church_email}</a>` : ''}
        ${s.church_phone ? html`<span>${s.church_phone}</span>` : ''}
        ${base ? html`<a href="${base}/terms">Terms and privacy</a>` : ''}
        <button type="button" class="linkbtn" onclick="gdToggleTheme()">Switch light or dark</button>
      </div>
      <div>© ${year} ${s.church_name ? html`${s.church_name}. Powered by GraceDesk` : 'GraceDesk'}</div>
    </div>
  </footer>`;
}

function initial(name) {
  return (name || 'G').trim().charAt(0).toUpperCase();
}

// Reusable card wrapper.
export function card(inner, extra = '') {
  return html`<div class="card ${extra}">${inner}</div>`;
}
