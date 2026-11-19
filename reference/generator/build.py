"""Build canvas artboards and the asset pack."""
import json, os, re, subprocess, sys, shutil
from html.parser import HTMLParser

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import *
from lib import _pin_loft, _pin_sill
from rig import *
from screens import SCREENS
from sheets import SHEETS, FLIGHT_LOG, NOTIFS, VOICE, EMPTY, app_icon_inner

OUT = "/home/claude/coo/project"
PACK = "/home/claude/coo-assets"
VOID = {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"}
SVG_VOID_OK = {"path", "circle", "rect", "ellipse", "line", "polygon", "polyline", "stop", "use"}


class Balance(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True); self.stack = []; self.errors = []

    def handle_starttag(self, tag, attrs):
        if tag in VOID:
            return
        self.stack.append(tag)

    def handle_startendtag(self, tag, attrs):
        pass

    def handle_endtag(self, tag):
        if tag in VOID:
            return
        if not self.stack or self.stack[-1] != tag:
            self.errors.append(f"close </{tag}> but open stack ends {self.stack[-3:]}")
            if tag in self.stack:
                while self.stack and self.stack[-1] != tag:
                    self.stack.pop()
                self.stack.pop()
        else:
            self.stack.pop()


def check(name, text):
    b = Balance(); b.feed(text)
    errs = b.errors + ([f"unclosed {b.stack}"] if b.stack else [])
    if errs:
        print("TAG PROBLEM", name, errs[:4])
    return not errs


def build_canvas():
    meta = {"screens": [], "sheets": []}
    ok = True
    for name, title, fn in SCREENS:
        htmlv = fn(); ok &= check(name, htmlv)
        open(f"{OUT}/{name}.dc.html", "w").write(htmlv)
        meta["screens"].append({"file": f"{name}.dc.html", "title": title, "bytes": len(htmlv)})
    for name, title, fn in SHEETS:
        htmlv, h = fn(); ok &= check(name, htmlv)
        open(f"{OUT}/{name}.dc.html", "w").write(htmlv)
        meta["sheets"].append({"file": f"{name}.dc.html", "title": title, "h": h, "bytes": len(htmlv)})
    json.dump(meta, open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "meta.json"), "w"), indent=1)
    print("canvas ok" if ok else "canvas has tag problems")
    for k in meta:
        for m in meta[k]:
            print(k, m)


