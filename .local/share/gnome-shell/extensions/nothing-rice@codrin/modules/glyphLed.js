// Nothing OS — glyph LED notification flasher.
// Spawns a row of dots along the bottom edge of the primary monitor
// and pulses each one in sequence whenever a new notification arrives.

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

export class GlyphLed {
    constructor(settings) {
        this._settings = settings;
        this._sourceAddedId = 0;
        this._sourceRemovedSignals = new Map();
        this._activeAnims = new Set();
    }

    enable() {
        const tray = Main.messageTray;
        this._sourceAddedId = tray.connect('source-added', (_t, src) => this._bindSource(src));
        // bind existing sources
        for (const src of tray.getSources()) this._bindSource(src);
    }

    disable() {
        const tray = Main.messageTray;
        if (this._sourceAddedId) {
            tray.disconnect(this._sourceAddedId);
            this._sourceAddedId = 0;
        }
        for (const [src, sigs] of this._sourceRemovedSignals.entries()) {
            for (const id of sigs) try { src.disconnect(id); } catch (_) {}
        }
        this._sourceRemovedSignals.clear();
        for (const t of this._activeAnims) GLib.source_remove(t);
        this._activeAnims.clear();
    }

    _bindSource(src) {
        if (!src) return;
        const sigs = [];
        try {
            sigs.push(src.connect('notification-added', () => this._flash()));
        } catch (e) {
            // older API: 'notify' on notification-count
        }
        this._sourceRemovedSignals.set(src, sigs);
    }

    _flash() {
        const count = this._settings.get_int('glyph-dot-count');
        const monitor = Main.layoutManager.primaryMonitor;
        const dotSize = 5;
        const gap = Math.floor(monitor.width / (count + 1)) - dotSize;
        const totalW = count * dotSize + (count - 1) * gap;
        const startX = monitor.x + Math.floor((monitor.width - totalW) / 2);
        const y = monitor.y + monitor.height - 14;

        const container = new St.Widget({
            style_class: 'nothing-glyph-led',
            x: startX,
            y: y,
            width: totalW,
            height: dotSize + 4,
            reactive: false,
            track_hover: false,
            opacity: 0,
        });
        Main.layoutManager.addTopChrome(container);

        const dots = [];
        for (let i = 0; i < count; i++) {
            const d = new St.Widget({
                style_class: 'nothing-glyph-dot',
                x: i * (dotSize + gap),
                y: 0,
                width: dotSize,
                height: dotSize,
                opacity: 0,
            });
            container.add_child(d);
            dots.push(d);
        }

        container.ease({
            opacity: 255, duration: 80, mode: Clutter.AnimationMode.EASE_OUT_QUAD,
        });

        // Sweep dots on
        for (let i = 0; i < count; i++) {
            const t = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 12 * i, () => {
                if (dots[i] && dots[i].get_parent()) {
                    dots[i].ease({ opacity: 255, duration: 140, mode: Clutter.AnimationMode.EASE_OUT_QUAD });
                }
                this._activeAnims.delete(t);
                return GLib.SOURCE_REMOVE;
            });
            this._activeAnims.add(t);
        }

        // Hold, then sweep off + remove
        const holdMs = 600 + count * 12;
        const tHold = GLib.timeout_add(GLib.PRIORITY_DEFAULT, holdMs, () => {
            for (let i = 0; i < count; i++) {
                if (dots[i] && dots[i].get_parent()) {
                    dots[i].ease({ opacity: 0, duration: 180, mode: Clutter.AnimationMode.EASE_IN_QUAD });
                }
            }
            const tEnd = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 220, () => {
                container.ease({
                    opacity: 0, duration: 120, mode: Clutter.AnimationMode.EASE_IN_QUAD,
                    onComplete: () => {
                        if (container.get_parent()) Main.layoutManager.removeChrome(container);
                        container.destroy();
                    },
                });
                this._activeAnims.delete(tEnd);
                return GLib.SOURCE_REMOVE;
            });
            this._activeAnims.add(tEnd);
            this._activeAnims.delete(tHold);
            return GLib.SOURCE_REMOVE;
        });
        this._activeAnims.add(tHold);
    }
}
