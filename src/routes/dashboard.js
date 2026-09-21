import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout, card } from '../views/layout.js';
import { requireAuth } from '../middleware.js';

export const dashboard = new Hono();

// Placeholder member dashboard — expanded in the contributions phase.
dashboard.get('/dashboard', requireAuth, (c) => {
  const ctx = c.get('ctx');
  const u = ctx.user;
  const b = ctx.base;
  const body = html`
    <h1 class="text-2xl font-bold text-slate-900 mb-1">Welcome, ${u.first_name || 'friend'}</h1>
    <p class="text-slate-500 mb-6">${ctx.settings?.church_name || ''}</p>
    <div class="grid gap-4 sm:grid-cols-2">
      ${card(html`
        <div class="text-sm text-slate-500">This year</div>
        <div class="text-2xl font-bold text-slate-900 mt-1">$0.00</div>
        <div class="text-xs text-slate-400 mt-1">Contribution totals appear here once recorded.</div>`)}
      ${card(html`
        <div class="text-sm text-slate-500">Quick links</div>
        <div class="mt-2 space-y-1 text-sm">
          <div><a href="${b}/profile" class="text-brand hover:underline">Edit my profile</a></div>
          ${u.is_admin ? html`<div><a href="${b}/admin" class="text-brand hover:underline">Admin panel</a></div>` : ''}
          <div><a href="${b}/change-password" class="text-brand hover:underline">Change password</a></div>
        </div>`)}
    </div>`;
  return c.html(layout({ ...ctx, title: 'Dashboard' }, body));
});

dashboard.get('/profile', requireAuth, (c) => {
  const ctx = c.get('ctx');
  const body = card(html`
    <h1 class="text-xl font-bold mb-2">My profile</h1>
    <p class="text-sm text-slate-500">Profile editing is coming in the next build phase.</p>
    <p class="mt-3 text-sm"><a href="${ctx.base}/change-password" class="text-brand hover:underline">Change password</a></p>`);
  return c.html(layout({ ...ctx, title: 'My profile' }, body));
});
