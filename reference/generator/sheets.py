"""Asset and spec reference sheets (1280 wide) for the Coo canvas."""
from lib import *
from lib import _pin_loft, _pin_sill
from rig import *
from screens import page, COL, chip, cta, btn2, card, bar, bold, muted, back, tabbar, bsvg, fields_js, sec, initial, BTN_RESET, H

W = 1280
CW = W - 96

FLIGHT_LOG = {
    "Takeoff": ["Released from your loft. Looked back once.", "Left in a hurry. Forgot nothing, owns nothing.", "Circled the block to show off, then got going."],
    "Cruising": ["Making good time and knows it.", "Holding a steady 45. Wind is cooperating.", "Overtook a seagull. Did not look back."],
    "Food nearby": ["Circled a hot dog cart twice. Kept going.", "Passed a bagel shop. Kept it professional.", "Saw a dropped pretzel. Chose the mission. Barely."],
    "Landmark": ["Crossed the Verrazzano. Did not pay the toll.", "Crossed the Susquehanna at a respectable height.", "Flew over a stadium. Nobody waved."],
    "Weather": ["Rain started. Goggles are doing their job.", "Headwind. Flapping harder and complaining about it.", "Snow. The scarf was a good call."],
    "Dusk": ["Sun went down. Found a barn. The cows are fine with it.", "Roosting on a water tower with a nice view.", "Too dark to fly. Asleep on a ledge by 4:40."],
    "Sunrise": ["Up at first light. Back in the air.", "Left the barn. Did not say goodbye to the cows."],
    "Delay": ["Found a statue. Sat on its head. Lost track of time.", "Followed a pizza box for three blocks.", "Joined some other pigeons. Remembered the job eventually."],
    "Landing": ["Landed on the sill. Note attached. Dignity intact.", "Arrived. Expects a snack.", "Landed with a small hop for effect."],
}
NOTIFS = [
    ("incoming", "envelope", SUN, "A pigeon is headed your way", "Dumpling left Philadelphia with a note from Priya. Lands about 11:24 am."),
    ("landed-in", "envelope", MINT, "Dumpling has landed", "There is a note from Priya on your sill."),
    ("landed-out", "check", MINT, "Gerald delivered your note", "Priya has it. 81 miles in 1h 48m. You earned 13 seeds."),
    ("reply-home", "wing", SKY, "Gerald is home, with a reply", "Priya wrote back. It rode home free."),
    ("delayed", "warning", PEACH, "Kevin is running late", "Last seen on a statue in Hartford. Tap to send a search party."),
    ("roosting", "moon", LILAC, "Gerald stopped for the night", "Asleep in a barn near Mercer, Pa. Back in the air at 7:14 am."),
    ("hungry", "seed", PEACH, "Admiral Crumbs is hungry", "He has opinions about it."),
    ("hatched", "egg", SUN, "Your egg hatched", "Come meet whoever this is."),
]
VOICE = [
    "The bird is the hero. Write about what the bird did, not what the system did.",
    "Deadpan beats wacky. State the absurd thing plainly, in short sentences.",
    "Nothing bad happens to a bird. Late, distracted, asleep, sulking. Never hurt, never gone.",
    "Buttons say exactly what happens: Release Gerald, Send a search party, Text it to Maya.",
    "Numbers are real. Miles, minutes and odds come from the flight, never from a joke.",
]
EMPTY = [
    ("No flights", "No birds in the air. Suspiciously quiet."),
    ("Empty sill", "Nobody on your sill yet. Send the first note."),
    ("No rested birds", "Everyone is asleep or eating. Feed someone, or wait for a nap to end."),
    ("Offline", "You are offline. Birds keep flying. The map catches up when you are back."),
    ("Expired link", "That link has expired. The bird went home with the note."),
    ("Place not found", "Could not find that place. Try a neighborhood or a city."),
]


def lum(hexv):
    def c(v):
        v /= 255
        return v / 12.92 if v <= 0.03928 else ((v + 0.055) / 1.055) ** 2.4
    r, g, b = (int(hexv[i:i + 2], 16) for i in (1, 3, 5))
    return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b)


def ratio(a, b):
    la, lb = lum(a), lum(b)
    return (max(la, lb) + 0.05) / (min(la, lb) + 0.05)


def tile(inner, label, sub="", h=200, bg=CARD, w=None, pad=10):
    ws = f"width: {w}px;" if w else ""
    s = f'<div style="font-weight: 700; font-size: 12px; color: {MUTED}; line-height: 1.25">{sub}</div>' if sub else ""
    return (f'<div style="{COL} gap: 6px; {ws} height: {h}px; box-sizing: border-box; padding: {pad}px; background: {bg}; border: 2px solid {INK}; border-radius: 14px; overflow: hidden">'
            f'<div style="flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center; position: relative">{inner}</div>'
            f'<div style="text-align: center"><div style="font-weight: 900; font-size: 13.5px">{label}</div>{s}</div></div>')


def grid(tiles, cols, gap=16):
    return f'<div style="display: grid; grid-template-columns: repeat({cols}, minmax(0, 1fr)); gap: {gap}px">{"".join(tiles)}</div>'


def rows(n, h, gap=16):
    return n * h + (n - 1) * gap


def sheet(title, lede, sections, js="return {};"):
    total = 232
    parts = [f'<header style="{COL} gap: 6px"><div style="font-weight: 900; font-size: 13px; letter-spacing: 2px">COO ASSET REFERENCE</div>'
             f'<h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 60px; line-height: 1">{esc(title)}</h1>'
             f'<p style="margin: 0; max-width: 860px; font-weight: 700; font-size: 16px; line-height: 1.4; color: {MUTED}">{lede}</p></header>']
    for head, note, htmlv, h in sections:
        n = f'<div style="font-weight: 700; font-size: 14px; color: {MUTED}; max-width: 900px; line-height: 1.35">{note}</div>' if note else ""
        nh = 24 if note else 0
        parts.append(f'<section style="{COL} gap: 12px"><div style="{COL} gap: 2px; border-top: 3px solid {INK}; padding-top: 12px"><h2 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 28px; line-height: 1.1">{esc(head)}</h2>{n}</div>'
                     f'<div style="height: {h}px">{htmlv}</div></section>')
        total += 15 + 34 + nh + 12 + h + 36
    total += 48
    body = "".join(parts)
    return page(title, body, root=f"{COL} padding: 48px; gap: 36px;", js=js, w=W, h=total), total


def svgbox(vb, inner, w, h=None, label=None, extra=""):
    hh = f' height="{h}"' if h else ""
    a = f'role="img" aria-label="{esc(label)}"' if label else 'aria-hidden="true"'
    return f'<svg width="{w}"{hh} viewBox="{vb}" {a} style="display: block;{extra}">{inner}</svg>'


