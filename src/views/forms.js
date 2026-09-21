import { html, raw } from 'hono/html';

export function field({ label, name, type = 'text', value = '', required = false, placeholder = '', autocomplete = '', hint = '' }) {
  return html`
    <label class="block mb-3">
      <span class="block text-sm font-medium text-slate-700 mb-1">${label}${required ? html`<span class="text-red-500"> *</span>` : ''}</span>
      <input
        type="${type}" name="${name}" value="${value}" ${raw(required ? 'required' : '')}
        placeholder="${placeholder}" ${raw(autocomplete ? `autocomplete="${autocomplete}"` : '')}
        class="w-full rounded-lg border border-slate-300 px-3 py-2 ring-brand" />
      ${hint ? html`<span class="block text-xs text-slate-400 mt-1">${hint}</span>` : ''}
    </label>`;
}

export function submitBtn(label, cls = '') {
  return html`<button type="submit" class="btn-brand text-white font-medium rounded-lg px-5 py-2.5 w-full ${cls}">${label}</button>`;
}

// Narrow single-column auth/card container.
export function authCard(title, inner, subtitle = '') {
  return html`
    <div class="max-w-md mx-auto mt-4">
      <div class="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <h1 class="text-xl font-bold text-slate-900">${title}</h1>
        ${subtitle ? html`<p class="text-sm text-slate-500 mt-1">${subtitle}</p>` : ''}
        <div class="mt-4">${inner}</div>
      </div>
    </div>`;
}

export function alertBox(type, message) {
  const cls = type === 'error' ? 'bg-red-50 text-red-800 border-red-200'
    : type === 'success' ? 'bg-green-50 text-green-800 border-green-200'
    : 'bg-blue-50 text-blue-800 border-blue-200';
  return html`<div class="${cls} border rounded-lg px-3 py-2 text-sm mb-3">${message}</div>`;
}
