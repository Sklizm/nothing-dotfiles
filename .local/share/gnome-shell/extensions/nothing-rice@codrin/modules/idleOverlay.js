// Nothing OS — idle Ndot overlay (v2).
// Adds weather (wttr.in via libsoup) + currently-playing track (playerctl).
// Refreshes both every 30s while the overlay is visible.

import Clutter from 'gi://Clutter';
import GLib    from 'gi://GLib';
import Gio     from 'gi://Gio';
import St      from 'gi://St';
import Meta    from 'gi://Meta';
import Soup    from 'gi://Soup';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const WEATHER_URL =
    'https://wttr.in/?format=%t+%C&u=metric';
const WEATHER_REFRESH_MS = 600 * 1000;   // 10 min
const NOWPLAYING_REFRESH_MS = 5 * 1000;
const CLOCK_REFRESH_MS = 5 * 1000;

export class IdleOverlay {
    constructor(settings) {
        this._settings = settings;
        this._idleMonitor = null;
        this._watchId = 0;
        this._activeWatchId = 0;
        this._overlay = null;
        this._tickClock = 0;
        this._tickNowplaying = 0;
        this._tickWeather = 0;
        this._weatherCache = '—';
        this._weatherCachedAt = 0;
        this._settingsChangedId = 0;
        this._soup = null;
    }

    enable() {
        try { this._idleMonitor = global.backend.get_core_idle_monitor(); }
        catch (_) { try { this._idleMonitor = Meta.IdleMonitor.get_core(); } catch (e) { console.error('nothing-rice idleOverlay: ' + e); return; } }
        this._soup = new Soup.Session({ timeout: 8, user_agent: 'nothing-rice/1.0' });
        this._rearm();
        this._settingsChangedId = this._settings.connect('changed::idle-timeout-ms', () => this._rearm());
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._clearWatches();
        this._dismissOverlay();
        if (this._soup) { try { this._soup.abort(); } catch (_) {} this._soup = null; }
    }

    _rearm() {
        this._clearWatches();
        if (!this._idleMonitor) return;
        const timeout = this._settings.get_int('idle-timeout-ms');
        this._watchId = this._idleMonitor.add_idle_watch(timeout, () => this._showOverlay());
    }

    _clearWatches() {
        if (!this._idleMonitor) return;
        if (this._watchId)       { try { this._idleMonitor.remove_watch(this._watchId); } catch (_) {} this._watchId = 0; }
        if (this._activeWatchId) { try { this._idleMonitor.remove_watch(this._activeWatchId); } catch (_) {} this._activeWatchId = 0; }
    }