# ------------------------------------------------------------------ Tokens
def tokens():
    sw = []
    for name, hexv, use in TOKENS:
        fg = PAPER if lum(hexv) < 0.2 else INK
        sw.append(f'<div style="{COL} height: 150px; box-sizing: border-box; border: 2px solid {INK}; border-radius: 14px; overflow: hidden; background: {CARD}">'
                  f'<div style="height: 64px; background: {hexv}; border-bottom: 2px solid {INK}; display: flex; align-items: flex-end; padding: 6px 8px; box-sizing: border-box; font-weight: 900; font-size: 12px; color: {fg}">{hexv}</div>'
                  f'<div style="padding: 6px 8px; {COL} gap: 2px"><div style="font-weight: 900; font-size: 13px">--coo-{name}</div><div style="font-weight: 700; font-size: 11.5px; line-height: 1.25; color: {MUTED}">{use}</div></div></div>')
    pairs = [(INK, PAPER, "ink on paper"), (INK, CARD, "ink on card"), (INK, SKY, "ink on sky"), (INK, TOMATO, "ink on tomato"), (INK, SUN, "ink on sun"), (INK, MINT, "ink on mint"),
             (INK, LILAC, "ink on lilac"), (MUTED, PAPER, "muted on paper"), (MUTED, CARD, "muted on card"), (STAMP, CARD, "stamp on card"), (PAPER, NIGHT, "paper on night"), (CARD, TOMATO, "card on tomato")]
    con = []
    for fg, bg, name in pairs:
        r = ratio(fg, bg)
        verdict = "Passes for all text" if r >= 4.5 else ("Large text only" if r >= 3 else "Do not use for text")
        con.append(f'<div style="display: flex; align-items: center; gap: 12px; height: 84px; box-sizing: border-box; padding: 8px 12px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">'
                   f'<div style="width: 60px; height: 60px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; border-radius: 12px; font-family: {FONT_D}; font-size: 26px; color: {fg}">Aa</div>'
                   f'<div style="{COL}"><div style="font-weight: 900; font-size: 13.5px">{name}</div><div style="font-weight: 900; font-size: 18px; font-variant-numeric: tabular-nums">{r:.1f} to 1</div><div style="font-weight: 700; font-size: 11.5px; color: {MUTED}">{verdict}</div></div></div>')

    def spec(fam, css, role, samples):
        rows_ = "".join(f'<div style="display: flex; align-items: baseline; gap: 12px"><span style="width: 74px; flex-shrink: 0; font-weight: 800; font-size: 12px; color: {MUTED}">{lab}</span><span style="{st}">{txt}</span></div>' for lab, st, txt in samples)
        return (f'<div style="{COL} gap: 10px; height: 330px; box-sizing: border-box; padding: 16px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px; overflow: hidden">'
                f'<div style="{COL}"><div style="font-weight: 900; font-size: 16px">{fam}</div><div style="font-weight: 700; font-size: 12.5px; color: {MUTED}">{role}</div>'
                f'<div style="font-weight: 700; font-size: 11.5px; color: {MUTED}; overflow-wrap: anywhere">{esc(css)}</div></div>{rows_}</div>')
    d = lambda px: f"font-family: {FONT_D}; font-size: {px}px; line-height: 1"
    bdy = lambda px, wt: f"font-weight: {wt}; font-size: {px}px"
    hnd = lambda px: f"font-family: {FONT_H}; font-weight: 700; font-size: {px}px; line-height: 1.1"
    typ = grid([
        spec("Bagel Fat One", FONT_D, "Display: wordmark, screen titles, big numbers, main buttons", [("52 / 1.0", d(52), "And he's off"), ("36 / 1.0", d(36), "Seed store"), ("28 / 1.0", d(28), "New pigeon post"), ("22 / 1.05", d(22), "Gerald is over Edison, NJ")]),
        spec("Nunito 700, 800, 900", FONT_B, "Everything else. 900 for labels and names, 800 for body, 700 for secondary lines", [("17 / 900", bdy(17, 900), "Lands in 1h 07m"), ("15 / 900", bdy(15, 900), "Incoming from Priya"), ("14 / 800", bdy(14, 800), "Your note to Theo is running late."), ("13 / 700", bdy(13, 700) + f"; color: {MUTED}", "Philadelphia, 81 miles as the pigeon flies"), ("11.5 / 900", bdy(11.5, 900) + "; letter-spacing: 1px", "BUREAU OF PIGEON AFFAIRS")]),
        spec("Caveat 700", FONT_H, "Handwriting: notes, name fields, speech bubbles. Never for interface labels", [("27 / 34", hnd(27), "Dinner Saturday? I'll bring the good bread."), ("22 / 1.3", hnd(22), "ooh, a bagel"), ("30", hnd(30), "Gerald")]),
    ], 3)

    def shape(inner, label, sub):
        return tile(inner, label, sub, 124)
    box = lambda st: f'<div style="width: 76px; height: 44px; box-sizing: border-box; background: {SUN}; {st}"></div>'
    shp = grid([
        shape(box(f"border: 2.5px solid {INK}; border-radius: 6px"), "6", "Paper, forms"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 14px"), "14", "Small buttons, tiles"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 16px"), "16", "Rows and cards"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 18px"), "18", "Feature cards"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 20px"), "20", "Main buttons"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 999px"), "999", "Pills, chips"),
        shape(box(f"border: 2px solid {INK}; border-radius: 14px"), "2px line", "Chips, inner tiles"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 14px"), "2.5px line", "Default outline"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}"), "0 3px 0", "Small raised"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 4px 0 {INK}"), "0 4px 0", "Cards, selected"),
        shape(box(f"border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 5px 0 {INK}"), "0 5px 0", "Main buttons"),
        shape(box(f"border: 2.5px dashed {INK}; border-radius: 14px; background: {SAND}"), "dashed", "Locked, add new"),
    ], 6)
    sp = "".join(f'<div style="{COL} align-items: center; gap: 6px"><div style="width: {n}px; height: 44px; background: {TOMATO}; border: 2px solid {INK}; box-sizing: border-box"></div><div style="font-weight: 900; font-size: 13px">{n}</div></div>' for n in (4, 6, 8, 10, 12, 14, 16, 20, 28, 44))
    spacing = f'<div style="display: flex; align-items: flex-end; gap: 28px; height: 84px">{sp}<div style="font-weight: 700; font-size: 13px; color: {MUTED}; max-width: 420px; line-height: 1.35">Screen gutter is 16. Gaps inside a card are 6 to 12. Sections sit 12 to 14 apart. 44 is the smallest touch target.</div></div>'
    return sheet("Foundations", "Colour, type, shape and spacing for the sticker-book look: thick ink outlines, hard bottom shadows, flat warm colour. The same values ship as tokens.css and tokens.json in the asset pack.", [
        ("Colour tokens", "Fourteen named colours. Ink is the only text colour on light surfaces.", grid(sw, 7), rows(2, 150)),
        ("Contrast pairs", "Measured WCAG ratios. Tomato and sun always carry ink text, never white.", grid(con, 4), rows(3, 84)),
        ("Type", "Three Google Fonts families. Sizes are px over line height or weight.", typ, 330),
        ("Outline, radius, shadow", "Every raised thing has an ink outline and a hard shadow straight down. No blur anywhere.", shp, rows(2, 124)),
        ("Spacing", None, spacing, 84),
    ])


