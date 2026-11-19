"""Phone screens (390 x 844) for the Coo canvas."""
import json
from lib import *
from rig import *

FONTS = "https://fonts.googleapis.com/css2?family=Bagel+Fat+One&family=Caveat:wght@600;700&family=Nunito:wght@600;700;800;900&display=swap"


def H(k):
    return "{{ " + k + " }}"


def page(title, body, bg=PAPER, root="", js="return {};", w=390, h=844):
    return f'''<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>{esc(title)}</title>
<script src="./support.js"></script>
</head>
<body>
<x-dc>
<helmet>
<link href="{FONTS}" rel="stylesheet">
<style>
body{{margin:0}}
a{{color:#2A2140}}a:hover{{color:#2A2140}}
a:focus-visible,button:focus-visible,input:focus-visible{{outline:3px solid #F4623F;outline-offset:2px}}
{MOTION_CSS}
</style>
</helmet>
<div style="width: {w}px; height: {h}px; box-sizing: border-box; position: relative; overflow: hidden; background: {bg}; font-family: {FONT_B}; color: {INK}; {root}">
{body}
</div>
</x-dc>
<script type="text/x-dc" data-dc-script data-props='{{"$preview":{{"width":{w},"height":{h}}}}}'>
class Component extends DCLogic {{
renderVals() {{
{js}
}}
}}
</script>
</body>
</html>
'''


def fields_js(fields=None, toggles=None):
    lines = ["var s = this.state || {}; var self = this; var out = {};"]
    for k, v in (fields or {}).items():
        lines.append(f"out.{k} = s.{k} === undefined ? {json.dumps(v)} : s.{k};")
        lines.append(f"out.set_{k} = function (e) {{ var n = {{}}; n.{k} = e.target.value; self.setState(n); }};")
    for k, v in (toggles or {}).items():
        lines.append(f"(function () {{ var on = s.{k} === undefined ? {json.dumps(v)} : s.{k}; out.{k} = on; out.{k}_bg = on ? '{MINT}' : '{SAND}'; out.{k}_x = on ? 'translateX(22px)' : 'translateX(0px)'; out.{k}_tap = function () {{ var n = {{}}; n.{k} = !on; self.setState(n); }}; }})();")
    lines.append("return out;")
    return "\n".join(lines)


COL = "display: flex; flex-direction: column;"
BTN_RESET = f"font-family: inherit; color: {INK}; cursor: pointer;"


def back(href, label):
    return (f'<a href="{href}" aria-label="{esc(label)}" style="width: 44px; height: 44px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {CARD}; '
            f'border: 2.5px solid {INK}; border-radius: 50%; box-shadow: 0 3px 0 {INK}">{icon("back", 20, 2.8)}</a>')


def hdr(title, href, label="Back", right="", size=28):
    return (f'<header style="display: flex; align-items: center; gap: 12px">{back(href, label)}'
            f'<h1 style="flex: 1; margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: {size}px; line-height: 1">{esc(title)}</h1>{right}</header>')


def chip(text, bg=SUN, size=12, extra=""):
    return f'<div style="flex-shrink: 0; padding: 4px 10px; background: {bg}; border: 2px solid {INK}; border-radius: 999px; font-size: {size}px; font-weight: 900;{extra}">{esc(text)}</div>'


def pill_link(text, href):
    return (f'<a href="{href}" style="min-height: 44px; box-sizing: border-box; display: flex; align-items: center; padding: 0 14px; background: {CARD}; border: 2.5px solid {INK}; '
            f'border-radius: 999px; text-decoration: none; font-weight: 900; font-size: 14px">{esc(text)}</a>')


def sec(title, right=None):
    r = f'<div style="font-size: 13px; font-weight: 800; color: {MUTED}">{esc(right)}</div>' if right else ""
    return f'<div style="display: flex; align-items: baseline; justify-content: space-between; gap: 8px"><h2 style="margin: 0; font-weight: 900; font-size: 15px">{esc(title)}</h2>{r}</div>'


def initial(letter, bg=ROSE, size=44):
    return (f'<div aria-hidden="true" style="width: {size}px; height: {size}px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; '
            f'border-radius: 50%; font-family: {FONT_D}; font-size: {size // 2}px">{esc(letter)}</div>')


def cta(text, href, bg=TOMATO, size=22, tag="a"):
    st = (f'width: 100%; min-height: 60px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 10px; padding: 0 12px; background: {bg}; border: 2.5px solid {INK}; '
          f'border-radius: 20px; box-shadow: 0 5px 0 {INK}; text-decoration: none; text-align: center; font-family: {FONT_D}; font-size: {size}px; line-height: 1.1; color: {INK}')
    if tag == "a":
        return f'<a href="{href}" style="{st}">{text}</a>'
    return f'<button type="button" style="{st}; cursor: pointer">{text}</button>'


def btn2(text, href=None, bg=CARD):
    st = (f'min-height: 50px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 14px; background: {bg}; border: 2.5px solid {INK}; '
          f'border-radius: 18px; text-decoration: none; font-weight: 900; font-size: 15px; color: {INK}')
    if href:
        return f'<a href="{href}" style="{st}">{text}</a>'
    return f'<button type="button" style="{st}; font-family: inherit; cursor: pointer">{text}</button>'


def bar(pct, label, fill=TOMATO, h=16):
    return (f'<div role="img" aria-label="{esc(label)}" style="height: {h}px; box-sizing: border-box; background: {CARD}; border: 2px solid {INK}; border-radius: 999px; overflow: hidden">'
            f'<div style="width: {pct}%; height: 100%; background: {fill}; border-right: 2px solid {INK}"></div></div>')


def muted(text, size=13, extra=""):
    return f'<div style="font-weight: 700; font-size: {size}px; color: {MUTED}; line-height: 1.3;{extra}">{text}</div>'


def bold(text, size=15, extra=""):
    return f'<div style="font-weight: 900; font-size: {size}px; line-height: 1.2;{extra}">{text}</div>'


def card(inner, bg=CARD, pad="8px 12px", radius=16, extra="", href=None, minh=58):
    st = f'display: flex; align-items: center; gap: 12px; min-height: {minh}px; box-sizing: border-box; padding: {pad}; background: {bg}; border: 2.5px solid {INK}; border-radius: {radius}px; text-decoration: none;{extra}'
    if href:
        return f'<a href="{href}" style="{st}">{inner}</a>'
    return f'<div style="{st}">{inner}</div>'


def tabbar(cur):
    def tab(key, href, label, ic):
        on = key == cur
        pill = f"background: {SUN}; border: 2px solid {INK}; border-radius: 999px;" if on else ""
        ac = ' aria-current="page"' if on else ""
        return (f'<a href="{href}"{ac} style="width: 62px; min-height: 52px; display: flex; flex-direction: column; align-items: center; gap: 2px; text-decoration: none; font-size: 11px; font-weight: {900 if on else 800}">'
                f'<span style="display: flex; align-items: center; justify-content: center; width: 46px; height: 30px; box-sizing: border-box;{pill}">{icon(ic, 22)}</span><span>{label}</span></a>')
    send = (f'<a href="Recipients.dc.html" aria-label="Send a pigeon" style="width: 64px; height: 64px; margin-top: -30px; display: flex; align-items: center; justify-content: center; background: {TOMATO}; '
            f'border: 2.5px solid {INK}; border-radius: 50%; box-shadow: 0 4px 0 {INK}; text-decoration: none"><svg width="32" height="32" viewBox="0 0 24 24" aria-hidden="true">'
            f'<path d="M3 14 C7 6 13 4 21 5 C20 9 17 12 13 13 C15 14 16 15 18 15 C14 19 7 19 3 14 Z" fill="{CARD}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
            f'<path d="M3 14 C8 12 12 10 16 8" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/></svg></a>')
    return (f'<nav aria-label="Main" style="position: absolute; left: 0; right: 0; bottom: 0; height: 84px; box-sizing: border-box; background: {PAPER}; border-top: 2.5px solid {INK}; display: flex; '
            f'align-items: flex-start; justify-content: space-around; padding: 8px 8px 0 8px">'
            + tab("loft", "Main.dc.html", "Loft", "loft") + tab("flights", "Flights.dc.html", "Flights", "map") + send
            + tab("sill", "Landed.dc.html", "Sill", "envelope") + tab("seeds", "Shop.dc.html", "Seeds", "bag") + "</nav>")


