// Nothing OS — idle Ndot overlay.
// Watches Mtk.IdleMonitor; when idle exceeds the configured timeout,
// fades in a fullscreen mono overlay with a centered Ndot "n" + ISO time.
// Any input dismisses it.

import Clutter from 'gi://Clutter';
import GLib from 'gi://GLib';
import St from 'gi://St';
import Meta from 'gi://Meta';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class IdleOverlay {
    constructor(settings) {
        this._settings = settings;
        this._idleMonitor = null;
        this._watchId = 0;
        this._activeWatchId = 0;
        this._overlay = null;
        this._timeUpdate = 0;
        this._settingsChangedId = 0;
    }

    enable() {
        // Mtk replaces Meta for some GNOME 47+ APIs but IdleMonitor stayed on Meta
        try {
            this._idleMonitor = global.backend.get_core_idle_monitor();
        } catch (_) {
            try { this._idleMonitor = Meta.IdleMonitor.get_core(); }
            catch (e) { console.error('nothing-rice idleOverlay: no IdleMonitor: ' + e); return; }
        }
        this._rearm();
        this._settingsChangedId = this._settings.connect(
            'changed::idle-timeout-ms', () => this._rearm()
        );
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }
        this._clearWatches();
        this._dismissOverlay();
    }

    _rearm() {
        this._clearWatches();
        if (!this._idleMonitor) return;
        const timeout = this._settings.get_int('idle-timeout-ms');
        this._watchId = this._idleMonitor.add_idle_watch(timeout, () => this._showOverlay());
    }

    _clearWatches() {
        if (this._idleMonitor) {
            if (this._watchId)        { try { this._idleMonitor.remove_watch(this._watchId); } catch (_) {} this._watchId = 0; }
            if (this._activeWatchId)  { try { this._idleMonitor.remove_watch(this._activeWatchId); } catch (_) {} this._activeWatchId = 0; }
        }
    }

    _showOverlay() {
        if (this._overlay) return;
        // Don't show overlay if a fullscreen window or the lock screen owns the input
        if (Main.screenShield && Main.screenShield._isLocked) return;

        const monitor = Main.layoutManager.primaryMonitor;
        const overlay = new St.Bin({
            style_class: 'nothing-idle-overlay',
            x: monitor.x, y: monitor.y,
            width: monitor.width, height: monitor.height,
            reactive: true,
            track_hover: false,
            opacity: 0,
        });

        const box = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
        });
        const glyph = new St.Label({
            style_class: 'nothing-idle-glyph',
            text: 'n',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const time = new St.Label({
            style_class: 'nothing-idle-time',
            text: this._isoTime(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        box.add_child(glyph);
        box.add_child(time);
        overlay.set_child(box);

        // capture-event lets us swallow + dismiss on any input
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

        overlay.ease({
            opacity: 255,
            duration: 600,
            mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Subtle pulse on the glyph
        this._pulse(glyph);

        // Tick clock label
        this._timeUpdate = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 5, () => {
            if (!this._overlay) return GLib.SOURCE_REMOVE;
            time.set_text(this._isoTime());
            return GLib.SOURCE_CONTINUE;
        });

        // arm an active-watch so we know when user wakes — fallback to capture-event
        if (this._idleMonitor) {
            try {
                this._activeWatchId = this._idleMonitor.add_user_active_watch(() => {
                    this._activeWatchId = 0;
                    this._dismissOverlay();
                });
            } catch (_) {}
        }
    }

    _pulse(actor) {
        const next = () => {
            if (!this._overlay || !actor.get_parent()) return;
            actor.ease({
                opacity: 120,
                duration: 1400,
                mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                onComplete: () => {
                    if (!this._overlay || !actor.get_parent()) return;
                    actor.ease({
                        opacity: 255,
                        duration: 1400,
                        mode: Clutter.AnimationMode.EASE_IN_OUT_SINE,
                        onComplete: () => next(),
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
        if (this._timeUpdate) { GLib.source_remove(this._timeUpdate); this._timeUpdate = 0; }
        overlay.ease({
            opacity: 0,
            duration: 250,
            mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (overlay.get_parent()) Main.layoutManager.removeChrome(overlay);
                overlay.destroy();
                // re-arm for next idle period
                this._rearm();
            },
        });
    }

    _isoTime() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
}
