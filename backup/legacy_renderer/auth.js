const INVENTORY_ADMIN_PERMISSION = 'inventory_admin';
const INVENTORY_VIEW_ALL_BRANCHES_PERMISSION = 'inventory_view_all_branches';
const EGYPT_TIME_ZONE = 'Africa/Cairo';
const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const COALESCED_GET_PATHS = new Set(['/api/me', '/api/branches', '/api/public/settings', '/api/server-time']);
const DEFAULT_FETCH_TIMEOUT_MS = 30000;
const SYNC_FETCH_TIMEOUT_MS = 15000;
const BACKGROUND_SYNC_INTERVAL_MS = 30000;

function installReadableTextStyles() {
    if (window.__readableTextStylesInstalled) return;
    window.__readableTextStylesInstalled = true;
    const style = document.createElement('style');
    style.id = 'readable-muted-text-overrides';
    style.textContent = `
        body :is(
            .text-slate-300,
            .text-slate-400,
            .text-slate-500,
            .text-slate-600,
            .text-gray-300,
            .text-gray-400,
            .text-gray-500,
            .text-gray-600,
            .text-zinc-300,
            .text-zinc-400,
            .text-zinc-500,
            .text-zinc-600,
            .text-neutral-300,
            .text-neutral-400,
            .text-neutral-500,
            .text-neutral-600,
            .text-secondary
        ):not(.sidebar-main):not(.sidebar-main *) {
            color: #000 !important;
        }
    `;
    document.head.appendChild(style);
}

installReadableTextStyles();

function normalizeFetchMethod(input, init = {}) {
    return String(init.method || input?.method || 'GET').toUpperCase();
}

function normalizeFetchUrl(input) {
    try {
        const raw = typeof input === 'string' ? input : input?.url;
        return new URL(raw, window.location.origin).toString();
    } catch {
        return String(input || '');
    }
}

function shouldGuardMutatingRequest(input, init = {}) {
    const method = normalizeFetchMethod(input, init);
    if (!MUTATING_METHODS.has(method)) return false;
    const url = normalizeFetchUrl(input);
    return url.includes('/api/') && !url.includes('/api/sync/apply');
}

function shouldCoalesceGetRequest(input, init = {}) {
    const method = normalizeFetchMethod(input, init);
    if (method !== 'GET') return false;
    try {
        const url = new URL(normalizeFetchUrl(input), window.location.origin);
        return COALESCED_GET_PATHS.has(url.pathname);
    } catch {
        return false;
    }
}

function timeoutMsForFetch(input, init = {}) {
    try {
        const url = new URL(normalizeFetchUrl(input), window.location.origin);
        if (url.pathname.startsWith('/api/sync/')) return SYNC_FETCH_TIMEOUT_MS;
    } catch {}
    const method = normalizeFetchMethod(input, init);
    return MUTATING_METHODS.has(method) ? DEFAULT_FETCH_TIMEOUT_MS * 2 : DEFAULT_FETCH_TIMEOUT_MS;
}

function createTimeoutError(timeoutMs) {
    try {
        return new DOMException(`Request timed out after ${timeoutMs}ms`, 'TimeoutError');
    } catch {
        const err = new Error(`Request timed out after ${timeoutMs}ms`);
        err.name = 'TimeoutError';
        return err;
    }
}

function fetchWithTimeout(fetchImpl, input, init = {}, timeoutMs = DEFAULT_FETCH_TIMEOUT_MS) {
    if (!timeoutMs || timeoutMs <= 0 || typeof AbortController === 'undefined') {
        return fetchImpl(input, init);
    }

    const controller = new AbortController();
    const originalSignal = init.signal || input?.signal;
    let timeoutId = null;
    let abortListener = null;

    if (originalSignal?.aborted) {
        controller.abort(originalSignal.reason);
    } else if (originalSignal) {
        abortListener = () => controller.abort(originalSignal.reason);
        originalSignal.addEventListener('abort', abortListener, { once: true });
    }

    timeoutId = setTimeout(() => {
        controller.abort(createTimeoutError(timeoutMs));
    }, timeoutMs);

    const finalInit = { ...init, signal: controller.signal };
    return fetchImpl(input, finalInit).finally(() => {
        clearTimeout(timeoutId);
        if (originalSignal && abortListener) {
            originalSignal.removeEventListener('abort', abortListener);
        }
    });
}

function responseFromSnapshot(snapshot) {
    return new Response(snapshot.body.slice(0), {
        status: snapshot.status,
        statusText: snapshot.statusText,
        headers: snapshot.headers
    });
}

