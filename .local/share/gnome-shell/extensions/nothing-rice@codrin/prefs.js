// Nothing OS — minimal Adw prefs window with one toggle per feature.

import Adw   from 'gi://Adw';
import Gtk   from 'gi://Gtk';
import GObject from 'gi://GObject';

import {ExtensionPreferences} from 'resource:///org/gnome/shell/extensions/prefs.js';

export default class NothingRicePrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();

        const page  = new Adw.PreferencesPage({ title: 'Nothing Rice', icon_name: 'preferences-system-symbolic' });
        const group = new Adw.PreferencesGroup({ title: 'Features' });

        const addToggle = (key, title, subtitle) => {
            const row = new Adw.SwitchRow({ title, subtitle });
            settings.bind(key, row, 'active', 0 /* DEFAULT */);
            group.add(row);
        };

        addToggle('enable-css',           'Nothing CSS overlay',      'Restyle notifications, popovers, quick settings.');
        addToggle('enable-glyph-led',     'Glyph LED notifications',  'Pulse a row of dots along the bottom edge on each notification, per-app patterns + unread badge.');
        addToggle('enable-idle-overlay',  'Idle Ndot overlay',        'Show a fullscreen mono overlay after the configured idle timeout — with weather + now-playing.');
        addToggle('enable-top-bar-clock', 'Top-bar Ndot clock',       'Replace GNOME’s default top-bar clock with an Ndot 57 live clock.');
        addToggle('enable-dashboard',     'Dashboard overlay',        'Toggle a fullscreen Ndot dashboard with weather, clock and MPRIS player. Hotkey: Super+D.');

        // Idle timeout (seconds via spin)
        const tuneGroup = new Adw.PreferencesGroup({ title: 'Tuning' });

        const idleRow = new Adw.SpinRow({
            title: 'Idle timeout (seconds)',
            subtitle: 'How long to wait before showing the overlay.',
            adjustment: new Gtk.Adjustment({
                lower: 30, upper: 3600, step_increment: 30, value: settings.get_int('idle-timeout-ms') / 1000,
            }),
        });
        idleRow.connect('output', () => {
            settings.set_int('idle-timeout-ms', Math.round(idleRow.get_value() * 1000));
            return false;
        });
        tuneGroup.add(idleRow);

        const dotsRow = new Adw.SpinRow({
            title: 'Glyph LED dot count',
            subtitle: 'How many dots in the bottom-edge bar.',
            adjustment: new Gtk.Adjustment({
                lower: 5, upper: 120, step_increment: 1, value: settings.get_int('glyph-dot-count'),
            }),
        });
        dotsRow.connect('output', () => {
            settings.set_int('glyph-dot-count', Math.round(dotsRow.get_value()));
            return false;
        });
        tuneGroup.add(dotsRow);

        page.add(group);
        page.add(tuneGroup);
        window.add(page);
    }
}
