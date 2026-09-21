import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout, card } from '../views/layout.js';

// Church-scoped public pages (mounted under /c/:slug).
export const pages = new Hono();

pages.get('/', (c) => {
  const ctx = c.get('ctx');
  const s = ctx.settings || {};
  const b = ctx.base;
  if (ctx.user) return c.redirect(`${b}/dashboard`);

  const body = html`
    <div class="narrow center" style="padding:2.5rem 0 1rem">
      <h1 style="font-size:2rem">${s.church_name || 'Welcome'}</h1>
      <p class="muted">Member portal and giving records</p>
      <div class="actions" style="display:flex;gap:0.7rem;justify-content:center;margin:1.6rem 0 0.5rem">
        <a href="${b}/login" class="btn btn-primary">Sign in</a>
        <a href="${b}/register" class="btn btn-ghost">Register</a>
      </div>
      <p class="small"><a href="${b}/forgot-password">Forgot your password?</a></p>
    </div>

    <div class="grid grid-2 mt-2">
      ${feature('Your giving history', 'See every contribution you have made, any time you need it.')}
      ${feature('Tax statements', 'Download your monthly and annual giving statements as PDF.')}
      ${feature('Family view', 'Heads of household can see the whole family in one place.')}
      ${feature('A note of thanks', 'Receive a thank-you for every gift you give.')}
    </div>`;

  return c.html(layout({ ...ctx, title: 'Home' }, body));
});

pages.get('/terms', (c) => {
  const ctx = c.get('ctx');
  const name = ctx.settings?.church_name || 'the church';
  const body = card(html`
    <h1 style="font-size:1.5rem">Terms and Privacy</h1>
    <p>This portal is operated by ${name} to keep giving records and to communicate with members.</p>
    <p><strong>No financial transactions.</strong> This system does not collect, process, or hold any money. All giving happens elsewhere. We only record what was given.</p>
    <p><strong>Personal data.</strong> We store the contact and giving information you and ${name} provide, only to maintain church records and produce giving statements. We do not sell your data.</p>
    <p><strong>Data retention.</strong> Records are kept as long as needed for church and tax purposes. Contact the church to request corrections.</p>`);
  return c.html(layout({ ...ctx, title: 'Terms' }, body));
});

pages.get('/suspended', (c) => {
  const ctx = c.get('ctx');
  const body = card(html`
    <h1 style="font-size:1.3rem">This account is paused</h1>
    <p class="muted small">Please contact your church administrator.</p>`);
  return c.html(layout({ ...ctx, title: 'Paused', user: null }, body));
});

function feature(title, text) {
  return card(html`<div class="feature"><h3>${title}</h3><p>${text}</p></div>`);
}