def bsvg(v, w, p="perched", gear=(), label=None, extra="", anim=None):
    return perch_svg(v, w, p, gear, label, anim, extra)


def inp(idv, label, hole, placeholder="", hand=False, itype="text"):
    font = f"font-family: {FONT_H}; font-weight: 700; font-size: 26px;" if hand else "font-family: inherit; font-weight: 800; font-size: 16px;"
    return (f'<div style="{COL} gap: 6px"><label for="{idv}" style="font-weight: 900; font-size: 15px">{esc(label)}</label>'
            f'<input id="{idv}" type="{itype}" autocomplete="off" placeholder="{esc(placeholder)}" value="{H(hole)}" onChange="{H("set_" + hole)}" style="height: 52px; box-sizing: border-box; padding: 0 14px; '
            f'background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px; {font} color: {INK}"></div>')


PAD = f"{COL} padding: 16px; gap: 12px;"
PADTAB = f"{COL} padding: 16px 16px 0 16px; gap: 12px;"
S = {}


# ------------------------------------------------------------------ More
def more():
    items = [("Friends.dc.html", "users", SKY, "Friends", "4 friends, 1 invite out"),
             ("Shoebox.dc.html", "box", PEACH, "Shoebox", "23 notes saved"),
             ("Collections.dc.html", "stamp", LILAC, "Collection", "4 postmarks, 2 badges"),
             ("Aviary.dc.html", "egg", SUN, "Aviary", "Egg hatches in 6 deliveries"),
             ("Earn.dc.html", "seed", MINT, "Earn seeds", "Punch card at 6 of 10"),
             ("Settings.dc.html", "settings", SAND, "Settings", "Quiet hours are on")]
    tiles = "".join(
        f'<a href="{h}" style="{COL} gap: 6px; min-height: 126px; box-sizing: border-box; padding: 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 18px; box-shadow: 0 4px 0 {INK}; text-decoration: none">'
        f'<span style="width: 46px; height: 46px; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; border-radius: 12px">{icon(ic, 26)}</span>'
        f'{bold(t, 17)}{muted(s, 12.5)}</a>' for h, ic, bg, t, s in items)
    body = (hdr("Post office", "Main.dc.html", "Back to the loft") +
            f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px">{tiles}</div>' + tabbar("loft"))
    return page("Post office menu", body, root=PADTAB)


# ------------------------------------------------------------------ Recipients
def recipients():
    row = (f'<button type="button" onClick="{H("p.tap")}" aria-pressed="{H("p.on")}" style="display: flex; align-items: center; gap: 10px; width: 100%; min-height: 56px; box-sizing: border-box; padding: 5px 10px 5px 8px; '
           f'background: {H("p.rowBg")}; border: 2.5px solid {INK}; border-radius: 16px; text-align: left; {BTN_RESET}">'
           f'<span style="width: 26px; height: 26px; flex-shrink: 0; box-sizing: border-box; display: flex; align-items: center; justify-content: center; background: {H("p.boxBg")}; border: 2.5px solid {INK}; border-radius: 8px">'
           f'<svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true" opacity="{H("p.tick")}"><path d="M5 12.5 L10 17.5 L19 7" fill="none" stroke="{CARD}" stroke-width="3.6" stroke-linecap="round" stroke-linejoin="round"/></svg></span>'
           f'<span aria-hidden="true" style="width: 40px; height: 40px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {H("p.color")}; border: 2px solid {INK}; border-radius: 50%; font-family: {FONT_D}; font-size: 20px">{H("p.letter")}</span>'
           f'<span style="flex: 1; {COL}"><span style="font-weight: 900; font-size: 15.5px">{H("p.name")}</span><span style="font-weight: 700; font-size: 12.5px; line-height: 1.25">{H("p.sub")}</span></span>'
           f'<sc-if value="{H("p.tag")}" hint-placeholder-val="{H("false")}"><span style="flex-shrink: 0; padding: 3px 9px; background: {CARD}; border: 2px solid {INK}; border-radius: 999px; font-size: 11.5px; font-weight: 900">{H("p.tag")}</span></sc-if>'
           f'</button>')

    def lst(name, n):
        return f'<div style="{COL} gap: 6px"><sc-for list="{H(name)}" as="p" hint-placeholder-count="{n}">{row}</sc-for></div>'

    body = (hdr("Who's it for?", "Main.dc.html", "Back to the loft") +
            f'<div style="display: flex; align-items: center; gap: 8px; height: 48px; box-sizing: border-box; padding: 0 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px">{icon("search", 20)}'
            f'<input id="who" type="text" autocomplete="off" aria-label="Search friends and contacts" placeholder="Search friends and contacts" value="{H("q")}" onChange="{H("setQ")}" style="flex: 1; min-width: 0; height: 40px; border: none; background: transparent; font-family: inherit; font-weight: 800; font-size: 15px; color: {INK}"></div>'
            + f'<section style="{COL} gap: 6px">{sec("A bird of theirs is on your sill")}{lst("sill", 1)}</section>'
            + f'<section style="{COL} gap: 6px">{sec("Friends", "Flight time from your loft")}{lst("friends", 3)}</section>'
            + f'<section style="{COL} gap: 6px">{sec("From your contacts", "Goes by text link")}{lst("contacts", 2)}</section>'
            + f'<a href="NewRecipient.dc.html" style="min-height: 48px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; gap: 8px; border: 2.5px dashed {INK}; border-radius: 16px; text-decoration: none; font-weight: 900; font-size: 15px">{icon("plus", 20, 2.8)}<span>Someone new</span></a>'
            + f'<div style="margin-top: auto; display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 14px; background: {SKY}; border: 2.5px solid {INK}; border-radius: 18px; box-shadow: 0 4px 0 {INK}">'
            f'<div style="flex: 1; font-weight: 900; font-size: 14px; line-height: 1.25">{H("summary")}</div>'
            f'<a href="{H("nextHref")}" style="min-height: 46px; box-sizing: border-box; display: flex; align-items: center; padding: 0 18px; background: {TOMATO}; border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}; text-decoration: none; font-family: {FONT_D}; font-size: 18px">Next</a></div>')
    js = f'''var s = this.state || {{}}; var self = this;
var picked = s.picked || {{ theo: true }};
var q = (s.q || "").toLowerCase();
var ready = 2;
function mk(p) {{
var on = !!picked[p.id];
return {{ name: p.name, sub: p.sub, letter: p.name.charAt(0), color: p.color, tag: p.tag || "", on: on,
boxBg: on ? "{INK}" : "{CARD}", tick: on ? 1 : 0, rowBg: on ? "{SUN}" : "{CARD}",
tap: function () {{ var n = {{}}; for (var k in picked) {{ n[k] = picked[k]; }} n[p.id] = !on; self.setState({{ picked: n }}); }} }};
}}
function keep(p) {{ return !q || p.name.toLowerCase().indexOf(q) >= 0; }}
var sill = [{{ id: "priya", name: "Priya", sub: "Dumpling is waiting. A reply rides home free.", color: "{ROSE}", tag: "Free ride" }}];
var friends = [
{{ id: "theo", name: "Theo", sub: "Boston, 190 mi. About 4h 13m.", color: "{SKY}" }},
{{ id: "rosa", name: "Rosa", sub: "3 blocks over. About 30 seconds.", color: "{MINT}" }},
{{ id: "dev", name: "Dev", sub: "Chicago, 713 mi. Two days, one barn.", color: "{LILAC}" }}
];
var contacts = [
{{ id: "maya", name: "Maya Okafor", sub: "Not on Coo yet. Add where the bird should fly.", color: "{PEACH}", tag: "By link" }},
{{ id: "jordan", name: "Jordan Bell", sub: "Not on Coo yet.", color: "{SAND}", tag: "By link" }}
];
var n = 0; for (var k in picked) {{ if (picked[k]) {{ n += 1; }} }}
var summary = n === 0 ? "Pick who gets a note." : (n > ready ? n + " picked, but only " + ready + " birds are rested. Unpick " + (n - ready) + "." : n + " picked. That takes " + n + (n === 1 ? " bird" : " birds") + ", and " + ready + " are ready.");
return {{ q: s.q || "", setQ: function (e) {{ self.setState({{ q: e.target.value }}); }}, sill: sill.filter(keep).map(mk), friends: friends.filter(keep).map(mk), contacts: contacts.filter(keep).map(mk), summary: summary, nextHref: (n === 1 && picked.priya) ? "Reply.dc.html" : "Compose.dc.html" }};'''
    return page("Pick who gets the note", body, root=PAD, js=js)


# ------------------------------------------------------------------ New recipient
def new_recipient():
    def sug(text, sub, on=False):
        right = f'<span style="width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; background: {INK}; border-radius: 50%">{icon("check", 16, 3.4, CARD)}</span>' if on else ""
        return (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="display: flex; align-items: center; gap: 10px; width: 100%; min-height: 46px; padding: 4px 10px; background: {SUN if on else CARD}; '
                f'border: 2px solid {INK}; border-radius: 12px; text-align: left; {BTN_RESET}">{icon("pin", 20)}<span style="flex: 1; {COL}"><span style="font-weight: 900; font-size: 14px">{text}</span>'
                f'<span style="font-weight: 700; font-size: 12px">{sub}</span></span>{right}</button>')

    def step(n, text):
        return (f'<li style="display: flex; align-items: center; gap: 10px"><span aria-hidden="true" style="width: 26px; height: 26px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {SUN}; '
                f'border: 2px solid {INK}; border-radius: 50%; font-family: {FONT_D}; font-size: 14px">{n}</span><span style="font-weight: 800; font-size: 13.5px; line-height: 1.25">{text}</span></li>')

    mini = (f'<svg width="358" height="104" viewBox="20 150 358 104" role="img" aria-label="Map preview with a roost pin in Fishtown" style="display: block; border: 2.5px solid {INK}; border-radius: 16px; box-sizing: border-box">'
            f'{map_block("coo-new", route=False, pins=False)}{_pin_sill_label()}</svg>')
    body = (hdr("Someone new", "Recipients.dc.html", "Back to the list") + inp("r-name", "Their name", "name")
            + f'<div style="{COL} gap: 6px">' + inp("r-place", "Where should the bird fly?", "place")
            + sug("Fishtown, Philadelphia", "A neighborhood is plenty", True) + sug("Philadelphia, PA", "Anywhere in the city") + sug("Use a street address", "Shown to nobody. Rounded to the nearest roost.") + "</div>"
            + mini
            + f'<section style="{COL} gap: 6px">{sec("How Maya gets it")}<ol style="margin: 0; padding: 0; list-style: none; {COL} gap: 6px">'
            + step(1, "You write the note and release a bird, same as always.") + step(2, "We hand you a private link to text her.") + step(3, "She watches the flight. The note opens when the bird lands.") + "</ol></section>"
            + f'<div style="margin-top: auto">{cta("Next: write the note", "Compose.dc.html", size=21)}</div>')
    return page("Send to someone new", body, root=PAD, js=fields_js({"name": "Maya", "place": "Fishtown, Philadelphia"}))


def _pin_sill_label():
    from lib import _pin_sill
    return _pin_sill(200, 196, "Fishtown roost", 220, 186, 104)


# ------------------------------------------------------------------ Takeoff
def takeoff(v="gerald", gear=("goggles",), chip_text="Released 9:32 am", title="And he's off", text="Gerald has your note for Priya. He should land around 11:20 am.",
            btn="Watch the flight", href="Flight.dc.html", label="Gerald launching off the ledge with your note", page_title="Takeoff"):
    sky = (f'<svg viewBox="0 0 390 844" width="390" height="844" aria-hidden="true" style="position: absolute; left: 0; top: 0">'
           f'<g fill="#8CCDEE"><rect x="0" y="560" width="60" height="160"/><rect x="70" y="600" width="50" height="120"/><rect x="230" y="540" width="54" height="180"/><rect x="292" y="590" width="98" height="130"/></g>'
           f'<rect x="-6" y="700" width="402" height="150" fill="{BRICK}" stroke="{INK}" stroke-width="2.5"/>'
           f'<path d="M-6 724 H396 M-6 748 H396 M40 700 V724 M130 700 V724 M220 700 V724 M310 700 V724 M84 724 V748 M174 724 V748 M264 724 V748 M354 724 V748" stroke="{INK}" stroke-width="1.6" opacity=".4" fill="none"/></svg>')
    clouds = (illo("cloud", 86, None, " position: absolute; left: 24px; top: 250px; animation: coo-drift 7s ease-in-out infinite alternate;")
              + illo("cloud", 64, None, " position: absolute; left: 270px; top: 330px; animation: coo-drift 9s ease-in-out infinite alternate-reverse;")
              + illo("cloud", 54, None, " position: absolute; left: 150px; top: 430px; animation: coo-drift 8s ease-in-out infinite alternate;"))
    puffs = (illo("puff", 54, None, " position: absolute; left: 40px; top: 668px; transform-origin: 50% 100%; opacity: 0; animation: coo-puff 3s ease-out infinite;")
             + illo("puff", 44, None, " position: absolute; left: 150px; top: 674px; transform-origin: 50% 100%; opacity: 0; animation: coo-puff 3s ease-out .08s infinite;")
             + illo("puff", 34, None, " position: absolute; left: 100px; top: 682px; transform-origin: 50% 100%; opacity: 0; animation: coo-puff 3s ease-out .16s infinite;"))
    feathers = (illo("feather", 18, None, " position: absolute; left: 150px; top: 540px; opacity: 0; animation: coo-feather 3s ease-in-out infinite;")
                + illo("feather", 13, None, " position: absolute; left: 96px; top: 560px; opacity: 0; animation: coo-feather 3s ease-in-out .25s infinite;"))
    # bird: 160 wide; feet sit at (101 + 22) / 132 of the svg height
    hh = round(160 * 132 / 140)
    top = 700 - round(hh * 123 / 132)
    hero = takeoff_html(v, gear, 160, label, f"position: absolute; left: 50px; top: {top}px;")
    textb = (f'<div style="position: relative; {COL} gap: 8px; padding: 36px 20px 0 20px">'
             f'<div style="align-self: flex-start">{chip(chip_text, CARD, 13)}</div>'
             f'<h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 52px; line-height: .98">{esc(title)}</h1>'
             f'<p style="margin: 0; font-weight: 800; font-size: 16px; line-height: 1.35">{esc(text)}</p></div>')
    foot = (f'<div style="position: absolute; left: 16px; right: 16px; bottom: 18px; {COL} align-items: center; gap: 8px">{cta(btn, href, SUN)}'
            f'<div style="font-weight: 800; font-size: 12.5px">The tracker opens by itself after a second.</div></div>')
    return page(page_title, sky + clouds + puffs + feathers + hero + textb + foot, bg=SKY)


def takeoff_home():
    return takeoff("dumpling", (), "Released 11:32 am", "Homeward bound", "Dumpling has your reply for Priya. She should land around 1:25 pm.", "Watch her go", "Flights.dc.html",
                   "Dumpling launching off your sill with the reply", "Takeoff, their bird heading home")


# ------------------------------------------------------------------ Reply (send their bird home)
def reply():
    top = (f'<section style="display: flex; align-items: center; gap: 6px; padding: 8px 14px 8px 4px; background: {SKY}; border: 2.5px solid {INK}; border-radius: 18px; box-shadow: 0 4px 0 {INK}">'
           + bsvg("dumpling", 112, "landed", (), "Dumpling waiting on your sill", "", True)
           + f'<div style="flex: 1; {COL} gap: 4px">{bold("Dumpling flies home to Priya", 16)}<div style="font-weight: 700; font-size: 13px; line-height: 1.3">Philadelphia, 81 miles. About 1h 53m at her pace.</div>'
           f'<div style="display: flex; gap: 6px; padding-top: 2px">{chip("Free ride", MINT)}{chip("43 mph", CARD)}</div></div></section>')
    quote = (f'<section style="{COL} gap: 2px; padding: 8px 12px; background: {CARD}; border: 2px dashed {INK}; border-radius: 6px">'
             f'<div style="font-weight: 900; font-size: 11.5px; letter-spacing: 1px; color: {MUTED}">PRIYA WROTE</div>'
             f'<div style="font-family: {FONT_H}; font-weight: 700; font-size: 20px; line-height: 1.15">Saturday works. Bring the bread. Dumpling ate half my sandwich on the way out, so this note may smell like tuna.</div></section>')
    paper = (f'<section style="{COL} gap: 6px"><label for="reply-note" style="font-weight: 900; font-size: 15px">Your reply</label>'
             f'<div style="{COL} background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}; transform: rotate(0.7deg); padding: 10px 14px 8px 14px">'
             f'<textarea id="reply-note" value="{H("note")}" onChange="{H("setNote")}" style="width: 100%; height: 136px; box-sizing: border-box; padding: 0; border: none; outline-offset: 4px; resize: none; '
             f'background: repeating-linear-gradient(to bottom, transparent 0, transparent 32px, #D9D3E6 32px, #D9D3E6 34px); font-family: {FONT_H}; font-weight: 700; font-size: 27px; line-height: 34px; color: {INK}"></textarea>'
             f'<div style="display: flex; justify-content: space-between; padding-top: 6px; font-size: 12.5px; font-weight: 800; color: {MUTED}"><span><span style="font-variant-numeric: tabular-nums">{H("count")}</span> of 140 characters</span><span>Same leg, same rules</span></div></div></section>')
    wait = f'<div style="display: flex; align-items: center; gap: 10px">{icon("clock", 22)}<span style="font-weight: 800; font-size: 13.5px; line-height: 1.3">She waits 28 more minutes, then heads home with or without a reply.</span></div>'
    foot = (f'<div style="margin-top: auto; {COL} align-items: center; gap: 2px">{cta("Send Dumpling home", "TakeoffHome.dc.html")}'
            f'<a href="Compose.dc.html" style="min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 14.5px">Send one of my own birds instead</a></div>')
    js = ('var s = this.state || {}; var self = this;\nvar note = s.note === undefined ? "Bread is secured. Tell Dumpling the tuna was not for her." : s.note;\n'
          'return { note: note, count: note.length, setNote: function (e) { self.setState({ note: e.target.value.slice(0, 140) }); } };')
    return page("Reply: send their bird home", hdr("Reply to Priya", "Landed.dc.html", "Back to the note") + top + quote + paper + wait + foot, root=f"{COL} padding: 16px 16px 10px 16px; gap: 12px;", js=js)


# ------------------------------------------------------------------ Flock closet (generated, replaces the hand-built one)
def wardrobe():
    holes = {"goggles": "dGoggles", "beanie": "dBeanie", "scarf": "dScarf", "bow": "dBow", "band": "dBand", "bell": "dBell"}
    prev = (f'<svg viewBox="{PERCH_VB}" width="176" height="166" role="img" aria-label="Gerald wearing the outfit you picked" style="flex-shrink: 0; display: block; overflow: visible">'
            f'{bird("gerald", "open", 3, (), False, IDLE, holes)}</svg>')
    fx = (f'<div style="flex: 1; {COL} gap: 6px; padding: 8px 0"><div style="font-weight: 900; font-size: 12px; letter-spacing: 1px">WHAT IT DOES</div>'
          f'<sc-for list="{H("effects")}" as="fx" hint-placeholder-count="2"><div style="padding: 5px 10px; background: {CARD}; border: 2px solid {INK}; border-radius: 12px; font-weight: 800; font-size: 13px; line-height: 1.25">{H("fx.text")}</div></sc-for></div>')
    preview = f'<section style="display: flex; align-items: center; gap: 8px; padding: 6px 12px 0 6px; background: {SKY}; border: 2.5px solid {INK}; border-radius: 18px">{prev}{fx}</section>'
    banner = (f'<section style="display: flex; align-items: center; gap: 10px; padding: 8px 10px 8px 12px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 16px">{icon("snow", 30, 2)}'
              f'<div style="flex: 1; {COL}"><div style="font-weight: 900; font-size: 14.5px">Friday: 31 degrees and flurries</div><div style="font-weight: 700; font-size: 12.5px; line-height: 1.3">{H("coldNote")}</div></div>'
              f'<button type="button" onClick="{H("dressCold")}" style="min-height: 44px; flex-shrink: 0; padding: 0 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 14px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 13.5px; {BTN_RESET}">{H("coldBtn")}</button></section>')
    outfits = (f'<section style="{COL} gap: 6px">{sec("Saved outfits")}<div style="display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px"><sc-for list="{H("outfits")}" as="fit" hint-placeholder-count="3">'
               f'<button type="button" onClick="{H("fit.pick")}" aria-pressed="{H("fit.on")}" style="min-height: 44px; background: {H("fit.bg")}; border: 2.5px solid {INK}; border-radius: 999px; box-shadow: {H("fit.sh")}; font-weight: 900; font-size: 14px; {BTN_RESET}">{H("fit.name")}</button>'
               f'</sc-for></div></section>')

    def t(key, gid, name):
        return (f'<button type="button" onClick="{H(key + ".tap")}" aria-pressed="{H(key + ".on")}" style="min-height: 92px; {COL} align-items: center; justify-content: center; gap: 1px; padding: 4px 2px; background: {H(key + ".bg")}; '
                f'border: 2.5px solid {INK}; border-radius: 16px; box-shadow: {H(key + ".sh")}; {BTN_RESET}"><svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">{GEAR_ICON[gid]}</svg>'
                f'<span style="font-weight: 900; font-size: 12.5px">{name}</span><span style="font-weight: 800; font-size: 11.5px">{H(key + ".st")}</span></button>')

    def locked(gid, name, price):
        return (f'<a href="Shop.dc.html" aria-label="{name}, {price} seeds in the store" style="min-height: 92px; box-sizing: border-box; {COL} align-items: center; justify-content: center; gap: 1px; padding: 4px 2px; background: {SAND}; '
                f'border: 2.5px dashed {INK}; border-radius: 16px; text-decoration: none"><svg width="40" height="40" viewBox="0 0 32 32" aria-hidden="true">{GEAR_ICON[gid]}</svg>'
                f'<span style="font-weight: 900; font-size: 12.5px">{name}</span><span style="font-weight: 800; font-size: 11.5px">{price} seeds</span></a>')
    closet = (f'<section style="{COL} gap: 6px">{sec("Closet", "Shared by every bird. Tap to dress Gerald.")}<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px">'
              + t("goggles", "goggles", "Goggles") + t("beanie", "beanie", "Beanie") + t("scarf", "scarf", "Scarf") + t("bow", "bow", "Bow tie") + t("band", "band", "Leg band") + t("bell", "bell", "Ankle bell")
              + locked("rainhat", "Rain hat", 120) + locked("tube", "Roomy tube", 200) + "</div></section>")
    js = f'''var s = this.state || {{}};
var worn = {{ head: s.head === undefined ? "goggles" : s.head, neck: s.neck === undefined ? null : s.neck, leg: s.leg === undefined ? "band" : s.leg }};
var self = this;
function tile(slot, id) {{
var on = worn[slot] === id;
return {{ on: on, bg: on ? "{SUN}" : "{CARD}", sh: on ? "0 4px 0 {INK}" : "none", st: on ? "Wearing" : "Owned", tap: function () {{ var next = {{}}; next[slot] = on ? null : id; self.setState(next); }} }};
}}
function show(slot, id) {{ return worn[slot] === id ? "inline" : "none"; }}
var notes = {{ goggles: "Full speed in rain", beanie: "Fine below freezing", scarf: "Flies in snow", bow: "Friends tip 1 extra seed", band: "3% better arrival odds", bell: "Friends hear him land" }};
var effects = [];
["head", "neck", "leg"].forEach(function (slot) {{ if (worn[slot]) {{ effects.push({{ text: notes[worn[slot]] }}); }} }});
if (!effects.length) {{ effects.push({{ text: "Nothing on. Brave." }}); }}
var saved = [{{ name: "Everyday", head: "goggles", neck: null, leg: "band" }}, {{ name: "Cold snap", head: "beanie", neck: "scarf", leg: "band" }}, {{ name: "Fancy", head: null, neck: "bow", leg: "bell" }}];
var outfits = saved.map(function (o) {{
var on = worn.head === o.head && worn.neck === o.neck && worn.leg === o.leg;
return {{ name: o.name, on: on, bg: on ? "{SUN}" : "{CARD}", sh: on ? "0 4px 0 {INK}" : "none", pick: function () {{ self.setState({{ head: o.head, neck: o.neck, leg: o.leg }}); }} }};
}});
var warm = worn.head === "beanie" && worn.neck === "scarf";
return {{ goggles: tile("head", "goggles"), beanie: tile("head", "beanie"), scarf: tile("neck", "scarf"), bow: tile("neck", "bow"), band: tile("leg", "band"), bell: tile("leg", "bell"),
dGoggles: show("head", "goggles"), dBeanie: show("head", "beanie"), dScarf: show("neck", "scarf"), dBow: show("neck", "bow"), dBand: show("leg", "band"), dBell: show("leg", "bell"),
effects: effects, outfits: outfits, coldNote: warm ? "Gerald is dressed for it." : "Underdressed birds fly 20% slower in the cold.", coldBtn: warm ? "All set" : "Dress him",
dressCold: function () {{ self.setState({{ head: "beanie", neck: "scarf" }}); }} }};'''
    body = hdr("Flock closet", "Pigeon.dc.html", "Back to Gerald", pill_link("Store", "Shop.dc.html")) + preview + banner + outfits + closet
    return page("Flock closet", body, root=PAD, js=js)


# ------------------------------------------------------------------ Seed store (generated, replaces the hand-built one)
def shop():
    def price(n, name):
        if n > 240:
            return (f'<div style="{COL} align-items: center; min-width: 78px"><div style="display: flex; align-items: center; gap: 5px; font-weight: 900; font-size: 15px">{seed(16)}<span>{n}</span></div>'
                    f'<div style="font-weight: 800; font-size: 12px; color: {MUTED}">{n - 240} to go</div></div>')
        return (f'<button type="button" aria-label="Buy {esc(name)} for {n} seeds" style="min-width: 78px; min-height: 44px; display: flex; align-items: center; justify-content: center; gap: 5px; background: {SUN}; border: 2.5px solid {INK}; '
                f'border-radius: 14px; box-shadow: 0 3px 0 {INK}; font-weight: 900; font-size: 15px; {BTN_RESET}">{seed(16, CARD)}<span>{n}</span></button>')

    def row(ic, bg, name, fx, right):
        return card(f'<div aria-hidden="true" style="width: 48px; height: 48px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; border-radius: 12px">'
                    f'<svg width="38" height="38" viewBox="0 0 32 32">{ic}</svg></div><div style="flex: 1; {COL}">{bold(name)}{muted(fx)}</div>{right}', pad="6px 10px 6px 8px", minh=62)
    by = {g[0]: g for g in GEAR}

    def grow(gid, bg):
        g_ = by[gid]
        return row(GEAR_ICON[gid], bg, g_[1], g_[3], chip("In the closet", MINT) if g_[5] else price(g_[4], g_[1]))
    bath = (f'<path d="M6 20 Q16 30 26 20 Z" fill="{CARD}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M9 21.4 Q16 26 23 21.4" fill="none" stroke="{SKY}" stroke-width="2.4" stroke-linecap="round"/>'
            f'<path d="M16 25 V30 M11 30 H21" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/><path d="M12 14 q2 -3 0 -6 M17 15 q2 -3 0 -6 M22 14 q2 -3 0 -6" fill="none" stroke="{INK}" stroke-width="1.8" stroke-linecap="round"/>')
    perch = (f'<path d="M4 12 H28" stroke="{INK}" stroke-width="6.4" stroke-linecap="round"/><path d="M4 12 H28" stroke="{WOOD}" stroke-width="3.2" stroke-linecap="round"/><path d="M8 11 H14" stroke="{CARD}" stroke-width="1.4" stroke-linecap="round" opacity=".7"/>'
             f'<path d="M16 14 V29 M10 29 H22" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>')
    body = (f'<div aria-hidden="true" style="height: 30px; flex-shrink: 0; background: repeating-linear-gradient(90deg, {TOMATO} 0, {TOMATO} 30px, {CARD} 30px, {CARD} 60px); border-bottom: 2.5px solid {INK}"></div>'
            f'<header style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px 0 16px"><h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 34px; line-height: 1">Seed store</h1>'
            f'<div aria-label="You have 240 seeds" style="display: flex; align-items: center; gap: 8px; min-height: 44px; box-sizing: border-box; padding: 0 14px 0 10px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 999px; font-weight: 900; font-size: 16px">{seed(22)}<span>240</span></div></header>'
            f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 0 16px"><p style="margin: 0; font-weight: 800; font-size: 13.5px; color: {MUTED}">You earn seeds every time a note lands.</p>'
            f'<a href="Earn.dc.html" style="flex-shrink: 0; min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 14px">More ways</a></div>'
            f'<main style="flex: 1; padding: 0 16px; {COL} gap: 7px">{sec("Gear for the flock", "Any bird can wear it")}'
            + grow("goggles", SKY) + grow("rainhat", SKY) + grow("cap", LILAC) + grow("tube", SUN) + grow("booties", PEACH)
            + f'<div style="padding-top: 4px">{sec("For the loft")}</div>' + row(bath, SKY, "Rooftop birdbath", "Feathers stay clean twice as long", price(220, "rooftop birdbath")) + row(perch, SUN, "Fifth perch", "Room for one more bird", price(400, "fifth perch"))
            + "</main>" + tabbar("seeds"))
    return page("Seed store", body, root=COL)


# ------------------------------------------------------------------ Share link
def share_link():
    def fact(ic, text):
        return f'<li style="display: flex; align-items: center; gap: 10px">{icon(ic, 22)}<span style="font-weight: 800; font-size: 14px; line-height: 1.25">{text}</span></li>'
    body = (card(avatar_svg("gerald", 44, CARD, gear=("goggles",)) + f'<div style="flex: 1; {COL}">{bold("Gerald is in the air")}<div style="font-weight: 700; font-size: 13px">Flying to Fishtown. Lands about 11:20 am.</div></div>', bg=SKY, minh=64)
            + f'<h1 style="margin: 4px 0 0 0; font-family: {FONT_D}; font-weight: 400; font-size: 32px; line-height: 1.03">Now text Maya her link</h1>'
            + f'<div style="{COL} gap: 6px; padding: 14px 16px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}; transform: rotate(-0.7deg)">'
            f'<div style="font-weight: 900; font-size: 11.5px; letter-spacing: 1px; color: {MUTED}">WHAT MAYA GETS</div>'
            f'<div style="font-weight: 800; font-size: 16px; line-height: 1.35">I sent you a pigeon. For real. Watch him fly to you:</div>'
            f'<div style="font-weight: 900; font-size: 15px; text-decoration: underline; overflow-wrap: anywhere">[your domain]/b/gerald-7QK4</div></div>'
            + cta(icon("message", 26) + "<span>Text it to Maya</span>", "Guest.dc.html")
            + f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px">{btn2(icon("copy", 20) + "<span>Copy link</span>")}{btn2(icon("share", 20) + "<span>Share another way</span>")}</div>'
            + f'<ul style="margin: 4px 0 0 0; padding: 0; list-style: none; {COL} gap: 10px">'
            + fact("eye", "She can watch the flight the moment she taps it.") + fact("lock", "The note stays sealed until Gerald lands.")
            + fact("user", "No app or account needed to read it.") + fact("clock", "Not opened in 7 days? The note comes back to you.") + "</ul>"
            + f'<a href="Flight.dc.html" style="margin-top: auto; align-self: center; min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 15px">Watch the flight</a>')
    return page("Share the tracking link", body, root=f"{COL} padding: 24px 16px 12px 16px; gap: 12px;")


# ------------------------------------------------------------------ Guest (link opened in a browser)
def guest():
    mapsvg = (f'<svg width="358" height="186" viewBox="70 76 300 156" role="img" aria-label="Live map. Gerald is over Edison, New Jersey, heading for Philadelphia." style="display: block; border: 2.5px solid {INK}; border-radius: 18px; box-sizing: border-box; box-shadow: 0 4px 0 {INK}">'
              f'{map_region()}<ellipse cx="226" cy="246" rx="15" ry="4" fill="{INK}" opacity=".2"/><g transform="translate(262 178) scale(-.6 .6)">{fly("gerald", "up", 3.4, True)}</g></svg>')
    body = (f'<div style="display: flex; align-items: center; justify-content: space-between"><div style="font-family: {FONT_D}; font-size: 34px; line-height: 1; letter-spacing: -1px">coo</div>{chip("No app needed", CARD, 13)}</div>'
            f'<div style="{COL} gap: 6px"><h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 36px; line-height: 1.02">Max sent you a pigeon</h1>'
            f'<p style="margin: 0; font-weight: 800; font-size: 15px; line-height: 1.35">His name is Gerald. He left Brooklyn at 9:32 this morning with a note for you, Maya.</p></div>'
            + mapsvg
            + f'<div style="{COL} gap: 4px">{bar(62, "50 of 81 miles flown")}<div style="display: flex; justify-content: space-between; font-weight: 900; font-size: 13px"><span>Over Trenton</span><span>Lands in 41 min</span></div></div>'
            + card(illo("sealed-note", 92) + f'<div style="flex: 1; {COL} gap: 2px">{bold("Your note is sealed")}<div style="font-weight: 700; font-size: 13px; line-height: 1.3">It opens the moment Gerald lands. He takes this seriously.</div></div>', minh=84)
            + f'<div style="margin-top: auto; {COL} align-items: center; gap: 4px">{cta("Text me when he lands", "GuestClaim.dc.html")}'
            f'<a href="Welcome.dc.html" style="min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 14.5px">What is this?</a></div>')
    return page("Guest link: a pigeon is on its way", body, bg=SKY, root=f"{COL} padding: 22px 16px 8px 16px; gap: 12px;")


def guest_claim():
    top = (f'<section style="display: flex; align-items: flex-end; justify-content: space-between; gap: 8px; background: {SKY}; border-bottom: 2.5px solid {INK}; padding: 22px 16px 0 20px">'
           f'<div style="{COL} gap: 4px; padding-bottom: 16px"><h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 36px; line-height: 1">He made it</h1>'
           f'<p style="margin: 0; font-weight: 800; font-size: 14px; line-height: 1.35">81 miles in 1h 48m. He would like you to know about the headwind.</p></div>'
           + bsvg("gerald", 132, "landed", ("goggles",), "Gerald on your sill with the note", "", True) + "</section>")
    note = (f'<article style="position: relative; padding: 14px 16px 12px 16px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}; transform: rotate(0.7deg)">'
            f'<svg width="66" height="66" viewBox="0 0 84 84" role="img" aria-label="Postmark: Brooklyn, November 19" style="position: absolute; right: 8px; top: -30px; transform: rotate(-12deg); animation: coo-stamp 1.8s cubic-bezier(.2,1.6,.4,1) 1">{postmark("BROOKLYN, NY")}</svg>'
            f'<div style="font-weight: 900; font-size: 12px; letter-spacing: 1px; color: {MUTED}">NOTE FROM MAX</div>'
            f'<p style="margin: 6px 0 0 0; font-family: {FONT_H}; font-weight: 700; font-size: 25px; line-height: 1.16">Dinner Saturday? I\'ll bring the good bread. Do NOT tell Gerald about the bread.</p></article>')
    claim = (f'<section style="{COL} gap: 10px; padding: 14px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 20px">'
             f'<div style="{COL} gap: 2px"><h2 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 22px; line-height: 1.05">Send Gerald home with a reply</h2>'
             f'<div style="font-weight: 800; font-size: 13.5px; line-height: 1.3">Make a free loft. You get a bird of your own, and Gerald carries your answer back to Max.</div></div>'
             + inp("g-name", "Your name", "gname", "", True) + inp("g-phone", "Phone number, for landing texts", "gphone", "(555) 010-0199", False, "tel")
             + cta("Make my loft", "Welcome.dc.html", TOMATO, 22) + "</section>")
    body = top + f'<div style="{COL} gap: 14px; padding: 22px 16px 12px 16px">{note}{claim}<div style="text-align: center; font-weight: 800; font-size: 12.5px; color: {MUTED}">Gerald waits on your sill for 30 minutes, then heads home.</div></div>'
    return page("Guest link: note opened, claim a loft", body, root=COL, js=fields_js({"gname": "Maya", "gphone": ""}))


# ------------------------------------------------------------------ Flights list
def flights():
    def fl(v, title, sub, pct, href, tag=None, tagbg=SUN, gear=(), eye="open", bg=CARD, fill=TOMATO):
        t = chip(tag, tagbg) if tag else ""
        return (f'<a href="{href}" style="{COL} gap: 6px; padding: 8px 12px 10px 8px; background: {bg}; border: 2.5px solid {INK}; border-radius: 16px; text-decoration: none">'
                f'<div style="display: flex; align-items: center; gap: 10px">{avatar_svg(v, 42, SKY, eye, gear)}<div style="flex: 1; {COL}">{bold(title, 15.5)}{muted(sub, 12.5)}</div>{t}</div>'
                f'{bar(pct, str(pct) + " percent of the way", fill, 12)}</a>')

    def done(text, when):
        return (f'<div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; min-height: 40px; padding: 0 4px; border-bottom: 2px dashed {DASH}">'
                f'<span style="font-weight: 800; font-size: 13.5px">{text}</span><span style="flex-shrink: 0; font-weight: 900; font-size: 13px; font-variant-numeric: tabular-nums">{when}</span></div>')
    body = (f'<header style="display: flex; align-items: center; justify-content: space-between"><h1 style="margin: 0; font-family: {FONT_D}; font-weight: 400; font-size: 36px; line-height: 1">Flights</h1>{chip("3 out, 1 coming in", CARD, 13)}</header>'
            + f'<section style="{COL} gap: 6px">{sec("Your birds")}'
            + fl("gerald", "Gerald to Priya", "Over Edison, NJ. Lands 11:20 am.", 38, "Flight.dc.html", "Flying", SUN, ("goggles",))
            + fl("brenda", "Brenda to Theo", "Over New Haven. Lands 3:05 pm.", 62, "FlightLong.dc.html", "Flying", SUN)
            + fl("kevin", "Kevin to Theo", "Last seen on a statue in Hartford.", 55, "Lost.dc.html", "Delayed", TOMATO, (), "happy", PEACH, LILAC) + "</section>"
            + f'<section style="{COL} gap: 6px">{sec("Coming to you")}' + fl("dumpling", "Dumpling from Priya", "Lands on your sill in 12 minutes.", 91, "Landed.dc.html", "Almost here", MINT, (), "open", CARD, MINT) + "</section>"
            + f'<section style="{COL} gap: 2px">{sec("Landed today")}' + done("Admiral Crumbs to Rosa, 3 blocks", "31 sec") + done("Gerald, odd job for the deli", "8 seeds") + "</section>"
            + tabbar("flights"))
    return page("All flights", body, root=PADTAB)


# ------------------------------------------------------------------ Friends
def friends():
    def seg(sel):
        def b(t):
            on = t == sel
            return (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="min-width: 48px; min-height: 44px; padding: 0 8px; background: {SUN if on else CARD}; border: none; '
                    f'font-weight: 900; font-size: 12.5px; {BTN_RESET}">{t}</button>')
        return f'<div role="group" aria-label="What this friend can see" style="display: flex; flex-shrink: 0; border: 2.5px solid {INK}; border-radius: 14px; overflow: hidden">{b("City")}<span style="width: 2.5px; background: {INK}"></span>{b("Block")}</div>'

    def fr(name, bg, sub, sel):
        return card(initial(name[0], bg, 42) + f'<div style="flex: 1; {COL}">{bold(name, 15.5)}{muted(sub, 12.5)}</div>' + seg(sel), pad="6px 8px 6px 8px", minh=62)
    invite = (f'<section style="{COL} gap: 8px; padding: 12px 14px; background: {SUN}; border: 2.5px solid {INK}; border-radius: 18px; box-shadow: 0 4px 0 {INK}">'
              f'<div style="{COL}">{bold("Your invite link", 16)}<div style="font-weight: 800; font-size: 13.5px; overflow-wrap: anywhere">[your domain]/join/max</div></div>'
              f'<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">{btn2(icon("copy", 20) + "<span>Copy</span>")}{btn2(icon("message", 20) + "<span>Text it</span>")}</div></section>')
    body = (hdr("Friends", "More.dc.html", "Back to the post office") + invite
            + f'<p style="margin: 0; font-weight: 800; font-size: 13px; line-height: 1.35; color: {MUTED}">City shows a friend your city. Block shows the roost nearest you, so short flights can be drawn street by street. Nobody sees an address.</p>'
            + f'<section style="{COL} gap: 6px">{sec("4 friends", "They can see")}'
            + fr("Priya", ROSE, "Philadelphia, 81 mi", "City") + fr("Theo", SKY, "Boston, 190 mi", "City") + fr("Rosa", MINT, "3 blocks over", "Block") + fr("Dev", LILAC, "Chicago, 713 mi", "City") + "</section>"
            + f'<section style="{COL} gap: 6px">{sec("Waiting on a link")}'
            + card(initial("M", PEACH, 42) + f'<div style="flex: 1; {COL}">{bold("Maya", 15.5)}{muted("Link sent. Gerald lands near her at 11:20 am.", 12.5)}</div>' + chip("Pending", CARD), href="ShareLink.dc.html", pad="6px 10px 6px 8px", minh=60) + "</section>")
    return page("Friends and location sharing", body, root=PAD)


# ------------------------------------------------------------------ Shoebox
def shoebox():
    def note(who, when, text, meta, v, rot, city, gear=()):
        return (f'<article style="position: relative; {COL} gap: 6px; padding: 12px 14px 10px 14px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 6px; box-shadow: 0 4px 0 {INK}; transform: rotate({rot}deg)">'
                f'<svg width="50" height="50" viewBox="0 0 84 84" aria-hidden="true" style="position: absolute; right: 8px; top: 8px; transform: rotate(-12deg)">{postmark(city, when)}</svg>'
                f'<div style="font-weight: 900; font-size: 11.5px; letter-spacing: 1px; color: {MUTED}">{who}</div>'
                f'<p style="margin: 0; padding-right: 52px; font-family: {FONT_H}; font-weight: 700; font-size: 22px; line-height: 1.15">{text}</p>'
                f'<div style="display: flex; align-items: center; gap: 8px">{avatar_svg(v, 28, SKY, "open", gear)}<span style="font-weight: 800; font-size: 12.5px">{meta}</span></div></article>')

    def f(t, on=False):
        return (f'<button type="button" aria-pressed="{"true" if on else "false"}" style="min-height: 44px; padding: 0 16px; background: {SUN if on else CARD}; border: 2.5px solid {INK}; border-radius: 999px; '
                f'{"box-shadow: 0 3px 0 " + INK + ";" if on else ""} font-weight: 900; font-size: 14px; {BTN_RESET}">{t}</button>')
    body = (hdr("Shoebox", "More.dc.html", "Back to the post office", chip("23 notes", CARD, 13))
            + f'<div style="display: flex; gap: 8px">{f("Everyone", True)}{f("Priya")}{f("Theo")}{f("Rosa")}</div>'
            + f'<div style="{COL} gap: 16px; padding-top: 4px">'
            + note("FROM PRIYA", "NOV 19", "Saturday works. Bring the bread. Dumpling ate half my sandwich, so this may smell like tuna.", "Dumpling, 81 mi in 1h 52m", "dumpling", 0.8, "PHILA, PA")
            + note("TO PRIYA", "NOV 19", "Dinner Saturday? I'll bring the good bread. Do NOT tell Gerald about the bread.", "Gerald, 81 mi in 1h 48m", "gerald", -0.9, "BROOKLYN, NY", ("goggles",))
            + note("FROM ROSA", "NOV 18", "Look out your window. No, the other window.", "Biscuit, 3 blocks in 31 seconds", "brenda", 0.5, "BROOKLYN, NY")
            + "</div>")
    return page("Shoebox of saved notes", body, root=PAD)


# ------------------------------------------------------------------ Collections
def collections():
    def pm(city, date):
        return f'<svg width="76" height="76" viewBox="0 0 84 84" role="img" aria-label="Postmark from {esc(city)}" style="display: block; transform: rotate(-8deg)">{postmark(city, date)}</svg>'

    def lock():
        return f'<div aria-label="Not collected yet" role="img" style="width: 70px; height: 70px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2.5px dashed {DASH}; border-radius: 50%; font-family: {FONT_D}; font-size: 24px; color: {MUTED}">?</div>'

    def badge(ic, bg, title, sub, got=True):
        return (f'<div style="display: flex; align-items: center; gap: 10px; min-height: 70px; box-sizing: border-box; padding: 8px 10px; background: {CARD if got else SAND}; border: 2.5px {"solid" if got else "dashed"} {INK}; border-radius: 16px">'
                f'<span style="width: 42px; height: 42px; flex-shrink: 0; display: flex; align-items: center; justify-content: center; background: {bg}; border: 2px solid {INK}; border-radius: 50%">{icon(ic, 24)}</span>'
                f'<div style="{COL}">{bold(title, 14)}<div style="font-weight: 700; font-size: 12px; line-height: 1.25">{sub}</div></div></div>')
    body = (hdr("Collection", "More.dc.html", "Back to the post office")
            + f'<section style="{COL} gap: 8px">{sec("Postmarks", "4 of 50 cities")}<div style="display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px 6px; justify-items: center; align-items: center">'
            + pm("PHILA, PA", "NOV 19") + pm("BOSTON, MA", "NOV 12") + pm("HOBOKEN, NJ", "NOV 9") + pm("CHICAGO, IL", "NOV 2") + lock() * 4 + "</div></section>"
            + f'<section style="{COL} gap: 8px">{sec("Badges", "2 of 12")}<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">'
            + badge("feather", SUN, "First flight", "Your first note landed") + badge("moon", LILAC, "Night owl", "A bird roosted overnight")
            + badge("rain", SKY, "Cher Ami", "Deliver through a storm", False) + badge("link", MINT, "RFC 1149", "Replies on the same bird: 4 of 9", False) + "</div></section>"
            + f'<section style="{COL} gap: 8px">{sec("Birds you have met", "5 of 11")}<div style="display: flex; gap: 8px; align-items: center">'
            + "".join(avatar_svg(v, 50, bg) for v, bg in (("gerald", SKY), ("brenda", SUN), ("kevin", LILAC), ("admiral", PEACH), ("dumpling", MINT)))
            + f'<div role="img" aria-label="6 more to meet" style="width: 50px; height: 50px; box-sizing: border-box; display: flex; align-items: center; justify-content: center; border: 2.5px dashed {DASH}; border-radius: 50%; font-weight: 900; font-size: 14px; color: {MUTED}">+6</div></div></section>')
    return page("Collection: postmarks, badges, birds", body, root=PAD)


# ------------------------------------------------------------------ Aviary
def aviary():
    def br(v):
        b = BREEDS[v]
        inner = bird(v, anim=CALM)
        if v == "tumbler":
            inner = f'<g transform="rotate(180 58 46)">{inner}</g>'
        return (f'<div style="{COL} align-items: center; gap: 2px; padding: 6px 6px 10px 6px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px">'
                f'<svg width="112" height="96" viewBox="-12 -14 140 120" role="img" aria-label="{esc(b["name"])} pigeon" style="display: block; overflow: visible">{inner}</svg>'
                f'{bold(b["name"], 15)}<div style="font-weight: 700; font-size: 12px; text-align: center; line-height: 1.25">{esc(b["note"])}</div>'
                f'<div style="margin-top: 4px">{chip(b["trait"], SKY, 11.5)}</div></div>')
    egg = card(illo("egg", 62) + f'<div style="flex: 1; {COL} gap: 4px">{bold("An egg is on the way", 17)}<div style="font-weight: 700; font-size: 13px; line-height: 1.3">It hatches after 6 more deliveries. The breed is a surprise.</div>{bar(76, "19 of 25 deliveries", MINT, 14)}</div>',
               bg=SKY, minh=104, pad="10px 14px 10px 10px", extra=f" box-shadow: 0 4px 0 {INK};")
    body = (hdr("Aviary", "More.dc.html", "Back to the post office", chip("4 of 5 perches", CARD, 13)) + egg
            + f'<section style="{COL} gap: 8px">{sec("Who might hatch", "6 breeds")}<div style="display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px">'
            + "".join(br(v) for v in ("fantail", "pouter", "frillback", "tumbler")) + "</div></section>")
    return page("Aviary: eggs and breeds", body, root=PAD)


# ------------------------------------------------------------------ Settings
def settings():
    def tog(k, label, sub=None):
        s = f'<span style="font-weight: 700; font-size: 12px; color: {MUTED}">{sub}</span>' if sub else ""
        return (f'<button type="button" role="switch" aria-checked="{H(k)}" onClick="{H(k + "_tap")}" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 46px; padding: 0; '
                f'background: none; border: none; border-bottom: 2px dashed {DASH}; text-align: left; {BTN_RESET}"><span style="{COL}"><span style="font-weight: 800; font-size: 14.5px">{label}</span>{s}</span>'
                f'<span aria-hidden="true" style="width: 50px; height: 28px; flex-shrink: 0; box-sizing: border-box; background: {H(k + "_bg")}; border: 2.5px solid {INK}; border-radius: 999px; padding: 1.5px">'
                f'<span style="display: block; width: 20px; height: 20px; background: {CARD}; border: 2px solid {INK}; border-radius: 50%; box-sizing: border-box; transform: {H(k + "_x")}; transition: transform .15s ease-out"></span></span></button>')

    def val(label, value, sub=None, last=False):
        s = f'<span style="font-weight: 700; font-size: 12px; color: {MUTED}">{sub}</span>' if sub else ""
        bb = "" if last else f"border-bottom: 2px dashed {DASH};"
        return (f'<button type="button" style="display: flex; align-items: center; justify-content: space-between; gap: 10px; width: 100%; min-height: 46px; padding: 0; background: none; border: none; {bb} text-align: left; {BTN_RESET}">'
                f'<span style="{COL}"><span style="font-weight: 800; font-size: 14.5px">{label}</span>{s}</span><span style="display: flex; align-items: center; gap: 4px; flex-shrink: 0; font-weight: 900; font-size: 14px">{value}{icon("forward", 16, 2.8)}</span></button>')

    def box(title, inner):
        return f'<section style="{COL} gap: 4px">{sec(title)}<div style="{COL} padding: 0 12px; background: {CARD}; border: 2.5px solid {INK}; border-radius: 16px">{inner}</div></section>'
    body = (hdr("Settings", "More.dc.html", "Back to the post office")
            + box("Tell me when", tog("t1", "A bird lands on my sill") + tog("t2", "My bird lands") + tog("t3", "A bird is delayed or roosting") + tog("t4", "A bird is hungry")
                  + val("Quiet hours", "10 pm to 7 am", "Birds still land. Your phone stays quiet.", True))
            + box("Where birds find me", val("Friends see", "My city", "Change it per friend in Friends") + val("Home roost", "Williamsburg", "Your address is never stored or shown", True))
            + box("App", val("Distances", "Miles") + val("On your home screen", "Yes", None, True))
            + box("Account", val("Name", "Max") + val("Phone", "Ends in 0142", None, True))
            + f'<a href="Install.dc.html" style="align-self: center; min-height: 44px; display: flex; align-items: center; font-weight: 900; font-size: 14.5px">Sign out</a>')
    return page("Settings", body, root=f"{COL} padding: 16px; gap: 10px;", js=fields_js(None, {"t1": True, "t2": True, "t3": True, "t4": False}))


SCREENS = [
    ("Recipients", "Address book: pick who gets a note", recipients),
    ("NewRecipient", "Send to someone not on the app", new_recipient),
    ("Takeoff", "Takeoff animation (about 1.5 s)", takeoff),
    ("Reply", "Reply: send their bird home", reply),
    ("TakeoffHome", "Takeoff: their bird heads home", takeoff_home),
    ("Wardrobe", "Flock closet: equip and saved outfits", wardrobe),
    ("Shop", "Seed store (upgrades)", shop),
    ("ShareLink", "Share the tracking link", share_link),
    ("Guest", "Guest link: flight in progress", guest),
    ("GuestClaim", "Guest link: note opened, claim a loft", guest_claim),
    ("Flights", "Flights list", flights),
    ("More", "Post office menu", more),
    ("Friends", "Friends, invites, location sharing", friends),
    ("Shoebox", "Shoebox: saved notes", shoebox),
    ("Collections", "Collection: postmarks, badges, birds", collections),
    ("Aviary", "Aviary: eggs and breeds", aviary),
    ("Settings", "Settings", settings),
]