function installDuplicateActionGuard() {
    if (window.__duplicateActionGuardInstalled) return;
    window.__duplicateActionGuardInstalled = true;

    const originalFetch = window.fetch.bind(window);
    const pendingRequests = new Map();

    window.fetch = function(input, init = {}) {
        const shouldGuard = shouldGuardMutatingRequest(input, init);
        const shouldCoalesce = !shouldGuard && shouldCoalesceGetRequest(input, init);
        const timeoutMs = timeoutMsForFetch(input, init);
        if (!shouldGuard && !shouldCoalesce) {
            return fetchWithTimeout(originalFetch, input, init, timeoutMs);
        }

        const method = normalizeFetchMethod(input, init);
        const url = normalizeFetchUrl(input);
        const body = init.body || input?.body || '';
        const key = `${method}:${url}:${typeof body === 'string' ? body : '[body]'}`;

        if (pendingRequests.has(key)) {
            return pendingRequests.get(key).done.then(responseFromSnapshot);
        }

        let resolveSnapshot;
        let rejectSnapshot;
        const entry = {
            done: new Promise((resolve, reject) => {
                resolveSnapshot = resolve;
                rejectSnapshot = reject;
            })
        };
        pendingRequests.set(key, entry);

        const requestPromise = fetchWithTimeout(originalFetch, input, init, timeoutMs).then(async response => {
            const clone = response.clone();
            const snapshot = {
                status: clone.status,
                statusText: clone.statusText,
                headers: [...clone.headers.entries()],
                body: await clone.arrayBuffer()
            };
            resolveSnapshot(snapshot);
            return response;
        }).catch(error => {
            rejectSnapshot(error);
            throw error;
        }).finally(() => {
            pendingRequests.delete(key);
        });
        return requestPromise;
    };

    document.addEventListener('click', event => {
        const button = event.target?.closest?.('button, input[type="button"], input[type="submit"], [role="button"]');
        if (!button || button.disabled || button.dataset.allowRepeatClick === 'true') return;

        const now = Date.now();
        const lockedUntil = Number(button.dataset.lockedUntil || 0);
        if (lockedUntil > now) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        const lockMs = Number(button.dataset.clickLockMs || 1500);
        button.dataset.lockedUntil = String(now + lockMs);
        setTimeout(() => {
            if (Number(button.dataset.lockedUntil || 0) <= Date.now()) {
                delete button.dataset.lockedUntil;
            }
        }, lockMs + 50);
    }, true);

    document.addEventListener('submit', event => {
        const form = event.target;
        if (!form || form.dataset.allowRepeatSubmit === 'true') return;

        const now = Date.now();
        const lockedUntil = Number(form.dataset.lockedUntil || 0);
        if (lockedUntil > now) {
            event.preventDefault();
            event.stopImmediatePropagation();
            return;
        }

        form.dataset.lockedUntil = String(now + 3000);
        setTimeout(() => {
            if (Number(form.dataset.lockedUntil || 0) <= Date.now()) {
                delete form.dataset.lockedUntil;
            }
        }, 3050);
    }, true);
}

installDuplicateActionGuard();

window.serverTimeOffsetMs = 0;
window.serverTimeInfo = null;

window.syncServerTime = async function() {
    try {
        const res = await fetch('/api/server-time', { cache: 'no-store' });
        if (!res.ok) return window.serverTimeInfo;
        const info = await res.json();
        if (Number.isFinite(Number(info.epoch_ms))) {
            window.serverTimeOffsetMs = Number(info.epoch_ms) - Date.now();
        }
        window.serverTimeInfo = info;
        return info;
    } catch (err) {
        console.warn('Server time sync failed:', err);
        return window.serverTimeInfo;
    }
};

window.getEgyptNow = function() {
    return new Date(Date.now() + (window.serverTimeOffsetMs || 0));
};

window.getEgyptDateString = function(daysOffset = 0) {
    const date = window.getEgyptNow();
    date.setUTCDate(date.getUTCDate() + Number(daysOffset || 0));
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: EGYPT_TIME_ZONE,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(date).reduce((acc, part) => {
        acc[part.type] = part.value;
        return acc;
    }, {});
    return `${parts.year}-${parts.month}-${parts.day}`;
};

window.formatEgyptDateTime = function(value, options = {}) {
    const date = value ? new Date(value) : window.getEgyptNow();
    return date.toLocaleString('ar-EG-u-nu-latn', { timeZone: EGYPT_TIME_ZONE, ...options });
};

window.formatProductName = function(name, category) {
    const cleanName = String(name || '').trim();
    const cleanCategory = String(category || '').trim();
    if (!cleanName) return cleanCategory ? `(${cleanCategory})` : '-';
    if (!cleanCategory) return cleanName;
    if (cleanName.endsWith(`(${cleanCategory})`)) return cleanName;
    return `${cleanName} (${cleanCategory})`;
};

window.productDisplayName = function(product, fallback = '-') {
    if (!product) return fallback;
    const name = product.name ?? product.inventory_name ?? product.product_name ?? fallback;
    const category = product.category ?? product.inventory_category ?? product.product_category;
    return window.formatProductName(name, category);
};

window.syncServerTime();

window.hasInventoryAdminAccess = function(user = window.currentUser) {
    let permissions = user?.permissions || [];
    if (typeof permissions === 'string') {
        try {
            permissions = JSON.parse(permissions);
        } catch {
            permissions = [];
        }
    }
    if (!Array.isArray(permissions)) permissions = [];
    return Boolean(user && (user.role === 'admin' || permissions.includes(INVENTORY_ADMIN_PERMISSION)));
};

window.hasInventoryAllBranchesAccess = function(user = window.currentUser) {
    let permissions = user?.permissions || [];
    if (typeof permissions === 'string') {
        try {
            permissions = JSON.parse(permissions);
        } catch {
            permissions = [];
        }
    }
    if (!Array.isArray(permissions)) permissions = [];
    return Boolean(user && (user.role === 'admin' || permissions.includes(INVENTORY_VIEW_ALL_BRANCHES_PERMISSION)));
};

window.isBranchScopedUser = function(user = window.currentUser) {
    return Boolean(user && user.role === 'branch_user' && !window.hasInventoryAllBranchesAccess(user));
};

const CHECKOUT_REMINDER_POLL_MS = 60000;
const CHECKOUT_REMINDER_BELL_MS = 7000;
const CHECKOUT_REMINDER_SNOOZE_OPTIONS = [
    { label: '15 ث', seconds: 15 },
    { label: '30 ث', seconds: 30 },
    { label: '60 ث', seconds: 60 },
];
const CHECKOUT_REMINDER_MINUTE_OPTIONS = [
    { label: '15 د', minutes: 15 },
    { label: '30 د', minutes: 30 },
    { label: '60 د', minutes: 60 },
];

function formatCheckoutReminderClock(value) {
    if (!value) return '-';
    const parts = String(value).split(':');
    if (parts.length < 2) return value;
    let hour = Number.parseInt(parts[0], 10);
    const minute = parts[1];
    if (!Number.isFinite(hour)) return value;
    const suffix = hour >= 12 ? 'م' : 'ص';
    hour = hour % 12 || 12;
    return `${String(hour).padStart(2, '0')}:${minute} ${suffix}`;
}

