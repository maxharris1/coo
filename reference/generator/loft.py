"""The loft hero scene: one house that grows a floor at a time, with fixed slots for every add-on.

scene(state) returns the SVG for the 390 x 412 hero. All positions come from the constants below,
so the same rules can be handed to a developer (see spec()).
"""
from lib import *
from rig import *

W, HERO_H = 390, 412
FLOOR = 378                 # top of the roof deck: everything stands on this line
COPING = 10                 # deck edge
BAY_W, BAY_H = 74, 80       # one perch = one bay
CX = W // 2
LEFT_SLOT_X, RIGHT_SLOT_X = 38, 353   # centres of the two deck slots
LIGHT_Y, LIGHT_SAG = 150, 50


def mix(a, b, t):
    ra, ga, ba = (int(a[i:i + 2], 16) for i in (1, 3, 5))
    rb, gb, bb = (int(b[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02X%02X%02X" % (round(ra + (rb - ra) * t), round(ga + (gb - ga) * t), round(ba + (bb - ba) * t))


FAR = mix(SKY, INK, .11)
NEAR = mix(SKY, INK, .25)
WIN = mix(NEAR, SKY, .55)
SUN_D = mix(SUN, INK, .16)
TOM_D = mix(TOMATO, INK, .18)
WOOD_D = mix(WOOD, INK, .2)
import re
_HEX = re.compile(r"#[0-9A-Fa-f]{6}")


def grade(svg, tint, amt, keep=(INK,)):
    """Colour-grade a finished piece of the scene: every flat colour moves toward `tint`. Outlines stay ink."""
    if not tint or not amt:
        return svg
    return _HEX.sub(lambda m: m.group(0) if m.group(0).upper() in keep else mix(m.group(0), tint, amt), svg)


def phase(name):
    """Everything that changes with the time of day. The art itself never moves."""
    plum, deep = "#7A5C9E", "#1E1A3C"
    if name == "sunrise":
        top, midb, low = mix(SKY, CARD, .35), mix(PEACH, CARD, .2), mix(SUN, CARD, .35)
        return dict(name=name, bands=[(-300, top), (178, midb), (238, low)], far=mix(midb, plum, .32), mid=mix(midb, plum, .62), lit_k={2, 9}, tint=PEACH, amt=.2, house=.1, bird=.06,
                    lights=False, sleep=False, text=INK, cloud=mix(CARD, PEACH, .3), sun=(312, 204, 40, mix(SUN, CARD, .2)), moon=False, stars=0, glow=False, more_lit=False)
    if name == "sunset":
        top, midb, low = mix(LILAC, ROSE, .42), mix(ROSE, PEACH, .45), mix(SUN, TOMATO, .22)
        return dict(name=name, bands=[(-300, top), (178, midb), (238, low)], far=mix(midb, plum, .45), mid=mix(midb, plum, .8), lit_k={2, 5, 9}, tint=mix(TOMATO, plum, .45), amt=.26, house=.12, bird=.08,
                    lights=True, sleep=False, text=INK, cloud=mix(CARD, ROSE, .4), sun=(72, 202, 42, mix(SUN, TOMATO, .32)), moon=False, stars=0, glow=False, more_lit=True)
    if name == "dusk":
        top, midb, low = mix(NIGHT, LILAC, .18), mix(NIGHT, ROSE, .42), mix(ROSE, PEACH, .35)
        return dict(name=name, bands=[(-300, top), (196, midb), (262, low)], far=mix(midb, deep, .42), mid=mix(midb, deep, .68), lit_k={1, 2, 5, 8, 9}, tint=NIGHT, amt=.42, house=.26, bird=.2,
                    lights=True, sleep=True, text=CARD, cloud=mix(CARD, NIGHT, .45), sun=None, moon=False, stars=5, glow=True, more_lit=True)
    if name == "night":
        sky = mix(NIGHT, NIGHTWATER, .4)
        return dict(name=name, bands=[(-300, sky)], far=mix(sky, deep, .3), mid=mix(sky, deep, .58), lit_k={2, 5, 9}, tint=NIGHTWATER, amt=.52, house=.34, bird=.26,
                    lights=True, sleep=True, text=CARD, cloud=mix(CARD, NIGHT, .6), sun=None, moon=True, stars=12, glow=True, more_lit=True)
    return dict(name="day", bands=[(-300, SKY)], far=mix(SKY, INK, .11), mid=mix(SKY, INK, .25), lit_k={2}, tint=None, amt=0, house=0, bird=0,
                lights=False, sleep=False, text=INK, cloud=CARD, sun=None, moon=False, stars=0, glow=False, more_lit=False)


_MORE_LIT = False
ST = f'stroke="{INK}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"'
ST2 = f'stroke="{INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'


# ------------------------------------------------------------------ geometry
def rows_for(perches):
    """Bays per storey, bottom first. Three to a floor; the top floor is centred."""
    rows, left = [], perches
    while left > 0:
        rows.append(min(3, left)); left -= 3
    if len(rows) > 1 and rows[-1] == 1:
        rows[-1] = 2            # a floor is always built two rooms wide; the spare room is "to let"
    return rows


def bay_xy(perches, i):
    """Top-left corner of bay i (0-based, bottom-left first)."""
    rows = rows_for(perches)
    r, c = divmod(i, 3)
    n = rows[r]
    x0 = CX - n * BAY_W / 2
    return x0 + c * BAY_W, FLOOR - (r + 1) * BAY_H


def roof_geom(perches):
    rows = rows_for(perches)
    top_w = rows[-1] * BAY_W
    eave_y = FLOOR - len(rows) * BAY_H
    over = 10
    rise = 44 if rows[-1] == 3 else 40
    return dict(x0=CX - top_w / 2 - over, x1=CX + top_w / 2 + over, eave=eave_y, peak=eave_y - rise)


# ------------------------------------------------------------------ backdrop
def _win(x, y, w, h, wall, kind="dark"):
    """A neighbour's window. kind: dark | lit | curtain | plant | cat"""
    lit = kind == "lit"
    pane = mix(wall, INK, .42)
    o = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="1.5" fill="{"§lit§" if lit else pane}" stroke="{INK}" stroke-width="1.6"/>'
    if kind == "curtain":
        o += f'<path d="M{x + .8} {y + .8} h{w - 1.6} v{h * .45:.1f} q-{(w - 1.6) / 2:.1f} 3 -{w - 1.6} 0 Z" fill="{CARD}"/>'
    elif kind == "plant":
        o += f'<circle cx="{x + w * .35:.1f}" cy="{y + h - 3}" r="2.6" fill="{MINT}"/><circle cx="{x + w * .68:.1f}" cy="{y + h - 4}" r="2.2" fill="{MINT}"/>'
    elif kind == "cat":
        cx, cy = x + w / 2, y + h - .8
        o += f'<path d="M{cx - 3.5} {cy} v-5 l-.6 -3 l2 1.6 h2.4 l2 -1.6 l-.6 3 v5 Z" fill="{INK}"/>'
    elif not lit:
        o += f'<path d="M{x + 2} {y + h - 3} L{x + w - 3} {y + 3}" stroke="{mix(pane, CARD, .35)}" stroke-width="1.4" stroke-linecap="round"/>'
    o += f'<rect x="{x - 1.5}" y="{y + h - .5}" width="{w + 3}" height="2.6" rx="1" fill="{mix(wall, CARD, .55)}" stroke="{INK}" stroke-width="1.2"/>'
    return o


def _neighbour(x, top, w, wall, wins=(), cols=2, win=(11, 14), cornice=True, xs=None):
    """A building just across the street: flat colour, thin ink outline, real windows."""
    o = f'<rect x="{x}" y="{top}" width="{w}" height="{FLOOR - top + 4}" fill="{wall}" {ST2}/>'
    shade = mix(wall, INK, .12)
    o += "".join(f'<path d="M{x + 5 + (i * 17) % (w - 16)} {top + 16 + i * 23} h7 m5 9 h6" stroke="{shade}" stroke-width="1.6" stroke-linecap="round"/>' for i in range(int((FLOOR - top - 30) // 23)))
    gap = (w - cols * win[0]) / (cols + 1)
    for i, kind in enumerate(wins):
        r, c = divmod(i, cols)
        if kind == "dark" and _MORE_LIT and i % 2 == 0:
            kind = "lit"
        if kind:
            o += _win(xs[c] if xs else round(x + gap + c * (win[0] + gap), 1), top + 14 + r * 22, win[0], win[1], wall, kind)
    if cornice:
        o += f'<rect x="{x - 3}" y="{top - 4}" width="{w + 6}" height="7" rx="2.5" fill="{mix(wall, CARD, .6)}" {ST2}/>'
    return o


def water_tower(x, y):
    """x is the centre, y the roof it stands on. Full colour: this one is close."""
    return (f'<g {ST2}><path d="M{x - 11} {y} L{x - 9} {y - 14} M{x + 11} {y} L{x + 9} {y - 14} M{x - 10} {y - 5} L{x + 10} {y - 11} M{x + 10} {y - 5} L{x - 10} {y - 11}" fill="none" stroke-width="1.8"/>'
            f'<rect x="{x - 14}" y="{y - 38}" width="28" height="25" rx="2" fill="{WOOD}"/>'
            f'<path d="M{x - 14} {y - 30} h28 M{x - 14} {y - 21} h28" stroke="{WOOD_D}" stroke-width="1.6" fill="none"/>'
            f'<path d="M{x - 7} {y - 37} v23 M{x} {y - 37} v23 M{x + 7} {y - 37} v23" stroke="{mix(WOOD, WOOD_D, .5)}" stroke-width="1" fill="none"/>'
            f'<path d="M{x - 17} {y - 37} L{x} {y - 51} L{x + 17} {y - 37} Z" fill="{mix(LILAC, INK, .22)}"/><circle cx="{x}" cy="{y - 52}" r="1.8" fill="{INK}" stroke="none"/></g>')


def _pigeon_dot(x, y, flip=False):
    k = -1 if flip else 1
    return f'<path d="M{x} {y} q{-6 * k} 0 {-7 * k} -4 q{1 * k} -4 {5 * k} -4 q{1 * k} -3 {3.5 * k} -2 l{2.2 * k} 1 l{-2 * k} 1 q{.6 * k} 4 {-1.7 * k} 8 Z" fill="{mix(INK, SKY, .28)}"/>'


def skyline(ph):
    """Three depths. Far: haze, shapes only. Middle: sky-tinted towers with window grids.
    Near: the neighbours across the street, in colour, with outlines, as tall as we are."""
    FAR, NEAR = ph["far"], ph["mid"]
    WIN = mix(NEAR, ph["bands"][-1][1], .5)
    # ---- far: tall pale shapes, one spire
    far = [(-6, 30, 208), (20, 30, 186), (54, 36, 204), (94, 34, 176), (128, 30, 198), (160, 44, 184), (206, 30, 196),
           (236, 30, 170), (262, 28, 152), (290, 36, 188), (326, 30, 172), (356, 40, 196)]
    o = "".join(f'<rect x="{x}" y="{t}" width="{w}" height="{FLOOR - t}" fill="{FAR}"/>' for x, w, t in far)
    o += f'<path d="M268 152 h16 l-3 -9 h-10 Z M273 143 h6 l-2 -8 h-2 Z" fill="{FAR}"/><path d="M276 136 V124 M111 176 V164 M341 172 V160" stroke="{FAR}" stroke-width="2" stroke-linecap="round" fill="none"/>'
    o += f'<path d="M94 190 h34 M94 204 h34 M236 184 h30 M236 198 h30 M160 198 h44 M326 186 h30" stroke="{mix(FAR, ph["bands"][-1][1], .5)}" stroke-width="2" fill="none"/>'
    # ---- middle: towers with windows; a setback tower in the centre
    mid = [(40, 36, 234), (72, 30, 252), (98, 44, 220), (140, 34, 242), (170, 44, 206), (212, 34, 234), (244, 36, 216),
           (278, 30, 240), (304, 34, 228), (336, 30, 244), (372, 24, 232)]
    o += f'<rect x="180" y="192" width="24" height="16" fill="{NEAR}"/><path d="M192 192 V180" stroke="{NEAR}" stroke-width="2.4" stroke-linecap="round"/>'
    o += f'<g fill="{NEAR}"><path d="M250 216 L252 205 H266 L268 216 Z"/><rect x="250" y="192" width="18" height="14" rx="2"/><path d="M248 193 L259 185 L270 193 Z"/></g>'
    for n, (x, w, t) in enumerate(mid):
        o += f'<rect x="{x}" y="{t}" width="{w}" height="{FLOOR - t}" fill="{NEAR}"/><rect x="{x}" y="{t}" width="{w}" height="3" fill="{mix(NEAR, INK, .12)}"/>'
        cols = int(max(2, (w - 8) // 9))
        gap = (w - cols * 5) / (cols + 1)
        for r in range(int((FLOOR - t - 16) // 12)):
            for c in range(cols):
                k = (n * 7 + r * 3 + c * 5) % 11
                yy = t + 9 + r * 12
                if k in (0, 7):
                    continue
                o += f'<rect x="{x + gap + c * (5 + gap):.1f}" y="{yy}" width="5" height="7" rx="1" fill="{"§lit§" if k in ph["lit_k"] and yy < FLOOR - 70 else WIN}"/>'
    back, o = o, ""
    # ---- near, left: a low slate roof with a stair hut, then a tall brick walk-up
    brick = mix(BRICK, SKY, .34)
    slate = mix(LILAC, INK, .13)
    o += _neighbour(40, 288, 60, slate, ("dark", "lit"), cols=2, win=(10, 12), xs=(51, 64))
    o += f'<g {ST2}><rect x="54" y="270" width="18" height="14" fill="{mix(slate, CARD, .35)}"/><rect x="59" y="275" width="7" height="9" fill="{mix(slate, INK, .4)}" stroke-width="1.4"/></g>'
    o += _pigeon_dot(68, 270)
    o += _neighbour(-8, 198, 56, brick, ("curtain", "dark", "lit", "plant", "dark", "cat", "dark", "curtain"), cols=2, win=(13, 15))
    o += _pigeon_dot(12, 194, True)
    # ---- near, right: a slate building with a roof garden, then a brick one carrying the water tower
    o += _neighbour(284, 274, 56, slate, ("curtain",), cols=1, win=(10, 12), xs=(323,))
    o += f'<g {ST2}><path d="M300 270 V262" fill="none"/><circle cx="296" cy="259" r="6.5" fill="{MINT}"/><circle cx="304" cy="256" r="7.5" fill="{MINT}"/><rect x="293" y="264" width="14" height="6" rx="1.5" fill="{WOOD}"/><rect x="320" y="262" width="13" height="8" rx="1.5" fill="{mix(slate, INK, .18)}"/></g>'
    rb = mix(BRICK, SKY, .42)
    o += _neighbour(338, 250, 60, rb, ("dark", "lit", "plant", "dark"), cols=2, win=(13, 15))
    o += water_tower(367, 246)
    return back, o


def cloud(x, y, w, delay=0, dur=26, fill=CARD):
    s = w / 74
    return (f'<g transform="translate({x} {y}) scale({s:.3f})"><g style="animation: coo-drift {dur}s ease-in-out {delay}s infinite alternate">'
            f'<path d="M10 28 q-8 -2 -6 -10 q0 -10 12 -10 q6 -8 18 -5 q12 -3 15 8 q12 0 12 9 q0 8 -9 8 z" fill="{fill}" stroke="{INK}" stroke-width="{2.5 / s:.2f}" stroke-linejoin="round"/></g></g>')


def lights(hide=None, on=False):
    """One garland, edge to edge, behind the house and in front of the skyline. Never moves."""
    p0, p1, p2 = (-6, LIGHT_Y), (CX, LIGHT_Y + 2 * LIGHT_SAG), (W + 6, LIGHT_Y)
    o = f'<path d="M{p0[0]} {p0[1]} Q{p1[0]} {p1[1]} {p2[0]} {p2[1]}" fill="none" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'
    cols = [TOMATO, SUN, MINT, CARD, ROSE]
    n = 13
    for i in range(n):
        t = .05 + .9 * (i + .5) / n
        x = (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * p1[0] + t * t * p2[0]
        y = (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * p1[1] + t * t * p2[1]
        c = cols[i % len(cols)]
        if hide and hide[0] < x < hide[1] and y > hide[2]:
            continue
        halo = f'<circle cy="8" r="12" fill="{c}" opacity=".42" style="animation: coo-twinkle {3 + i % 3}s ease-in-out {i * .37:.2f}s infinite"/>' if on else ""
        c = c if on else mix(c, CARD, .38)
        o += (f'<g transform="translate({x:.1f} {y:.1f})">{halo}'
              f'<rect x="-2.5" y="0" width="5" height="4" rx="1" fill="{INK}"/><path d="M0 3.5 C5 5 5.5 11 0 14 C-5.5 11 -5 5 0 3.5 Z" fill="{c}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/></g>')
    return o


def deck(brick=PEACH):
    y0, y1 = FLOOR + COPING, HERO_H
    o = f'<rect x="-4" y="{y0}" width="{W + 8}" height="{y1 - y0}" fill="{brick}"/>'
    mid = (y0 + y1) / 2 + 1
    o += f'<path d="M-4 {mid} H{W + 4}" stroke="{INK}" stroke-width="1.6" opacity=".55"/>'
    o += "".join(f'<path d="M{x} {y0} V{mid}" stroke="{INK}" stroke-width="1.6" opacity=".55"/>' for x in range(30, W, 52))
    o += "".join(f'<path d="M{x} {mid} V{y1}" stroke="{INK}" stroke-width="1.6" opacity=".55"/>' for x in range(4, W, 52))
    o += f'<rect x="-4" y="{FLOOR}" width="{W + 8}" height="{COPING}" fill="{CARD}" {ST}/>'
    o += f'<path d="M-4 {y1 - 1.25} H{W + 4}" stroke="{INK}" stroke-width="2.5"/>'
    return o


# ------------------------------------------------------------------ the house
def _bay(x, y, state):
    """state: bird | empty | egg | ready | tolet"""
    o = ""
    if isinstance(state, str) and state == "tolet":
        o += f'<rect x="{x}" y="{y}" width="{BAY_W}" height="{BAY_H}" fill="{SAND}" {ST}/>'
        o += f'<rect x="{x + 7}" y="{y + 7}" width="{BAY_W - 14}" height="{BAY_H - 14}" rx="6" fill="none" stroke="{INK}" stroke-width="1.8" stroke-dasharray="3 5" stroke-linecap="round" opacity=".55"/>'
        sx, sy = x + 37, y + 36
        o += (f'<g transform="rotate(-4 {sx} {sy})"><path d="M{sx - 14} {sy} L{sx} {sy - 14} L{sx + 14} {sy}" fill="none" stroke="{INK}" stroke-width="1.6"/>'
              f'<circle cx="{sx}" cy="{sy - 14}" r="2" fill="{INK}"/><rect x="{sx - 22}" y="{sy}" width="44" height="19" rx="4" fill="{CARD}" {ST2}/>'
              f'<text x="{sx}" y="{sy + 13.4}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="9.5" letter-spacing=".6" fill="{STAMP}">TO LET</text></g>')
        return o
    o += f'<circle cx="{x + 17}" cy="{y + 19}" r="15" fill="§halo§" opacity="§haloa§"/><circle cx="{x + 17}" cy="{y + 19}" r="10" fill="§hole§" {ST}/>'
    o += f'<path d="M{x + 10.5} {y + 16} a7 7 0 0 1 6 -4.5" fill="none" stroke="§holehi§" stroke-width="1.8" stroke-linecap="round"/>'
    # the perch: a plank on two brackets
    o += f'<path d="M{x + 14} {y + 78} v-5 h7 Z M{x + 60} {y + 78} v-5 h-7 Z" fill="{WOOD_D}" {ST2}/>'
    o += f'<rect x="{x + 7}" y="{y + 68}" width="{BAY_W - 14}" height="7" rx="3" fill="{WOOD}" {ST}/>'
    if isinstance(state, tuple) and state[0] == "away":
        fx, fy, col = x + 36, y + 64, state[1]
        o += (f'<g transform="rotate(-14 {fx} {fy})"><path d="M{fx - 15} {fy} q8 -9 22 -6 q6 1 9 5 q-12 7 -24 4 Z" fill="{col}" {ST2}/>'
              f'<path d="M{fx - 15} {fy} q14 -2 28 -2" fill="none" stroke="{INK}" stroke-width="1.5" stroke-linecap="round"/></g>')
    if state == "roommate":
        cx, by = x + 40, y + 68
        o += (f'<g {ST2}><path d="M{cx - 5} {by - 19} v-4 q0 -3 3 -3 h4 q3 0 3 3 v4" fill="none"/><rect x="{cx - 13}" y="{by - 19}" width="26" height="19" rx="4" fill="{TOMATO}"/>'
              f'<path d="M{cx - 6} {by - 19} v19 M{cx + 6} {by - 19} v19" stroke="{CARD}" stroke-width="3"/><path d="M{cx - 6} {by - 19} v19 M{cx + 6} {by - 19} v19" fill="none" stroke-width="0"/>'
              f'<rect x="{cx - 13}" y="{by - 19}" width="26" height="19" rx="4" fill="none"/>'
              f'<path d="M{cx + 13} {by - 12} l7 3" fill="none" stroke-width="1.5"/><rect x="{cx + 18}" y="{by - 11}" width="9" height="7" rx="1.5" fill="{SUN}" stroke-width="1.5" transform="rotate(18 {cx + 22} {by - 8})"/></g>')
    if state in ("egg", "ready"):
        ex, ey = x + 40, y + 68
        o += f'<path d="M{ex - 15} {ey - 4} q15 9 30 0 l-2 4 h-26 Z" fill="{WOOD_D}" {ST2}/>'
        egg = (f'<path d="M0 -24 C7 -24 11 -11 11 -5 a11 11 0 0 1 -22 0 C-11 -11 -7 -24 0 -24 Z" fill="{CARD}" {ST2}/><circle cx="-4" cy="-10" r="1.6" fill="{LILAC}"/><circle cx="4" cy="-4" r="2" fill="{LILAC}"/>')
        if state == "ready":
            egg += f'<path d="M-9 -9 l4 3 l4 -4 l4 4 l5 -3" fill="none" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round"/>'
            egg = f'<g style="transform-box: fill-box; transform-origin: 50% 100%; animation: coo-wobble .9s ease-in-out infinite">{egg}</g>'
            o += f'<path d="M{ex + 14} {ey - 24} l5 -4 M{ex + 17} {ey - 15} l6 0 M{ex - 14} {ey - 24} l-5 -4" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>'
        o += f'<g transform="translate({ex} {ey - 1})">{egg}</g>'
        o += f'<path d="M{ex - 16} {ey - 3} q16 10 32 0" fill="none" {ST2}/>'
    return o


def house(perches, bays, items=()):
    rows = rows_for(perches)
    g = roof_geom(perches)
    o = ""
    # walls, bottom floor first
    for r, n in enumerate(rows):
        x0, y0 = CX - n * BAY_W / 2, FLOOR - (r + 1) * BAY_H
        o += f'<rect x="{x0}" y="{y0}" width="{n * BAY_W}" height="{BAY_H}" fill="{SUN}" {ST}/>'
        o += "".join(f'<path d="M{x0 + 2} {y0 + k} H{x0 + n * BAY_W - 2}" stroke="{SUN_D}" stroke-width="1.5"/>' for k in (20, 40, 60))
        o += "".join(f'<path d="M{x0 + c * BAY_W} {y0} V{y0 + BAY_H}" stroke="{INK}" stroke-width="2"/>' for c in range(1, n))
    # a cornice between floors, which also caps the shoulders of the ground floor
    for r in range(1, len(rows)):
        n = rows[r - 1]
        o += f'<rect x="{CX - n * BAY_W / 2 - 4}" y="{FLOOR - r * BAY_H - 3}" width="{n * BAY_W + 8}" height="7" rx="3" fill="{CARD}" {ST}/>'
    # bays
    for i in range(sum(rows)):
        x, y = bay_xy(perches, i)
        o += _bay(x, y, bays[i] if i < len(bays) else ("tolet" if i >= perches else "empty"))
    # roof
    x0, x1, ey, py = g["x0"], g["x1"], g["eave"], g["peak"]
    o += f'<path d="M{x0 + 5} {ey - 3} L{CX} {py} L{x1 - 5} {ey - 3} Z" fill="{TOMATO}" {ST}/>'
    k = (ey - 3 - py) / (CX - x0 - 5)
    for d in (16, 32):
        if CX - x0 - 5 - d * 1.9 > 30:
            o += f'<path d="M{x0 + 5 + d * 1.9:.1f} {ey - 3} L{CX} {py + d:.1f} L{x1 - 5 - d * 1.9:.1f} {ey - 3}" fill="none" stroke="{TOM_D}" stroke-width="1.6" stroke-linejoin="round"/>'
    o += f'<rect x="{x0}" y="{ey - 5}" width="{x1 - x0}" height="9" rx="4" fill="{TOM_D}" {ST}/>'
    o += (f'<rect x="{CX - 29}" y="{ey - 24}" width="58" height="15" rx="4" fill="{CARD}" {ST2}/>'
          f'<text x="{CX}" y="{ey - 13}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="9.5" letter-spacing=".8" fill="{INK}">LOFT 4B</text>')
    # stovepipe on the right slope, always there
    px = CX + (x1 - CX) * .52
    pyy = py + (px - CX) * k
    o += f'<rect x="{px - 5}" y="{pyy - 20:.1f}" width="10" height="{24:.1f}" fill="{LILAC}" {ST2}/><rect x="{px - 7.5}" y="{pyy - 24:.1f}" width="15" height="6" rx="2" fill="{mix(LILAC, INK, .2)}" {ST2}/>'
    for j, (dx, dy, r) in enumerate(((1, -34, 4.5), (6, -44, 6), (2, -55, 4))):
        o += (f'<circle cx="{px + dx:.1f}" cy="{pyy + dy:.1f}" r="{r}" fill="{CARD}" stroke="{INK}" stroke-width="1.6" '
              f'style="transform-box: fill-box; transform-origin: 50% 50%; animation: loft-smoke 5s ease-out {j * 1.6:.1f}s infinite"/>')
    if "vane" in items:
        o += vane(CX, py)
    return o


# ------------------------------------------------------------------ add-ons
def vane(x, y):
    return (f'<g {ST2}><path d="M{x} {y + 2} V{y - 13}" fill="none" stroke-width="2.5"/><circle cx="{x}" cy="{y - 1}" r="3.2" fill="{SUN}"/>'
            f'<g style="transform-box: fill-box; transform-origin: 50% 100%; animation: coo-sway 7s ease-in-out infinite alternate">'
            f'<path d="M{x - 17} {y - 14} H{x + 12}" fill="none"/><path d="M{x + 11} {y - 19} L{x + 20} {y - 14} L{x + 11} {y - 9} Z" fill="{SUN}"/>'
            f'<path d="M{x - 17} {y - 19} l-5 5 l5 5 Z" fill="{SUN}"/>'
            f'<path d="M{x - 8} {y - 17} q0 -9 8 -9 q4 -5 8 -1 l4 1 l-4 2 q0 7 -8 7 Z" fill="{CARD}"/><circle cx="{x + 5.5}" cy="{y - 26}" r=".9" fill="{INK}" stroke="none"/></g></g>')


def planter(x):
    f = FLOOR
    cols = (TOMATO, CARD, ROSE, SUN, CARD)
    o = f'<g {ST2}><rect x="{x - 28}" y="{f + 10}" width="56" height="13" rx="3" fill="{WOOD}"/><path d="M{x - 28} {f + 15} H{x + 28}" fill="none" stroke="{WOOD_D}" stroke-width="1.5"/>'
    o += "".join(f'<circle cx="{x - 22 + i * 11}" cy="{f + 8}" r="5.2" fill="{MINT}"/>' for i in range(5))
    o += "".join(f'<circle cx="{x - 21 + i * 10.5}" cy="{f + 4.5 + (i % 2)}" r="3.9" fill="{cols[i]}" stroke-width="1.5"/>' for i in range(5))
    return o + '</g>'


def birdbath(x=LEFT_SLOT_X):
    f = FLOOR
    return (f'<g {ST}><path d="M{x - 13} {f} q0 -6 5 -7 h16 q5 1 5 7 Z" fill="{LILAC}"/><path d="M{x - 5} {f - 7} V{f - 30} H{x + 5} V{f - 7} Z" fill="{CARD}"/>'
            f'<path d="M{x - 26} {f - 42} H{x + 26} q-2 14 -26 14 q-24 0 -26 -14 Z" fill="{CARD}"/>'
            f'<ellipse cx="{x}" cy="{f - 42}" rx="26" ry="5.5" fill="{SKY}"/>'
            f'<path d="M{x - 12} {f - 42} q4 -2 8 0 M{x + 4} {f - 43} q4 -2 8 0" fill="none" stroke-width="1.6"/></g>'
            f'<path d="M{x - 19} {f - 36} q2 6 10 8" fill="none" stroke="{LILAC}" stroke-width="2.4" stroke-linecap="round"/>'
            f'<g fill="{CARD}" stroke="{INK}" stroke-width="1.4"><circle cx="{x + 15}" cy="{f - 54}" r="2.2" style="animation: coo-twinkle 2.6s ease-in-out infinite"/><circle cx="{x + 21}" cy="{f - 61}" r="1.5" style="animation: coo-twinkle 2.6s ease-in-out .9s infinite"/></g>')


def cart(x=RIGHT_SLOT_X):
    f = FLOOR
    o = f'<g {ST}>'
    o += f'<path d="M{x - 23} {f - 28} V{f - 52} M{x + 23} {f - 28} V{f - 52}" fill="none"/>'
    # body, counter, seed heap
    o += f'<path d="M{x - 15} {f - 30} q15 -17 30 0 Z" fill="{SUN}"/>'
    o += f'<rect x="{x - 25}" y="{f - 30}" width="50" height="19" rx="4" fill="{CARD}"/>'
    o += f'<rect x="{x - 28}" y="{f - 33}" width="56" height="7" rx="3" fill="{WOOD}"/>'
    o += f'<path d="M{x} {f - 24} c3.4 2.6 4.6 5.6 0 10 c-4.6 -4.4 -3.4 -7.4 0 -10 Z" fill="{SUN}" stroke-width="1.8"/>'
    # wheels
    o += f'<circle cx="{x - 14}" cy="{f - 8}" r="8" fill="{CARD}"/><circle cx="{x + 14}" cy="{f - 8}" r="8" fill="{CARD}"/>'
    o += f'<circle cx="{x - 14}" cy="{f - 8}" r="2.2" fill="{INK}"/><circle cx="{x + 14}" cy="{f - 8}" r="2.2" fill="{INK}"/>'
    # awning, striped like the seed store
    ax0, n = x - 27.5, 5
    for i in range(n):
        o += f'<path d="M{ax0 + i * 11} {f - 64} h11 v9 a5.5 5.5 0 0 1 -11 0 Z" fill="{TOMATO if i % 2 == 0 else CARD}"/>'
    o += f'<rect x="{ax0 - 1}" y="{f - 68}" width="57" height="6" rx="3" fill="{TOM_D}"/>'
    return o + '</g>'


# ------------------------------------------------------------------ the whole scene
SMOKE_CSS = "@keyframes loft-smoke{0%{transform:translate(0,10px) scale(.4);opacity:0}25%{opacity:1}100%{transform:translate(9px,-12px) scale(1.25);opacity:0}}"


def bird_in_bay(perches, i, v, pose_name="perched", gear=(), w=70):
    x, y = bay_xy(perches, i)
    vb, inner = pose(v, pose_name, 3, gear, anim=True)
    vx, vy, vw, vh = [float(n) for n in vb.split()]
    s = w / vw
    foot = (104 - vy) * s
    bx = x + (BAY_W - w) / 2 + 3
    by = y + 68 - foot
    return f'<svg x="{bx:.1f}" y="{by:.1f}" width="{w}" height="{vh * s:.1f}" viewBox="{vb}" overflow="visible">{inner}</svg>'


STARS = [(120, 30), (168, 16), (228, 38), (266, 60), (270, 112), (378, 64), (374, 132), (34, 140), (92, 146), (200, 140), (246, 150), (300, 142)]


def sky(ph, clouds=True):
    o = "".join(f'<rect x="-4" y="{y}" width="{W + 8}" height="{HERO_H + 300}" fill="{c}"/>' for y, c in ph["bands"])
    top = ph["bands"][0][1]
    for i, (x, y) in enumerate(STARS[:ph["stars"]]):
        r = 2.2 if i % 3 == 0 else 1.5
        o += f'<path d="M{x} {y - r * 2} L{x + r * .6} {y - r * .6} L{x + r * 2} {y} L{x + r * .6} {y + r * .6} L{x} {y + r * 2} L{x - r * .6} {y + r * .6} L{x - r * 2} {y} L{x - r * .6} {y - r * .6} Z" fill="{CARD}" style="animation: coo-twinkle {3 + i % 4}s ease-in-out {i * .41:.2f}s infinite"/>'
    if ph["sun"]:
        x, y, r, c = ph["sun"]
        o += f'<circle cx="{x}" cy="{y}" r="{r + 12}" fill="{c}" opacity=".28"/><circle cx="{x}" cy="{y}" r="{r}" fill="{c}" {ST}/>'
    if ph["moon"]:
        cx, cy = 322, 94
        o += f'<circle cx="{cx}" cy="{cy}" r="26" fill="{CARD}" opacity=".12"/><path d="M{cx + 5} {cy - 17} A17 17 0 1 0 {cx + 17} {cy + 6} A13.5 13.5 0 1 1 {cx + 5} {cy - 17} Z" fill="{CARD}" {ST}/>'
    if clouds:
        if not ph["moon"]:
            o += cloud(288, 80, 60, 0, 30, ph["cloud"])
        o += cloud(338, 122, 34, 4, 24, ph["cloud"]) if not ph["moon"] else cloud(214, 58, 34, 4, 24, ph["cloud"]).replace('<g transform="translate(214 58)', '<g opacity=".0" transform="translate(214 58)')
    return o


def scene(perches=3, birds=(), items=(), clouds=True, brick=PEACH, y0=0, h=HERO_H, label="Your rooftop loft", scale=1, extra="", time="day"):
    """birds: list, one entry per bay in order. Each is None (empty), 'egg', 'ready',
    or (look, pose, gear). Bays past `perches` on a built floor are 'to let'.
    time: sunrise | day | sunset | dusk | night."""
    global _MORE_LIT
    ph = phase(time)
    if ph["sleep"]:
        birds = [(b[0], "sleep", b[2]) if isinstance(b, tuple) and b[0] != "away" else b for b in birds]
    states = []
    for i in range(perches):
        b = birds[i] if i < len(birds) else None
        states.append("empty" if b is None else "bird" if b == "home" else b if isinstance(b, str) else ("away", ALL[b[1]]["wing"]) if b[0] == "away" else "bird")
    g = roof_geom(perches)
    _MORE_LIT = ph["more_lit"]
    back, near = skyline(ph)
    o = sky(ph, clouds) + back + grade(near, ph["tint"], ph["amt"])
    o += lights((g['x0'] - 4, g['x1'] + 4, g['peak'] - 22) if len(rows_for(perches)) > 1 else None, ph["lights"])
    stage = house(perches, states, items)
    if "birdbath" in items:
        stage += birdbath()
    if "cart" in items:
        stage += cart()
    o += grade(stage, ph["tint"], ph["house"])
    front = deck(brick)
    if "planters" in items:
        front += planter(LEFT_SLOT_X) + planter(RIGHT_SLOT_X)
    o += grade(front, ph["tint"], ph["amt"] * .8)
    flock = ""
    for i in range(perches):
        b = birds[i] if i < len(birds) else None
        if isinstance(b, tuple) and b[0] != "away":
            flock += bird_in_bay(perches, i, *b)
    o += grade(flock, ph["tint"], ph["bird"])
    warm = mix(SUN, CARD, .25)
    o = (o.replace("§lit§", SUN).replace("§hole§", warm if ph["glow"] else NIGHT).replace("§holehi§", mix(warm, CARD, .6) if ph["glow"] else mix(NIGHT, CARD, .35))
         .replace("§halo§", warm).replace("§haloa§", ".4" if ph["glow"] else "0"))
    return (f'<svg width="{W * scale:.0f}" height="{h * scale:.0f}" viewBox="0 {y0} {W} {h}" role="img" aria-label="{esc(label)}" style="display: block;{extra}">{o}</svg>')


# ------------------------------------------------------------------ phone screens
from screens import page, card, chip, tabbar, COL

EXTRA_CSS = SMOKE_CSS + "\n@media (prefers-reduced-motion: reduce){*{animation:none !important}}"
G = ("gerald", "perched", ("goggles",)); B = ("brenda", "perched", ("bow",)); K = ("kevin", "sleep", ("beanie",))
A = ("admiral", "perched", ("cap",)); P = ("fantail", "perched", ())
ROWS = {
    "gerald": ("Gerald", "Home, fed, smug", "Ready", MINT, ("goggles",), "open"),
    "brenda": ("Brenda", "Home. Judging the skyline.", "Ready", MINT, ("bow",), "open"),
    "brenda-out": ("Brenda", "Over Edison. Lands about 11:20", "Flying", SKY, ("bow",), "open"),
    "kevin": ("Kevin", "Napping until 2:40 pm", "Resting", LILAC, ("beanie",), "closed"),
    "admiral": ("Admiral Crumbs", "Hungry. Has opinions about it.", "Feed me", SUN, ("cap",), "open"),
    "fantail": ("Pretzel", "Home. Fanned out for no reason.", "Ready", MINT, (), "open"),
}


NIGHT_LINES = {"gerald": "Asleep. One eye open.", "brenda": "Asleep. Still judging.", "kevin": "Asleep. He was already.",
               "admiral": "Asleep. Dreaming of bread.", "fantail": "Asleep. Fanned out anyway."}


def flock_row(key, asleep=False):
    name, status, tag, bg, gear, eye = ROWS[key]
    if asleep:
        status, tag, bg, eye = NIGHT_LINES[key], "Asleep", LILAC, "closed"
    v = key.split("-")[0]
    right = (f'<span style="flex-shrink: 0; min-height: 34px; box-sizing: border-box; display: flex; align-items: center; padding: 0 12px; background: {SUN}; border: 2px solid {INK}; border-radius: 12px; box-shadow: 0 2px 0 {INK}; font-size: 13px; font-weight: 900">{tag}</span>'
             if tag == "Feed me" else chip(tag, bg))
    inner = (avatar_svg(v, 38, SKY, eye, gear) + f'<div style="flex: 1; min-width: 0; {COL}"><div style="font-weight: 900; font-size: 16px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(name)}</div>'
             f'<div style="font-weight: 700; font-size: 13px; line-height: 1.25; color: {MUTED}; white-space: nowrap; overflow: hidden; text-overflow: ellipsis">{esc(status)}</div></div>' + right)
    return card(inner, pad="4px 12px 4px 8px", href="Pigeon.dc.html", minh=52)


def egg_row(title, sub, tag=None):
    egg = (f'<svg width="38" height="38" viewBox="-19 -30 38 38" aria-hidden="true" style="flex-shrink: 0; background: {CARD}; border: 2px solid {INK}; border-radius: 50%">'
           f'<path d="M0 -24 C7 -24 11 -11 11 -5 a11 11 0 0 1 -22 0 C-11 -11 -7 -24 0 -24 Z" fill="{CARD}" {ST2}/><circle cx="-4" cy="-10" r="1.6" fill="{LILAC}"/><circle cx="4" cy="-4" r="2" fill="{LILAC}"/></svg>')
    inner = (egg + f'<div style="flex: 1; min-width: 0; {COL}"><div style="font-weight: 900; font-size: 16px; line-height: 1.2">{esc(title)}</div>'
             f'<div style="font-weight: 700; font-size: 13px; line-height: 1.25; color: {MUTED}">{esc(sub)}</div></div>' + (chip(tag, SUN) if tag else ""))
    return card(inner, bg="transparent", pad="4px 12px 4px 8px", href="Aviary.dc.html", minh=52, extra=" border-style: dashed;")


def hit(x, y, w, h, href, label, k=1.0, dy=0.0):
    return (f'<a href="{href}" aria-label="{esc(label)}" style="position: absolute; left: {x * k:.0f}px; top: {y * k + dy:.0f}px; width: {w * k:.0f}px; height: {h * k:.0f}px; border-radius: 12px"></a>')


def loft_screen(title, greeting, seeds, perches, birds, items, rows, perch_link, labels, w=390, h=844, time="day"):
    k = w / W
    sky = 128                                   # the clear band for the top bar and greeting never scales
    art = (HERO_H - sky) * k                    # everything below it scales with the screen width
    hero_h = round(sky + art)
    y0 = HERO_H - hero_h / k
    svg = scene(perches, birds, items, y0=round(y0, 1), h=round(hero_h / k, 1), scale=k, extra=" position: absolute; left: 0; top: 0;", time=time)
    ink = phase(time)["text"]
    dy = hero_h - HERO_H * k
    hits = ""
    for i in range(sum(rows_for(perches))):
        x, y = bay_xy(perches, i)
        if i >= perches:
            hits += hit(x, y, BAY_W, BAY_H, "Shop.dc.html", "Room to let. Add a perch in the seed store", k, dy)
        elif i < len(labels) and labels[i]:
            hits += hit(x, y, BAY_W, BAY_H, labels[i][1], labels[i][0], k, dy)
    if "birdbath" in items:
        hits += hit(LEFT_SLOT_X - 30, FLOOR - 60, 60, 60, "Shop.dc.html", "Rooftop birdbath", k, dy)
    if "cart" in items:
        hits += hit(RIGHT_SLOT_X - 30, FLOOR - 70, 60, 70, "Shop.dc.html", "Seed cart", k, dy)
    gsize = 27 if w >= 380 else 23
    hero = (f'<section aria-label="Your loft" style="position: relative; height: {hero_h}px; overflow: hidden">{svg}{hits}'
            f'<div style="position: absolute; left: 16px; right: 16px; top: 12px; display: flex; align-items: center; justify-content: space-between">'
            f'<div style="font-family: {FONT_D}; font-size: 26px; line-height: 1; color: {ink}">Coo</div>'
            f'<div style="display: flex; align-items: center; gap: 8px">'
            f'<a href="More.dc.html" aria-label="Post office menu" style="width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; background: {CARD}; border: 2.5px solid {INK}; border-radius: 50%; box-shadow: 0 3px 0 {INK}">{icon("menu", 20, 2.6)}</a>'
            f'<a href="Shop.dc.html" aria-label="{seeds} seeds. Open the seed store" style="min-height: 44px; box-sizing: border-box; display: flex; align-items: center; gap: 6px; padding: 0 14px 0 10px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 999px; box-shadow: 0 3px 0 {INK}; text-decoration: none; font-weight: 900; font-size: 16px">{seed(18)}{seeds}</a>'
            f'</div></div>'
            f'<h1 style="position: absolute; left: 16px; top: 66px; margin: 0; max-width: {250 if w >= 380 else 220}px; font-family: {FONT_D}; font-weight: 400; font-size: {gsize}px; line-height: 1.12; color: {ink}">{greeting}</h1>'
            f'</section>')
    lst = (f'<div style="{COL} gap: 6px; padding: 8px 16px 0 16px">'
           f'<div style="display: flex; align-items: baseline; justify-content: space-between"><h2 style="margin: 0; font-size: 17px; font-weight: 900">Your flock</h2>'
           f'<a href="Shop.dc.html" style="min-height: 44px; margin: -12px 0; display: flex; align-items: center; font-size: 13px; font-weight: 900">{perch_link}</a></div>'
           f'<div style="{COL} gap: 5px">{"".join(rows)}</div></div>')
    return page(title, hero + lst + tabbar("loft"), w=w, h=h).replace("</style>\n</helmet>", EXTRA_CSS + "\n</style>\n</helmet>")


def screens():
    pg, av = "Pigeon.dc.html", "Aviary.dc.html"
    full_items = ("birdbath", "cart", "planters", "vane")
    return {
        "LoftStart": loft_screen("Loft: day one", "Morning. One bird home, one out.", 60, 3, [G, ("away", "brenda"), "egg"], (),
                                 [flock_row("gerald"), flock_row("brenda-out"), egg_row("An egg", "Hatches after 5 more deliveries")], "2 of 3 perches",
                                 [("Gerald, home", pg), ("Brenda, out flying", "Flight.dc.html"), ("An egg. Hatches after 5 more deliveries", av)]),
        "LoftMid": loft_screen("Loft: second floor", "Afternoon. Three birds home.", 240, 4, [G, B, K, "ready"], ("birdbath",),
                               [flock_row("gerald"), flock_row("brenda"), flock_row("kevin"), egg_row("An egg is ready", "Somebody wants out", "Hatch")], "4 of 5 perches",
                               [("Gerald, home", pg), ("Brenda, home", pg), ("Kevin, napping", pg), ("An egg is ready to hatch", av)]),
        "LoftFull": loft_screen("Loft: full house", "Afternoon. Five birds home.", 1310, 5, [G, B, K, A, P], full_items,
                                [flock_row(k) for k in ("gerald", "brenda", "kevin", "admiral", "fantail")], "5 of 5 perches",
                                [("Gerald, home", pg), ("Brenda, home", pg), ("Kevin, napping", pg), ("Admiral Crumbs, hungry", pg), ("Pretzel, home", pg)]),
        "LoftSunset": loft_screen("Loft at sunset", "Evening. Five birds home.", 1310, 5, [G, B, K, A, P], full_items,
                                  [flock_row(k) for k in ("gerald", "brenda", "kevin", "admiral", "fantail")], "5 of 5 perches",
                                  [("Gerald, home", pg), ("Brenda, home", pg), ("Kevin, napping", pg), ("Admiral Crumbs, hungry", pg), ("Pretzel, home", pg)], time="sunset"),
        "LoftNight": loft_screen("Loft at night", "Night. Five birds asleep.", 1310, 5, [G, B, K, A, P], full_items,
                                 [flock_row(k, True) for k in ("gerald", "brenda", "kevin", "admiral", "fantail")], "5 of 5 perches",
                                 [(n + ", asleep", pg) for n in ("Gerald", "Brenda", "Kevin", "Admiral Crumbs", "Pretzel")], time="night"),
        "LoftSmall": loft_screen("Loft at 320 pt", "Afternoon. Three birds home.", 240, 4, [G, B, K, "ready"], ("birdbath",),
                                 [flock_row("gerald"), flock_row("brenda"), flock_row("kevin"), egg_row("An egg is ready", "Somebody wants out", "Hatch")], "4 of 5 perches",
                                 [("Gerald, home", pg), ("Brenda, home", pg), ("Kevin, napping", pg), ("An egg is ready to hatch", av)], w=320, h=760),
    }


# ------------------------------------------------------------------ the spec sheet
def bay_tile(state, bird=None, label="", sub=""):
    x, y = 0, 0
    st = state if state != "away" else ("away", ALL["brenda"]["wing"])
    o = f'<rect x="{x}" y="{y}" width="{BAY_W}" height="{BAY_H}" fill="{SUN}" {ST}/>' + "".join(f'<path d="M2 {k} H{BAY_W - 2}" stroke="{SUN_D}" stroke-width="1.5"/>' for k in (20, 40, 60))
    o += _bay(x, y, st if state != "bird" else "bird").replace("§hole§", NIGHT).replace("§holehi§", mix(NIGHT, CARD, .35)).replace("§halo§", CARD).replace("§haloa§", "0")
    if bird:
        vb, inner = pose(bird[0], bird[1], 3, bird[2], anim=True)
        vx, vy, vw, vh = [float(n) for n in vb.split()]
        k = 70 / vw
        o += f'<svg x="{(BAY_W - 70) / 2 + 3:.1f}" y="{68 - (104 - vy) * k:.1f}" width="70" height="{vh * k:.1f}" viewBox="{vb}" overflow="visible">{inner}</svg>'
    svg = f'<svg width="141" height="160" viewBox="-10 -14 94 106" role="img" aria-label="{esc(label)}" style="display: block">{o}</svg>'
    return (f'<div style="{COL} align-items: center; gap: 6px; width: 160px"><div style="background: {SKY}; border: 2.5px solid {INK}; border-radius: 16px; padding: 4px 6px 0 6px">{svg}</div>'
            f'<div style="font-weight: 900; font-size: 15px; text-align: center">{esc(label)}</div><div style="font-weight: 700; font-size: 13px; line-height: 1.3; color: {MUTED}; text-align: center">{esc(sub)}</div></div>')


def spec():
    from sheets import sheet
    k = 1.5
    full = [G, B, K, A, P]
    items = ("birdbath", "cart", "planters", "vane")
    g = roof_geom(5)
    zones = [  # number, x, y, w, h (scene units), title, text
        (1, 6, 6, 378, 118, "Top bar and greeting", "Sky and clouds only. This band is always 128 pt tall and never scales, so the words never touch the art."),
        (2, 6, 146, 378, 72, "String lights", "Free decor. One garland, edge to edge, always in the same place: in front of the skyline, behind the house. Unlit by day, glowing from sunset to sunrise. A bulb the roof would cut in half is simply not drawn."),
        (3, CX - 26, g["peak"] - 32, 52, 34, "Roof peak", "Weathervane. Moves up with the roof when a floor is added."),
        (4, CX - 115, FLOOR - 164, 230, 164, "Rooms", "One room per perch. Three to a floor, filled bottom-left first, in the same order as the flock list. The second floor is two rooms wide and centred."),
        (5, LEFT_SLOT_X - 32, FLOOR - 64, 64, 64, "Left of the house", "Rooftop birdbath. 60 pt wide slot, standing on the deck line."),
        (6, RIGHT_SLOT_X - 32, FLOOR - 72, 64, 72, "Right of the house", "Seed cart. Same slot size, mirrored."),
        (7, 6, FLOOR + 1, 378, 28, "The wall", "Flower boxes hang under each deck slot. Nothing here rises above the deck line."),
    ]
    over = ""
    for n, x, y, w, h, *_ in zones:
        over += (f'<div aria-hidden="true" style="position: absolute; left: {x * k:.0f}px; top: {y * k:.0f}px; width: {w * k:.0f}px; height: {h * k:.0f}px; box-sizing: border-box; border: 2.5px dashed {STAMP}; border-radius: 10px"></div>'
                 f'<div aria-hidden="true" style="position: absolute; left: {x * k - 11:.0f}px; top: {y * k - 11:.0f}px; width: 26px; height: 26px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {SUN}; border: 2px solid {INK}; border-radius: 50%; font-weight: 900; font-size: 14px">{n}</div>')
    legend = "".join(
        f'<div style="display: flex; gap: 12px; align-items: flex-start"><div style="flex-shrink: 0; width: 28px; height: 28px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {SUN}; border: 2px solid {INK}; border-radius: 50%; font-weight: 900; font-size: 14px">{n}</div>'
        f'<div style="{COL} gap: 1px"><div style="font-weight: 900; font-size: 16px">{esc(t)}</div><div style="font-weight: 700; font-size: 14px; line-height: 1.35; color: {MUTED}">{esc(d)}</div></div></div>'
        for n, x, y, w, h, t, d in zones)
    legend += (f'<div style="margin-top: 4px; padding: 12px 14px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px; font-weight: 700; font-size: 14px; line-height: 1.4">'
               f'<b style="font-weight: 900">Behind everything: the city, at three depths.</b> Far: pale haze, shapes only. Middle: sky-tinted towers with window grids. '
               f'Near: the neighbours across the street, in colour with thin outlines, about as tall as the loft. No neighbour rises above the lights, their windows stop 70 pt above the deck, '
               f'and none is cut by the house wall.</div>')
    slot_map = (f'<div style="display: flex; gap: 36px; align-items: flex-start"><div style="position: relative; flex-shrink: 0; width: {W * k:.0f}px; height: {HERO_H * k:.0f}px; border: 2.5px solid {INK}; border-radius: 18px; overflow: hidden">'
                f'{scene(5, full, items, scale=k, label="The full loft with its seven zones marked")}{over}</div><div style="{COL} gap: 14px; padding-top: 4px">{legend}</div></div>')

    steps = [
        ("Day one", "Three rooms under one roof. Two birds and the first egg.", 3, [G, B, "egg"], ()),
        ("Rooftop birdbath · 220 seeds", "Lands in the left slot. The house does not move.", 3, [G, B, "egg"], ("birdbath",)),
        ("Perch 4 · 250 seeds", "A second floor goes up. Its spare room hangs a sign.", 4, [G, B, K, None], ("birdbath",)),
        ("Perch 5 · 400 seeds", "The spare room opens. The roof stays put.", 5, [G, B, K, A, None], ("birdbath",)),
        ("Seed cart and flower boxes", "New add-ons, prices to set. Right slot, and along the wall.", 5, [G, B, K, A, P], ("birdbath", "cart", "planters")),
        ("Weathervane", "New add-on, price to set. On the roof peak.", 5, [G, B, K, A, P], items),
    ]
    sk = 384 / W
    grow = '<div style="display: grid; grid-template-columns: repeat(3, 384px); gap: 16px">' + "".join(
        f'<div style="{COL} gap: 8px"><div style="border: 2.5px solid {INK}; border-radius: 16px; overflow: hidden">{scene(p, b, it, y0=126, h=HERO_H - 126, scale=sk, label=t)}</div>'
        f'<div style="{COL} gap: 1px; padding: 0 4px"><div style="font-weight: 900; font-size: 16px"><span style="color: {STAMP}">{i + 1}.</span> {esc(t)}</div><div style="font-weight: 700; font-size: 14px; line-height: 1.35; color: {MUTED}">{esc(d)}</div></div></div>'
        for i, (t, d, p, b, it) in enumerate(steps)) + '</div>'

    times = [
        ("Sunrise", "Sun up to 6 degrees high, morning. Birds wake. Lights go off.", "sunrise"),
        ("Day", "Sun above 6 degrees. Lights off. A few windows lit.", "day"),
        ("Sunset", "Sun under 6 degrees, evening. Lights come on. Windows start to light.", "sunset"),
        ("Dusk and dawn", "Sun just below the horizon. Birds sleep, doorways glow, first stars.", "dusk"),
        ("Night", "Sun 6 degrees under. Moon, stars, a lit city. Everyone asleep.", "night"),
    ]
    cyc = '<div style="display: grid; grid-template-columns: repeat(3, 384px); gap: 16px">' + "".join(
        f'<div style="{COL} gap: 8px"><div style="border: 2.5px solid {INK}; border-radius: 16px; overflow: hidden">{scene(5, full, items, y0=56, h=HERO_H - 56, scale=sk, label=t, time=tm)}</div>'
        f'<div style="{COL} gap: 1px; padding: 0 4px"><div style="font-weight: 900; font-size: 16px">{esc(t)}</div><div style="font-weight: 700; font-size: 14px; line-height: 1.35; color: {MUTED}">{esc(d)}</div></div></div>'
        for t, d, tm in times)
    cyc += (f'<div style="{COL} gap: 8px; align-self: start; padding: 16px 18px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px; font-weight: 700; font-size: 14px; line-height: 1.45">'
            f'<div style="font-weight: 900; font-size: 16px">What drives it</div>'
            f'<div>The real sun at your loft, from the same sun maths the flights use. No clock settings, no time zones to get wrong.</div>'
            f'<div><b style="font-weight: 900">Birds sleep when the sun is down</b>, the same moment a bird in the air has to roost. They wake at sunrise.</div>'
            f'<div><b style="font-weight: 900">Lights</b> are on from sunset to sunrise. Bulbs glow and twinkle. By day they hang unlit.</div>'
            f'<div><b style="font-weight: 900">Only colour changes.</b> Nothing moves between times of day. Each piece is the day drawing, tinted; lit windows, bulbs, doorways, moon and stars are left untinted. Outlines stay ink.</div>'
            f'<div><b style="font-weight: 900">Words on the sky</b> switch to cream at dusk and night.</div>'
            f'<div>When the time of day changes with the app open, cross-fade over two seconds.</div></div>')
    cyc += '</div>'

    tiles = (bay_tile("bird", G, "Home", "Idles, blinks, looks around") + bay_tile("bird", K, "Asleep", "Tired, or the sun is down") + bay_tile("away", None, "Out", "Leaves a feather in its colour")
             + bay_tile("egg", None, "Egg", "In a nest until it is due") + bay_tile("ready", None, "Egg ready", "Wobbles. Tap to hatch") + bay_tile("roommate", None, "Roommate", "Bag on the perch. Tap to meet") + bay_tile("tolet", None, "To let", "Built, not bought"))
    rooms = f'<div style="display: flex; gap: 10px; justify-content: space-between">{tiles}</div>'

    rules = [
        ("One ground line", "Everything stands on the deck or on a perch. Nothing overlaps anything it is not standing on."),
        ("The house is the backdrop", "Birds sit against flat yellow, never against windows, so the city behind can be as lively as we like."),
        ("Fixed slots", "Each add-on has exactly one place. Buying one never moves another, so every combination is already composed."),
        ("Grows by floors", "Three rooms to a floor, newest floor on top, top floor centred. A sixth perch would start a third floor; add 80 pt of sky for it."),
        ("Scales with the screen", "From 320 to 430 pt wide the art scales as one picture. The 128 pt sky band on top stays as it is."),
        ("The scene is live", "Each room shows what its bird is doing. Tap a room for that bird, the birdbath or cart for the store."),
    ]
    rule_html = '<div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px">' + "".join(
        f'<div style="{COL} gap: 4px; padding: 14px 16px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px"><div style="font-weight: 900; font-size: 16px">{esc(t)}</div>'
        f'<div style="font-weight: 700; font-size: 14px; line-height: 1.4; color: {MUTED}">{esc(d)}</div></div>' for t, d in rules) + '</div>'

    html, h = sheet("The loft scene", "One house that grows a floor at a time. Every bird has a room and every add-on has one fixed place, so the scene looks composed with any mix of birds and purchases.",
                    [("Where everything goes", "Seven zones. Positions are fixed numbers, not judgement calls.", slot_map, round(HERO_H * k) + 6),
                     ("How it grows", "The same six purchases in order. Each one fills its own place and nothing else shifts.", grow, 2 * (round((HERO_H - 126) * sk) + 5 + 8 + 44) + 16),
                     ("Day and night", "Five looks, picked by how high the sun is where you live. Sunrise and sunset last about half an hour each.", cyc, 2 * (round((HERO_H - 56) * sk) + 5 + 8 + 44) + 44),
                     ("What a room can show", "The scene is a picture of the flock's state, in list order.", rooms, 226),
                     ("Rules", "", rule_html, 232)])
    return html.replace("</style>\n</helmet>", EXTRA_CSS + "\n</style>\n</helmet>"), h


if __name__ == "__main__":
    import json, os, sys
    out = sys.argv[1] if len(sys.argv) > 1 else "loft-out"   # usage: python3 loft.py [output folder]
    os.makedirs(out, exist_ok=True)
    for name, html in screens().items():
        open(f"{out}/{name}.dc.html", "w").write(html)
        print(name, len(html))
    html, h = spec()
    open(f"{out}/LoftSpec.dc.html", "w").write(html)
    print("LoftSpec", len(html), h)
    json.dump({"spec_h": h}, open(f"{out}/loft-meta.json", "w"))
