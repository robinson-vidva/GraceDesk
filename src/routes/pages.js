import { Hono } from 'hono';
import { html } from 'hono/html';
import { layout, card } from '../views/layout.js';

export const pages = new Hono();

pages.get('/', (c) => {
  const ctx = c.get('ctx');
  const s = ctx.settings || {};
  if (ctx.user) return c.redirect('/dashboard');

  const body = html`
    <div class="max-w-2xl mx-auto text-center py-8">
      <h1 class="text-3xl font-bold text-slate-900">${s.church_name || 'Welcome'}</h1>
      <p class="mt-3 text-slate-600">Member portal &amp; contribution tracker</p>

      <div class="mt-8 grid gap-3 text-left sm:grid-cols-2">
        ${feature('📊', 'Track your giving', 'See your contribution history any time.')}
        ${feature('🧾', 'Tax reports', 'Download monthly and annual statements as PDF.')}
        ${feature('👪', 'Family view', 'Family heads can see the whole household.')}
        ${feature('✉️', 'Stay connected', 'Get a thank-you note for every gift.')}
      </div>

      <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/login" class="btn-brand text-white font-medium rounded-lg px-6 py-3">Login</a>
        <a href="/register" class="bg-white border border-slate-300 font-medium rounded-lg px-6 py-3 hover:bg-slate-50">New here? Register</a>
      </div>
      <p class="mt-4 text-sm text-slate-500">
        <a href="/forgot-password" class="hover:underline">Forgot your password?</a>
      </p>
    </div>`;

  return c.html(layout({ ...ctx, title: 'Home' }, body));
});

pages.get('/terms', (c) => {
  const ctx = c.get('ctx');
  const name = ctx.settings?.church_name || 'the church';
  const body = card(html`
    <h1 class="text-2xl font-bold mb-4">Terms &amp; Privacy</h1>
    <div class="prose prose-sm max-w-none space-y-3 text-slate-700">
      <p>This portal is operated by ${name} to track member contributions and communicate with members.</p>
      <p><strong>No financial transactions.</strong> This system does not collect, process, or hold any money. All giving happens outside this system. We only record what was given.</p>
      <p><strong>Personal data.</strong> We store the contact and contribution information you and ${name} provide, solely to maintain church records and produce giving statements. We do not sell your data.</p>
      <p><strong>Data retention.</strong> Records are kept as long as needed for church and tax-record purposes. Contact the church to request corrections.</p>
    </div>`);
  return c.html(layout({ ...ctx, title: 'Terms' }, body));
});

// Health check (no layout).
pages.get('/healthz', (c) => c.json({ ok: true, app: 'gracedesk' }));

function feature(icon, title, text) {
  return html`
    <div class="bg-white rounded-lg border border-slate-200 p-4 flex gap-3">
      <div class="text-2xl">${icon}</div>
      <div>
        <div class="font-medium text-slate-900">${title}</div>
        <div class="text-sm text-slate-500">${text}</div>
      </div>
    </div>`;
}
