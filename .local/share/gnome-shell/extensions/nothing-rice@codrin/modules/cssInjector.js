// Nothing OS — load the bundled stylesheet.css into the shell theme.

import St from 'gi://St';
import Gio from 'gi://Gio';
import GLib from 'gi://GLib';

export class CssInjector {
    constructor(extensionPath) {
        this._path = extensionPath;
        this._loaded = false;
    }

    enable() {
        const ctx = St.ThemeContext.get_for_stage(global.stage);
        let theme = ctx.get_theme();
        if (!theme) {
            theme = new St.Theme();
            ctx.set_theme(theme);
        }
        const cssPath = GLib.build_filenamev([this._path, 'stylesheet.css']);
        const file = Gio.File.new_for_path(cssPath);
        try {
            theme.load_stylesheet(file);
            this._theme = theme;
            this._file = file;
            this._loaded = true;
        } catch (e) {
            console.error('nothing-rice cssInjector: load failed: ' + e);
        }
    }

    disable() {
        if (this._loaded && this._theme && this._file) {
            try { this._theme.unload_stylesheet(this._file); }
            catch (e) { console.error('nothing-rice cssInjector: unload failed: ' + e); }
        }
        this._loaded = false;
        this._theme = null;
        this._file = null;
    }
}
