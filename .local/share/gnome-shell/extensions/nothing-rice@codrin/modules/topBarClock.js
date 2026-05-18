// Nothing OS — top-bar Ndot clock module.
// Hides GNOME DateMenu's default clock label and inserts a custom panel button
// rendering live time in Ndot 57. Clicking opens the original DateMenu popup.

import Clutter from 'gi://Clutter';
import GLib    from 'gi://GLib';
import GObject from 'gi://GObject';
import St      from 'gi://St';

import * as Main         from 'resource:///org/gnome/shell/ui/main.js';
import * as PanelMenu    from 'resource:///org/gnome/shell/ui/panelMenu.js';

export class TopBarClock {
    constructor() {
        this._button = null;
        this._label = null;
        this._tick = 0;
        this._origLabel = null;
        this._origVisible = null;
    }

    enable() {
        // Hide GNOME's default clock label inside the date menu button.
        const dm = Main.panel.statusArea.dateMenu;
        if (dm && dm._clockDisplay) {
            this._origLabel  = dm._clockDisplay;
            this._origVisible = dm._clockDisplay.visible;
            dm._clockDisplay.visible = false;
            // also hide the indicators (notification dot / pad)
            if (dm._indicators) {
                this._origIndVisible = dm._indicators.visible;
                dm._indicators.visible = false;
            }
        }

        // Our own panel button
        const BtnCls = GObject.registerClass(
            class NothingClockButton extends PanelMenu.Button {
                _init() {
                    super._init(0.5, 'nothing-clock', false);
                }
            }
        );
        this._button = new BtnCls();

        this._label = new St.Label({
            style_class: 'nothing-panel-clock',
            text: this._render(),
            y_align: Clutter.ActorAlign.CENTER,
            x_align: Clutter.ActorAlign.CENTER,
        });
        this._button.add_child(this._label);

        // Forward clicks to open the original DateMenu's menu
        this._button.connect('button-press-event', () => {
            try { Main.panel.statusArea.dateMenu.menu.toggle(); } catch (_) {}
            return Clutter.EVENT_STOP;
        });

        // Insert into center box next to the (now-hidden) date menu
        Main.panel.addToStatusArea('nothing-clock', this._button, 0, 'center');

        // Tick once per second so it never lags behind by more than a second
        this._tick = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            if (!this._label) return GLib.SOURCE_REMOVE;
            this._label.set_text(this._render());
            return GLib.SOURCE_CONTINUE;
        });
    }

    disable() {
        if (this._tick) { GLib.source_remove(this._tick); this._tick = 0; }
        if (this._button) {
            try { this._button.destroy(); } catch (_) {}
            this._button = null;
        }
        this._label = null;
        // Restore the original clock label
        if (this._origLabel) {
            try { this._origLabel.visible = this._origVisible ?? true; } catch (_) {}
            this._origLabel = null;
        }
        const dm = Main.panel.statusArea.dateMenu;
        if (dm && dm._indicators && this._origIndVisible !== undefined) {
            try { dm._indicators.visible = this._origIndVisible; } catch (_) {}
            this._origIndVisible = undefined;
        }
    }

    _render() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        // Use a thin separator (▪) so it reads like Ndot phone style
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
}