    _showOverlay() {
        if (this._overlay) return;
        if (Main.screenShield && Main.screenShield._isLocked) return;

        const monitor = Main.layoutManager.primaryMonitor;
        const overlay = new St.Bin({
            style_class: 'nothing-idle-overlay',
            x: monitor.x, y: monitor.y,
            width: monitor.width, height: monitor.height,
            reactive: true, track_hover: false, opacity: 0,
        });

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });

        // weather (top, small)
        const weather = new St.Label({
            style_class: 'nothing-idle-weather',
            text: this._weatherCache,
            x_align: Clutter.ActorAlign.CENTER,
        });

        // big Ndot glyph
        const glyph = new St.Label({
            style_class: 'nothing-idle-glyph',
            text: this._timeMain(),
            x_align: Clutter.ActorAlign.CENTER,
        });

        // ISO date + time
        const time = new St.Label({
            style_class: 'nothing-idle-time',
            text: this._isoStamp(),
            x_align: Clutter.ActorAlign.CENTER,
        });

        // now playing (bottom)
        const now = new St.Label({
            style_class: 'nothing-idle-nowplaying',
            text: '—',
            x_align: Clutter.ActorAlign.CENTER,
        });

        box.add_child(weather);
        box.add_child(glyph);
        box.add_child(time);
        box.add_child(now);
        overlay.set_child(box);

        overlay.connect('captured-event', (_a, ev) => {
            const t = ev.type();
            if (t === Clutter.EventType.KEY_PRESS ||
                t === Clutter.EventType.BUTTON_PRESS ||
                t === Clutter.EventType.MOTION ||
                t === Clutter.EventType.SCROLL ||
                t === Clutter.EventType.TOUCH_BEGIN) {
                this._dismissOverlay();
                return Clutter.EVENT_STOP;
            }
            return Clutter.EVENT_PROPAGATE;
        });

        Main.layoutManager.addTopChrome(overlay, { affectsInputRegion: true });
        this._overlay = overlay;
        this._overlayParts = { weather, glyph, time, now };

        overlay.ease({ opacity: 255, duration: 600, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
        this._pulse(glyph);

        // clock ticker
        this._tickClock = GLib.timeout_add(GLib.PRIORITY_LOW, CLOCK_REFRESH_MS / 1000, () => {
            if (!this._overlay) return GLib.SOURCE_REMOVE;
            glyph.set_text(this._timeMain());
            time.set_text(this._isoStamp());
            return GLib.SOURCE_CONTINUE;
        });

        // now-playing ticker
        this._refreshNowplaying(now);
        this._tickNowplaying = GLib.timeout_add(GLib.PRIORITY_LOW, NOWPLAYING_REFRESH_MS, () => {
            if (!this._overlay) return GLib.SOURCE_REMOVE;
            this._refreshNowplaying(now);
            return GLib.SOURCE_CONTINUE;
        });

        // weather: refresh if stale; then re-fetch periodically
        this._refreshWeather(weather);
        this._tickWeather = GLib.timeout_add(GLib.PRIORITY_LOW, WEATHER_REFRESH_MS, () => {
            if (!this._overlay) return GLib.SOURCE_REMOVE;
            this._refreshWeather(weather);
            return GLib.SOURCE_CONTINUE;
        });

        // user-active watch
        try {
            this._activeWatchId = this._idleMonitor.add_user_active_watch(() => {
                this._activeWatchId = 0;
                this._dismissOverlay();
            });
        } catch (_) {}
    }

    _pulse(actor) {
        const next = () => {
            if (!this._overlay || !actor.get_parent()) return;
            actor.ease({
                opacity: 140, duration: 1400, mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                onComplete: () => {
                    if (!this._overlay || !actor.get_parent()) return;
                    actor.ease({
                        opacity: 255, duration: 1400, mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                        onComplete: next,
                    });
                },
            });
        };
        next();
    }

    _dismissOverlay() {
        if (!this._overlay) return;
        const overlay = this._overlay;
        this._overlay = null;
        this._overlayParts = null;
        for (const id of ['_tickClock', '_tickNowplaying', '_tickWeather']) {
            if (this[id]) { GLib.source_remove(this[id]); this[id] = 0; }
        }
        overlay.ease({
            opacity: 0, duration: 250, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (overlay.get_parent()) Main.layoutManager.removeChrome(overlay);
                overlay.destroy();
                this._rearm();
            },
        });
    }

    _timeMain() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    _isoStamp() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}  ▪  ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    // ---- now playing ----
    _refreshNowplaying(label) {
        // Spawn playerctl async; show "—" if nothing playing.
        try {
            const proc = Gio.Subprocess.new(
                ['playerctl', 'metadata', '--format', '{{title}} · {{artist}}'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    let line = (stdout || '').trim();
                    if (!line || line === ' · ') line = '—';
                    if (line.length > 60) line = line.slice(0, 58) + '…';
                    if (this._overlay && label.get_parent()) label.set_text(line);
                } catch (e) {
                    if (this._overlay && label.get_parent()) label.set_text('—');
                }
            });
        } catch (_) {
            label.set_text('—');
        }
    }

    // ---- weather ----
    _refreshWeather(label) {
        const now = GLib.get_monotonic_time() / 1000; // ms
        if (now - this._weatherCachedAt < WEATHER_REFRESH_MS && this._weatherCache !== '—') {
            label.set_text(this._weatherCache);
            return;
        }
        if (!this._soup) return;
        const msg = Soup.Message.new('GET', WEATHER_URL);
        if (!msg) return;
        this._soup.send_and_read_async(msg, GLib.PRIORITY_LOW, null, (sess, res) => {
            try {
                const bytes = sess.send_and_read_finish(res);
                if (msg.status_code !== 200) return;
                const decoder = new TextDecoder();
                let text = decoder.decode(bytes.get_data() || new Uint8Array()).trim();
                if (text.length > 50) text = text.slice(0, 50);
                this._weatherCache = text || '—';
                this._weatherCachedAt = GLib.get_monotonic_time() / 1000;
                if (this._overlay && label.get_parent()) label.set_text(this._weatherCache);
            } catch (e) {
                // network error — keep previous
            }
        });
    }
}
