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
    <section class="hero">
      <h1>${s.church_name || 'Welcome'}</h1>
      <p>Member portal and giving records.</p>
      <div class="actions">
        <a href="${b}/login" class="btn btn-primary">Log in</a>
        <a href="${b}/register" class="btn btn-ghost">Register</a>
      </div>
      <p class="mt-2"><a href="${b}/forgot-password">Forgot your password?</a></p>
    </section>

    <h2 class="mt-3">After you log in you can</h2>
    <ul class="plain-list">
      <li>See the gifts the church has recorded for you.</li>
      <li>Download monthly and yearly giving statements as PDF.</li>
      <li>See your family's giving, if you are the head of the household.</li>
      <li>Update your contact details.</li>
    </ul>`;

  return c.html(layout({ ...ctx, title: 'Home' }, body));
});

pages.get('/terms', (c) => {
  const ctx = c.get('ctx');
  const name = ctx.settings?.church_name || 'the church';
  const body = card(html`
    <h1>Terms and privacy</h1>
    <p>This portal is operated by ${name} to keep giving records and to communicate with members.</p>
    <p><strong>No financial transactions.</strong> This system does not collect, process, or hold any money. All giving happens elsewhere. We only record what was given.</p>
    <p><strong>Personal data.</strong> We store the contact and giving information you and ${name} provide, only to maintain church records and produce giving statements. We do not sell your data.</p>
    <p><strong>Data retention.</strong> Records are kept as long as needed for church and tax purposes. Contact the church to request corrections.</p>`);
  return c.html(layout({ ...ctx, title: 'Terms' }, body));
});

pages.get('/suspended', (c) => {
  const ctx = c.get('ctx');
  const body = card(html`
    <h1>This church's account is paused</h1>
    <p>Please contact your church administrator.</p>`);
  return c.html(layout({ ...ctx, title: 'Paused', user: null }, body));
});

