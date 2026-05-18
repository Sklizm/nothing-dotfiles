// Nothing OS — interactive dashboard overlay.
// Bound to a global hotkey (default super+d). Renders a fullscreen mono
// overlay with: big Ndot clock, weather, MPRIS player card (with prev/play/next
// buttons), battery, uptime. Click anywhere outside the panel or press Esc/super+d to dismiss.

import Clutter from 'gi://Clutter';
import GLib    from 'gi://GLib';
import GObject from 'gi://GObject';
import Gio     from 'gi://Gio';
import Meta    from 'gi://Meta';
import St      from 'gi://St';
import Shell   from 'gi://Shell';
import Soup    from 'gi://Soup';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const WEATHER_URL = 'https://wttr.in/?format=%t+%C&u=metric';
const NOWPLAYING_REFRESH_MS = 2000;
const STATS_REFRESH_MS = 5000;

const KEYBINDING = 'dashboard-hotkey';
const KEYBINDING_DEFAULT = ['<Super>d'];

export class Dashboard {
    constructor(settings) {
        this._settings = settings;
        this._actor = null;
        this._tickClock = 0;
        this._tickPlayer = 0;
        this._tickStats  = 0;
        this._soup = null;
        this._weatherCache = '—';
        this._weatherCachedAt = 0;
    }

    enable() {
        this._soup = new Soup.Session({ timeout: 8, user_agent: 'nothing-rice/1.0' });
        // Ensure keybinding is set (idempotent)
        const cur = this._settings.get_strv(KEYBINDING);
        if (!cur || cur.length === 0) this._settings.set_strv(KEYBINDING, KEYBINDING_DEFAULT);

        Main.wm.addKeybinding(
            KEYBINDING,
            this._settings,
            Meta.KeyBindingFlags.NONE,
            Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
            () => this.toggle()
        );
    }

    disable() {
        try { Main.wm.removeKeybinding(KEYBINDING); } catch (_) {}
        this._hide();
        if (this._soup) { try { this._soup.abort(); } catch (_) {} this._soup = null; }
    }

    toggle() {
        if (this._actor) this._hide();
        else this._show();
    }

