import { html, raw } from 'hono/html';

// Base HTML shell. `ctx` carries { settings, user, title, flash }.
export function layout(ctx, body) {
  const s = ctx.settings || {};
  const primary = s.primary_color || '#4f46e5';
  const churchName = s.church_name || 'GraceDesk';
  const year = new Date().getFullYear();

  return html`<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${ctx.title ? `${ctx.title} · ${churchName}` : churchName}</title>
  <link rel="icon" href="/icons/icon.svg" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = { theme: { extend: { colors: { brand: '${raw(primary)}' } } } };
  </script>
  <style>
    :root { --brand: ${raw(primary)}; }
    .btn-brand { background: var(--brand); }
    .btn-brand:hover { filter: brightness(0.92); }
    .text-brand { color: var(--brand); }
    .ring-brand:focus { outline: none; box-shadow: 0 0 0 2px #fff, 0 0 0 4px var(--brand); }
  </style>
</head>
<body class="min-h-screen bg-slate-50 text-slate-800 flex flex-col">
  ${header(ctx)}
  ${ctx.flash ? flashBanner(ctx.flash) : ''}
  <main class="flex-1 w-full max-w-5xl mx-auto px-4 py-6">
    ${body}
  </main>
  ${footer(ctx, year)}
</body>
</html>`;
}

function header(ctx) {
  const s = ctx.settings || {};
  const user = ctx.user;
  return html`
  <header class="text-white btn-brand shadow">
    <div class="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between gap-3">
      <a href="/" class="flex items-center gap-2 font-semibold text-lg">
        ${s.church_logo_key
          ? html`<img src="/logo" alt="" class="h-8 w-8 rounded object-cover bg-white/20" />`
          : html`<span class="h-8 w-8 rounded bg-white/20 grid place-items-center">⛪</span>`}
        <span>${s.church_name || 'GraceDesk'}</span>
      </a>
      <nav class="text-sm flex items-center gap-4">
        ${user
          ? html`
            <a href="/dashboard" class="hover:underline">Dashboard</a>
            ${user.is_admin ? html`<a href="/admin" class="hover:underline">Admin</a>` : ''}
            <a href="/logout" class="hover:underline">Log out</a>`
          : html`<a href="/login" class="hover:underline">Login</a>`}
      </nav>
    </div>
  </header>`;
}

function flashBanner(flash) {
  const color = flash.type === 'error' ? 'bg-red-50 text-red-800 border-red-200'
    : flash.type === 'success' ? 'bg-green-50 text-green-800 border-green-200'
    : 'bg-blue-50 text-blue-800 border-blue-200';
  return html`<div class="${color} border-b">
    <div class="max-w-5xl mx-auto px-4 py-2 text-sm">${flash.message}</div>
  </div>`;
}

function footer(ctx, year) {
  const s = ctx.settings || {};
  return html`
  <footer class="border-t bg-white">
    <div class="max-w-5xl mx-auto px-4 py-6 text-sm text-slate-500 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      <div class="space-x-3">
        ${s.church_email ? html`<a class="hover:underline" href="mailto:${s.church_email}">${s.church_email}</a>` : ''}
        ${s.church_phone ? html`<span>${s.church_phone}</span>` : ''}
        <a class="hover:underline" href="/terms">Terms</a>
      </div>
      <div class="text-slate-400">© ${year} ${s.church_name || ''} · Powered by GraceDesk</div>
    </div>
  </footer>`;
}

// Small reusable card wrapper.
export function card(inner, cls = '') {
  return html`<div class="bg-white rounded-xl shadow-sm border border-slate-200 p-5 ${cls}">${inner}</div>`;
}
