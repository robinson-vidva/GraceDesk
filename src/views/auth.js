import { html, raw } from 'hono/html';
import { layout } from './layout.js';
import { field, submitBtn, authCard, alertBox } from './forms.js';
import { turnstileWidget } from '../services/turnstile.js';

export function loginPage(ctx, env, { error, email = '' } = {}) {
  const b = ctx.base;
  const inner = html`
    <form method="post" action="${b}/login">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Email', name: 'email', type: 'email', value: email, required: true, autocomplete: 'email' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'current-password' })}
      ${raw(turnstileWidget(ctx.settings, env))}
      ${submitBtn('Log in')}
    </form>
    <div class="mt-4 text-sm text-center space-y-1">
      <div><a href="${b}/forgot-password" class="text-brand hover:underline">Forgot your password?</a></div>
      <div class="text-slate-500">New here? <a href="${b}/register" class="text-brand hover:underline">Register</a></div>
    </div>`;
  return layout({ ...ctx, title: 'Login' }, authCard(`Log in to ${ctx.settings?.church_name || 'your church'}`, inner));
}

export function registerPage(ctx, env, { error, values = {} } = {}) {
  const b = ctx.base;
  const inner = html`
    <form method="post" action="${b}/register">
      ${error ? alertBox('error', error) : ''}
      <div class="grid grid-cols-2 gap-3">
        <div>${field({ label: 'First name', name: 'first_name', value: values.first_name || '', required: true })}</div>
        <div>${field({ label: 'Last name', name: 'last_name', value: values.last_name || '', required: true })}</div>
      </div>
      ${field({ label: 'Email', name: 'email', type: 'email', value: values.email || '', required: true, autocomplete: 'email' })}
      ${field({ label: 'Phone', name: 'phone', type: 'tel', value: values.phone || '', placeholder: 'Optional' })}
      ${field({ label: 'Password', name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters' })}
      ${field({ label: 'Confirm password', name: 'password2', type: 'password', required: true, autocomplete: 'new-password' })}
      ${raw(turnstileWidget(ctx.settings, env))}
      ${submitBtn('Register')}
    </form>
    <div class="mt-4 text-sm text-center text-slate-500">
      Already have an account? <a href="${b}/login" class="text-brand hover:underline">Log in</a>
    </div>`;
  return layout({ ...ctx, title: 'Register' }, authCard('Create your account', inner,
    'An admin will review and approve your account.'));
}

export function registeredPage(ctx) {
  const inner = html`
    ${alertBox('success', 'Thank you for registering!')}
    <p class="text-slate-600 text-sm">An admin will review and approve your account. You'll receive an email when it's approved and you can log in.</p>
    <div class="mt-4"><a href="${ctx.base}/" class="text-brand hover:underline text-sm">← Back to home</a></div>`;
  return layout({ ...ctx, title: 'Registered' }, authCard('Registration received', inner));
}

export function forgotPage(ctx, env, { error, sent, devLink } = {}) {
  const b = ctx.base;
  if (sent) {
    const inner = html`
      ${alertBox('success', 'If that email is registered, a reset link has been sent.')}
      ${devLink ? html`<p class="text-xs text-slate-500 mt-2">Dev link: <a class="text-brand break-all" href="${devLink}">${devLink}</a></p>` : ''}
      <div class="mt-4"><a href="${b}/login" class="text-brand hover:underline text-sm">← Back to login</a></div>`;
    return layout({ ...ctx, title: 'Reset password' }, authCard('Check your email', inner));
  }
  const inner = html`
    <form method="post" action="${b}/forgot-password">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'Email', name: 'email', type: 'email', required: true, autocomplete: 'email' })}
      ${raw(turnstileWidget(ctx.settings, env))}
      ${submitBtn('Send reset link')}
    </form>
    <div class="mt-4 text-sm text-center"><a href="${b}/login" class="text-brand hover:underline">Back to login</a></div>`;
  return layout({ ...ctx, title: 'Forgot password' }, authCard('Forgot your password?', inner,
    'Enter your email and we\'ll send a reset link.'));
}

export function resetPage(ctx, { token, error, invalid } = {}) {
  const b = ctx.base;
  if (invalid) {
    const inner = html`
      ${alertBox('error', 'This reset link is invalid or has expired.')}
      <div class="mt-2"><a href="${b}/forgot-password" class="text-brand hover:underline text-sm">Request a new link</a></div>`;
    return layout({ ...ctx, title: 'Reset password' }, authCard('Link expired', inner));
  }
  const inner = html`
    <form method="post" action="${b}/reset-password/${token}">
      ${error ? alertBox('error', error) : ''}
      ${field({ label: 'New password', name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters' })}
      ${field({ label: 'Confirm password', name: 'password2', type: 'password', required: true, autocomplete: 'new-password' })}
      ${submitBtn('Set new password')}
    </form>`;
  return layout({ ...ctx, title: 'Reset password' }, authCard('Set a new password', inner));
}

export function changePasswordPage(ctx, { error, forced } = {}) {
  const b = ctx.base;
  const inner = html`
    <form method="post" action="${b}/change-password">
      ${error ? alertBox('error', error) : ''}
      ${forced ? alertBox('info', 'For security, please set a new password before continuing.') : ''}
      ${forced ? '' : field({ label: 'Current password', name: 'current', type: 'password', required: true, autocomplete: 'current-password' })}
      ${field({ label: 'New password', name: 'password', type: 'password', required: true, autocomplete: 'new-password', hint: 'At least 8 characters' })}
      ${field({ label: 'Confirm new password', name: 'password2', type: 'password', required: true, autocomplete: 'new-password' })}
      ${submitBtn('Change password')}
    </form>`;
  return layout({ ...ctx, title: 'Change password' }, authCard('Change your password', inner));
}