# ------------------------------------------------------------------ Components
def components():
    def spc(html_, label, sub, span=1, h=190):
        return (f'<div style="grid-column: span {span}; {COL} gap: 8px; height: {h}px; box-sizing: border-box; padding: 12px; background: {PAPER}; border: 2px solid {INK}; border-radius: 14px; overflow: hidden">'
                f'<div style="flex: 1; min-height: 0; display: flex; align-items: center; justify-content: center"><div style="width: 100%; max-width: 358px">{html_}</div></div>'
                f'<div><div style="font-weight: 900; font-size: 13.5px">{label}</div><div style="font-weight: 700; font-size: 12px; color: {MUTED}; line-height: 1.25">{sub}</div></div></div>')
    price = (f'<div style="display: flex; justify-content: center"><button type="button" style="min-width: 78px; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 5px; background: {SUN}; border: 2.5px solid {INK}; '
             f'border-radius: 14px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 15px; {BTN_RESET}">{seed(16, CARD)}<span>200</span></button></div>')
    chips = f'<div style="display: flex; flex-wrap: wrap; gap: 6px; justify-content: center">{chip("Ready", MINT)}{chip("Flying", SUN)}{chip("Resting", LILAC)}{chip("Feed me", TOMATO)}{chip("Delayed", TOMATO)}{chip("Roosting", LILAC)}{chip("Free ride", CARD)}{chip("By link", CARD)}</div>'
    pill = (f'<div style="display: flex; justify-content: center"><div style="display: flex; align-items: center; gap: 8px; min-height: 44px; box-sizing: border-box; padding: 0 14px 0 10px; background: {CARD}; border: 2.5px solid {INK}; '
            f'border-radius: 999px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 16px">{seed(22)}<span>240</span></div></div>')
    birdrow = card(avatar_svg("gerald", 42) + f'<div style="flex: 1; {COL}">{bold("Gerald", 16)}{muted("Home, fed, smug")}</div>' + chip("Ready", MINT), pad="6px 12px 6px 8px")
    store = card(f'<div style="width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {SKY}; border: 2px solid {INK}; border-radius: 12px"><svg width="32" height="32" viewBox="0 0 32 32" aria-hidden="true">{GEAR_ICON["goggles"]}</svg></div>'
                 f'<div style="flex: 1; {COL}">{bold("Aviator goggles")}{muted("Holds full speed in rain")}</div>' + chip("Wearing", MINT), pad="6px 10px 6px 8px", minh=64)

    def ct(gid, name, state, bg, dashed=False):
        return (f'<div style="width: 80px; min-height: 90px; box-sizing: border-box; {COL} align-items: center; justify-content: center; gap: 1px; padding: 4px 2px; background: {bg}; border: 2.5px {"dashed" if dashed else "solid"} {INK}; border-radius: 16px;'
                f'{"box-shadow: 0 4px 0 " + INK + ";" if bg == SUN else ""}"><svg width="36" height="36" viewBox="0 0 32 32" aria-hidden="true">{GEAR_ICON[gid]}</svg><span style="font-weight: 900; font-size: 12.5px">{name}</span><span style="font-weight: 800; font-size: 11.5px">{state}</span></div>')
    closet = f'<div style="display: flex; gap: 8px; justify-content: center">{ct("goggles", "Goggles", "Wearing", SUN)}{ct("scarf", "Scarf", "Owned", CARD)}{ct("rainhat", "Rain hat", "120 seeds", SAND, True)}</div>'

    def st(v, l):
        return f'<div style="{COL} padding: 6px 10px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px"><span style="font-weight: 900; font-size: 17px">{v}</span><span style="font-weight: 800; font-size: 11.5px; color: {MUTED}">{l}</span></div>'
    stats = f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px">{st("1h 07m", "Lands in")}{st("45 mph", "Speed")}{st("Lowish", "Altitude")}</div>'
    prog = f'<div style="{COL} gap: 4px">{bar(38, "38 percent")}<div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 12px"><span>Brooklyn</span><span>31 of 81 mi</span><span>Philly</span></div></div>'
    meter = (f'<div style="display: flex; align-items: center; gap: 10px"><div style="width: 66px; font-weight: 900; font-size: 14px">Belly</div><div style="flex: 1">{bar(80, "80 percent", MINT, 18)}</div>'
             f'<button type="button" style="width: 78px; min-height: 44px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 14px; {BTN_RESET}">Feed</button></div>')
    seg = (f'<div style="display: flex; justify-content: center"><div style="display: flex; border: 2.5px solid {INK}; border-radius: 14px; overflow: hidden"><span style="min-width: 64px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: {SUN}; font-weight: 900; font-size: 13px">City</span>'
           f'<span style="width: 2.5px; background: {INK}"></span><span style="min-width: 64px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: {CARD}; font-weight: 900; font-size: 13px">Block</span></div></div>')

    def sw_(on):
        return (f'<span style="width: 50px; height: 28px; box-sizing: border-box; background: {MINT if on else SAND}; border: 2.5px solid {INK}; border-radius: 999px; padding: 1.5px; display: block"><span style="display: block; width: 20px; height: 20px; '
                f'background: {CARD}; border: 2px solid {INK}; border-radius: 50%; box-sizing: border-box; transform: translateX({22 if on else 0}px)"></span></span>')
    toggles = f'<div style="display: flex; gap: 24px; justify-content: center; align-items: center">{sw_(True)}{sw_(False)}</div>'
    field = (f'<div style="{COL} gap: 6px"><label for="c-demo" style="font-weight: 900; font-size: 15px">Name your pigeon</label><input id="c-demo" type="text" value="{H("demo")}" onChange="{H("set_demo")}" style="height: 52px; box-sizing: border-box; padding: 0 14px; '
             f'background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px; font-family: {FONT_H}; font-weight: 700; font-size: 26px; color: {INK}"></div>')
    search = (f'<div style="display: flex; align-items: center; gap: 8px; height: 48px; box-sizing: border-box; padding: 0 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px">{icon("search", 20)}'
              f'<span style="font-weight: 800; font-size: 15px; color: {MUTED}">Search friends and contacts</span></div>')
    paper = (f'<div style="{COL} padding: 10px 14px 8px 14px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}; transform: rotate(-0.8deg)"><div style="font-family: {FONT_H}; font-weight: 700; font-size: 24px; line-height: 30px; '
             f'background: repeating-linear-gradient(to bottom, transparent 0, transparent 28px, #D9D3E6 28px, #D9D3E6 30px)">Dinner Saturday? I\'ll bring the good bread.</div><div style="display: flex; justify-content: space-between; padding-top: 6px; font-size: 12px; font-weight: 800; color: {MUTED}"><span>44 of 140 characters</span><span>One leg only</span></div></div>')
    pmk = f'<div style="display: flex; justify-content: center">{svgbox("0 0 84 84", postmark(), 84, 84, "Postmark", " transform: rotate(-12deg);")}</div>'
    bubble = f'<div style="display: flex; justify-content: center"><div style="padding: 0 12px 2px 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px 16px 16px 4px; transform: rotate(-4deg); font-family: {FONT_H}; font-weight: 700; font-size: 22px; line-height: 1.3">ooh, a bagel</div></div>'
    topbar = (f'<div style="display: flex; align-items: center; gap: 10px">{back("#top", "Back")}<div style="flex: 1; height: 44px; box-sizing: border-box; display: flex; align-items: center; justify-content: space-between; padding: 0 8px 0 16px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 999px; box-shadow: 0 3px 0 {INK}">'
              f'<div style="display: flex; align-items: center; gap: 8px; font-weight: 900; font-size: 15px"><span>Gerald</span>{icon("arrow", 18)}<span>Priya</span></div><div style="display: flex; align-items: center; gap: 6px; padding: 3px 10px; background: {MINT}; border: 2px solid {INK}; border-radius: 999px; font-weight: 900; font-size: 12px">'
              f'<span style="width: 8px; height: 8px; background: {INK}; border-radius: 50%; animation: coo-pulse 1.4s ease-in-out infinite"></span><span>In the air</span></div></div></div>')
    banner = (f'<div style="display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 12px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 16px">{icon("snow", 28, 2)}<div style="flex: 1; {COL}">{bold("Friday: 31 degrees and flurries", 14.5)}'
              f'<div style="font-weight: 700; font-size: 12.5px">Underdressed birds fly 20% slower.</div></div><span style="min-height: 44px; display: flex; align-items: center; padding: 0 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 13.5px">Dress him</span></div>')
    dots = "".join(f'<div style="width: 24px; height: 24px; box-sizing: border-box; {"background: " + INK + "; border: 2.5px solid " + INK if i < 6 else ("background: " + SUN + "; border: 2.5px solid " + INK if i == 9 else "border: 2.5px dashed " + INK)}; border-radius: 50%"></div>' for i in range(10))
    punch = (f'<div style="{COL} gap: 8px; padding: 12px 14px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}"><div style="font-weight: 900; font-size: 11.5px; letter-spacing: 1px; color: {MUTED}">POST OFFICE PUNCH CARD</div>'
             f'<div style="display: flex; justify-content: space-between">{dots}</div></div>')
    check = (f'<div style="display: flex; align-items: center; gap: 10px; min-height: 56px; box-sizing: border-box; padding: 5px 10px 5px 8px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 16px"><span style="width: 26px; height: 26px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {INK}; border-radius: 8px">{icon("check", 16, 3.6, CARD)}</span>'
             f'{initial("P", ROSE, 40)}<span style="flex: 1; {COL}"><span style="font-weight: 900; font-size: 15.5px">Priya</span><span style="font-weight: 700; font-size: 12.5px">A reply rides home free.</span></span>{chip("Free ride", CARD, 11.5)}</div>')
    notif = notif_card(NOTIFS[1])
    sheet_hdr = (f'<div style="{COL} gap: 10px; padding: 10px 16px 12px 16px; background: {PAPER}; border: 2.5px solid {INK}; border-bottom: none; border-radius: 28px 28px 0 0"><div style="align-self: center; width: 44px; height: 5px; background: {INK}; opacity: .3; border-radius: 999px"></div>'
                 f'<div style="display: flex; align-items: center; gap: 12px">{avatar_svg("gerald", 46)}<div style="{COL}"><div style="font-family: {FONT_D}; font-size: 22px; line-height: 1.05">Gerald is over Edison, NJ</div>{muted("Carrying your note to Priya")}</div></div></div>')
    tabs = f'<div style="position: relative; width: 358px; height: 110px">{tabbar("loft")}</div>'
    cells = [
        spc(cta("Release Gerald", None, TOMATO, 24, "button"), "Main button", "60 tall, radius 20, shadow 0 5px 0, Bagel 24. One per screen."),
        spc(cta("Send Dumpling home with a reply", None, SUN, 20, "button"), "Main button, friendly", "Same shape in sun for the happy path."),
        spc(f'<div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px">{btn2("Wait it out")}{btn2("Resend")}</div>', "Quiet button", "50 tall, radius 18, no shadow, Nunito 900 15."),
        spc(price, "Price button", "Seed icon plus amount. Min 78 by 44."),
        spc(f'<div style="display: flex; gap: 16px; justify-content: center; align-items: center">{back("#top", "Back")}<span style="min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 15px; text-decoration: underline">Send at 1 pm anyway</span></div>', "Icon button and text link", "44 circle with 0 3px 0 shadow. Links are ink, underlined, 44 tall."),
        spc(pill, "Seed balance", "Pill, 44 tall. Opens the seed store."),
        spc(chips, "Status chips", "2px outline, Nunito 900 12. Colour plus words, never colour alone.", 2),
        spc(seg, "Two-way switch", "City or Block, per friend."),
        spc(birdrow, "Bird row", "58 tall, radius 16. Avatar 42, name 16, status chip."),
        spc(store, "Store row", "64 tall. Icon tile 48, radius 12."),
        spc(check, "Checklist row", "Address book. Picked rows turn sun."),
        spc(closet, "Closet tiles", "Wearing, owned, not owned yet."),
        spc(stats, "Stat tiles", "Value 17 over label 11.5."),
        spc(prog, "Flight progress", "16 tall, tomato fill, ends labelled."),
        spc(meter, "Care meter", "Label, bar, action. Mint above half, tomato below."),
        spc(toggles, "Toggle", "50 by 28. Mint on, sand off. The whole row is the control."),
        spc(field, "Text field", "52 tall, radius 14. Handwriting for names and notes."),
        spc(search, "Search field", "48 tall."),
        spc(paper, "Note paper", "Radius 6, ruled every 30, tilted under a degree."),
        spc(pmk, "Postmark", "Stamp colour, tilted 12 degrees. Thunks in on arrival."),
        spc(bubble, "Thought bubble", "Caveat 22. One short thought, lower case."),
        spc(topbar, "Tracker bar", "Back, who to whom, live state.", 2),
        spc(notif, "Notification", "Title 15, body 13. Same card in-app and as a push."),
        spc(banner, "Weather prompt", "Shows in the closet when tomorrow needs gear.", 2),
        spc(punch, "Punch card", "Ten holes. The tenth is the prize."),
        spc(sheet_hdr, "Bottom sheet", "Radius 28 on top, grab handle, bird and headline.", 2),
        spc(tabs, "Tab bar", "84 tall. Send floats 30 above the bar."),
    ]
    g = f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{"".join(cells)}</div>'
    return sheet("Components", "Every repeated part of the interface, drawn once with its measurements. Screens are assembled from these.", [
        ("Buttons, chips, rows, fields", "Sizes are in px. Touch targets are never under 44.", g, rows(11, 190)),
    ], js=fields_js({"demo": "Gerald"}))