function getCheckoutReminderStorageKey(user = window.currentUser) {
    const userKey = user?.id || user?.username || 'user';
    return `checkoutReminderSnoozes:${userKey}`;
}

function getCheckoutReminderDismissStorageKey(user = window.currentUser) {
    const userKey = user?.id || user?.username || 'user';
    return `checkoutReminderDismissed:${userKey}`;
}

function getCheckoutReminderKey(reminder) {
    return [
        reminder?.id || '',
        reminder?.attendance_date || '',
        reminder?.shift_due_at || reminder?.shift_end || ''
    ].join(':');
}

function loadCheckoutReminderSnoozes(user = window.currentUser) {
    try {
        const stored = JSON.parse(localStorage.getItem(getCheckoutReminderStorageKey(user)) || '{}');
        const now = Date.now();
        Object.keys(stored).forEach(key => {
            if (!Number.isFinite(Number(stored[key])) || Number(stored[key]) <= now) delete stored[key];
        });
        localStorage.setItem(getCheckoutReminderStorageKey(user), JSON.stringify(stored));
        return stored;
    } catch {
        return {};
    }
}

function saveCheckoutReminderSnoozes(snoozes, user = window.currentUser) {
    localStorage.setItem(getCheckoutReminderStorageKey(user), JSON.stringify(snoozes || {}));
}

function loadCheckoutReminderDismissed(user = window.currentUser) {
    try {
        const stored = JSON.parse(localStorage.getItem(getCheckoutReminderDismissStorageKey(user)) || '{}');
        const cutoff = Date.now() - 36 * 60 * 60 * 1000;
        Object.keys(stored).forEach(key => {
            if (!Number.isFinite(Number(stored[key])) || Number(stored[key]) < cutoff) delete stored[key];
        });
        localStorage.setItem(getCheckoutReminderDismissStorageKey(user), JSON.stringify(stored));
        return stored;
    } catch {
        return {};
    }
}

function saveCheckoutReminderDismissed(dismissed, user = window.currentUser) {
    localStorage.setItem(getCheckoutReminderDismissStorageKey(user), JSON.stringify(dismissed || {}));
}

function formatCheckoutReminderSnoozeUntil(timestamp) {
    const date = new Date(Number(timestamp || 0));
    if (!Number.isFinite(date.getTime())) return '';
    return date.toLocaleTimeString('ar-EG-u-nu-latn', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    });
}

function ensureCheckoutReminderStyles() {
    if (document.getElementById('checkout-reminder-styles')) return;
    const style = document.createElement('style');
    style.id = 'checkout-reminder-styles';
    style.textContent = `
        .checkout-reminder-panel {
            position: fixed;
            left: 18px;
            bottom: 18px;
            width: min(420px, calc(100vw - 36px));
            max-height: min(620px, calc(100vh - 36px));
            background: #ffffff;
            border: 2px solid #f59e0b;
            border-radius: 22px;
            box-shadow: 0 24px 70px -24px rgba(15, 23, 42, 0.35);
            z-index: 10000;
            overflow: hidden;
            direction: rtl;
            font-family: 'Cairo', sans-serif;
        }
        .checkout-reminder-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 12px;
            padding: 16px 18px;
            background: #fffbeb;
            border-bottom: 1px solid #fde68a;
        }
        .checkout-reminder-title {
            margin: 0;
            color: #92400e;
            font-size: 14px;
            font-weight: 900;
        }
        .checkout-reminder-subtitle {
            margin: 3px 0 0;
            color: #78350f;
            font-size: 11px;
            font-weight: 700;
        }
        .checkout-reminder-close {
            width: 34px;
            height: 34px;
            border: 0;
            border-radius: 12px;
            background: #fef3c7;
            color: #92400e;
            cursor: pointer;
            font-weight: 900;
        }
        .checkout-reminder-sound-test {
            border: 0;
            border-radius: 12px;
            background: #1e293b;
            color: #ffffff;
            padding: 9px 11px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
            white-space: nowrap;
        }
        .checkout-reminder-nav {
            position: relative;
            display: flex;
            align-items: center;
        }
        .checkout-reminder-nav-button {
            position: relative;
            width: 42px;
            height: 42px;
            border: 1px solid #e2e8f0;
            border-radius: 14px;
            background: #ffffff;
            color: #1e293b;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            box-shadow: 0 8px 24px -16px rgba(15, 23, 42, 0.3);
        }
        .checkout-reminder-nav-button.is-active {
            border-color: #f59e0b;
            background: #fffbeb;
            color: #92400e;
        }
        .checkout-reminder-nav-badge {
            position: absolute;
            top: -6px;
            left: -6px;
            min-width: 20px;
            height: 20px;
            padding: 0 5px;
            border-radius: 999px;
            background: #ef4444;
            color: #ffffff;
            font-size: 11px;
            line-height: 20px;
            text-align: center;
            font-weight: 900;
            display: none;
        }
        .checkout-reminder-dropdown {
            position: absolute;
            top: calc(100% + 10px);
            left: 0;
            width: min(380px, calc(100vw - 24px));
            max-height: 470px;
            overflow: auto;
            background: #ffffff;
            border: 1px solid #e2e8f0;
            border-radius: 18px;
            box-shadow: 0 24px 70px -28px rgba(15, 23, 42, 0.45);
            padding: 12px;
            z-index: 10001;
            display: none;
            direction: rtl;
        }
        .checkout-reminder-dropdown.is-open {
            display: block;
        }
        .checkout-reminder-dropdown-title {
            margin: 0 0 10px;
            color: #0f172a;
            font-size: 13px;
            font-weight: 900;
        }
        .checkout-reminder-dropdown-empty {
            color: #64748b;
            font-size: 12px;
            font-weight: 800;
            text-align: center;
            padding: 20px 8px;
        }
        .checkout-reminder-list {
            display: grid;
            gap: 12px;
            padding: 14px;
            max-height: 440px;
            overflow-y: auto;
        }
        .checkout-reminder-item {
            border: 1px solid #e2e8f0;
            border-radius: 16px;
            padding: 12px;
            background: #ffffff;
        }
        .checkout-reminder-name {
            margin: 0;
            color: #0f172a;
            font-size: 14px;
            font-weight: 900;
        }
        .checkout-reminder-meta {
            margin: 4px 0 0;
            color: #475569;
            font-size: 11px;
            font-weight: 700;
            line-height: 1.6;
        }
        .checkout-reminder-actions {
            display: grid;
            grid-template-columns: 1fr;
            gap: 8px;
            margin-top: 10px;
        }
        .checkout-reminder-checkout {
            border: 0;
            border-radius: 12px;
            background: #1e293b;
            color: #ffffff;
            padding: 10px 12px;
            font-size: 12px;
            font-weight: 900;
            cursor: pointer;
        }
        .checkout-reminder-dismiss {
            border: 1px solid #fecaca;
            border-radius: 12px;
            background: #fef2f2;
            color: #b91c1c;
            padding: 9px 12px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
        }
        .checkout-reminder-snooze-row {
            display: grid;
            grid-template-columns: repeat(3, 1fr);
            gap: 6px;
        }
        .checkout-reminder-snooze {
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            background: #f8fafc;
            color: #334155;
            padding: 8px 6px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
        }
        .checkout-reminder-custom {
            display: grid;
            grid-template-columns: 1fr auto;
            gap: 6px;
        }
        .checkout-reminder-custom input {
            min-width: 0;
            border: 1px solid #cbd5e1;
            border-radius: 10px;
            padding: 8px 10px;
            font-size: 12px;
            font-weight: 800;
        }
        .checkout-reminder-custom button {
            border: 0;
            border-radius: 10px;
            background: #f59e0b;
            color: #ffffff;
            padding: 8px 10px;
            font-size: 11px;
            font-weight: 900;
            cursor: pointer;
            white-space: nowrap;
        }
        .checkout-reminder-muted {
            color: #64748b;
            font-size: 10px;
            font-weight: 700;
        }
        .checkout-reminder-snoozed {
            display: inline-flex;
            margin-top: 5px;
            padding: 4px 8px;
            border-radius: 999px;
            background: #eef2ff;
            color: #4338ca;
            font-size: 10px;
            font-weight: 900;
        }
        @media (max-width: 640px) {
            .checkout-reminder-panel {
                left: 10px;
                right: 10px;
                bottom: 10px;
                width: auto;
            }
        }
    `;
    document.head.appendChild(style);
}