def wsvg(path, vb, inner):
    x0, y0, vw, vh = vb.split()
    os.makedirs(os.path.dirname(path), exist_ok=True)
    open(path, "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{vb}" width="{vw}" height="{vh}">{inner}</svg>\n')


def build_pack():
    if os.path.exists(PACK):
        shutil.rmtree(PACK)
    n = 0
    for v in BIRDS:
        for key, name, use in POSES:
            vb, inner = pose(v, key); wsvg(f"{PACK}/svg/birds/{v}/{key}.svg", vb, inner); n += 1
        wsvg(f"{PACK}/svg/birds/{v}/fly-up.svg", FLY_VB, fly(v, "up")); wsvg(f"{PACK}/svg/birds/{v}/fly-down.svg", FLY_VB, fly(v, "down")); n += 2
    for v in BREEDS:
        wsvg(f"{PACK}/svg/birds/breeds/{v}.svg", "-14 -22 148 132", bird(v)); n += 1
    for gid, name, slot, fx, price, owned in GEAR:
        wsvg(f"{PACK}/svg/gear/icons/{gid}.svg", "0 0 32 32", GEAR_ICON[gid]); wsvg(f"{PACK}/svg/gear/overlays/{gid}.svg", PERCH_VB, re.sub("§[a-z]+§", "", ON_PRE.get(gid, "") + ON[gid])); n += 2
    for name, inner in ICONS.items():
        body = inner.replace("#2A2140", "currentColor")
        wsvg(f"{PACK}/svg/icons/{name}.svg", "0 0 24 24", f'<g fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{body}</g>'); n += 1
    for name, (vb, inner) in ILLOS.items():
        wsvg(f"{PACK}/svg/illustrations/{name}.svg", vb, inner); n += 1
    wsvg(f"{PACK}/svg/map/pin-loft.svg", "0 0 32 32", _pin_loft(16, 16)); wsvg(f"{PACK}/svg/map/pin-sill.svg", "0 0 32 32", _pin_sill(16, 16)); n += 2
    wsvg(f"{PACK}/app-icon/icon.svg", "0 0 512 512", app_icon_inner(SUN, None, 112))
    wsvg(f"{PACK}/app-icon/icon-maskable.svg", "0 0 512 512", app_icon_inner(SUN, None, 0))
    wsvg(f"{PACK}/app-icon/icon-mono.svg", "0 0 512 512", app_icon_inner(PAPER, INK, 112)); n += 3
    for src, out, size in (("icon-maskable", "icon-512", 512), ("icon-maskable", "icon-192", 192), ("icon-maskable", "apple-touch-icon-180", 180), ("icon-maskable", "icon-maskable-512", 512), ("icon", "favicon-32", 32), ("icon", "favicon-16", 16)):
        subprocess.run(["rsvg-convert", "-w", str(size), "-h", str(size), f"{PACK}/app-icon/{src}.svg", "-o", f"{PACK}/app-icon/{out}.png"], check=True); n += 1

    css = [":root {"] + [f"  --coo-{name}: {hexv}; /* {use} */" for name, hexv, use in TOKENS]
    css += [f"  --coo-font-display: {FONT_D};", f"  --coo-font-body: {FONT_B};", f"  --coo-font-hand: {FONT_H};",
            "  --coo-radius-paper: 6px;", "  --coo-radius-tile: 14px;", "  --coo-radius-row: 16px;", "  --coo-radius-card: 18px;", "  --coo-radius-button: 20px;", "  --coo-radius-pill: 999px;",
            "  --coo-line: 2.5px solid var(--coo-ink);", "  --coo-line-thin: 2px solid var(--coo-ink);",
            "  --coo-shadow-1: 0 3px 0 var(--coo-ink);", "  --coo-shadow-2: 0 4px 0 var(--coo-ink);", "  --coo-shadow-3: 0 5px 0 var(--coo-ink);",
            "  --coo-gutter: 16px;", "  --coo-touch: 44px;", "}"]
    open(f"{PACK}/tokens.css", "w").write("\n".join(css) + "\n")
    json.dump({"color": {n_: h for n_, h, u in TOKENS}, "font": {"display": FONT_D, "body": FONT_B, "hand": FONT_H},
               "radius": {"paper": 6, "tile": 14, "row": 16, "card": 18, "button": 20, "pill": 999}, "line": 2.5, "shadow": [3, 4, 5], "gutter": 16, "touch": 44,
               "googleFonts": "https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Caveat:wght@600;700&family=Nunito:wght@600;700;800;900&display=swap"}, open(f"{PACK}/tokens.json", "w"), indent=2)
    open(f"{PACK}/motion.css", "w").write(MOTION_CSS + "\n")
    json.dump({"keyframes": [{"name": a, "duration": b, "easing": c, "use": d} for a, b, c, d in MOTION]}, open(f"{PACK}/motion.json", "w"), indent=2)
    json.dump({"name": "Coo", "short_name": "Coo", "description": "Messages, eventually. Sent by pigeon.", "start_url": "/", "scope": "/", "display": "standalone", "orientation": "portrait",
               "background_color": SUN, "theme_color": SUN, "icons": [
                   {"src": "/app-icon/icon-192.png", "sizes": "192x192", "type": "image/png"}, {"src": "/app-icon/icon-512.png", "sizes": "512x512", "type": "image/png"},
                   {"src": "/app-icon/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable"}]}, open(f"{PACK}/manifest.webmanifest", "w"), indent=2)
    os.makedirs(f"{PACK}/copy", exist_ok=True); os.makedirs(f"{PACK}/data", exist_ok=True); os.makedirs(f"{PACK}/map", exist_ok=True)
    json.dump(FLIGHT_LOG, open(f"{PACK}/copy/flight-log.json", "w"), indent=2)
    json.dump([{"event": k, "icon": ic, "title": t, "body": b} for k, ic, bg, t, b in NOTIFS], open(f"{PACK}/copy/notifications.json", "w"), indent=2)
    json.dump([{"state": t, "text": l} for t, l in EMPTY], open(f"{PACK}/copy/empty-states.json", "w"), indent=2)
    open(f"{PACK}/copy/voice.md", "w").write("# Voice\n\n" + "\n".join(f"{i + 1}. {v}" for i, v in enumerate(VOICE)) + "\n")
    json.dump([{"id": g, "name": nm, "slot": s, "effect": fx, "price": p, "starter": o} for g, nm, s, fx, p, o in GEAR], open(f"{PACK}/data/gear.json", "w"), indent=2)
    json.dump({k: {kk: vv for kk, vv in v.items() if kk != "own"} for k, v in ALL.items()}, open(f"{PACK}/data/birds.json", "w"), indent=2)

    def interp(*stops):
        return ["interpolate", ["linear"], ["zoom"], *stops]

    def lyr(i, t, sl=None, **kw):
        d = {"id": i, "type": t}
        if sl:
            d["source"] = "openmaptiles"; d["source-layer"] = sl
        d.update({k.replace("_", "-"): v for k, v in kw.items()})
        return d
    cls = lambda *c: ["in", ["get", "class"], ["literal", list(c)]]
    round_ = {"line-cap": "round", "line-join": "round"}
    style = {"version": 8, "name": "Coo day (starter)",
             "metadata": {"coo:status": "Starter style, not yet tested against live tiles. Before use, copy the sources, glyphs and sprite values from https://tiles.openfreemap.org/styles/liberty and confirm the font names it lists.",
                          "coo:schema": "OpenMapTiles", "coo:editor": "Open in Maputnik to tune: https://maputnik.github.io/editor"},
             "sources": {"openmaptiles": {"type": "vector", "url": "https://tiles.openfreemap.org/planet"}},
             "glyphs": "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
             "layers": [
                 lyr("land", "background", paint={"background-color": LAND}),
                 lyr("urban", "fill", "landuse", minzoom=9, filter=cls("residential", "commercial", "retail", "industrial"), paint={"fill-color": URBAN}),
                 lyr("green", "fill", "landcover", filter=cls("wood", "grass"), paint={"fill-color": GRASS}),
                 lyr("park", "fill", "park", paint={"fill-color": GRASS}),
                 lyr("water", "fill", "water", paint={"fill-color": SKY}),
                 lyr("shoreline", "line", "water", paint={"line-color": INK, "line-width": interp(4, 1, 10, 2, 16, 2.5)}),
                 lyr("river-casing", "line", "waterway", minzoom=8, layout=round_, paint={"line-color": INK, "line-width": interp(8, 2, 14, 8)}),
                 lyr("river", "line", "waterway", minzoom=8, layout=round_, paint={"line-color": SKY, "line-width": interp(8, 1, 14, 5)}),
                 lyr("building", "fill", "building", minzoom=15, paint={"fill-color": BLOCK, "fill-outline-color": INK}),
                 lyr("street", "line", "transportation", minzoom=13, filter=cls("minor", "service", "tertiary", "secondary"), layout=round_, paint={"line-color": CARD, "line-width": interp(13, 1.5, 17, 10)}),
                 lyr("road-casing", "line", "transportation", minzoom=6, filter=cls("motorway", "trunk", "primary"), layout=round_, paint={"line-color": INK, "line-width": interp(6, 2.5, 12, 6, 16, 13)}),
                 lyr("road", "line", "transportation", minzoom=6, filter=cls("motorway", "trunk", "primary"), layout=round_, paint={"line-color": CARD, "line-width": interp(6, 1, 12, 3.5, 16, 10)}),
                 lyr("border", "line", "boundary", filter=["<=", ["get", "admin_level"], 4], paint={"line-color": INK, "line-opacity": 0.4, "line-dasharray": [3, 3], "line-width": 1.2}),
                 lyr("street-name", "symbol", "transportation_name", minzoom=14, layout={"symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": interp(14, 9, 17, 11), "text-transform": "uppercase", "text-letter-spacing": 0.06},
                     paint={"text-color": INK, "text-halo-color": CARD, "text-halo-width": 1.5}),
                 lyr("place", "symbol", "place", filter=cls("city", "town", "village", "suburb", "neighbourhood"), layout={"text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": interp(4, 10, 10, 13, 16, 15)},
                     paint={"text-color": INK, "text-halo-color": PAPER, "text-halo-width": 2}),
                 lyr("state", "symbol", "place", maxzoom=8, filter=cls("state", "country"), layout={"text-field": ["get", "name"], "text-font": ["Noto Sans Bold"], "text-size": 11, "text-transform": "uppercase", "text-letter-spacing": 0.2},
                     paint={"text-color": INK, "text-opacity": 0.55, "text-halo-color": PAPER, "text-halo-width": 2}),
             ]}
    json.dump(style, open(f"{PACK}/map/coo-day.style.json", "w"), indent=2)
    json.dump({"note": "Night style is the day style with these paint overrides, applied after local sunset.", "land": NIGHT, "urban": "#544C8E", "green": "#3F4F6E", "park": "#3F4F6E", "water": NIGHTWATER, "shoreline": PAPER, "river": NIGHTWATER,
               "river-casing": PAPER, "building": "#5A5296", "road": "#6A62A6", "road-casing": NIGHTWATER, "text": PAPER, "halo": NIGHT}, open(f"{PACK}/map/coo-night.overrides.json", "w"), indent=2)
    readme = f"""# Coo asset pack

Generated from the same drawing code as the design canvas, so these files and the canvas always match.
Canvas (master reference): https://claude.ai/artifact/C2tik3RpARNGU8GooDhTxP

## What is here

- `tokens.css`, `tokens.json`: colours, fonts, radii, outline, shadows.
- `motion.css`, `motion.json`: every keyframe with its duration, easing and use.
- `svg/birds/<bird>/<pose>.svg`: {len(BIRDS)} birds x {len(POSES)} poses, plus `fly-up` and `fly-down` frames. All face right.
- `svg/birds/breeds/`: the {len(BREEDS)} hatchable breeds.
- `svg/gear/icons/`: closet and store icons (32 grid). `svg/gear/overlays/`: the same items drawn in bird coordinates
  (viewBox {PERCH_VB}); stack one on top of any upright bird pose.
- `svg/icons/`: {len(ICONS)} interface icons, 24 grid, `currentColor`.
- `svg/illustrations/`: props and scene pieces.
- `svg/map/`: route pins.
- `app-icon/`: SVG masters and PNG exports (16, 32, 180, 192, 512, maskable 512).
- `manifest.webmanifest`: home screen install settings.
- `map/coo-day.style.json`: STARTER MapLibre style for OpenMapTiles-schema vector tiles. Not yet tested against live tiles;
  read its metadata before use. `map/coo-night.overrides.json` lists the night colours.
- `copy/`: flight log lines by trigger, notification templates, empty states, voice rules.
- `data/`: gear and bird definitions as JSON.

## Notes

- Fonts are Google Fonts (Bagel Fat One, Nunito, Caveat); the URL is in `tokens.json`. Map labels use Noto Sans until Nunito glyphs are built for the map.
- Gear is shared by the whole flock; overlays fit every bird.
- Layer order for a dressed bird: bird pose, then neck gear, then head gear, then leg gear. Goggles replace the eye highlight, so draw the goggles overlay before re-drawing the eye if you composite by hand; `data/gear.json` lists slots.
"""
    open(f"{PACK}/README.md", "w").write(readme)
    print("pack files:", sum(len(f) for _, _, f in os.walk(PACK)))


def contact():
    """One PNG of the main drawn assets, for a visual check."""
    cells = []
    x = y = 0

    def put(vb, inner, w, h, bg=SKY):
        nonlocal x, y
        if x + w > 1900:
            x = 0; y += 170
        cells.append(f'<svg x="{x}" y="{y}" width="{w}" height="{h}" viewBox="{vb}"><rect x="-999" y="-999" width="9999" height="9999" fill="{bg}"/>{inner}</svg>')
        x += w + 8
    for v in BIRDS:
        put(PERCH_VB, bird(v), 170, 160)
    for key, n_, u in POSES:
        vb, inner = pose("gerald", key); put(vb, inner, 190, 160)
    put(FLY_VB, fly("gerald", "up"), 190, 160); put(FLY_VB, fly("gerald", "down"), 190, 160)
    for v in BREEDS:
        inner = bird(v)
        if v == "tumbler":
            inner = f'<g transform="rotate(180 58 46)">{inner}</g>'
        put("-14 -16 144 124", inner, 180, 160, PAPER)
    for g in GEAR:
        put(PERCH_VB, bird("gerald", "open", 3, (g[0],)), 170, 160)
    for g in GEAR:
        put("0 0 32 32", GEAR_ICON[g[0]], 80, 80, CARD)
    x = 0; y += 170
    for name, (vb, inner) in ILLOS.items():
        put(vb, inner, 130, 120, PAPER)
    x = 0; y += 170
    for name, inner in ICONS.items():
        put("0 0 24 24", f'<g fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{inner}</g>', 56, 56, CARD)
    x = 0; y += 170
    put("0 0 512 512", app_icon_inner(SUN, None, 112), 160, 160, PAPER); put("0 0 512 512", app_icon_inner(PAPER, INK, 112), 160, 160, CARD)
    put("0 0 390 456", map_country(False), 137, 160); put("0 0 390 456", map_country(True), 137, 160); put("0 0 390 456", map_region(), 137, 160); put("0 0 390 456", map_city(), 137, 160); put("0 0 390 456", map_block("cs"), 137, 160)
    total_h = y + 180
    open("/tmp/coo-contact.svg", "w").write(f'<svg xmlns="http://www.w3.org/2000/svg" width="1900" height="{total_h}" viewBox="0 0 1900 {total_h}"><rect width="1900" height="{total_h}" fill="#ffffff"/>{"".join(cells)}</svg>')
    subprocess.run(["rsvg-convert", "-w", "1900", "/tmp/coo-contact.svg", "-o", "/tmp/coo-contact.png"], check=True)
    print("contact sheet", total_h)




def preview_pages():
    """Standalone preview of all motion (ships in the pack) plus a frame strip page for checking."""
    from sheets import motion_sequences, motion_demo
    css = (f"body{{margin:0;padding:24px;background:{PAPER};font-family:{FONT_B};color:{INK}}}h1{{font-family:{FONT_D};font-weight:400;font-size:44px;margin:0 0 6px}}"
           f".g{{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:14px;margin:14px 0 30px}}"
           f".t{{position:relative;height:250px;border:2px solid {INK};border-radius:14px;background:{CARD};overflow:hidden;display:flex;flex-direction:column}}"
           f".t.sky{{background:{SKY}}}.d{{flex:1;position:relative;display:flex;align-items:center;justify-content:center;min-height:0}}.l{{padding:8px 10px;font-weight:900;font-size:13px;text-align:center}}.l small{{display:block;font-weight:700;color:{MUTED}}}"
           f".big .t{{height:330px}}")
    freeze = "<script>const t=new URLSearchParams(location.search).get('t');if(t!==null){const s=document.createElement('style');s.textContent='*,*::before,*::after{animation-play-state:paused!important;animation-delay:-'+t+'s!important}';document.head.appendChild(s);}</script>"
    fonts = '<link href="https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Caveat:wght@600;700&family=Nunito:wght@600;700;800;900&display=swap" rel="stylesheet">'
    seq = "".join(f'<div class="t sky"><div class="d">{d}</div><div class="l">{n}</div></div>' for n, s_, d, bg in motion_sequences())
    sky = ("coo-flap", "coo-fly-core", "coo-fly-tail", "coo-bob", "coo-streak", "coo-flutter", "coo-takeoff-crouch", "coo-takeoff-fly", "coo-land-fly", "coo-land-perch", "coo-drift", "coo-feather", "coo-spin", "coo-puff")
    kf = "".join(f'<div class="t{" sky" if n in sky else ""}"><div class="d">{motion_demo(n)}</div><div class="l">{n}<small>{dur}, {ease}</small></div></div>' for n, dur, ease, use in MOTION)
    os.makedirs(f"{PACK}/preview", exist_ok=True)
    open(f"{PACK}/preview/motion.html", "w").write(f'<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Coo motion preview</title><meta name="viewport" content="width=device-width, initial-scale=1">{fonts}<style>{css}\n{MOTION_CSS}</style></head>'
                                                   f'<body><h1>Coo motion preview</h1><p>Add ?t=0.5 to the address to freeze every animation half a second in.</p><div class="g big">{seq}</div><div class="g">{kf}</div>{freeze}</body></html>')
    strip = "".join(f'<div class="t sky" style="width:300px;height:300px;flex-shrink:0"><div class="d">{d}</div></div>' for n, s_, d, bg in motion_sequences())
    extra = "".join(f'<div class="t" style="width:150px;height:300px;flex-shrink:0"><div class="d">{motion_demo(n)}</div></div>' for n in ("coo-peck-head", "coo-hop"))
    open("/tmp/coo-frames.html", "w").write(f'<!doctype html><html><head><meta charset="utf-8"><style>{css}\nbody{{padding:8px}}\n{MOTION_CSS}</style></head><body><div style="display:flex;gap:8px">{strip}{extra}</div>{freeze}</body></html>')
    shots = []
    for i, t in enumerate(("0.1", "0.5", "0.66", "0.74", "1.0", "1.5", "1.75", "2.3")):
        out = f"/tmp/coo-frame-{i}.png"
        subprocess.run(["google-chrome", "--headless=new", "--no-sandbox", "--disable-gpu", "--hide-scrollbars", "--window-size=1560,316", f"--screenshot={out}", f"file:///tmp/coo-frames.html?t={t}"],
                       check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, timeout=60)
        shots.append(out)
    subprocess.run(["convert", *shots, "-append", "/tmp/coo-frames.png"], check=True)
    print("frames ok")


if __name__ == "__main__":
    build_canvas(); build_pack(); contact(); preview_pages()