def notif_card(n):
    key, ic, bg, title, body_ = n
    return (f'<div style="display: flex; align-items: center; gap: 10px; min-height: 72px; box-sizing: border-box; padding: 8px 12px 8px 10px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 18px; box-shadow: 0 4px 0 {INK}">'
            f'<span style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; border-radius: 12px">{icon(ic, 24)}</span>'
            f'<div style="{COL}"><div style="font-weight: 900; font-size: 15px; line-height: 1.2">{title}</div><div style="font-weight: 700; font-size: 13px; line-height: 1.25">{body_}</div></div></div>')


# ------------------------------------------------------------------ Icons
def icons():
    ts = [tile(icon(n, 40, 2.2), n, "", 104, CARD, None, 8) for n in ICONS]
    n = -(-len(ts) // 10)
    return sheet("Icons", f"{len(ICONS)} line icons on a 24 grid: 2.2 stroke, round caps and joins, ink. In the asset pack they use currentColor.", [
        ("Interface set", "Names match the file names in svg/icons.", grid(ts, 10, 12), rows(n, 104, 12)),
    ])


# ------------------------------------------------------------------ Pigeons
def pigeons():
    flock = []
    for v, b in BIRDS.items():
        sw = "".join(f'<span style="width: 18px; height: 18px; background: {b[k]}; border: 2px solid {INK}; border-radius: 50%; display: block"></span>' for k in ("body", "wing", "collar"))
        flock.append(tile(perch_svg(v, 170, "perched", (), b["name"], IDLE), b["name"], f'{b["note"]} {b["speed"]}.<div style="display: flex; gap: 4px; justify-content: center; padding-top: 4px">{sw}</div>', 280, SKY))
    poses = []
    for key, name, use in POSES:
        vb, inner = pose("gerald", key)
        poses.append(tile(svgbox(vb, inner, 180, 150, name), name, use, 222))
    frames = [tile(svgbox(FLY_VB, fly("gerald", "up"), 170, None, "Wing up"), "Flight, wing up", "Frame A. Each wing pivots at its root.", 222, SKY),
              tile(svgbox(FLY_VB, fly("gerald", "down"), 170, None, "Wing down"), "Flight, wing down", "Frame B, for sprite sheets.", 222, SKY),
              tile(fly_sprite("gerald", 180, (), "Flapping"), "Flight, live", "Two wings, body pitch, tail swing, slow float.", 222, SKY),
              tile(f'<div style="display: flex; gap: 8px">{"".join(avatar_svg(v, 48, bg) for v, bg in (("gerald", SKY), ("brenda", SUN), ("kevin", LILAC), ("admiral", PEACH), ("dumpling", MINT)))}</div>', "Avatars", "Head crop, 62 box at 60, 2. Any size from 28.", 222)]
    breeds = []
    for v, b in BREEDS.items():
        inner = bird(v)
        if v == "tumbler":
            inner = f'<g transform="rotate(180 58 46)">{inner}</g>'
        breeds.append(tile(svgbox("-14 -16 144 124", inner, 150, None, b["name"]), b["name"], f'{b["note"]} {b["trait"]}.', 236))
    notes = (f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px; height: 150px">'
             + "".join(f'<div style="{COL} gap: 4px; padding: 14px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(t, 15)}<div style="font-weight: 700; font-size: 13px; line-height: 1.4; color: {MUTED}">{d}</div></div>' for t, d in (
                 ("Five jointed parts", "Tail, legs, torso with wing, head, neck. Each is its own group with its own pivot, so the head can bob, the wing shrug and the tail flick independently. Always facing right; flip the whole drawing to face left."),
                 ("Outline and eye", "3px ink outline at the 120-wide master size, scaled with the bird. Eye is orange, 6.5 radius, with a small pupil set forward so he always looks slightly alarmed."),
                 ("Three colours each", "Body, wing and collar. A new bird is a new set of three. Breeds add one shape: a fan, a balloon, a hood, some curls.")))
             + "</div>")
    return sheet("Pigeons", "The cast, every pose, the flight frames and the breeds. All drawn in code from the same six shapes, so any bird can take any pose and wear any gear.", [
        ("The flock", "Five named birds, idling live. The three dots are body, wing and collar.", grid(flock, 5), 280),
        ("Poses", "Shown on Gerald. Each exists for every bird in the asset pack.", grid(poses, 4), rows(2, 222)),
        ("Flight frames and avatars", None, grid(frames, 4), 222),
        ("Breeds", "Hatched from eggs in the aviary.", grid(breeds, 6), 236),
        ("Construction", None, notes, 150),
    ])


# ------------------------------------------------------------------ Gear
def gear():
    ts = []
    for gid, name, slot, fx, price, owned in GEAR:
        on = svgbox(PERCH_VB, bird("gerald", "open", 3, (gid,)), 126, None, f"Gerald wearing the {name}")
        ic = f'<svg width="60" height="60" viewBox="0 0 32 32" aria-hidden="true" style="background: {PAPER}; border: 2px solid {INK}; border-radius: 12px; padding: 6px; box-sizing: border-box">{GEAR_ICON[gid]}</svg>'
        ts.append(tile(f'<div style="display: flex; align-items: center; gap: 10px">{on}{ic}</div>', name, f'{slot.capitalize()} slot. {price} seeds{" (starter set)" if owned else ""}.<br>{fx}.', 252, SKY))
    rules = (f'<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; height: 120px">'
             + "".join(f'<div style="{COL} gap: 4px; padding: 14px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(t, 15)}<div style="font-weight: 700; font-size: 13px; line-height: 1.4; color: {MUTED}">{d}</div></div>' for t, d in (
                 ("Shared by the flock", "One closet. Any bird can wear any item, one bird at a time."),
                 ("Four slots", "Head, neck, leg, and back for later. One item per slot."),
                 ("One job each", "Every item changes one number or one behaviour, in plain words."),
                 ("Never punishing", "Wrong gear slows a bird. It does not hurt it or lose the note.")))
             + "</div>")
    air = grid([tile(fly_sprite("gerald", 190, gs), nm, sub, 210, SKY) for gs, nm, sub in (
        (("goggles", "scarf"), "Goggles and scarf", "Scarf tails trail and flutter."), (("beanie",), "Beanie", "Head gear rides the head, scaled .84."),
        (("party", "bow"), "Party hat and bow tie", "Pom-pom keeps its sway."), (("cap", "bandana"), "Cap and bandana", "Leg gear is hidden while feet are tucked."))], 4)
    return sheet("Gear", "All fourteen closet items: on the bird, as a closet icon, with slot, price and effect. Overlays are drawn in the bird's own coordinates so they fit every bird and every upright pose.", [
        ("Rules", None, rules, 120),
        ("Items", "Six are owned from the start in the mockups. The rest are bought in the seed store. Each item has a base colour, a darker shade and a highlight.", grid(ts, 5), rows(3, 252)),
        ("In flight", "The same overlays, re-seated on the flying pose.", air, 210),
    ])


# ------------------------------------------------------------------ Illustrations
def illustrations():
    names = {"cloud": "Drifts on every sky", "coop": "Loft home", "water-tower": "Skyline", "flowerpot": "Windowsill", "statue": "Incident report", "pretzel": "Kevin's downfall", "bagel": "Map food marker", "bread": "Do not tell Gerald",
             "barn": "Overnight roost", "egg": "Aviary", "eggshell": "First run", "sunburst": "Behind a landing", "bottle-cap": "Found object", "button": "Found object", "wrapper": "Found object", "seed": "Currency",
             "wax-seal": "Sealed note", "postmark": "Arrival stamp", "tree": "Map parks", "feather": "Takeoff", "puff": "Takeoff dust", "moon": "Night map", "scroll": "Leg tube note", "sealed-note": "Guest link"}
    ts = [tile(illo(n, 110, 96), n, names.get(n, ""), 176, SKY if n in ("cloud", "puff", "sunburst", "moon") else CARD) for n in ILLOS]
    n = -(-len(ts) // 6)
    return sheet("Illustrations", "Scene pieces and props. Screens are composed from these; nothing is a one-off drawing.", [
        ("Props and scene pieces", "File names match svg/illustrations in the asset pack.", grid(ts, 6), rows(n, 176)),
    ])


# ------------------------------------------------------------------ Map style
def mapstyle():
    def m(inner, label, sub, vb="0 0 390 456"):
        return tile(svgbox(vb, inner, 262, 306, label, f" border: 2px solid {INK}; border-radius: 10px;"), label, sub, 400, PAPER, None, 10)
    zoom = grid([
        m(map_country(False), "Zoom 4 to 6: country", "States, big lakes, coast, mountains. Multi-day routes and roost markers."),
        m(map_region(), "Zoom 7 to 10: region", "Towns, rivers, parks. Flights measured in hours."),
        m(map_city(), "Zoom 11 to 14: city", "Urban tone, neighbourhood names, main roads, bridges."),
        m(map_block("coo-ms"), "Zoom 15 to 17: block", "Every building as a block, street names, food."),
    ], 4)

    def note(t, d):
        return f'<div style="{COL} gap: 6px; height: 400px; box-sizing: border-box; padding: 16px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(t, 17)}<div style="font-weight: 700; font-size: 14px; line-height: 1.45; color: {MUTED}">{d}</div></div>'
    night = grid([
        m(map_country(True), "Night style", "Swaps land and water after local sunset. Same layers, same data."),
        note("How it is built", "One vector tile source in the OpenMapTiles schema, drawn by MapLibre GL JS with our own style file. The style is a list of rules like the table below, so the map is real, current OpenStreetMap geography in this look at every zoom, with no seams between levels.<br><br>The four pictures here are hand-drawn targets for that style, not screenshots of it."),
        note("Camera", "Opening a flight fits both ends of the route with 48px of padding, then eases toward the bird. Pinch and the plus and minus buttons zoom freely from 3 to 17. The bird stays the same size on screen at every zoom; only the map changes scale.<br><br>A scale bar sits bottom left: 500 ft, 10 mi, 100 mi."),
        note("Location precision", "A friend set to City is placed at a roost near the middle of their city, and the map will not zoom past 12 on their end of the route. A friend set to Block is placed at the roost nearest them and unlocks zoom 17. No end point is ever an address."),
    ], 4)
    head = f'<div style="display: grid; grid-template-columns: 56px 190px 300px 70px 1fr; gap: 12px; padding: 0 12px 6px 12px; font-weight: 900; font-size: 12px; letter-spacing: 1px; color: {MUTED}"><span>FILL</span><span>LAYER</span><span>SOURCE LAYER (OPENMAPTILES)</span><span>ZOOM</span><span>TREATMENT</span></div>'
    lay = "".join(f'<div style="display: grid; grid-template-columns: 56px 190px 300px 70px 1fr; gap: 12px; align-items: center; height: 42px; padding: 0 12px; border-top: 2px dashed {DASH}; font-weight: 800; font-size: 13.5px">'
                  f'<span style="width: 40px; height: 24px; background: {c}; border: 2px solid {INK}; border-radius: 6px; display: block"></span><span style="font-weight: 900">{n}</span><span style="font-family: ui-monospace, Menlo, monospace; font-size: 12.5px">{src}</span><span>{z}</span><span style="font-weight: 700; color: {MUTED}">{t}</span></div>'
                  for n, c, src, z, t in MAP_LAYERS)
    layers = f'<div style="background: {CARD}; border: 2px solid {INK}; border-radius: 14px; padding: 12px 0 0 0">{head}{lay}</div>'
    mk = lambda inner, vb="0 0 80 60": svgbox(vb, inner, 120, 90)
    roost = f'<path d="M32 44 L40 58 L48 44 Z" fill="{PAPER}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/><circle cx="40" cy="24" r="22" fill="{PAPER}" stroke="{INK}" stroke-width="2.5"/><g transform="translate(22 8) scale(.3)">{bird("gerald", "closed", 5)}</g>'
    markers = grid([
        tile(mk(_pin_loft(40, 30)), "Loft pin", "Sun, 12 radius. Where a flight starts.", 172, LAND),
        tile(mk(_pin_sill(40, 30)), "Sill pin", "Tomato, 13 radius. Where it lands.", 172, LAND),
        tile(mk(roost), "Roost bubble", "Sleeping bird over the stop point.", 172, NIGHT),
        tile(mk(f'<path d="M8 44 Q40 10 72 20" fill="none" stroke="{INK}" stroke-width="9" stroke-linecap="round"/><path d="M8 44 Q40 10 72 20" fill="none" stroke="{TOMATO}" stroke-width="5" stroke-linecap="round"/>'), "Flown path", "Tomato 5 over ink 9.", 172, LAND),
        tile(mk(f'<path d="M8 44 Q40 10 72 20" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 10" style="animation: coo-march 1.2s linear infinite"/>'), "Path to fly", "Ink dots, 1 on 10 off, marching.", 172, LAND),
        tile(mk(f'<ellipse cx="40" cy="46" rx="17" ry="5" fill="{INK}" opacity=".2"/><g transform="translate(14 0) scale(.42)">{fly("gerald", "up", 4)}</g>'), "Bird and shadow", "Shadow sits 36 below the bird.", 172, LAND),
        tile(mk(f'<path d="M6 34 V42 H74 V34" fill="none" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/><rect x="16" y="12" width="48" height="18" rx="9" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="40" y="25" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="11" fill="{INK}">500 ft</text>'), "Scale bar", "Bottom left, 16 in.", 172, LAND),
        tile(f'<div style="{COL} gap: 6px"><span style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}">{icon("plus", 20, 3)}</span></div>', "Zoom buttons", "44 square, stacked, right edge.", 172, LAND),
    ], 8)
    return sheet("Map style", "One continuous, accurate map in the sticker-book look, from a few blocks to several states. Real geography comes from OpenStreetMap vector tiles; this sheet is the style we paint it with.", [
        ("One map, four zoom bands", "Detail arrives as you zoom in. Colours and outlines never change, so it reads as one map.", zoom, 400),
        ("Night, build, camera, privacy", None, night, 400),
        ("Layer rules", "Each row becomes one or two layers in the MapLibre style file. A starter version is in the asset pack as map/coo-day.style.json.", layers, 42 * len(MAP_LAYERS) + 44),
        ("Markers and route", None, markers, 172),
    ])


# ------------------------------------------------------------------ Motion
def motion_demo(name):
    small = lambda inner: f'<div style="position: absolute; left: 12px; bottom: 0; transform: scale(.44); transform-origin: 0 100%">{inner}</div>'
    P = lambda anim, p="perched", gear=(), w=112: perch_svg("gerald", w, p, gear, None, anim)
    one = lambda key, val: {key: val}
    spec = {m[0]: m for m in MOTION}
    full = lambda n: f"{n} {spec[n][1]} {spec[n][2].split(',')[0] if 'stepped' not in spec[n][2] else 'linear'} infinite" + (" alternate" if "alternate" in spec[n][2] else "")
    if name == "coo-flap":
        return fly_svg("gerald", 150, (), None, {"wing": FLYING["wing"], "wing2": FLYING["wing2"]})
    if name == "coo-fly-core":
        return fly_svg("gerald", 150, (), None, {"core": FLYING["core"]})
    if name == "coo-fly-tail":
        return fly_svg("gerald", 150, (), None, {"tail": FLYING["tail"]})
    if name == "coo-bob":
        return f'<div style="animation: coo-bob 1.7s ease-in-out infinite alternate">{fly_svg("gerald", 150, (), None, None)}</div>'
    if name == "coo-streak":
        return fly_svg("gerald", 150, (), None, {"streak": True})
    if name == "coo-flutter":
        return fly_svg("gerald", 150, ("scarf",), None, {"scarf": FLYING["scarf"]})
    if name == "coo-takeoff-crouch":
        return small(f'<div style="transform-origin: 46% 100%; animation: coo-takeoff-crouch 3s linear infinite">{perch_svg("gerald", 160, "landed", (), None, None)}</div>')
    if name == "coo-takeoff-fly":
        return small(takeoff_html("gerald", (), 160, "", "position: relative;"))
    if name == "coo-land-fly":
        return f'<div style="position: absolute; right: 16px; bottom: 0; transform: scale(.5); transform-origin: 100% 100%">{landing_html("gerald", (), 150, "position: relative;")}</div>'
    if name == "coo-land-perch":
        return f'<div style="transform: scale(.7); transform-origin: 50% 100%"><div style="transform-origin: 46% 100%; animation: coo-land-perch 4s linear infinite">{perch_svg("gerald", 150, "landed")}</div></div>'
    if name == "coo-puff":
        return illo("puff", 70, None, " transform-origin: 50% 100%; animation: coo-puff 3s ease-out infinite;")
    if name == "coo-feather":
        return f'<div style="position: absolute; left: 50%; top: -6px">{illo("feather", 20, None, " animation: coo-feather 3s ease-in-out infinite;")}</div>'
    if name == "coo-headbob":
        return P(one("head", IDLE["head"]))
    if name == "coo-blink":
        return P({"blink": True})
    if name == "coo-breathe":
        return P(one("torso", IDLE["torso"]))
    if name == "coo-tail-flick":
        return P(one("tail", "coo-tail-flick 2.6s ease-in-out infinite"))
    if name == "coo-wing-shrug":
        return P(one("wing", "coo-wing-shrug 3s ease-in-out infinite"))
    if name == "coo-tilt":
        return P(one("head", CURIOUS["head"]))
    if name == "coo-sway":
        return P({"scarf": IDLE["scarf"], "pom": IDLE["pom"], "bell": IDLE["bell"]}, "perched", ("beanie", "scarf", "bell"))
    if name == "coo-hop":
        return P(one("all", HOPPING["all"]), "landed")
    if name == "coo-peck-body":
        return f'<div style="margin-right: 30px">{P({"all": PECKING["all"]})}</div>'
    if name == "coo-peck-head":
        return perch_svg("gerald", 124, "eat", (), None, True)
    if name == "coo-sigh":
        return perch_svg("gerald", 112, "sulk", (), None, True)
    if name == "coo-sleep":
        return P(SLEEPING, "perched")
    if name == "coo-snooze":
        return perch_svg("gerald", 112, "sleep", (), None, True)
    if name == "coo-march":
        return svgbox("0 0 160 80", f'<path d="M10 64 Q80 0 150 30" fill="none" stroke="{INK}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 10" style="animation: coo-march 1.2s linear infinite"/>', 170)
    if name == "coo-drift":
        return illo("cloud", 100, None, " animation: coo-drift 7s ease-in-out infinite alternate;")
    if name == "coo-pulse":
        return f'<div style="display: flex; align-items: center; gap: 8px; padding: 5px 14px; background: {MINT}; border: 2px solid {INK}; border-radius: 999px; font-weight: 900; font-size: 14px"><span style="width: 10px; height: 10px; background: {INK}; border-radius: 50%; animation: coo-pulse 1.4s ease-in-out infinite"></span>In the air</div>'
    if name == "coo-rain":
        return svgbox("0 0 96 92", f'<path d="M22 54 q-14 -2 -12 -16 q2 -14 18 -13 q8 -16 26 -10 q16 -4 22 12 q14 2 12 16 q-2 12 -16 11 z" fill="{CARD}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><g stroke="{INK}" stroke-width="3.4" stroke-linecap="round"><path d="M30 66 L26 78" style="animation: coo-rain .7s ease-in infinite alternate"/><path d="M48 66 L44 78" style="animation: coo-rain .7s ease-in .2s infinite alternate"/><path d="M66 66 L62 78" style="animation: coo-rain .7s ease-in .4s infinite alternate"/></g>', 100)
    if name == "coo-twinkle":
        return svgbox("0 0 120 80", f'<rect width="120" height="80" rx="10" fill="{NIGHTWATER}"/><g fill="{PAPER}"><circle cx="24" cy="24" r="3" style="animation: coo-twinkle 2.2s ease-in-out infinite"/><circle cx="64" cy="50" r="2.4" style="animation: coo-twinkle 2.2s ease-in-out .7s infinite"/><circle cx="96" cy="22" r="3" style="animation: coo-twinkle 2.2s ease-in-out 1.2s infinite"/><circle cx="44" cy="62" r="2"/></g>', 140)
    if name == "coo-spin":
        return svgbox("0 0 200 200", sunburst(), 120, 120, None, " animation: coo-spin 12s linear infinite;")
    if name == "coo-stamp":
        return svgbox("0 0 84 84", postmark(), 90, 90, None, " animation: coo-stamp 1.8s cubic-bezier(.2,1.6,.4,1) infinite;")
    if name == "coo-burst":
        return (f'<div style="position: relative; width: 30px; height: 30px">' + "".join(f'<span style="position: absolute; left: 3px; top: 3px; animation: {k} 1.8s ease-out infinite">{seed(24)}</span>' for k in ("coo-burst", "coo-burst-l", "coo-burst-u")) + "</div>")
    if name == "coo-press":
        return f'<span style="min-height: 48px; display: flex; align-items: center; padding: 0 22px; background: {TOMATO}; border: 2.5px solid {INK}; border-radius: 16px; font-family: {FONT_D}; font-size: 20px; animation: coo-press 1.6s ease-in-out infinite">Release</span>'
    if name == "coo-point":
        return f'<div style="animation: coo-point .6s ease-in-out infinite alternate">{icon("down", 44, 3.2)}</div>'
    return ""


def motion_sequences():
    big = lambda inner: f'<div style="position: absolute; left: 20px; bottom: 6px; transform: scale(.62); transform-origin: 0 100%">{inner}</div>'
    return [
        ("Idle", "Head bob, blink, breathing, tail flick, wing shrug and swaying gear, all on different clocks so the loop never looks like a loop.", perch_svg("gerald", 190, "perched", ("beanie", "scarf", "bell"), "Gerald idling", IDLE), SKY),
        ("Flight cycle", "Wings flip through the body 50ms apart. The body pitches against the beat, the tail counter-swings, and the whole bird floats on a slower wave.", fly_sprite("gerald", 230, ("goggles", "scarf"), "Gerald flying"), SKY),
        ("Takeoff", "Small stretch up, deep crouch, spring. At the top of the spring the perched drawing swaps for the flying one, which climbs out with dust and a loose feather behind.",
         big(takeoff_html("gerald", ("goggles",), 160, "Gerald taking off", "position: relative;")) + illo("puff", 34, None, " position: absolute; left: 26px; bottom: 4px; transform-origin: 50% 100%; opacity: 0; animation: coo-puff 3s ease-out infinite;"), SKY),
        ("Landing", "Glide in, swap to the perched drawing a few pixels up, drop into a squash, rebound, settle.", f'<div style="position: absolute; right: 30px; bottom: 6px; transform: scale(.75); transform-origin: 100% 100%">{landing_html("dumpling", (), 150, "position: relative;")}</div>', SKY),
    ]


def motion():
    seqs = grid([tile(d, n, s_, 330, bg, None, 12) for n, s_, d, bg in motion_sequences()], 4)
    sky = ("coo-flap", "coo-fly-core", "coo-fly-tail", "coo-bob", "coo-streak", "coo-flutter", "coo-takeoff-crouch", "coo-takeoff-fly", "coo-land-fly", "coo-land-perch", "coo-drift", "coo-feather", "coo-spin", "coo-puff")
    ts = [tile(motion_demo(n), n, f"{dur}, {ease}.<br>{use}.", 250, SKY if n in sky else CARD) for n, dur, ease, use in MOTION]
    nrows = -(-len(ts) // 5)
    rules = (f'<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; height: 150px">'
             + "".join(f'<div style="{COL} gap: 4px; padding: 14px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(t, 15)}<div style="font-weight: 700; font-size: 13px; line-height: 1.4; color: {MUTED}">{d}</div></div>' for t, d in (
                 ("Jointed, not sliding", "A bird is five parts with their own pivots. Nothing moves as one rigid sticker except the slow float in flight."),
                 ("Squash, then stretch", "Every jump is announced by a squash and paid off with a stretch. Landings overshoot and settle."),
                 ("Different clocks", "Idle parts run on 1.9, 4.2, 4.6, 5.5 and 6 second loops, so the combined motion takes minutes to repeat."),
                 ("Takeoff is the only delay", "About 1.5 seconds from tap to tracker. With reduced motion on, every loop stops and takeoff is a straight cut.")))
             + "</div>")
    return sheet("Motion", "Birds are animated as jointed characters: parts overlap, anticipate and follow through. Everything here runs live, and the same keyframes ship as motion.css.", [
        ("Principles", None, rules, 150),
        ("Full sequences", "How the keyframes below combine.", seqs, 330),
        ("Keyframes", "Each tile isolates one keyframe on the part it drives. Loops shown here repeat forever; in the app, takeoff, landing, stamp and burst play once.", grid(ts, 5), rows(nrows, 250)),
    ])


# ------------------------------------------------------------------ App icon
def app_icon_inner(bg=SUN, fg=None, rx=112):
    body = fg or "#B8B3D6"; collar = fg or TEAL; eye = fg and bg or "#FFB03A"; beak = fg or TOMATO; line = fg or INK
    return (f'<rect width="512" height="512" rx="{rx}" fill="{bg}"/>'
            f'<g transform="translate(-268 46) scale(6)" stroke="{line}" stroke-linejoin="round"><ellipse cx="82" cy="57" rx="17" ry="8" fill="{collar}" stroke-width="3"/><circle cx="86" cy="34" r="18" fill="{body}" stroke-width="3"/>'
            f'<circle cx="92" cy="30" r="6.8" fill="{eye}" stroke-width="2.6"/><circle cx="93.6" cy="30" r="2.7" fill="{line if not fg else bg}" stroke="none"/><path d="M104 31 L118 36 L104 41 Z" fill="{beak}" stroke-width="2.6"/></g>')


def appicon():
    ic = lambda w, bg=SUN, fg=None, rx=112, extra="": svgbox("0 0 512 512", app_icon_inner(bg, fg, rx), w, w, "Coo app icon", extra)
    safe = f'<div style="position: relative; width: 190px; height: 190px">{ic(190, SUN, None, 0)}<div style="position: absolute; left: 19px; top: 19px; width: 152px; height: 152px; box-sizing: border-box; border: 2.5px dashed {INK}; border-radius: 50%"></div></div>'
    sizes = f'<div style="display: flex; align-items: flex-end; gap: 14px">{ic(120)}{ic(76)}{ic(60)}{ic(40)}{ic(29)}{ic(16)}</div>'
    icons_ = grid([
        tile(ic(190, SUN, None, 112, f" filter: drop-shadow(0 5px 0 {INK});"), "Master", "512 square. Sun ground, Gerald's head, tomato beak.", 290, PAPER),
        tile(safe, "Maskable", "Full bleed. Everything important sits inside the 80% circle.", 290, PAPER),
        tile(ic(190, PAPER, INK), "One colour", "Ink on paper, for themed icons and print.", 290, CARD),
        tile(sizes, "Small sizes", "120, 76, 60, 40, 29, 16. Legible down to the favicon.", 290, PAPER),
    ], 4)

    def lock(bg, fg, sub):
        return (f'<div style="{COL} align-items: flex-start; justify-content: center; gap: 2px; height: 190px; box-sizing: border-box; padding: 0 32px; background: {bg}; border: 2px solid {INK}; border-radius: 14px; color: {fg}">'
                f'<div style="font-family: {FONT_D}; font-size: 92px; line-height: .9; letter-spacing: -3px">coo</div><div style="font-weight: 900; font-size: 20px">{sub}</div></div>')
    marks = grid([lock(PAPER, INK, "Messages, eventually."), lock(SUN, INK, "Messages, eventually."), lock(INK, PAPER, "Messages, eventually.")], 3)
    splash = (f'<div style="width: 195px; height: 422px; box-sizing: border-box; {COL} align-items: center; justify-content: center; gap: 10px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 22px">'
              f'{bsvg("gerald", 110, "perched", ("goggles",))}<div style="font-family: {FONT_D}; font-size: 46px; line-height: .9; letter-spacing: -1px">coo</div></div>')
    og = (f'<div style="position: relative; width: 600px; height: 315px; box-sizing: border-box; overflow: hidden; background: {SKY}; border: 2.5px solid {INK}; border-radius: 16px">'
          f'<svg width="330" height="330" viewBox="0 0 200 200" aria-hidden="true" style="position: absolute; right: -40px; top: -10px; opacity: .55">{sunburst()}</svg>'
          f'<div style="position: absolute; left: 36px; top: 34px; {COL} gap: 10px; width: 330px"><div style="font-family: {FONT_D}; font-size: 30px; line-height: 1">coo</div>'
          f'<div style="font-family: {FONT_D}; font-size: 54px; line-height: .98">You\'ve got a pigeon</div><div style="font-weight: 900; font-size: 19px; line-height: 1.25">Gerald is flying a note to you right now. Tap to watch.</div></div>'
          f'<div style="position: absolute; right: 28px; top: 78px; animation: coo-bob 1.7s ease-in-out infinite alternate">{fly_svg("gerald", 230, ("goggles",), None, FLYING, True)}</div></div>')
    files = (f'<div style="{COL} gap: 6px; height: 422px; box-sizing: border-box; padding: 16px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px; flex: 1">{bold("Home screen checklist", 17)}'
             + "".join(f'<div style="font-weight: 700; font-size: 13.5px; line-height: 1.4; color: {MUTED}">{t}</div>' for t in (
                 "manifest.webmanifest: name Coo, display standalone, portrait, background and theme colour sun, start_url /.",
                 "Icons: 192 and 512 PNG, plus a 512 maskable. apple-touch-icon at 180.",
                 "iPhone: no install prompt exists, so onboarding step one teaches Share, then Add to Home Screen. Notifications work only after that.",
                 "Android: catch beforeinstallprompt and show our own Install button on the same screen.",
                 "Launch: the splash is the sun ground with Gerald and the wordmark, then straight to the loft.",
                 "Link preview: this 1200 by 630 card is what a texted bird link unfurls to. It is most people's first sight of the app."))
             + "</div>")
    launch = f'<div style="display: flex; gap: 16px; align-items: flex-start">{splash}<div style="{COL} gap: 8px">{og}<div style="font-weight: 900; font-size: 13.5px">Link preview, 1200 by 630, shown at half size</div></div>{files}</div>'
    return sheet("App icon and launch", "What the app looks like before it opens: on the home screen, in the launch moment, and as the preview on a texted link.", [
        ("Icon", "PNG exports at 16, 32, 180, 192 and 512 are in the asset pack.", icons_, 290),
        ("Wordmark", "Bagel Fat One, lower case, tight. The tagline is optional.", marks, 190),
        ("Launch screen, link preview, install", None, launch, 440),
    ])


# ------------------------------------------------------------------ Voice
def voice():
    rules = f'<ol style="margin: 0; padding: 0 0 0 22px; {COL} gap: 6px; font-weight: 800; font-size: 15.5px; line-height: 1.4">{"".join(f"<li>{v}</li>" for v in VOICE)}</ol>'
    nts = "".join(f'<div style="{COL} gap: 6px">{notif_card(n)}<div style="font-family: ui-monospace, Menlo, monospace; font-size: 12px; color: {MUTED}; padding-left: 4px">{n[0]}</div></div>' for n in NOTIFS)
    notifs = f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{nts}</div>'
    cols = []
    for trig, lines in FLIGHT_LOG.items():
        cols.append(f'<div style="{COL} gap: 6px; padding: 12px 14px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(trig, 14)}'
                    + "".join(f'<div style="font-weight: 700; font-size: 13.5px; line-height: 1.35">{esc(l)}</div>' for l in lines) + "</div>")
    log = f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{"".join(cols)}</div>'
    emp = "".join(f'<div style="{COL} gap: 4px; padding: 12px 14px; background: {CARD}; border: 2px solid {INK}; border-radius: 14px">{bold(t, 14)}<div style="font-weight: 700; font-size: 13.5px; line-height: 1.35">{esc(l)}</div></div>' for t, l in EMPTY)
    empty = f'<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 16px">{emp}</div>'
    return sheet("Voice and copy", "How the app talks, the notification set, and a starter library of flight log lines. All of it ships as JSON in the asset pack.", [
        ("Five rules", None, rules, 170),
        ("Notifications", "Eight events. The monospace key is the event name in copy/notifications.json.", notifs, rows(3, 104)),
        ("Flight log lines", "One line is written when its trigger happens. Each trigger needs dozens of lines before launch so they do not repeat; these are the first few.", log, rows(3, 150)),
        ("Empty and error states", None, empty, rows(2, 96)),
    ])


SHEETS = [
    ("Tokens", "Foundations: colour, type, shape", tokens),
    ("Components", "Components", components),
    ("Icons", "Icon set", icons),
    ("Pigeons", "Pigeons: flock, poses, breeds", pigeons),
    ("Gear", "Gear: all closet items", gear),
    ("Illustrations", "Illustrations and props", illustrations),
    ("MapStyle", "Map style across zoom levels", mapstyle),
    ("Motion", "Motion: live keyframes", motion),
    ("AppIcon", "App icon, launch, link preview", appicon),
    ("Voice", "Voice, notifications, flight log copy", voice),
]
