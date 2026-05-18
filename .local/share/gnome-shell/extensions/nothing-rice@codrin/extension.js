// Nothing OS — main extension entry.
// GNOME 48-50 ESM extension format.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {CssInjector} from './modules/cssInjector.js';
import {GlyphLed}    from './modules/glyphLed.js';
import {IdleOverlay} from './modules/idleOverlay.js';
import {TopBarClock} from './modules/topBarClock.js';
import {Dashboard}   from './modules/dashboard.js';

export default class NothingRice extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._css   = new CssInjector(this.path);
        this._glyph = new GlyphLed(this._settings);
        this._idle  = new IdleOverlay(this._settings);
        this._clock = new TopBarClock();
        this._dash  = new Dashboard(this._settings);

        this._toggles = [
            ['enable-css',          this._css],
            ['enable-glyph-led',    this._glyph],
            ['enable-idle-overlay', this._idle],
            ['enable-top-bar-clock',this._clock],
            ['enable-dashboard',    this._dash],
        ];
        for (const [k, m] of this._toggles) this._applyToggle(k, m);

        this._sigIds = this._toggles.map(([k, m]) =>
            this._settings.connect(`changed::${k}`, () => this._applyToggle(k, m))
        );
    }

    disable() {
        if (this._settings && this._sigIds) {
            for (const id of this._sigIds) try { this._settings.disconnect(id); } catch (_) {}
            this._sigIds = null;
        }
        for (const [k, m] of (this._toggles || [])) {
            try { m && m.disable(); } catch (e) { console.error(`nothing-rice ${k} disable: ` + e); }
        }
        this._toggles = null;
        this._css = this._glyph = this._idle = this._clock = this._dash = null;
        this._settings = null;
    }

    _applyToggle(key, mod) {
        if (!mod) return;
        if (this._settings.get_boolean(key)) {
            try { mod.enable(); } catch (e) { console.error(`nothing-rice ${key} enable: ` + e); }
        } else {
            try { mod.disable(); } catch (e) { console.error(`nothing-rice ${key} disable: ` + e); }
        }
    }
}