function ensureCheckoutReminderPanel() {
    ensureCheckoutReminderStyles();
    let panel = document.getElementById('checkout-reminder-panel');
    if (panel) return panel;
    panel = document.createElement('section');
    panel.id = 'checkout-reminder-panel';
    panel.className = 'checkout-reminder-panel';
    panel.style.display = 'none';
    panel.innerHTML = `
        <div class="checkout-reminder-header">
            <div>
                <h3 class="checkout-reminder-title">تذكير تسجيل الانصراف</h3>
                <p class="checkout-reminder-subtitle" id="checkout-reminder-summary"></p>
            </div>
            <div style="display:flex; gap:8px; align-items:center;">
                <button type="button" class="checkout-reminder-sound-test" id="checkout-reminder-sound-test">اختبار الصوت</button>
                <button type="button" class="checkout-reminder-close" id="checkout-reminder-close" title="إخفاء مؤقت">×</button>
            </div>
        </div>
        <div class="checkout-reminder-list" id="checkout-reminder-list"></div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#checkout-reminder-close')?.addEventListener('click', () => {
        panel.style.display = 'none';
        window.checkoutReminderState.hiddenUntil = Date.now() + 5 * 60 * 1000;
    });
    panel.querySelector('#checkout-reminder-sound-test')?.addEventListener('click', async () => {
        await playCheckoutReminderBell(true);
    });
    return panel;
}

function getCheckoutReminderState() {
    if (!window.checkoutReminderState) {
        window.checkoutReminderState = {
            reminders: [],
            visibleReminders: [],
            audibleReminders: [],
            pollTimer: null,
            snoozeTimer: null,
            bellTimer: null,
            audioContext: null,
            bellPlaying: false,
            hiddenUntil: 0,
            started: false,
            audioReady: false,
        };
    }
    return window.checkoutReminderState;
}

async function unlockCheckoutReminderAudio() {
    const state = getCheckoutReminderState();
    if (!window.AudioContext && !window.webkitAudioContext) return null;
    try {
        if (!state.audioContext) {
            const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
            state.audioContext = new AudioContextCtor();
        }
        if (state.audioContext.state === 'suspended') await state.audioContext.resume();
        state.audioReady = state.audioContext.state === 'running';
        return state.audioContext;
    } catch (err) {
        console.warn('Checkout reminder audio unlock failed:', err);
        return null;
    }
}

async function playCheckoutReminderBell(force = false) {
    const state = getCheckoutReminderState();
    if (state.bellPlaying || (!force && !state.audibleReminders.length)) return;
    const ctx = await unlockCheckoutReminderAudio();
    if (!ctx) return;
    if (ctx.state !== 'running') return;

    state.bellPlaying = true;
    const stopAt = ctx.currentTime + (CHECKOUT_REMINDER_BELL_MS / 1000);
    const nodes = [];

    const tick = () => {
        if (ctx.currentTime >= stopAt || (!force && !state.audibleReminders.length)) {
            state.bellPlaying = false;
            return;
        }
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(1046, ctx.currentTime);
            osc.frequency.setValueAtTime(784, ctx.currentTime + 0.16);
            gain.gain.setValueAtTime(0.0001, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.35, ctx.currentTime + 0.03);
            gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.42);
            osc.connect(gain).connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.44);
            nodes.push(osc, gain);
        } catch (err) {
            console.warn('Checkout reminder bell failed:', err);
            state.bellPlaying = false;
            return;
        }
        setTimeout(tick, 700);
    };

    tick();
    setTimeout(() => {
        nodes.forEach(node => {
            try { node.disconnect?.(); } catch {}
        });
        state.bellPlaying = false;
        try { ctx.suspend?.(); } catch {}
    }, CHECKOUT_REMINDER_BELL_MS + 250);
}

function checkoutReminderItemHtml(reminder) {
    const branch = reminder.branch_name ? ` - ${reminder.branch_name}` : '';
    const overdue = Number(reminder.overdue_minutes || 0);
    const overdueText = overdue > 0 ? `متأخر ${overdue} دقيقة` : 'وقت الانصراف الآن';
    const snoozedUntil = Number(reminder.snoozed_until || 0);
    const snoozeText = snoozedUntil > Date.now()
        ? `<span class="checkout-reminder-snoozed">مؤجل لحد ${formatCheckoutReminderSnoozeUntil(snoozedUntil)}</span>`
        : '';
    const reminderKey = getCheckoutReminderKey(reminder);
    const options = CHECKOUT_REMINDER_SNOOZE_OPTIONS.map(option => `
        <button type="button" class="checkout-reminder-snooze" data-checkout-snooze="${reminder.id}" data-seconds="${option.seconds}">
            بعد ${option.label}
        </button>
    `).join('');
    const minuteOptions = CHECKOUT_REMINDER_MINUTE_OPTIONS.map(option => `
        <button type="button" class="checkout-reminder-snooze" data-checkout-snooze="${reminder.id}" data-minutes="${option.minutes}">
            بعد ${option.label}
        </button>
    `).join('');

    return `
        <article class="checkout-reminder-item" data-employee-id="${reminder.id}">
            <p class="checkout-reminder-name">${reminder.name || '-'}</p>
            <p class="checkout-reminder-meta">
                ${reminder.position || 'موظف'}${branch}<br>
                الحضور: ${formatCheckoutReminderClock(reminder.check_in)} - الانصراف المفروض: ${formatCheckoutReminderClock(reminder.shift_end)}<br>
                <span class="checkout-reminder-muted">${overdueText}</span>
                ${snoozeText}
            </p>
            <div class="checkout-reminder-actions">
                <button type="button" class="checkout-reminder-checkout" data-checkout-now="${reminder.id}" data-attendance-date="${reminder.attendance_date || ''}">
                    تسجيل الانصراف الآن
                </button>
                <button type="button" class="checkout-reminder-dismiss" data-checkout-dismiss="${reminderKey}">
                    مسح الإشعار
                </button>
                <div class="checkout-reminder-snooze-row">${options}</div>
                <div class="checkout-reminder-snooze-row">${minuteOptions}</div>
                <div class="checkout-reminder-custom">
                    <input type="number" min="1" max="720" step="1" placeholder="دقائق التأجيل" data-checkout-custom-input="${reminder.id}">
                    <button type="button" data-checkout-custom-snooze="${reminder.id}">تأجيل</button>
                </div>
            </div>
        </article>
    `;
}

function updateCheckoutReminderNav(reminders) {
    const button = document.getElementById('checkout-reminder-nav-button');
    const badge = document.getElementById('checkout-reminder-nav-badge');
    const dropdownList = document.getElementById('checkout-reminder-dropdown-list');
    if (!button || !badge || !dropdownList) return;

    const activeReminders = Array.isArray(reminders) ? reminders : [];
    const count = activeReminders.length;
    badge.textContent = String(count);
    badge.style.display = count > 0 ? 'block' : 'none';
    button.classList.toggle('is-active', count > 0);

    if (count > 0) {
        dropdownList.innerHTML = activeReminders.map(checkoutReminderItemHtml).join('');
    } else {
        dropdownList.innerHTML = '<div class="checkout-reminder-dropdown-empty">لا توجد إشعارات انصراف حالياً</div>';
    }
}

function renderCheckoutReminders(reminders) {
    const state = getCheckoutReminderState();
    const panel = ensureCheckoutReminderPanel();
    const list = panel.querySelector('#checkout-reminder-list');
    const summary = panel.querySelector('#checkout-reminder-summary');
    const snoozes = loadCheckoutReminderSnoozes();
    const dismissed = loadCheckoutReminderDismissed();
    const now = Date.now();
    state.reminders = (Array.isArray(reminders) ? reminders : []).filter(reminder => !dismissed[getCheckoutReminderKey(reminder)]);
    state.visibleReminders = state.reminders.map(reminder => ({
        ...reminder,
        snoozed_until: Number(snoozes[reminder.id] || 0)
    }));
    state.audibleReminders = state.visibleReminders.filter(reminder => Number(reminder.snoozed_until || 0) <= now);
    updateCheckoutReminderNav(state.visibleReminders);

    if (!state.visibleReminders.length) {
        panel.style.display = 'none';
        list.innerHTML = '';
        clearInterval(state.bellTimer);
        state.bellTimer = null;
        return;
    }

    summary.textContent = `${state.visibleReminders.length} موظف محتاج تسجيل انصراف`;
    list.innerHTML = state.visibleReminders.map(checkoutReminderItemHtml).join('');
    panel.style.display = Date.now() < state.hiddenUntil ? 'none' : 'block';

    const nextSnoozeEnd = state.visibleReminders
        .map(reminder => Number(reminder.snoozed_until || 0))
        .filter(timestamp => timestamp > now)
        .sort((a, b) => a - b)[0];
    clearTimeout(state.snoozeTimer);
    state.snoozeTimer = nextSnoozeEnd
        ? setTimeout(() => renderCheckoutReminders(state.reminders), Math.max(250, nextSnoozeEnd - now + 50))
        : null;

    if (!state.audibleReminders.length) {
        clearInterval(state.bellTimer);
        state.bellTimer = null;
        return;
    }

    if (!state.bellTimer) {
        playCheckoutReminderBell();
        state.bellTimer = setInterval(playCheckoutReminderBell, CHECKOUT_REMINDER_POLL_MS);
    }
}

async function refreshCheckoutReminders() {
    if (window.location.pathname === '/login.html' || window.location.pathname === '/setup.html') return;
    try {
        const res = await fetch('/api/employees/checkout-reminders', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        renderCheckoutReminders(data.reminders || []);
    } catch (err) {
        console.warn('Checkout reminders refresh failed:', err);
    }
}

function snoozeCheckoutReminder(employeeId, amount, unit = 'minutes') {
    const parsedAmount = Math.min(Math.max(Number.parseInt(amount, 10) || 0, 1), unit === 'seconds' ? 86400 : 720);
    const durationMs = unit === 'seconds' ? parsedAmount * 1000 : parsedAmount * 60 * 1000;
    const snoozes = loadCheckoutReminderSnoozes();
    snoozes[employeeId] = Date.now() + durationMs;
    saveCheckoutReminderSnoozes(snoozes);
    renderCheckoutReminders(getCheckoutReminderState().reminders);
}

function dismissCheckoutReminder(reminderKey) {
    if (!reminderKey) return;
    const dismissed = loadCheckoutReminderDismissed();
    dismissed[reminderKey] = Date.now();
    saveCheckoutReminderDismissed(dismissed);
    renderCheckoutReminders(getCheckoutReminderState().reminders);
}

function openCheckoutReminderEmployeeAttendance(employeeId, attendanceDate = '') {
    if (!employeeId) return;
    const params = new URLSearchParams({
        attendance_employee_id: employeeId,
        from_checkout_reminder: '1'
    });
    if (attendanceDate) params.set('attendance_date', attendanceDate);

    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    if (currentPage === 'Employees.html' && typeof window.openEmployeeAttendanceFromReminder === 'function') {
        window.openEmployeeAttendanceFromReminder(employeeId, attendanceDate);
        document.getElementById('checkout-reminder-dropdown')?.classList.remove('is-open');
        return;
    }
    window.location.href = `/Employees.html?${params.toString()}`;
}

function installCheckoutReminderEvents() {
    if (window.__checkoutReminderEventsInstalled) return;
    window.__checkoutReminderEventsInstalled = true;

    const unlockOnce = () => {
        const state = getCheckoutReminderState();
        if (state.audibleReminders?.length) {
            unlockCheckoutReminderAudio();
        }
    };
    document.addEventListener('pointerdown', unlockOnce, { once: true, passive: true });

    document.addEventListener('click', event => {
        const navButton = event.target.closest?.('#checkout-reminder-nav-button');
        if (navButton) {
            const dropdown = document.getElementById('checkout-reminder-dropdown');
            dropdown?.classList.toggle('is-open');
            unlockCheckoutReminderAudio();
            return;
        }

        const checkoutButton = event.target.closest?.('[data-checkout-now]');
        if (checkoutButton) {
            openCheckoutReminderEmployeeAttendance(checkoutButton.dataset.checkoutNow, checkoutButton.dataset.attendanceDate);
            return;
        }

        const snoozeButton = event.target.closest?.('[data-checkout-snooze]');
        if (snoozeButton) {
            if (snoozeButton.dataset.seconds) {
                snoozeCheckoutReminder(snoozeButton.dataset.checkoutSnooze, snoozeButton.dataset.seconds, 'seconds');
            } else {
                snoozeCheckoutReminder(snoozeButton.dataset.checkoutSnooze, snoozeButton.dataset.minutes, 'minutes');
            }
            return;
        }

        const dismissButton = event.target.closest?.('[data-checkout-dismiss]');
        if (dismissButton) {
            dismissCheckoutReminder(dismissButton.dataset.checkoutDismiss);
            return;
        }

        const customButton = event.target.closest?.('[data-checkout-custom-snooze]');
        if (customButton) {
            const id = customButton.dataset.checkoutCustomSnooze;
            const item = customButton.closest('[data-employee-id]');
            const input = item?.querySelector(`[data-checkout-custom-input="${id}"]`);
            snoozeCheckoutReminder(id, input?.value || 15, 'minutes');
            return;
        }

        if (!event.target.closest?.('#checkout-reminder-nav')) {
            document.getElementById('checkout-reminder-dropdown')?.classList.remove('is-open');
        }
    });
}

window.startCheckoutReminderMonitor = function(user = window.currentUser) {
    const state = getCheckoutReminderState();
    if (state.started || !user) return;
    state.started = true;
    installCheckoutReminderEvents();
    refreshCheckoutReminders();
    state.pollTimer = setInterval(refreshCheckoutReminders, CHECKOUT_REMINDER_POLL_MS);
};

// Fetch user data on every page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        await window.syncServerTime();
        const res = await fetch('/api/me');
        if (!res.ok) {
            if (window.location.pathname !== '/login.html' && window.location.pathname !== '/setup.html') {
                window.location.href = '/login.html';
            }
            return;
        }
        
        const data = await res.json();
        const user = data.user;
        window.currentUser = user;

        // Render user info
        const userInfoContainer = document.getElementById('user-info-display');
        if (userInfoContainer) {
            ensureCheckoutReminderStyles();
            userInfoContainer.innerHTML = `
                <div class="checkout-reminder-nav" id="checkout-reminder-nav">
                    <button type="button" class="checkout-reminder-nav-button" id="checkout-reminder-nav-button" title="إشعارات الانصراف">
                        <span class="material-symbols-outlined">notifications</span>
                        <span class="checkout-reminder-nav-badge" id="checkout-reminder-nav-badge">0</span>
                    </button>
                <div class="checkout-reminder-dropdown" id="checkout-reminder-dropdown">
                    <p class="checkout-reminder-dropdown-title">إشعارات الانصراف</p>
                    <div id="checkout-reminder-dropdown-list"></div>
                </div>
            </div>
                <div class="text-left hidden sm:block">
                    <p class="text-xs font-bold text-primary">${user.username}</p>
                </div>
                <div class="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center font-bold text-lg shadow-sm">
                    ${user.username.charAt(0).toUpperCase()}
                </div>
            `;
            updateCheckoutReminderNav([]);
        }

        // Update welcome message if exists
        const welcomeMsg = document.getElementById('welcome-message');
        if (welcomeMsg) {
            welcomeMsg.textContent = `أهلاً بك مجدداً، ${user.full_name || user.username}! 👋`;
        }

        // Ensure user has a permissions array, fallback if null
        let userPermissions = user.permissions || ['index.html', 'Rentals.html', 'Barcodes.html', 'Customers.html', 'Suppliers.html', 'RentalInventory.html', 'WornProducts.html'];
        if (typeof userPermissions === 'string') {
            try {
                userPermissions = JSON.parse(userPermissions);
            } catch {
                userPermissions = [];
            }
        }
        if (!Array.isArray(userPermissions)) userPermissions = [];

        // If user is not admin, enforce permissions and exclude Dashboard & Settings
        if (user && user.role !== 'admin') {
            userPermissions = userPermissions.filter(p => p !== 'Dashboard.html' && p !== 'Settings.html');

            // If user tries to access Dashboard.html or Settings.html directly, redirect immediately
            const currentPage = window.location.pathname.split('/').pop() || 'index.html';
            const cleanCurrentPage = currentPage.split('?')[0];
            const permissionAliases = { 'Tailoring.html': 'Alterations.html' };
            const effectiveCurrentPage = permissionAliases[cleanCurrentPage] || cleanCurrentPage;

            if (cleanCurrentPage === 'Dashboard.html' || cleanCurrentPage === 'Settings.html') {
                window.location.href = '/index.html';
                return;
            }

            // Remove restricted links/buttons from sidebar
            const navElements = document.querySelectorAll('aside nav a, aside nav button.nav-link');
            navElements.forEach(el => {
                const href = el.getAttribute('href') || el.getAttribute('data-href');
                if (href) {
                    const rawPageName = href.split('?')[0];
                    const pageName = permissionAliases[rawPageName] || rawPageName;
                    if (!userPermissions.includes(pageName)) {
                        el.style.display = 'none';
                    }
                }
            });

            // If user tries to access restricted page directly, redirect
            if (!userPermissions.includes(effectiveCurrentPage) && cleanCurrentPage !== 'login.html') {
                // Find first available page to redirect to
                if (userPermissions.length > 0) {
                    window.location.href = '/' + userPermissions[0];
                } else {
                    alert('ليس لديك أي صلاحيات لفتح هذا النظام');
                    window.logout();
                }
            }
        }

        window.startCheckoutReminderMonitor(user);

        // Update Store Name Globally from public endpoint
        try {
            const settingsRes = await fetch('/api/public/settings');
            if (!settingsRes.ok) return;
            const settings = await settingsRes.json();
            if (settings.store_name) {
                // Update Sidebar Logo Text
                const logoTitle = document.querySelector('aside h1');
                if (logoTitle) logoTitle.textContent = settings.store_name;

                // Update Login Page Title
                const loginTitle = document.querySelector('.login-brand-title');
                if (loginTitle) loginTitle.textContent = settings.store_name;

                // Update Window Title
                if (document.title.includes('براند')) {
                    document.title = document.title.replace('براند', settings.store_name);
                }
                
                // Store in window for other scripts to use
                window.storeSettings = settings;
            }
        } catch (sErr) {
            console.error('Settings load error:', sErr);
        }
    } catch (err) {
        console.error('Auth error:', err);
    }
});

// Logout function attached to window
window.logout = async function(event) {
    if (event && typeof event.preventDefault === 'function') event.preventDefault();
    try {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'same-origin',
            cache: 'no-store',
        });
    } catch (err) {
        console.error(err);
    } finally {
        window.currentUser = null;
        window.location.replace('/login.html');
    }
};

// Global helper for branch logos
window.getLogoPath = function(branchId, branches) {
    if (!branchId || !branches) return '/logos/men.png';
    const branch = branches.find(b => b.id == branchId);
    if (!branch) return '/logos/men.png';
    if (branch.logo_url && branch.logo_url.trim() !== '') {
        return branch.logo_url;
    }
    if (branch.type === 'men' || (branch.name && branch.name.includes('رجالي'))) return '/logos/men.png';
    if (branch.type === 'women' || (branch.name && branch.name.includes('حريمي'))) return '/logos/women.png';
    return '/logos/men.png';
};

window.logoFilterValue = function(filter) {
    const filters = {
        black: 'grayscale(1) contrast(1.2)',
        slate: 'brightness(0) saturate(100%) invert(24%) sepia(9%) saturate(884%) hue-rotate(176deg) brightness(92%) contrast(87%)',
        gold: 'brightness(0) saturate(100%) invert(55%) sepia(83%) saturate(504%) hue-rotate(12deg) brightness(93%) contrast(88%)',
        rose: 'brightness(0) saturate(100%) invert(37%) sepia(55%) saturate(1343%) hue-rotate(312deg) brightness(91%) contrast(91%)',
        teal: 'brightness(0) saturate(100%) invert(42%) sepia(71%) saturate(421%) hue-rotate(127deg) brightness(86%) contrast(91%)',
        blue: 'brightness(0) saturate(100%) invert(32%) sepia(94%) saturate(1064%) hue-rotate(197deg) brightness(87%) contrast(93%)',
        white: 'brightness(0) invert(1)',
        original: 'none',
    };
    return filters[filter] || filters.black;
};

window.getBranchInvoiceLogoSettings = function(branchId, branches) {
    const branch = Array.isArray(branches) ? branches.find(b => b.id == branchId) : null;
    const colorPattern = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
    const clamp = (value, fallback, min, max) => {
        const parsed = Number.parseInt(value, 10);
        const normalized = Number.isFinite(parsed) ? parsed : fallback;
        return Math.min(Math.max(normalized, min), max);
    };
    const color = (value, fallback) => colorPattern.test(String(value || '').trim()) ? String(value).trim() : fallback;
    const bgEnabled = branch?.invoice_logo_bg_enabled === true || branch?.invoice_logo_bg_enabled === 'true';
    return {
        height: clamp(branch?.invoice_logo_height, 160, 60, 260),
        spacing: clamp(branch?.invoice_logo_spacing, 8, -60, 60),
        filter: bgEnabled ? window.logoFilterValue(branch?.invoice_logo_filter || 'black') : 'none',
        bgEnabled,
        bgStart: color(branch?.invoice_logo_bg_start, '#ffffff'),
        bgEnd: color(branch?.invoice_logo_bg_end, '#ffffff'),
    };
};

window.getInvoiceLogoStyle = function(branchId, branches) {
    const settings = window.getBranchInvoiceLogoSettings(branchId, branches);
    return [
        `--invoice-logo-height: ${settings.height}px`,
        `height: ${settings.height}px !important`,
        'max-height: 260px !important',
        'width: auto !important',
        'max-width: 100% !important',
        `filter: ${settings.filter}`,
    ].join('; ');
};

window.getInvoiceLogoFrameStyle = function(branchId, branches) {
    const settings = window.getBranchInvoiceLogoSettings(branchId, branches);
    return [
        `--invoice-logo-height: ${settings.height}px`,
        `--invoice-logo-spacing: ${settings.spacing}px`,
        'width: 100% !important',
        'max-width: 300px !important',
        `min-height: ${settings.height}px !important`,
        `margin-bottom: ${settings.spacing}px !important`,
        'padding: 0 !important',
        'background: transparent !important',
        'border-radius: 0 !important',
    ].join('; ');
};

// Lightweight background sync. If a branch is working against a local DB and
// SYNC_SERVER_URL is configured on the local server, this pushes queued changes
// whenever connectivity returns.
let syncNowInFlight = null;
window.syncNow = async function() {
    if (syncNowInFlight) return syncNowInFlight;
    syncNowInFlight = (async () => {
    try {
        const statusRes = await fetch('/api/sync/status');
        if (!statusRes.ok) return null;
        const status = await statusRes.json();
        window.syncStatus = status;
        if (!status.configured || Number(status.pending || 0) <= 0) return status;
        const runRes = await fetch('/api/sync/run', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ limit: 50 })
        });
        if (!runRes.ok) return status;
        const result = await runRes.json();
        window.syncStatus = { ...status, ...result };
        return window.syncStatus;
    } catch (err) {
        window.syncStatus = { ...(window.syncStatus || {}), offline: true, last_error: err.message };
        return window.syncStatus;
    } finally {
        syncNowInFlight = null;
    }
    })();
    return syncNowInFlight;
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/login.html' || window.location.pathname === '/setup.html') return;
    window.syncNow().then(status => {
        if (status && status.configured) {
            setInterval(() => window.syncNow(), BACKGROUND_SYNC_INTERVAL_MS);
        }
    });
    window.addEventListener('online', () => window.syncNow());
});

// --- Responsive Tables: Table-to-Card Logic ---
function syncTableLabels(root = document) {
    const tables = root.matches?.('table.responsive-table')
        ? [root]
        : Array.from(root.querySelectorAll?.('table.responsive-table') || []);
    tables.forEach(table => {
        const headers = Array.from(table.querySelectorAll('thead th')).map(th => th.innerText.trim());
        table.querySelectorAll('tbody tr').forEach(row => {
            row.querySelectorAll('td').forEach((td, i) => {
                if (headers[i] && !td.getAttribute('data-label')) {
                    td.setAttribute('data-label', headers[i]);
                }
            });
        });
    });
}

// Initial sync
document.addEventListener('DOMContentLoaded', () => {
    syncTableLabels();

    // Watch dynamic responsive tables without rescanning the full page on every Alpine mutation.
    const pendingTableRoots = new Set();
    let labelsFrame = null;
    const scheduleTableLabelSync = (root) => {
        if (root && root.nodeType === Node.ELEMENT_NODE) {
            const tableRoot = root.closest?.('table.responsive-table, .table-responsive') || root;
            pendingTableRoots.add(tableRoot);
        }
        if (labelsFrame) return;
        labelsFrame = requestAnimationFrame(() => {
            labelsFrame = null;
            const roots = Array.from(pendingTableRoots);
            pendingTableRoots.clear();
            roots.forEach(syncTableLabels);
        });
    };

    const observer = new MutationObserver((mutations) => {
        for (const mutation of mutations) {
            if (mutation.type !== 'childList' || mutation.addedNodes.length === 0) continue;
            const target = mutation.target;
            if (
                target.closest?.('table.responsive-table, .table-responsive') ||
                Array.from(mutation.addedNodes).some(node =>
                    node.nodeType === Node.ELEMENT_NODE &&
                    (node.matches?.('table.responsive-table, .table-responsive') ||
                     node.querySelector?.('table.responsive-table, .table-responsive'))
                )
            ) {
                scheduleTableLabelSync(target);
            }
        }
    });

    document.querySelectorAll('.table-responsive, table.responsive-table').forEach(container => {
        observer.observe(container, { childList: true, subtree: true });
    });

    // Global restrictions for number inputs
    document.addEventListener('wheel', function(event) {
        if (document.activeElement.type === 'number') {
            document.activeElement.blur();
        }
    });

    document.addEventListener('keydown', function(event) {
        if (event.target.type === 'number') {
            if (event.key === '-' || event.key === 'e' || event.key === '+') {
                event.preventDefault();
            }
        }
    });
});
