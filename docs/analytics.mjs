import { analyticsConfig } from './analytics-config.mjs?v=3';

const actions = new Set(['pdf', 'jpg', 'png', 'merge', 'split', 'extract', 'compress-image', 'compress-pdf']);
const events = new Set(['conversion_start', 'conversion_complete', 'conversion_error', 'conversion_cancel', 'result_download', 'app_download']);
export const ANALYTICS_PREFERENCE_KEY = 'dropi-analytics-disabled';

export function analyticsDisabled(win, id = analyticsConfig.measurementId) {
  if (win.navigator?.globalPrivacyControl || win[`ga-disable-${id}`]) return true;
  try { return win.localStorage?.getItem(ANALYTICS_PREFERENCE_KEY) === 'true'; } catch { return false; }
}

export function setAnalyticsDisabled(win, doc, disabled, id = analyticsConfig.measurementId) {
  win[`ga-disable-${id}`] = Boolean(disabled || win.navigator?.globalPrivacyControl);
  let saved = false;
  try {
    if (disabled) win.localStorage.setItem(ANALYTICS_PREFERENCE_KEY, 'true');
    else win.localStorage.removeItem(ANALYTICS_PREFERENCE_KEY);
    saved = true;
  } catch {}
  if (disabled) {
    for (const item of (doc.cookie || '').split(';')) {
      const name = item.trim().split('=')[0];
      if (/^dropi_ga(?:_[A-Za-z0-9]+)?$/.test(name)) doc.cookie = `${name}=; Max-Age=0; Path=${analyticsConfig.basePath}; SameSite=Lax; Secure`;
    }
  }
  return { saved, disabled: win[`ga-disable-${id}`] };
}

// Deliberately discard unknown fields, filenames, URLs, and error messages.
export function eventParameters(detail = {}) {
  const params = {};
  if (actions.has(detail.action)) params.tool = detail.action;
  for (const key of ['file_count', 'output_count']) {
    if (Number.isInteger(detail[key]) && detail[key] >= 1 && detail[key] <= 300) params[key] = detail[key];
  }
  if (['single', 'zip'].includes(detail.download_kind)) params.download_kind = detail.download_kind;
  return params;
}

export function startAnalytics(win, doc, config = analyticsConfig) {
  const id = config.measurementId;
  const basePath = config.basePath || '/';
  if (!/^G-[A-Z0-9]{6,}$/.test(id) || /^G-X+$/.test(id) ||
      win.location.protocol !== 'https:' || win.location.hostname !== config.hostname ||
      !win.location.pathname.startsWith(basePath) ||
      win.__dropiAnalyticsStarted) return false;
  if (analyticsDisabled(win, id)) { win[`ga-disable-${id}`] = true; return false; }

  win.__dropiAnalyticsStarted = true;
  win.dataLayer = win.dataLayer || [];
  win.gtag = win.gtag || function () { win.dataLayer.push(arguments); };
  const page = win.location.origin + win.location.pathname;
  let referrer = '';
  try { referrer = new URL(doc.referrer).origin; } catch {}
  win.gtag('js', new Date());
  win.gtag('config', id, {
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    cookie_domain: 'none',
    cookie_prefix: 'dropi',
    cookie_path: basePath,
    cookie_expires: 365 * 24 * 60 * 60,
    cookie_update: false,
    page_location: page,
    page_referrer: referrer,
    page_title: ({ 'guide/': 'Dropi 사용 가이드', 'about/': 'Dropi 소개', 'privacy/': 'Dropi 개인정보 처리 안내' })[win.location.pathname.slice(basePath.length)] || 'Dropi — 파일을 드롭하면, 끝.',
  });
  win.gtag('event', 'page_view', { send_to: id });

  doc.addEventListener('dropi:analytics', e => {
    if (analyticsDisabled(win, id)) return;
    if (!events.has(e.detail?.event)) return;
    win.gtag('event', e.detail.event, { ...eventParameters(e.detail), send_to: id });
  });
  doc.addEventListener('click', e => {
    if (analyticsDisabled(win, id)) return;
    const link = e.target.closest?.('a[download]');
    if (!link) return;
    try {
      const url = new URL(link.href, win.location.href);
      if (url.origin === win.location.origin && url.pathname.startsWith(basePath) && /^downloads\/Dropi-[\w.-]+\.dmg$/.test(url.pathname.slice(basePath.length))) {
        win.gtag('event', 'app_download', { platform: 'macos', send_to: id });
      }
    } catch {}
  });
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${id}`;
  doc.head.append(script);
  return true;
}

// Analytics failure must never prevent the local converter from starting.
if (typeof window !== 'undefined') {
  try { startAnalytics(window, document); } catch {}
}