    _show() {
        const monitor = Main.layoutManager.primaryMonitor;
        const overlay = new St.Bin({
            style_class: 'nothing-dashboard',
            x: monitor.x, y: monitor.y,
            width: monitor.width, height: monitor.height,
            reactive: true, track_hover: false, opacity: 0,
        });

        // Click background to dismiss
        overlay.connect('button-press-event', () => { this._hide(); return Clutter.EVENT_STOP; });
        // Esc to dismiss
        overlay.connect('key-press-event', (_a, ev) => {
            const sym = ev.get_key_symbol();
            if (sym === Clutter.KEY_Escape) { this._hide(); return Clutter.EVENT_STOP; }
            return Clutter.EVENT_PROPAGATE;
        });

        // Central panel
        const panel = new St.BoxLayout({
            vertical: true,
            x_align: Clutter.ActorAlign.CENTER,
            y_align: Clutter.ActorAlign.CENTER,
            style_class: 'nothing-dashboard-panel',
        });

        // Swallow clicks on the panel itself so they don't dismiss
        panel.connect('button-press-event', () => Clutter.EVENT_STOP);
        panel.reactive = true;

        // --- top row: weather + battery + uptime
        const topRow = new St.BoxLayout({
            x_align: Clutter.ActorAlign.CENTER,
            style_class: 'nothing-dashboard-toprow',
        });
        const weatherLbl = new St.Label({ style_class: 'nothing-dashboard-meta', text: this._weatherCache });
        const battLbl    = new St.Label({ style_class: 'nothing-dashboard-meta', text: this._battery() });
        const upLbl      = new St.Label({ style_class: 'nothing-dashboard-meta', text: this._uptime() });
        const sep1 = new St.Label({ style_class: 'nothing-dashboard-sep', text: '▪' });
        const sep2 = new St.Label({ style_class: 'nothing-dashboard-sep', text: '▪' });
        topRow.add_child(weatherLbl);
        topRow.add_child(sep1);
        topRow.add_child(battLbl);
        topRow.add_child(sep2);
        topRow.add_child(upLbl);
        panel.add_child(topRow);

        // --- center: big Ndot clock
        const clock = new St.Label({
            style_class: 'nothing-dashboard-clock',
            text: this._timeMain(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        const date = new St.Label({
            style_class: 'nothing-dashboard-date',
            text: this._isoDate(),
            x_align: Clutter.ActorAlign.CENTER,
        });
        panel.add_child(clock);
        panel.add_child(date);

        // --- player card
        const playerBox = new St.BoxLayout({
            vertical: true, style_class: 'nothing-dashboard-player',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const trackLbl = new St.Label({ style_class: 'nothing-dashboard-track',   text: '—', x_align: Clutter.ActorAlign.CENTER });
        const artistLbl = new St.Label({ style_class: 'nothing-dashboard-artist', text: '',  x_align: Clutter.ActorAlign.CENTER });
        playerBox.add_child(trackLbl);
        playerBox.add_child(artistLbl);

        // controls
        const controls = new St.BoxLayout({
            style_class: 'nothing-dashboard-controls',
            x_align: Clutter.ActorAlign.CENTER,
        });
        const mkBtn = (sym, action) => {
            const b = new St.Button({
                style_class: 'nothing-dashboard-btn',
                label: sym, can_focus: true, track_hover: true, reactive: true,
            });
            b.connect('clicked', () => {
                try {
                    Gio.Subprocess.new(['playerctl', action],
                        Gio.SubprocessFlags.STDOUT_SILENCE | Gio.SubprocessFlags.STDERR_SILENCE);
                } catch (_) {}
                // refresh in 200ms
                GLib.timeout_add(GLib.PRIORITY_DEFAULT, 200, () => {
                    this._refreshPlayer(trackLbl, artistLbl);
                    return GLib.SOURCE_REMOVE;
                });
            });
            return b;
        };
        controls.add_child(mkBtn('◂◂', 'previous'));
        controls.add_child(mkBtn('▮▮', 'play-pause'));
        controls.add_child(mkBtn('▸▸', 'next'));
        playerBox.add_child(controls);

        panel.add_child(playerBox);

        // --- footer: dismiss hint
        const hint = new St.Label({
            style_class: 'nothing-dashboard-hint',
            text: '▪ esc / click outside to dismiss ▪',
            x_align: Clutter.ActorAlign.CENTER,
        });
        panel.add_child(hint);

        overlay.set_child(panel);
        Main.layoutManager.addTopChrome(overlay, { affectsInputRegion: true });
        this._actor = overlay;
        this._parts = { weatherLbl, battLbl, upLbl, clock, date, trackLbl, artistLbl };

        overlay.ease({ opacity: 255, duration: 200, mode: Clutter.AnimationMode.EASE_OUT_QUAD });

        // grab key focus so Esc reaches our handler
        try { global.stage.set_key_focus(overlay); } catch (_) {}

        // initial refreshes
        this._refreshPlayer(trackLbl, artistLbl);
        this._refreshWeather(weatherLbl);

        // tickers
        this._tickClock = GLib.timeout_add_seconds(GLib.PRIORITY_LOW, 1, () => {
            if (!this._actor) return GLib.SOURCE_REMOVE;
            clock.set_text(this._timeMain());
            return GLib.SOURCE_CONTINUE;
        });
        this._tickPlayer = GLib.timeout_add(GLib.PRIORITY_LOW, NOWPLAYING_REFRESH_MS, () => {
            if (!this._actor) return GLib.SOURCE_REMOVE;
            this._refreshPlayer(trackLbl, artistLbl);
            return GLib.SOURCE_CONTINUE;
        });
        this._tickStats = GLib.timeout_add(GLib.PRIORITY_LOW, STATS_REFRESH_MS, () => {
            if (!this._actor) return GLib.SOURCE_REMOVE;
            battLbl.set_text(this._battery());
            upLbl.set_text(this._uptime());
            return GLib.SOURCE_CONTINUE;
        });
    }

    _hide() {
        if (!this._actor) return;
        const a = this._actor;
        this._actor = null;
        for (const id of ['_tickClock', '_tickPlayer', '_tickStats']) {
            if (this[id]) { GLib.source_remove(this[id]); this[id] = 0; }
        }
        a.ease({
            opacity: 0, duration: 160, mode: Clutter.AnimationMode.EASE_IN_QUAD,
            onComplete: () => {
                if (a.get_parent()) Main.layoutManager.removeChrome(a);
                a.destroy();
            },
        });
    }

    // --- data helpers ---
    _timeMain() {
        const d = new Date();
        const pad = n => String(n).padStart(2, '0');
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }
    _isoDate() {
        const d = new Date();
        return d.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).toLowerCase();
    }
    _battery() {
        try {
            const [, raw] = GLib.file_get_contents('/sys/class/power_supply/BAT0/capacity');
            const pct = parseInt(new TextDecoder().decode(raw).trim(), 10);
            return Number.isFinite(pct) ? `bat ${pct}%` : 'bat —';
        } catch (_) { return 'bat —'; }
    }
    _uptime() {
        try {
            const [, raw] = GLib.file_get_contents('/proc/uptime');
            const s = parseFloat(new TextDecoder().decode(raw).trim().split(' ')[0]);
            const h = Math.floor(s / 3600);
            const m = Math.floor((s % 3600) / 60);
            return `up ${h}h ${m}m`;
        } catch (_) { return 'up —'; }
    }

    _refreshPlayer(trackLbl, artistLbl) {
        try {
            const proc = Gio.Subprocess.new(
                ['playerctl', 'metadata', '--format', '{{title}}\n{{artist}}\n{{status}}'],
                Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_SILENCE
            );
            proc.communicate_utf8_async(null, null, (p, res) => {
                try {
                    const [, stdout] = p.communicate_utf8_finish(res);
                    const lines = (stdout || '').trim().split('\n');
                    let title  = lines[0] || '—';
                    let artist = lines[1] || '';
                    const status = (lines[2] || '').toLowerCase();
                    if (title.length > 50) title = title.slice(0, 48) + '…';
                    if (artist.length > 50) artist = artist.slice(0, 48) + '…';
                    const prefix = status === 'playing' ? '▸ '
                                  : status === 'paused'  ? '▮ '
                                  : '';
                    if (this._actor && trackLbl.get_parent()) {
                        trackLbl.set_text(prefix + title);
                        artistLbl.set_text(artist);
                    }
                } catch (e) {
                    if (this._actor && trackLbl.get_parent()) {
                        trackLbl.set_text('—');
                        artistLbl.set_text('');
                    }
                }
            });
        } catch (_) {
            trackLbl.set_text('—'); artistLbl.set_text('');
        }
    }

    _refreshWeather(label) {
        if (!this._soup) return;
        const msg = Soup.Message.new('GET', WEATHER_URL);
        if (!msg) return;
        this._soup.send_and_read_async(msg, GLib.PRIORITY_LOW, null, (sess, res) => {
            try {
                const bytes = sess.send_and_read_finish(res);
                if (msg.status_code !== 200) return;
                let text = new TextDecoder().decode(bytes.get_data() || new Uint8Array()).trim();
                if (text.length > 60) text = text.slice(0, 60);
                this._weatherCache = text;
                if (this._actor && label.get_parent()) label.set_text(text);
            } catch (_) {}
        });
    }
}
