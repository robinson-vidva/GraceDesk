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
    <h1 style="font-size:1.7rem;margin-bottom:0.1rem">Welcome, ${u.first_name || 'friend'}</h1>
    <p class="muted mt-1" style="margin-top:0">${ctx.settings?.church_name || ''}</p>
    <div class="grid grid-2 mt-2">
      ${card(html`
        <div class="stat">
          <div class="label">This year</div>
          <div class="value">$0.00</div>
        </div>
        <p class="muted small" style="margin:0.4rem 0 0">Your giving total appears here once recorded.</p>`)}
      ${card(html`
        <div class="label muted small">Quick links</div>
        <div class="stack mt-1">
          <div><a href="${b}/profile">Edit my profile</a></div>
          ${u.is_admin ? html`<div><a href="${b}/admin">Admin panel</a></div>` : ''}
          <div><a href="${b}/change-password">Change password</a></div>
        </div>`)}
    </div>`;
  return c.html(layout({ ...ctx, title: 'Dashboard' }, body));
});

dashboard.get('/profile', requireAuth, (c) => {
  const ctx = c.get('ctx');
  const body = card(html`
    <h1 style="font-size:1.3rem">My profile</h1>
    <p class="muted small">Profile editing is coming in the next build phase.</p>
    <p class="small mt-1"><a href="${ctx.base}/change-password">Change password</a></p>`);
  return c.html(layout({ ...ctx, title: 'My profile' }, body));
});
