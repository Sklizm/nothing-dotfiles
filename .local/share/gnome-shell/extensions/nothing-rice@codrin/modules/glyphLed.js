// Nothing OS — glyph LED notification flasher (v2).
// Listens directly on the freedesktop Notifications D-Bus so it works with
// GNOME's native daemon OR dunst (or any other freedesktop daemon).
// Per-app patterns + unread badge that stays lit until tray opened.

import Clutter from 'gi://Clutter';
import St      from 'gi://St';
import GLib    from 'gi://GLib';
import Gio     from 'gi://Gio';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const NOTIFY_RULE =
    "type='method_call'," +
    "interface='org.freedesktop.Notifications'," +
    "member='Notify'," +
    "eavesdrop='true'";

// Per-app pattern map. Key matched against app_name (case-insensitive contains).
// Falls back to 'default' (sweep left→right).
const PATTERNS = {
    'discord':  { kind: 'cluster',  side: 'left',  count: 3, durMs: 1400 },
    'vesktop':  { kind: 'cluster',  side: 'left',  count: 3, durMs: 1400 },
    'spotify':  { kind: 'sweep',    full: true,           durMs: 1600 },
    'rmpc':     { kind: 'sweep',    full: true,           durMs: 1600 },
    'telegram': { kind: 'cluster',  side: 'right', count: 4, durMs: 1200 },
    'slack':    { kind: 'cluster',  side: 'right', count: 5, durMs: 1200 },
    'firefox':  { kind: 'pulse',                          durMs: 900  },
    'zen':      { kind: 'pulse',                          durMs: 900  },
    'default':  { kind: 'sweep',    full: false,          durMs: 900  },
};

export class GlyphLed {
    constructor(settings) {
        this._settings = settings;
        this._bus = null;
        this._subId = 0;
        this._activeAnims = new Set();
        this._unreadCount = 0;
        this._badge = null;
        this._traySig = 0;
    }

    enable() {
        // Subscribe to the session bus for Notify method calls (monitoring).
        // Uses Gio.DBus.session.signal_subscribe with G_DBUS_SIGNAL_FLAGS_MATCH_ARG0_NAMESPACE
        // doesn't fit method calls — we use the bus monitor approach via add_match.
        this._bus = Gio.DBus.session;

        // Become a monitor on org.freedesktop.Notifications
        try {
            this._bus.call_sync(
                'org.freedesktop.DBus',
                '/org/freedesktop/DBus',
                'org.freedesktop.DBus.Monitoring',
                'BecomeMonitor',
                new GLib.Variant('(asu)', [[NOTIFY_RULE], 0]),
                null,
                Gio.DBusCallFlags.NONE,
                -1,
                null
            );
        } catch (e) {
            // BecomeMonitor not allowed for this connection — fall back to AddMatch
            console.warn('nothing-rice glyphLed: BecomeMonitor failed (' + e + '), trying AddMatch');
            try {
                this._bus.call_sync(
                    'org.freedesktop.DBus',
                    '/org/freedesktop/DBus',
                    'org.freedesktop.DBus',
                    'AddMatch',
                    new GLib.Variant('(s)', [NOTIFY_RULE]),
                    null,
                    Gio.DBusCallFlags.NONE,
                    -1,
                    null
                );
            } catch (e2) {
                console.error('nothing-rice glyphLed: AddMatch also failed: ' + e2);
            }
        }

        // Subscribe to all signals; we filter for Notify ourselves.
        this._subId = this._bus.signal_subscribe(
            null,                                  // sender
            'org.freedesktop.Notifications',       // interface
            'Notify',                              // member
            '/org/freedesktop/Notifications',      // path
            null,                                  // arg0
            Gio.DBusSignalFlags.NONE,
            (conn, sender, path, iface, signal, params) => this._onNotify(params)
        );

        // Track when user opens the message tray → clear badge.
        if (Main.messageTray && Main.messageTray.connect) {
            this._traySig = Main.panel.statusArea.dateMenu.menu.connect('open-state-changed', (_m, open) => {
                if (open) this._clearBadge();
            });
        }
    }

    disable() {
        if (this._subId && this._bus) {
            try { this._bus.signal_unsubscribe(this._subId); } catch (_) {}
        }
        this._subId = 0;
        this._bus = null;
        if (this._traySig) {
            try { Main.panel.statusArea.dateMenu.menu.disconnect(this._traySig); } catch (_) {}
            this._traySig = 0;
        }
        for (const t of this._activeAnims) GLib.source_remove(t);
        this._activeAnims.clear();
        this._clearBadge();
    }

    _onNotify(params) {
        // Notify signature: (susssasa{sv}i)
        // (app_name, replaces_id, app_icon, summary, body, actions, hints, expire_timeout)
        let appName = 'default';
        try {
            const u = params.unpack();
            if (u && u[0]) appName = u[0].unpack ? u[0].unpack() : String(u[0]);
        } catch (e) {
            // best effort
        }
        const pattern = this._matchPattern(appName);
        this._flash(pattern);
        this._bumpBadge();
    }

    _matchPattern(appName) {
        const key = String(appName || '').toLowerCase();
        for (const k of Object.keys(PATTERNS)) {
            if (k !== 'default' && key.includes(k)) return PATTERNS[k];
        }
        return PATTERNS.default;
    }

