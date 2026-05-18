// Nothing OS — main extension entry.
// GNOME 48-50 ESM extension format.

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';

import {CssInjector} from './modules/cssInjector.js';
import {GlyphLed}    from './modules/glyphLed.js';
import {IdleOverlay} from './modules/idleOverlay.js';

export default class NothingRice extends Extension {
    enable() {
        this._settings = this.getSettings();

        this._css   = new CssInjector(this.path);
        this._glyph = new GlyphLed(this._settings);
        this._idle  = new IdleOverlay(this._settings);

        this._applyToggle('enable-css',         this._css);
        this._applyToggle('enable-glyph-led',   this._glyph);
        this._applyToggle('enable-idle-overlay',this._idle);

        this._cssId   = this._settings.connect('changed::enable-css',          () => this._applyToggle('enable-css',          this._css));
        this._glyphId = this._settings.connect('changed::enable-glyph-led',    () => this._applyToggle('enable-glyph-led',    this._glyph));
        this._idleId  = this._settings.connect('changed::enable-idle-overlay', () => this._applyToggle('enable-idle-overlay', this._idle));
    }

    disable() {
        if (this._settings) {
            if (this._cssId)   this._settings.disconnect(this._cssId);
            if (this._glyphId) this._settings.disconnect(this._glyphId);
            if (this._idleId)  this._settings.disconnect(this._idleId);
        }
        try { this._css   && this._css.disable(); }   catch (e) { console.error('nothing-rice css disable: '   + e); }
        try { this._glyph && this._glyph.disable(); } catch (e) { console.error('nothing-rice glyph disable: ' + e); }
        try { this._idle  && this._idle.disable(); }  catch (e) { console.error('nothing-rice idle disable: '  + e); }
        this._css = null;
        this._glyph = null;
        this._idle = null;
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
