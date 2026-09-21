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
  <title>${ctx.title ? `${ctx.title} · ${churchName}` : churchName}</title>
  <link rel="icon" href="/icons/icon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Spectral:wght@500;600;700&display=swap" rel="stylesheet" />
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
    function gdToggleTheme(){var el=document.documentElement;var next=el.getAttribute('data-theme')==='dark'?'light':'dark';el.setAttribute('data-theme',next);try{localStorage.setItem('gd-theme',next);}catch(e){}}
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
          : html`<span class="mark">${initial(s.church_name)}</span>`}
        <span>${s.church_name || 'GraceDesk'}</span>
      </a>
      <nav class="nav">
        ${base && user
          ? html`
            <a href="${base}/dashboard">Dashboard</a>
            ${user.is_admin ? html`<a href="${base}/admin">Admin</a>` : ''}
            <a href="${base}/logout">Sign out</a>`
          : base
            ? html`<a href="${base}/login">Sign in</a>`
            : html`<a href="/find">Find your church</a><a href="/signup">Start a church</a>`}
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
      <div>
        ${s.church_email ? html`<a href="mailto:${s.church_email}">${s.church_email}</a>&nbsp;&nbsp;` : ''}
        ${s.church_phone ? html`<span class="muted">${s.church_phone}</span>&nbsp;&nbsp;` : ''}
        <a href="${base}/terms">Terms</a>&nbsp;&nbsp;
        <button type="button" onclick="gdToggleTheme()" style="background:none;border:none;color:var(--muted);cursor:pointer;font:inherit;padding:0;text-decoration:underline">Theme</button>
      </div>
      <div class="muted">© ${year} ${s.church_name || 'GraceDesk'} · Powered by GraceDesk</div>
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
