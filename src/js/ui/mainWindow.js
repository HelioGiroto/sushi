const GLib = imports.gi.GLib;
const Gdk = imports.gi.Gdk;
const Gtk = imports.gi.Gtk;
const GtkClutter = imports.gi.GtkClutter;
const Clutter = imports.gi.Clutter;

const Cairo = imports.cairo;
const Tweener = imports.tweener.tweener;
const Lang = imports.lang;

const Mainloop = imports.mainloop;

const VIEW_MIN = 400;
const VIEW_PADDING_Y = 28;
const VIEW_PADDING_X = 4;
const VIEW_MAX_W = 800;
const VIEW_MAX_H = 600;

function MainWindow(args) {
    this._init(args);
}

MainWindow.prototype = {
    _init : function(args) {
        args = args || {};

        this._application = args.application;
        this._createGtkWindow();
        this._createClutterEmbed();

        this._connectStageSignals();
        this._createToolbar();
    },

    _createGtkWindow : function() {
        this._gtkWindow = new Gtk.Window({ type: Gtk.WindowType.TOPLEVEL,
                                           focusOnMap: true,
                                           decorated: false,
                                           hasResizeGrip: false,
                                           skipPagerHint: true,
                                           skipTaskbarHint: true});

        let screen = Gdk.Screen.get_default();
        this._gtkWindow.set_visual(screen.get_rgba_visual());

        this._gtkWindow.connect("delete-event",
                                Lang.bind(this, this._onWindowDeleteEvent));
    },

    _createClutterEmbed : function() {
        this._clutterEmbed = new GtkClutter.Embed();
        this._gtkWindow.add(this._clutterEmbed);

        this._clutterEmbed.set_receives_default(true);
        this._clutterEmbed.set_can_default(true);

        this._stage = this._clutterEmbed.get_stage();
        this._stage.set_use_alpha(true);
        this._stage.set_opacity(221);
        this._stage.set_color(new Clutter.Color({ red: 0,
                                                  green: 0,
                                                  blue: 0, 
                                                  alpha: 255 }));
        this._stage.set_size(VIEW_MIN, VIEW_MIN);
        this._gtkWindow.resize(VIEW_MIN, VIEW_MIN);
    },

    _connectStageSignals : function() {
        this._stage.connect("key-press-event",
                            Lang.bind(this, this._onStageKeyPressEvent));
    },

    _createToolbar : function () {
        this._mainToolbar = new Gtk.Toolbar();
        this._mainToolbar.get_style_context().add_class("np-toolbar");
        this._mainToolbar.set_icon_size(Gtk.IconSize.SMALL_TOOLBAR);
        this._mainToolbar.show();

        this._toolbarActor = new GtkClutter.Actor({ contents: this._mainToolbar });
        this._toolbarActor.add_constraint(
            new Clutter.AlignConstraint({ source: this._stage,
                                          factor: 0.5 }));

        let yConstraint = 
            new Clutter.BindConstraint({ source: this._stage,
                                         coordinate: Clutter.BindCoordinate.Y,
                                         offset: this._stage.height - 52 });
        this._toolbarActor.add_constraint(yConstraint);

        this._toolbarActor.set_size(100, 40);
        this._toolbarActor.set_opacity(0);
        this._stage.add_actor(this._toolbarActor);

        this._stage.connect("notify::height",
                            Lang.bind(this, function() {
                                yConstraint.set_offset(this._stage.height - 52);
                            }));

        this._toolbarNext = new Gtk.ToolButton();
        this._toolbarNext.set_icon_name("go-next-symbolic");
        this._toolbarNext.show();
        this._toolbarNext.set_expand(true);
        this._mainToolbar.insert(this._toolbarNext, 0);

        this._toolbarZoom = new Gtk.ToolButton();
        this._toolbarZoom.set_icon_name("view-fullscreen-symbolic");
        this._toolbarZoom.set_expand(true);
        this._toolbarZoom.show();
        this._mainToolbar.insert(this._toolbarZoom, 0);

        this._toolbarPrev = new Gtk.ToolButton();
        this._toolbarPrev.set_icon_name("go-previous-symbolic");
        this._toolbarPrev.set_expand(true);
        this._toolbarPrev.show();
        this._mainToolbar.insert(this._toolbarPrev, 0);
    },

    _onWindowDeleteEvent : function() {
        this._application.quit();
    },

    _onStageKeyPressEvent : function(actor, event) {
        let key = event.get_key_symbol();

        if (key == Clutter.Escape)
            this._application.quit();
    },

    showAll : function() {
        this._gtkWindow.show_all();
    },

    setFile : function(file) {
        if (this._texture)
            this._texture.destroy();

        this._texture = new Clutter.Texture({ filename: file.get_path(),
                                             "keep-aspect-ratio": true });

        if(this._texture.width > VIEW_MAX_W || this._texture.height > VIEW_MAX_H) {
            let scale = 0;

            if (this._texture.width > this._texture.height)
                scale = VIEW_MAX_W / this._texture.width;
            else
                scale = VIEW_MAX_H / this._texture.height;

            this._texture.set_size(this._texture.width * scale,
                                   this._texture.height * scale);
            this._gtkWindow.resize(this._texture.width + VIEW_PADDING_X,
                                   this._texture.height + VIEW_PADDING_Y);
        } else if (this._texture.width < VIEW_MIN &&
                   this._texture.height < VIEW_MIN) {
            this._gtkWindow.resize(VIEW_MIN + VIEW_PADDING_X,
                                   VIEW_MIN + VIEW_PADDING_Y);
        } else {
            this._gtkWindow.resize(this._texture.width + VIEW_PADDING_X,
                                   this._texture.height + VIEW_PADDING_Y);
        }

        this._texture.add_constraint(
            new Clutter.AlignConstraint({ source: this._stage,
                                          factor: 0.5 }));

        let yAlign =                 
            new Clutter.AlignConstraint({ source: this._stage,
                                          factor: 0.92 })
        yAlign.set_align_axis(Clutter.AlignAxis.Y_AXIS);
        this._texture.add_constraint(yAlign);

        this._stage.add_actor(this._texture);
        this._texture.set_reactive(true);
        this._texture.connect("motion-event",
                              Lang.bind(this, this._onTextureMotion));
    },

    _onTextureMotion : function() {
        if (this._toolbarId) {
            GLib.source_remove(this._toolbarId);
            delete this._toolbarId;
        } else {
            Tweener.removeAllTweens(this._toolbarActor);

            this._toolbarActor.raise_top();
            this._toolbarActor.set_opacity(0);
            Tweener.addTween(this._toolbarActor,
                             { opacity: 200,
                               time: 0.1,
                               transition: 'easeOutQuad',
                             });
        }

        this._toolbarId = Mainloop.timeout_add(1500,
                                               Lang.bind(this,
                                                         this._onToolbarTimeout));
    },

    _onToolbarTimeout : function() {
        delete this._toolbarId;
        Tweener.addTween(this._toolbarActor,
                         { opacity: 0,
                           time: 0.25,
                           transition: 'easeOutQuad'
                         });
        return false;
    }
}