    _flash(pattern) {
        const count = this._settings.get_int('glyph-dot-count');
        const monitor = Main.layoutManager.primaryMonitor;
        const dotSize = 5;
        const gap = Math.floor(monitor.width / (count + 1)) - dotSize;
        const totalW = count * dotSize + (count - 1) * gap;
        const startX = monitor.x + Math.floor((monitor.width - totalW) / 2);
        const y = monitor.y + monitor.height - 14;

        const container = new St.Widget({
            style_class: 'nothing-glyph-led',
            x: startX, y: y,
            width: totalW, height: dotSize + 4,
            reactive: false, track_hover: false,
            opacity: 0,
        });
        Main.layoutManager.addTopChrome(container);

        const dots = [];
        for (let i = 0; i < count; i++) {
            const d = new St.Widget({
                style_class: 'nothing-glyph-dot',
                x: i * (dotSize + gap), y: 0,
                width: dotSize, height: dotSize, opacity: 0,
            });
            container.add_child(d);
            dots.push(d);
        }

        container.ease({ opacity: 255, duration: 80, mode: Clutter.AnimationMode.EASE_OUT_QUAD });

        switch (pattern.kind) {
            case 'cluster': this._playCluster(dots, pattern); break;
            case 'pulse':   this._playPulse(dots, pattern); break;
            case 'sweep':   /* fallthrough */
            default:        this._playSweep(dots, pattern); break;
        }

        // Schedule fade-out + destroy
        const lifeMs = pattern.durMs + 200;
        const tEnd = GLib.timeout_add(GLib.PRIORITY_DEFAULT, lifeMs, () => {
            for (const d of dots) {
                if (d && d.get_parent()) d.ease({ opacity: 0, duration: 200, mode: Clutter.AnimationMode.EASE_IN_QUAD });
            }
            const tDestroy = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 240, () => {
                container.ease({
                    opacity: 0, duration: 120, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onComplete: () => {
                        if (container.get_parent()) Main.layoutManager.removeChrome(container);
                        container.destroy();
                    },
                });
                this._activeAnims.delete(tDestroy);
                return GLib.SOURCE_REMOVE;
            });
            this._activeAnims.add(tDestroy);
            this._activeAnims.delete(tEnd);
            return GLib.SOURCE_REMOVE;
        });
        this._activeAnims.add(tEnd);
    }

    _playSweep(dots, pattern) {
        const total = dots.length;
        const span = pattern.full ? total : Math.ceil(total * 0.66);
        const start = pattern.full ? 0 : Math.floor((total - span) / 2);
        const step = Math.max(8, Math.floor(pattern.durMs / span / 3));
        for (let i = 0; i < span; i++) {
            const idx = start + i;
            const t = GLib.timeout_add(GLib.PRIORITY_DEFAULT, step * i, () => {
                if (dots[idx] && dots[idx].get_parent()) {
                    dots[idx].ease({ opacity: 255, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                }
                this._activeAnims.delete(t);
                return GLib.SOURCE_REMOVE;
            });
            this._activeAnims.add(t);
        }
    }

    _playCluster(dots, pattern) {
        const total = dots.length;
        const n = Math.min(pattern.count, total);
        const indices = [];
        if (pattern.side === 'left') {
            for (let i = 0; i < n; i++) indices.push(i + 2);
        } else if (pattern.side === 'right') {
            for (let i = 0; i < n; i++) indices.push(total - 3 - i);
        } else {
            // center
            const c = Math.floor(total / 2);
            for (let i = 0; i < n; i++) indices.push(c - Math.floor(n / 2) + i);
        }
        // 2 pulses
        const pulse = (delay) => {
            for (const idx of indices) {
                if (!dots[idx]) continue;
                const t = GLib.timeout_add(GLib.PRIORITY_DEFAULT, delay, () => {
                    if (dots[idx] && dots[idx].get_parent()) {
                        dots[idx].opacity = 0;
                        dots[idx].ease({ opacity: 255, duration: 220, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                    }
                    this._activeAnims.delete(t);
                    return GLib.SOURCE_REMOVE;
                });
                this._activeAnims.add(t);
            }
        };
        pulse(0);
        pulse(Math.floor(pattern.durMs / 2));
    }

    _playPulse(dots, pattern) {
        // All dots fade in together, hold, fade.
        for (const d of dots) {
            if (d && d.get_parent()) {
                d.ease({ opacity: 200, duration: 240, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
            }
        }
    }

    // ---- unread badge ----
    _bumpBadge() {
        this._unreadCount++;
        this._renderBadge();
    }

    _clearBadge() {
        this._unreadCount = 0;
        if (this._badge) {
            const b = this._badge;
            this._badge = null;
            b.ease({
                opacity: 0, duration: 160, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                onComplete: () => {
                    if (b.get_parent()) Main.layoutManager.removeChrome(b);
                    b.destroy();
                },
            });
        }
    }

    _renderBadge() {
        const monitor = Main.layoutManager.primaryMonitor;
        const text = String(this._unreadCount);
        if (!this._badge) {
            this._badge = new St.Label({
                style_class: 'nothing-glyph-badge',
                text: text,
                x: monitor.x + monitor.width - 56,
                y: monitor.y + monitor.height - 36,
                opacity: 0,
            });
            Main.layoutManager.addTopChrome(this._badge);
            this._badge.ease({ opacity: 255, duration: 160 });
        } else {
            this._badge.set_text(text);
        }
    }
}
