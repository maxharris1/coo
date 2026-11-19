"""Shared drawing library for the Coo canvas and asset pack."""
import html, json, math

INK = "#2A2140"; PAPER = "#FFF4DC"; CARD = "#FFFBF0"; SKY = "#A9DDF7"; TOMATO = "#F4623F"; SUN = "#FFC93C"
MINT = "#86D9A0"; LILAC = "#D5D1EA"; PEACH = "#F9C5B4"; MUTED = "#5E5675"; STAMP = "#C23A1C"; GRASS = "#B9DE95"
SAND = "#E9E3D0"; BLOCK = "#FFE2A8"; URBAN = "#FFE9BF"; LAND = "#D4EBB0"; NIGHT = "#4A4380"; NIGHTWATER = "#2C2752"
WOOD = "#D99A6C"; DASH = "#B9B3C9"; ROSE = "#F59C8E"; PURPLE = "#A98BE8"; TEAL = "#7FD6B6"; BRICK = "#F08A6B"

FONT_D = "'Bagel Fat One', 'Arial Rounded MT Bold', 'Trebuchet MS', sans-serif"
FONT_B = "'Nunito', 'Avenir Next', 'Segoe UI', system-ui, sans-serif"
FONT_H = "'Caveat', 'Bradley Hand', 'Segoe Print', cursive"

TOKENS = [
    ("ink", INK, "Text, outlines, hard shadows"),
    ("paper", PAPER, "App background"),
    ("card", CARD, "Cards, inputs, note paper"),
    ("sky", SKY, "Hero areas, water, info cards"),
    ("tomato", TOMATO, "Primary action, flown path, alerts"),
    ("sun", SUN, "Selected state, secondary action, seeds"),
    ("mint", MINT, "Ready, good odds, grass"),
    ("lilac", LILAC, "Resting, roosting, quirks"),
    ("peach", PEACH, "Soft warning tiles"),
    ("sand", SAND, "Locked or unavailable"),
    ("muted", MUTED, "Secondary text on paper or card"),
    ("stamp", STAMP, "Postmarks and stamp ink"),
    ("night", NIGHT, "Map land after dusk"),
    ("night-water", NIGHTWATER, "Map water after dusk"),
]

MOTION = [
    ("coo-flap", ".22s", "ease-in-out, alternate", "Wing while flying"),
    ("coo-bob", ".45s", "ease-in-out, alternate", "Whole bird while flying"),
    ("coo-takeoff", "2.8s", "cubic-bezier(.3,.7,.3,1)", "Release: crouch, spring, exit top right"),
    ("coo-puff", "2.8s", "ease-out", "Dust under the takeoff"),
    ("coo-hop", "3.2s", "ease-in-out", "Landed bird on the sill"),
    ("coo-peck", "1.1s", "ease-in-out, alternate", "Feeding"),
    ("coo-tilt", "2.2s", "ease-in-out, alternate", "Idle bird, onboarding"),
    ("coo-wobble", "1.6s", "ease-in-out", "Sulking bird"),
    ("coo-snooze", "2.4s", "ease-in-out", "Sleeping z letters"),
    ("coo-march", "1.2s", "linear", "Dotted path still to fly"),
    ("coo-drift", "7s", "ease-in-out, alternate", "Clouds"),
    ("coo-pulse", "1.4s", "ease-in-out", "Live dot"),
    ("coo-rain", ".7s", "ease-in, alternate", "Forecast rain"),
    ("coo-twinkle", "2.2s", "ease-in-out", "Night map stars"),
    ("coo-spin", "60s", "linear", "Sunburst behind a landing"),
    ("coo-stamp", "1.8s", "cubic-bezier(.2,1.6,.4,1)", "Postmark thunk on arrival"),
    ("coo-burst", "1.8s", "ease-out", "Seeds paid out"),
    ("coo-press", "1.6s", "ease-in-out", "Button press: drop 3px, shadow to 1px"),
    ("coo-point", ".6s", "ease-in-out, alternate", "Install arrow"),
    ("coo-feather", "2.8s", "ease-in", "Feather drifting after takeoff"),
]

MOTION_CSS = """@keyframes coo-flap{from{transform:rotate(-16deg) scaleY(1)}to{transform:rotate(12deg) scaleY(.5)}}
@keyframes coo-bob{from{transform:translateY(0)}to{transform:translateY(-5px)}}
@keyframes coo-takeoff{0%{transform:translate(0,0) scale(1,1);opacity:1}10%{transform:translate(0,10px) scale(1.1,.82)}16%{transform:translate(0,10px) scale(1.1,.82)}24%{transform:translate(8px,-30px) scale(.94,1.1) rotate(-8deg)}58%{transform:translate(250px,-520px) scale(.5) rotate(-14deg);opacity:1}62%{transform:translate(260px,-540px) scale(.5) rotate(-14deg);opacity:0}100%{transform:translate(260px,-540px) scale(.5);opacity:0}}
@keyframes coo-puff{0%,15%{transform:scale(.2);opacity:0}20%{transform:scale(.6);opacity:1}45%{transform:scale(1.5);opacity:0}100%{transform:scale(1.5);opacity:0}}
@keyframes coo-hop{0%,70%,100%{transform:translateY(0)}80%{transform:translateY(-7px)}90%{transform:translateY(0)}95%{transform:translateY(-3px)}}
@keyframes coo-peck{from{transform:rotate(0deg)}to{transform:rotate(34deg)}}
@keyframes coo-tilt{from{transform:rotate(-3deg)}to{transform:rotate(3deg)}}
@keyframes coo-wobble{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-4deg)}75%{transform:rotate(4deg)}}
@keyframes coo-snooze{0%,100%{opacity:.25;transform:translateY(0)}50%{opacity:1;transform:translateY(-4px)}}
@keyframes coo-march{from{stroke-dashoffset:0}to{stroke-dashoffset:-22}}
@keyframes coo-drift{from{transform:translateX(0)}to{transform:translateX(18px)}}
@keyframes coo-pulse{0%,100%{transform:scale(1)}50%{transform:scale(1.5)}}
@keyframes coo-rain{from{transform:translateY(-3px);opacity:.3}to{transform:translateY(4px);opacity:1}}
@keyframes coo-twinkle{0%,100%{opacity:1}50%{opacity:.25}}
@keyframes coo-spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
@keyframes coo-stamp{0%,55%{transform:scale(2.2) rotate(-30deg);opacity:0}70%{transform:scale(.92) rotate(-12deg);opacity:1}80%,100%{transform:scale(1) rotate(-12deg);opacity:1}}
@keyframes coo-burst{0%,20%{transform:translate(0,0) scale(.3);opacity:0}30%{opacity:1}80%{transform:translate(26px,-34px) scale(1);opacity:1}100%{transform:translate(26px,-34px) scale(1);opacity:0}}
@keyframes coo-burst-l{0%,20%{transform:translate(0,0) scale(.3);opacity:0}30%{opacity:1}80%{transform:translate(-28px,-30px) scale(1);opacity:1}100%{transform:translate(-28px,-30px) scale(1);opacity:0}}
@keyframes coo-burst-u{0%,20%{transform:translate(0,0) scale(.3);opacity:0}30%{opacity:1}80%{transform:translate(0,-44px) scale(1);opacity:1}100%{transform:translate(0,-44px) scale(1);opacity:0}}
@keyframes coo-press{0%,40%,100%{transform:translateY(0);box-shadow:0 4px 0 #2A2140}50%,70%{transform:translateY(3px);box-shadow:0 1px 0 #2A2140}}
@keyframes coo-point{from{transform:translateY(0)}to{transform:translateY(7px)}}
@keyframes coo-feather{0%,24%{transform:translate(0,0) rotate(0deg);opacity:0}30%{opacity:1}90%{transform:translate(-30px,150px) rotate(160deg);opacity:1}100%{transform:translate(-34px,170px) rotate(180deg);opacity:0}}
@media (prefers-reduced-motion: reduce){*{animation:none !important}}"""


def esc(s):
    return html.escape(str(s), quote=True)


# ---------------------------------------------------------------- birds
BIRDS = {
    "gerald": dict(name="Gerald", body="#B8B3D6", wing="#8E88B5", collar=TEAL, sheen=PURPLE, note="City pigeon. Loyal, bread-motivated.", speed="45 mph"),
    "brenda": dict(name="Brenda", body=CARD, wing="#F2C9A0", collar=ROSE, note="Fast and judgmental.", speed="54 mph"),
    "kevin": dict(name="Kevin", body="#7A7396", wing="#595278", collar=PURPLE, note="Has never once been on time.", speed="38 mph"),
    "admiral": dict(name="Admiral Crumbs", body="#E0A870", wing="#B87A45", collar=TEAL, note="Hungry. Has opinions about it.", speed="52 mph", own=("cap",)),
    "dumpling": dict(name="Dumpling", body="#FFE9C4", wing="#F2C08A", collar=ROSE, rx=38, ry=30, note="Priya's bird. Extremely round.", speed="43 mph"),
}
BREEDS = {
    "fantail": dict(name="Fantail", body=CARD, wing="#E3DCF0", collar=LILAC, breed="fantail", note="Slow, gorgeous, knows it.", trait="Friends tip double"),
    "pouter": dict(name="Pouter", body="#CFE3F2", wing="#9DB9D6", collar=SKY, breed="pouter", note="Mostly air.", trait="Carries two notes"),
    "frillback": dict(name="Frillback", body="#F2C9A0", wing="#D99A6C", collar=ROSE, breed="frillback", note="Permed. Unbothered by rain.", trait="Ignores drizzle"),
    "jacobin": dict(name="Jacobin", body=CARD, wing="#E9E3D0", collar=CARD, breed="jacobin", note="Cannot see much. Does not care.", trait="Never distracted"),
    "king": dict(name="King", body=CARD, wing="#F4EBD6", collar=SUN, breed="king", rx=40, ry=31, note="Large. Carries snacks for the trip.", trait="Longer range"),
    "tumbler": dict(name="Tumbler", body="#9CC7B5", wing="#6FA893", collar=SUN, breed="tumbler", note="Does a backflip on arrival.", trait="Lands with style"),
}
ALL = dict(BIRDS, **BREEDS)

GEAR = [
    # id, name, slot, effect, price, owned
    ("goggles", "Aviator goggles", "head", "Holds full speed in rain", 120, True),
    ("beanie", "Wool beanie", "head", "Fine below freezing", 110, True),
    ("rainhat", "Rain hat", "head", "Shrugs off downpours", 120, False),
    ("cap", "Captain's cap", "head", "Steadier in a headwind", 160, False),
    ("party", "Party hat", "head", "Weekend deliveries pay 5 extra", 80, False),
    ("earmuffs", "Earmuffs", "head", "Ignores street noise, fewer detours", 140, False),
    ("scarf", "Thermal scarf", "neck", "Flies in snow", 150, True),
    ("bow", "Bow tie", "neck", "Friends tip 1 extra seed", 90, True),
    ("bandana", "Bandana", "neck", "Looks tough, hawks think twice", 130, False),
    ("band", "Lucky leg band", "leg", "3% better arrival odds", 90, True),
    ("bell", "Ankle bell", "leg", "Friends hear the landing", 70, True),
    ("tube", "Roomy leg tube", "leg", "Notes up to 280 characters", 200, False),
    ("booties", "Rain booties", "leg", "No muddy feet on the sill", 60, False),
    ("backpack", "Tiny backpack", "back", "Carries one photo (later release)", 300, False),
]

_G = f'stroke="{INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"'
ON = {
    "scarf": f'<path d="M74 57 L69 82 L80 83 L83 60 Z" fill="{TOMATO}" {_G}/><path d="M71 72 L81 73" stroke="{CARD}" stroke-width="2.4"/><ellipse cx="83" cy="53" rx="17" ry="8.5" fill="{TOMATO}" {_G}/><path d="M72 53 Q83 58 94 53" fill="none" stroke="{CARD}" stroke-width="2.4" stroke-linecap="round"/>',
    "bow": f'<path d="M99 53 L89 46 V60 Z" fill="{PURPLE}" {_G}/><path d="M99 53 L109 46 V60 Z" fill="{PURPLE}" {_G}/><circle cx="99" cy="53" r="3" fill="{CARD}" stroke="{INK}" stroke-width="2"/>',
    "bandana": f'<path d="M68 49 Q83 55 98 49 L85 71 Z" fill="{SUN}" {_G}/><circle cx="80" cy="56" r="1.4" fill="{INK}"/><circle cx="88" cy="56" r="1.4" fill="{INK}"/><circle cx="84" cy="62" r="1.4" fill="{INK}"/>',
    "goggles": f'<path d="M69 27 Q76 22 84 27" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round"/><path d="M69 27 Q76 22 84 27" fill="none" stroke="{WOOD}" stroke-width="3" stroke-linecap="round"/><circle cx="92" cy="30" r="10" fill="{CARD}" stroke="{INK}" stroke-width="2.6"/>',
    "beanie": f'<path d="M68 27 Q68 5 87 5 Q105 6 105 25 Q86 15 68 27 Z" fill="{TOMATO}" {_G}/><path d="M67 28 Q86 15 106 26" fill="none" stroke="{INK}" stroke-width="8" stroke-linecap="round"/><path d="M67 28 Q86 15 106 26" fill="none" stroke="{CARD}" stroke-width="4.4" stroke-linecap="round"/><circle cx="87" cy="2" r="5.5" fill="{CARD}" stroke="{INK}" stroke-width="2.2"/>',
    "rainhat": f'<path d="M66 24 Q68 4 87 4 Q104 5 106 22 Z" fill="{SUN}" {_G}/><path d="M58 30 Q86 12 118 28 Q88 22 58 30 Z" fill="{SUN}" {_G}/>',
    "cap": f'<path d="M70 20 Q86 2 102 20 Z" fill="{INK}"/><path d="M66 21 H110" stroke="{INK}" stroke-width="4.5" stroke-linecap="round"/><circle cx="86" cy="13" r="2.6" fill="{SUN}"/>',
    "party": f'<path d="M75 19 L89 -10 L100 18 Z" fill="{PURPLE}" {_G}/><path d="M80 9 L95 5 M77 15 L98 12" stroke="{SUN}" stroke-width="2.6"/><circle cx="89" cy="-11" r="4" fill="{SUN}" stroke="{INK}" stroke-width="2"/>',
    "earmuffs": f'<path d="M72 30 Q72 11 87 11 Q101 11 103 24" fill="none" stroke="{INK}" stroke-width="6" stroke-linecap="round"/><path d="M72 30 Q72 11 87 11 Q101 11 103 24" fill="none" stroke="{SUN}" stroke-width="2.8" stroke-linecap="round"/><circle cx="76" cy="36" r="8.5" fill="{TOMATO}" stroke="{INK}" stroke-width="2.4"/>',
    "band": f'<rect x="63.5" y="91" width="9" height="6" rx="2" fill="{SUN}" stroke="{INK}" stroke-width="2"/>',
    "bell": f'<circle cx="52" cy="95" r="5" fill="{SUN}" stroke="{INK}" stroke-width="2"/><circle cx="52" cy="97" r="1.4" fill="{INK}"/>',
    "tube": f'<rect x="58" y="88" width="20" height="10" rx="5" fill="{CARD}" stroke="{INK}" stroke-width="2.2"/><path d="M64 88 V98" stroke="{TOMATO}" stroke-width="2.2"/>',
    "booties": f'<path d="M45 96 H58 Q62 96 62 100 V104 H45 Z" fill="{TOMATO}" {_G}/><path d="M61 96 H74 Q78 96 78 100 V104 H61 Z" fill="{TOMATO}" {_G}/>',
    "backpack": f'<path d="M48 44 Q62 40 76 52" fill="none" stroke="{INK}" stroke-width="5" stroke-linecap="round"/><path d="M48 44 Q62 40 76 52" fill="none" stroke="{WOOD}" stroke-width="2.4" stroke-linecap="round"/><rect x="24" y="34" width="24" height="26" rx="7" fill="{MINT}" {_G}/><path d="M29 44 H43" stroke="{INK}" stroke-width="2.2" stroke-linecap="round"/>',
}
_NECK = ("scarf", "bow", "bandana")
_HEAD = ("beanie", "rainhat", "cap", "party", "earmuffs")
_LEG = ("band", "bell", "tube", "booties")

_I = f'stroke="{INK}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"'
GEAR_ICON = {
    "goggles": f'<path d="M2 14 H6 M26 14 H30 M13 15 Q16 12 19 15" fill="none" {_I}/><circle cx="10" cy="16" r="5.5" fill="{CARD}" {_I}/><circle cx="22" cy="16" r="5.5" fill="{CARD}" {_I}/>',
    "beanie": f'<path d="M6 22 Q6 9 16 9 Q26 9 26 22 Z" fill="{TOMATO}" {_I}/><rect x="4" y="20" width="24" height="7" rx="3.5" fill="{CARD}" {_I}/><circle cx="16" cy="6.5" r="3.6" fill="{CARD}" {_I}/>',
    "rainhat": f'<path d="M4 21 Q16 27 28 21 Q24 19 23 13 Q22 6 16 6 Q10 6 9 13 Q8 19 4 21 Z" fill="{SUN}" {_I}/>',
    "cap": f'<path d="M6 19 Q16 3 26 19 Z" fill="{INK}" {_I}/><path d="M3 21 H29" {_I}/><circle cx="16" cy="13" r="2.4" fill="{SUN}"/>',
    "party": f'<path d="M8 27 L16 5 L24 27 Z" fill="{PURPLE}" {_I}/><path d="M11.5 19 L20 16 M10 24 L22 21" stroke="{SUN}" stroke-width="2.4"/><circle cx="16" cy="4.5" r="3" fill="{SUN}" {_I}/>',
    "earmuffs": f'<path d="M6 19 Q6 6 16 6 Q26 6 26 19" fill="none" {_I}/><rect x="2.5" y="16" width="8" height="11" rx="4" fill="{TOMATO}" {_I}/><rect x="21.5" y="16" width="8" height="11" rx="4" fill="{TOMATO}" {_I}/>',
    "scarf": f'<path d="M6 9 Q16 15 26 9 V15 Q16 21 6 15 Z" fill="{TOMATO}" {_I}/><path d="M19 17 L22 28 L27 26 L24 15" fill="{TOMATO}" {_I}/>',
    "bow": f'<path d="M16 16 L5 9 V23 Z M16 16 L27 9 V23 Z" fill="{PURPLE}" {_I}/><circle cx="16" cy="16" r="3.2" fill="{CARD}" {_I}/>',
    "bandana": f'<path d="M3 9 Q16 15 29 9 L17 27 Z" fill="{SUN}" {_I}/><circle cx="13" cy="15" r="1.4" fill="{INK}"/><circle cx="19" cy="15" r="1.4" fill="{INK}"/><circle cx="16" cy="20" r="1.4" fill="{INK}"/>',
    "band": f'<ellipse cx="16" cy="17" rx="10" ry="7" fill="none" stroke="{INK}" stroke-width="6"/><ellipse cx="16" cy="17" rx="10" ry="7" fill="none" stroke="{SUN}" stroke-width="2.8"/>',
    "bell": f'<path d="M16 6 Q24 8 24 18 L26 23 H6 L8 18 Q8 8 16 6 Z" fill="{SUN}" {_I}/><circle cx="16" cy="26.5" r="2.4" fill="{INK}"/>',
    "tube": f'<g transform="rotate(-35 16 16)"><rect x="5" y="11" width="22" height="10" rx="5" fill="{CARD}" {_I}/><path d="M11 11 V21" {_I}/></g>',
    "booties": f'<path d="M4 10 H12 V18 Q16 18 16 22 V25 H4 Z" fill="{TOMATO}" {_I}/><path d="M18 10 H26 V18 Q30 18 30 22 V25 H18 Z" fill="{TOMATO}" {_I}/>',
    "backpack": f'<path d="M11 8 V6 a5 5 0 0 1 10 0 V8" fill="none" {_I}/><rect x="6" y="8" width="20" height="20" rx="6" fill="{MINT}" {_I}/><path d="M11 17 H21 V22 H11 Z" fill="{CARD}" {_I}/>',
}


def _eye(kind, body, sw):
    w = round(sw * .82, 1)
    if kind == "closed":
        return f'<path d="M87 31 q5 4 10 0" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>'
    if kind == "happy":
        return f'<path d="M87 33 q5 -6 10 0" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>'
    if kind == "wide":
        return f'<circle cx="92" cy="30" r="8.5" fill="{CARD}" stroke="{INK}" stroke-width="{w}"/><circle cx="92" cy="30" r="4.4" fill="#FFB03A" stroke="{INK}" stroke-width="{w * .8:.1f}"/><circle cx="92.6" cy="30" r="1.6" fill="{INK}"/>'
    base = f'<circle cx="92" cy="30" r="6.5" fill="#FFB03A" stroke="{INK}" stroke-width="{w}"/>'
    if kind == "lid":
        return base + f'<circle cx="92.5" cy="32.4" r="2.4" fill="{INK}"/><path d="M85.5 30 a6.5 6.5 0 0 1 13 0 Z" fill="{body}" stroke="{INK}" stroke-width="{w}" stroke-linejoin="round"/>'
    return base + f'<circle cx="93.5" cy="30" r="2.6" fill="{INK}"/><circle cx="94.6" cy="28.8" r=".9" fill="{CARD}"/>'


def bird(v="gerald", eye="open", sw=3, gear=(), scroll=False):
    """Perched pigeon, facing right. Draws inside roughly x 0..120, y -12..106."""
    b = ALL[v]; body, wing, collar = b["body"], b["wing"], b["collar"]
    breed = b.get("breed"); rx, ry = b.get("rx", 35), b.get("ry", 27)
    gear = tuple(gear) + tuple(b.get("own", ()))
    w = round(sw * .82, 1)
    S = f'stroke="{INK}" stroke-width="{sw}"'; J = S + ' stroke-linejoin="round"'
    o = []
    if breed == "fantail":
        o.append(f'<path d="M30 76 L-6 62 Q-10 36 8 20 Q24 10 40 20 Z" fill="{wing}" {J}/><path d="M30 74 L0 48 M30 74 L10 30 M30 74 L26 20" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>')
    else:
        o.append(f'<path d="M26 62 L4 52 L8 72 L24 78 Z" fill="{wing}" {J}/>')
    o.append(f'<path d="M52 86 V101 M46 101 H58 M68 86 V101 M62 101 H74" stroke="{TOMATO}" stroke-width="{sw + .5}" stroke-linecap="round" fill="none"/>')
    o.append(f'<ellipse cx="56" cy="62" rx="{rx}" ry="{ry}" fill="{body}" {S}/>')
    if breed == "jacobin":
        hood = "#B5553C"
        for i in range(10):
            a = math.radians(36 * i + 10)
            o.append(f'<circle cx="{84 + 20 * math.cos(a):.1f}" cy="{36 + 20 * math.sin(a):.1f}" r="9" fill="{hood}" {S}/>')
        o.append(f'<circle cx="84" cy="36" r="21" fill="{hood}"/>')
        o.append(f'<circle cx="88" cy="34" r="14" fill="{body}" {S}/>')
    else:
        o.append(f'<circle cx="86" cy="34" r="18" fill="{body}" {S}/>')
    if breed == "pouter":
        o.append(f'<circle cx="92" cy="63" r="20" fill="{body}" {S}/><path d="M82 50 Q92 45 102 50" fill="none" stroke="{INK}" stroke-width="{w}" stroke-linecap="round"/>')
    elif breed != "jacobin":
        o.append(f'<ellipse cx="83" cy="53" rx="15" ry="7" fill="{collar}" stroke="{INK}" stroke-width="{w}"/>')
        if b.get("sheen"):
            o.append(f'<ellipse cx="79" cy="54" rx="6" ry="2.6" fill="{b["sheen"]}"/>')
    o.append(f'<path d="M36 58 Q56 42 78 60 Q66 80 40 74 Z" fill="{wing}" {J}/>')
    if breed == "frillback":
        o.append(f'<path d="M46 66 q4 -7 9 0 q-4 5 -7 0 M57 71 q4 -7 9 0 q-4 5 -7 0 M54 58 q4 -7 9 0 q-4 5 -7 0" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>')
    else:
        o.append(f'<path d="M50 70 L58 56 M60 72 L67 59" stroke="{INK}" stroke-width="{w}" stroke-linecap="round"/>')
    if "backpack" in gear:
        o.append(ON["backpack"])
    for g in _NECK:
        if g in gear:
            o.append(ON[g])
    if "goggles" in gear:
        o.append(ON["goggles"])
    o.append(_eye(eye, body, sw))
    o.append(f'<path d="M104 31 L118 36 L104 41 Z" fill="{SUN}" stroke="{INK}" stroke-width="{w}" stroke-linejoin="round"/>')
    if "goggles" not in gear:
        o.append(f'<ellipse cx="104.5" cy="30.5" rx="3.4" ry="2.5" fill="{CARD}" stroke="{INK}" stroke-width="{w * .8:.1f}"/>')
    if eye not in ("lid",):
        o.append(f'<circle cx="84" cy="43" r="3.2" fill="{ROSE}"/>')
    for g in _HEAD:
        if g in gear:
            o.append(ON[g])
    for g in _LEG:
        if g in gear:
            o.append(ON[g])
    if scroll and not any(g in gear for g in ("tube",)):
        o.append(f'<rect x="62" y="92" width="12" height="7" rx="2" fill="{CARD}" stroke="{INK}" stroke-width="2"/><path d="M65 92 V99" stroke="{TOMATO}" stroke-width="2"/>')
    return "".join(o)


def fly(v="gerald", wing="up", sw=3, anim=False):
    """Flying pigeon, facing right, viewBox 0 0 124 100."""
    b = ALL[v]; body, wc, collar = b["body"], b["wing"], b["collar"]
    w = round(sw * .82, 1)
    S = f'stroke="{INK}" stroke-width="{sw}"'; J = S + ' stroke-linejoin="round"'
    d = "M42 54 Q34 14 68 4 Q76 28 72 56 Z" if wing == "up" else "M42 58 Q38 92 66 97 Q78 78 72 58 Z"
    st = ' style="transform-box: fill-box; transform-origin: 50% 100%; animation: coo-flap .22s ease-in-out infinite alternate"' if anim else ""
    return (f'<path d="M26 54 L2 46 L6 64 L24 66 Z" fill="{wc}" {J}/>'
            f'<path d="M46 72 L34 80 M58 74 L48 83" stroke="{TOMATO}" stroke-width="{sw + .5}" stroke-linecap="round" fill="none"/>'
            f'<rect x="28" y="78" width="12" height="7" rx="2" fill="{CARD}" stroke="{INK}" stroke-width="2"/>'
            f'<ellipse cx="58" cy="56" rx="36" ry="19" fill="{body}" {S}/>'
            f'<circle cx="96" cy="44" r="15" fill="{body}" {S}/>'
            f'<ellipse cx="84" cy="55" rx="8" ry="9" fill="{collar}" stroke="{INK}" stroke-width="{w}"/>'
            f'<path d="{d}" fill="{wc}" {J}{st}/>'
            f'<circle cx="101" cy="41" r="5.5" fill="#FFB03A" stroke="{INK}" stroke-width="{w}"/><circle cx="102.4" cy="41" r="2.2" fill="{INK}"/>'
            f'<path d="M109 41 L122 45 L109 49 Z" fill="{SUN}" stroke="{INK}" stroke-width="{w}" stroke-linejoin="round"/>'
            f'<ellipse cx="110" cy="40.5" rx="3" ry="2.2" fill="{CARD}" stroke="{INK}" stroke-width="{w * .7:.1f}"/>')


PERCH_VB = "-10 -16 136 124"
FLY_VB = "0 0 124 100"

POSES = [
    ("perched", "Perched", "Default in the loft and lists"),
    ("sleep", "Asleep", "Resting, roosting"),
    ("eat", "Eating", "Feed action, snack tip"),
    ("sulk", "Sulking", "Neglected or underdressed"),
    ("surprise", "Startled", "Hawk advisory, statue nearby"),
    ("crouch", "Crouch", "First frame of takeoff"),
    ("landed", "Just landed", "On a sill, note attached"),
    ("proud", "Proud", "After a delivery"),
]


def pose(v, p, sw=3, gear=()):
    """Returns (viewBox, inner svg) for a named pose."""
    if p == "sleep":
        z = f'<text x="110" y="8" font-family="Nunito, sans-serif" font-weight="900" font-size="15" fill="{INK}">z</text><text x="120" y="-4" font-family="Nunito, sans-serif" font-weight="900" font-size="10" fill="{INK}">z</text>'
        return PERCH_VB, bird(v, "closed", sw, gear) + z
    if p == "eat":
        seeds = "".join(f'<ellipse cx="{x}" cy="{y}" rx="3" ry="2" fill="{SUN}" stroke="{INK}" stroke-width="1.6"/>' for x, y in ((128, 101), (138, 103), (146, 100), (122, 104)))
        return "-10 -16 170 124", f'<g transform="rotate(34 60 101)">{bird(v, "happy", sw, gear)}</g>' + seeds
    if p == "sulk":
        cloud = f'<path d="M92 -2 q-6 -1 -5 -7 q1 -6 8 -5 q4 -6 11 -3 q7 -1 8 6 q5 1 4 6 q-1 4 -6 4 z" fill="{LILAC}" stroke="{INK}" stroke-width="2"/><path d="M96 4 l-2 5 M104 4 l-2 5 M112 4 l-2 5" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "lid", sw, gear) + cloud
    if p == "surprise":
        marks = f'<path d="M112 14 L120 4 M116 22 L126 18 M104 8 L106 -4" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "wide", sw, gear) + marks
    if p == "crouch":
        return PERCH_VB, f'<g transform="translate(-6 17) scale(1.1 .84)">{bird(v, "open", sw, gear)}</g>'
    if p == "landed":
        lines = f'<path d="M30 104 H20 M100 104 H112 M26 96 L18 92" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "open", sw, gear, scroll=True) + lines
    if p == "proud":
        spark = f'<path d="M112 6 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="{SUN}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        return PERCH_VB, f'<g transform="rotate(-6 60 101)">{bird(v, "happy", sw, gear)}</g>' + spark
    return PERCH_VB, bird(v, "open", sw, gear)


def avatar_svg(v, size=42, bg=SKY, eye="open", gear=(), extra_style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="60 2 62 62" aria-hidden="true" style="background: {bg}; border: 2px solid {INK}; border-radius: 50%; flex-shrink: 0;{extra_style}">'
            f'{bird(v, eye, 3, gear)}</svg>')


# ---------------------------------------------------------------- icons
_P = 'fill="none" stroke="#2A2140" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"'
ICONS = {
    "loft": '<path d="M4 11 L12 4 L20 11 V20 H4 Z"/><circle cx="12" cy="14" r="2.2" fill="#2A2140"/>',
    "map": '<path d="M3 6 L9 4 L15 6 L21 4 V18 L15 20 L9 18 L3 20 Z M9 4 V18 M15 6 V20"/>',
    "wing": '<path d="M3 14 C7 6 13 4 21 5 C20 9 17 12 13 13 C15 14 16 15 18 15 C14 19 7 19 3 14 Z"/><path d="M3 14 C8 12 12 10 16 8"/>',
    "envelope": '<rect x="3" y="6" width="18" height="13" rx="2.5"/><path d="M3.5 7.5 L12 13.5 L20.5 7.5"/>',
    "bag": '<path d="M6 9 H18 L19.5 20 H4.5 Z M9 9 V7 a3 3 0 0 1 6 0 V9"/>',
    "seed": '<path d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z"/><path d="M12 8 V16"/>',
    "back": '<path d="M15 5 L8 12 L15 19"/>',
    "forward": '<path d="M9 5 L16 12 L9 19"/>',
    "down": '<path d="M5 9 L12 16 L19 9"/>',
    "arrow": '<path d="M3 12 H19 M14 6 L20 12 L14 18"/>',
    "close": '<path d="M6 6 L18 18 M18 6 L6 18"/>',
    "plus": '<path d="M12 5 V19 M5 12 H19"/>',
    "minus": '<path d="M5 12 H19"/>',
    "check": '<path d="M5 12.5 L10 17.5 L19 7"/>',
    "menu": '<path d="M4 7 H20 M4 12 H20 M4 17 H20"/>',
    "search": '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15 L20 20"/>',
    "share": '<path d="M8 10 H6 V21 H18 V10 H16 M12 15 V3 M8 7 L12 3 L16 7"/>',
    "copy": '<rect x="8" y="8" width="12" height="12" rx="2.5"/><path d="M16 8 V6 a2 2 0 0 0 -2 -2 H6 a2 2 0 0 0 -2 2 v8 a2 2 0 0 0 2 2 h2"/>',
    "link": '<path d="M10 14 a4 4 0 0 0 5.7 0 l3 -3 a4 4 0 0 0 -5.7 -5.7 l-1.2 1.2 M14 10 a4 4 0 0 0 -5.7 0 l-3 3 a4 4 0 0 0 5.7 5.7 l1.2 -1.2"/>',
    "home-add": '<rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8 V16 M8 12 H16"/>',
    "bell": '<path d="M12 4 Q18 5 18 13 L20 17 H4 L6 13 Q6 5 12 4 Z"/><path d="M10 20 Q12 22 14 20"/>',
    "clock": '<circle cx="12" cy="12" r="8.5"/><path d="M12 7 V12 L15.5 14"/>',
    "moon": '<path d="M19 14 A8 8 0 1 1 10 5 A6.5 6.5 0 0 0 19 14 Z"/>',
    "sun": '<circle cx="12" cy="12" r="4"/><path d="M12 2.5 V5 M12 19 V21.5 M2.5 12 H5 M19 12 H21.5 M5.3 5.3 L7 7 M17 17 L18.7 18.7 M5.3 18.7 L7 17 M17 7 L18.7 5.3"/>',
    "rain": '<path d="M7 14 a4 4 0 0 1 .6 -8 a5 5 0 0 1 9.4 1.2 a3.5 3.5 0 0 1 0 6.8 z"/><path d="M8 17 L7 20 M12 17 L11 20 M16 17 L15 20"/>',
    "wind": '<path d="M3 9 H14 a3 3 0 1 0 -3 -3 M3 14 H19 a3 3 0 1 1 -3 3 M3 19 H10"/>',
    "snow": '<path d="M12 2 V22 M3.3 7 L20.7 17 M20.7 7 L3.3 17 M12 6 L9.5 3.5 M12 6 L14.5 3.5 M12 18 L9.5 20.5 M12 18 L14.5 20.5"/>',
    "hawk": '<path d="M2 8 Q8 4 12 12 Q16 4 22 8 Q18 9 16 14 L12 20 L8 14 Q6 9 2 8 Z" fill="#2A2140"/>',
    "tent": '<path d="M3 12 L12 3 L21 12 Z M5 12 V21 H19 V12 M10 21 V16 H14 V21"/>',
    "pin": '<path d="M12 21 C7 15 5 12 5 9 a7 7 0 0 1 14 0 c0 3 -2 6 -7 12 Z"/><circle cx="12" cy="9" r="2.5"/>',
    "locate": '<circle cx="12" cy="12" r="6"/><path d="M12 2 V6 M12 18 V22 M2 12 H6 M18 12 H22"/><circle cx="12" cy="12" r="1.5" fill="#2A2140"/>',
    "settings": '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.5 L13.8 5.2 L17 4.4 L17.6 7.6 L20.8 8.6 L19.4 11.6 L21.5 14 L18.8 15.8 L19 19 L15.8 18.8 L14 21.5 L12 19 L10 21.5 L8.2 18.8 L5 19 L5.2 15.8 L2.5 14 L4.6 11.6 L3.2 8.6 L6.4 7.6 L7 4.4 L10.2 5.2 Z"/>',
    "user": '<circle cx="12" cy="8" r="4"/><path d="M4 21 a8 8 0 0 1 16 0"/>',
    "users": '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20 a6.5 6.5 0 0 1 13 0"/><path d="M15.5 4.8 a3.5 3.5 0 0 1 0 6.4 M18 14.5 a6.5 6.5 0 0 1 3.5 5.5"/>',
    "lock": '<rect x="5" y="11" width="14" height="10" rx="2.5"/><path d="M8 11 V8 a4 4 0 0 1 8 0 V11"/>',
    "eye": '<path d="M2 12 Q12 3 22 12 Q12 21 2 12 Z"/><circle cx="12" cy="12" r="3"/>',
    "heart": '<path d="M12 20 C5 14 3 11 3 8 a4.5 4.5 0 0 1 9 -1 a4.5 4.5 0 0 1 9 1 c0 3 -2 6 -9 12 Z"/>',
    "star": '<path d="M12 3 L14.6 9 L21 9.6 L16.2 13.8 L17.6 20 L12 16.7 L6.4 20 L7.8 13.8 L3 9.6 L9.4 9 Z"/>',
    "badge": '<circle cx="12" cy="9" r="6"/><path d="M8.5 14 L7 21 L12 18.5 L17 21 L15.5 14"/>',
    "stamp": '<rect x="4" y="4" width="16" height="16" rx="1.5" stroke-dasharray="2.2 2.2"/><circle cx="12" cy="12" r="3.5"/>',
    "box": '<path d="M3 8 H21 V20 H3 Z M2 4 H22 V8 H2 Z M9 12 H15"/>',
    "egg": '<path d="M12 3 C16 3 19 10 19 14 a7 7 0 0 1 -14 0 C5 10 8 3 12 3 Z"/>',
    "feather": '<path d="M20 4 C12 4 6 9 5 17 L4 20 M5 17 C13 17 18 12 20 4 M9 15 L14 10"/>',
    "phone": '<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M11 18 H13"/>',
    "message": '<path d="M4 5 H20 V16 H11 L6 20 V16 H4 Z"/>',
    "pencil": '<path d="M4 20 L5 15 L16 4 L20 8 L9 19 Z M14 6 L18 10"/>',
    "trash": '<path d="M4 7 H20 M9 7 V4 H15 V7 M6 7 L7 20 H17 L18 7 M10 11 V16 M14 11 V16"/>',
    "info": '<circle cx="12" cy="12" r="8.5"/><path d="M12 11 V16.5"/><circle cx="12" cy="7.8" r=".6" fill="#2A2140"/>',
    "warning": '<path d="M12 3.5 L21.5 20 H2.5 Z M12 10 V14.5"/><circle cx="12" cy="17.2" r=".6" fill="#2A2140"/>',
}


def icon(name, size=22, sw=2.2, color=INK):
    inner = ICONS[name].replace("#2A2140", color)
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink: 0"><g fill="none" stroke="{color}" stroke-width="{sw}" '
            f'stroke-linecap="round" stroke-linejoin="round">{inner}</g></svg>')


def seed(size=16, fill=SUN):
    return (f'<svg width="{size}" height="{size}" viewBox="0 0 24 24" aria-hidden="true" style="flex-shrink: 0"><path d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z" fill="{fill}" stroke="{INK}" '
            f'stroke-width="2.4" stroke-linejoin="round"/><path d="M12 8 V16" stroke="{INK}" stroke-width="2" stroke-linecap="round"/></svg>')


# ---------------------------------------------------------------- illustrations
_S25 = f'stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"'


def scallop(cx, cy, r, n, fill, sw=2.5):
    o = []
    for i in range(n):
        a = 2 * math.pi * i / n
        o.append(f'<circle cx="{cx + r * math.cos(a):.1f}" cy="{cy + r * math.sin(a):.1f}" r="{r * .3:.1f}" fill="{fill}" stroke="{INK}" stroke-width="{sw}"/>')
    o.append(f'<circle cx="{cx}" cy="{cy}" r="{r:.1f}" fill="{fill}"/>')
    return "".join(o)


def postmark(city="PHILA, PA", date="NOV 19", color=STAMP):
    return (f'<circle cx="42" cy="42" r="38" fill="{CARD}" stroke="{color}" stroke-width="2.5"/><circle cx="42" cy="42" r="31" fill="none" stroke="{color}" stroke-width="1.5" stroke-dasharray="3 3"/>'
            f'<text x="42" y="30" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="8.5" letter-spacing="1" fill="{color}">PIGEON POST</text>'
            f'<text x="42" y="49" text-anchor="middle" font-family="\'Bagel Fat One\', sans-serif" font-size="17" fill="{color}">{esc(date)}</text>'
            f'<text x="42" y="62" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="{8.5 if len(city) <= 9 else 7}" letter-spacing="{1 if len(city) <= 9 else .4}" fill="{color}">{esc(city)}</text>')


def sunburst(color=SUN, n=12):
    return "".join(f'<path d="M100 100 L92 0 L108 0 Z" fill="{color}" transform="rotate({360 / n * i:.0f} 100 100)"/>' for i in range(n))


ILLOS = {
    "cloud": ("0 0 74 36", f'<path d="M10 28 q-8 -2 -6 -10 q0 -10 12 -10 q6 -8 18 -5 q12 -3 15 8 q12 0 12 9 q0 8 -9 8 z" fill="{CARD}" {_S25}/>'),
    "coop": ("6 54 186 148", f'<rect x="24" y="100" width="150" height="96" rx="6" fill="{SUN}" stroke="{INK}" stroke-width="3"/><path d="M12 104 L99 62 L186 104 Z" fill="{TOMATO}" stroke="{INK}" stroke-width="3" stroke-linejoin="round"/><rect x="76" y="80" width="46" height="16" rx="4" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="99" y="92" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="10" fill="{INK}">LOFT 4B</text><path d="M40 196 V150 a26 26 0 0 1 52 0 V196 Z" fill="{INK}"/><path d="M106 196 V150 a26 26 0 0 1 52 0 V196 Z" fill="{INK}"/>'),
    "water-tower": ("302 24 70 92", f'<g {_S25}><path d="M318 112 V84 M356 112 V84" fill="none"/><rect x="312" y="52" width="50" height="34" rx="4" fill="{WOOD}"/><path d="M308 54 L337 30 L366 54 Z" fill="{TOMATO}"/></g>'),
    "flowerpot": ("300 70 62 100", f'<g {_S25}><path d="M306 166 L312 128 H350 L356 166 Z" fill="{TOMATO}"/><rect x="304" y="120" width="54" height="12" rx="3" fill="{TOMATO}"/><path d="M331 120 V96" fill="none"/><path d="M331 104 Q316 100 314 84 Q330 86 331 104 Z" fill="{MINT}"/><path d="M331 98 Q346 92 350 76 Q334 78 331 98 Z" fill="{MINT}"/></g>'),
    "statue": ("130 64 90 98", f'<g stroke="{INK}" stroke-width="3" stroke-linejoin="round"><rect x="136" y="136" width="76" height="22" rx="3" fill="{LILAC}"/><path d="M144 136 Q146 112 174 110 Q202 112 204 136 Z" fill="#9CC7B5"/><circle cx="174" cy="92" r="22" fill="#9CC7B5"/></g><path d="M165 90 h6 M178 90 h6 M168 101 q6 -4 12 0" stroke="{INK}" stroke-width="2.4" fill="none" stroke-linecap="round"/>'),
    "pretzel": ("-4 -4 38 32", f'<path d="M6 16 C-4 2 14 -4 15 8 C16 -4 34 2 24 16 C20 24 10 24 6 16 Z M9 18 L22 5 M21 18 L8 5" fill="none" stroke="{INK}" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/><path d="M6 16 C-4 2 14 -4 15 8 C16 -4 34 2 24 16 C20 24 10 24 6 16 Z M9 18 L22 5 M21 18 L8 5" fill="none" stroke="{WOOD}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>'),
    "bagel": ("0 0 48 48", f'<circle cx="24" cy="24" r="20" fill="#E0A870" {_S25}/><circle cx="24" cy="24" r="7" fill="{PAPER}" {_S25}/><g fill="{CARD}" stroke="{INK}" stroke-width="1.2"><ellipse cx="13" cy="15" rx="2.2" ry="1.3"/><ellipse cx="34" cy="13" rx="2.2" ry="1.3"/><ellipse cx="37" cy="30" rx="2.2" ry="1.3"/><ellipse cx="14" cy="34" rx="2.2" ry="1.3"/><ellipse cx="25" cy="39" rx="2.2" ry="1.3"/><ellipse cx="24" cy="9" rx="2.2" ry="1.3"/></g>'),
    "bread": ("0 0 64 42", f'<path d="M6 36 V20 Q6 6 20 6 H44 Q58 6 58 20 V36 Z" fill="#E0A870" {_S25}/><path d="M20 10 L16 20 M32 10 L28 20 M44 10 L40 20" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'),
    "barn": ("0 0 64 58", f'<path d="M8 26 H56 V54 H8 Z" fill="{TOMATO}" {_S25}/><path d="M4 28 L16 10 H48 L60 28 Z" fill="{STAMP}" {_S25}/><rect x="24" y="34" width="16" height="20" fill="{CARD}" {_S25}/><path d="M24 34 L40 54 M40 34 L24 54" stroke="{INK}" stroke-width="2"/>'),
    "egg": ("0 0 60 74", f'<path d="M30 4 C44 4 54 30 54 46 a24 24 0 0 1 -48 0 C6 30 16 4 30 4 Z" fill="{CARD}" {_S25}/><circle cx="22" cy="34" r="3" fill="{LILAC}"/><circle cx="38" cy="50" r="4" fill="{LILAC}"/><circle cx="36" cy="24" r="2.4" fill="{LILAC}"/><path d="M16 44 l6 5 l6 -6 l6 6 l6 -5" fill="none" stroke="{INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>'),
    "eggshell": ("30 182 50 40", f'<path d="M34 196 l7 -9 l7 9 l7 -9 l7 9 l7 -9 l7 9 q-3 20 -21 20 q-18 0 -21 -20 z" fill="{CARD}" {_S25}/>'),
    "sunburst": ("0 0 200 200", sunburst()),
    "bottle-cap": ("0 0 30 38", f'<g stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"><path d="M15 4 l3 3 l4 -1 l1 4 l4 1 l-1 4 l3 3 l-3 3 l1 4 l-4 1 l-1 4 l-4 -1 l-3 3 l-3 -3 l-4 1 l-1 -4 l-4 -1 l1 -4 l-3 -3 l3 -3 l-1 -4 l4 -1 l1 -4 l4 1 z" fill="{TOMATO}"/><circle cx="15" cy="19" r="6" fill="{CARD}"/></g>'),
    "button": ("32 5 28 28", f'<circle cx="46" cy="19" r="12" fill="{PURPLE}" stroke="{INK}" stroke-width="2.2"/><g fill="{INK}"><circle cx="42.5" cy="15.5" r="1.7"/><circle cx="49.5" cy="15.5" r="1.7"/><circle cx="42.5" cy="22.5" r="1.7"/><circle cx="49.5" cy="22.5" r="1.7"/></g>'),
    "wrapper": ("54 6 38 26", f'<path d="M56 12 L64 8 L66 14 L84 10 L86 16 L90 18 L86 22 L84 28 L66 24 L64 30 L56 26 L60 19 Z" fill="{SUN}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'),
    "seed": ("0 0 24 24", f'<path d="M12 3 C17 7 19 12 12 21 C5 12 7 7 12 3 Z" fill="{SUN}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/><path d="M12 8 V16" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'),
    "wax-seal": ("0 0 60 60", scallop(30, 30, 20, 11, TOMATO) + f'<circle cx="30" cy="30" r="13" fill="none" stroke="{INK}" stroke-width="2"/><path d="M36 22 C28 22 24 27 23 35 L22 38 M23 35 C30 35 34 30 36 22" fill="none" stroke="{INK}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/>'),
    "postmark": ("0 0 84 84", postmark()),
    "tree": ("0 0 30 34", f'<path d="M15 20 V32" stroke="{INK}" stroke-width="3" stroke-linecap="round"/><circle cx="15" cy="13" r="11" fill="{MINT}" stroke="{INK}" stroke-width="2.2"/>'),
    "feather": ("0 0 26 44", f'<path d="M13 42 V20" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/><path d="M13 30 C2 26 2 10 13 2 C24 10 24 26 13 30 Z" fill="#B8B3D6" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/><path d="M13 8 V28" stroke="{INK}" stroke-width="1.8"/>'),
    "puff": ("0 0 44 30", f'<path d="M8 24 q-6 -2 -4 -8 q1 -6 8 -5 q3 -7 11 -5 q8 -3 11 4 q8 0 7 8 q-1 6 -7 6 z" fill="{CARD}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'),
    "moon": ("0 0 40 40", f'<path d="M32 24 A14 14 0 1 1 16 8 A11 11 0 0 0 32 24 Z" fill="{PAPER}" stroke="{INK}" stroke-width="2.4" stroke-linejoin="round"/>'),
    "scroll": ("0 0 40 26", f'<rect x="3" y="5" width="34" height="16" rx="8" fill="{CARD}" stroke="{INK}" stroke-width="2.4"/><path d="M13 5 V21" stroke="{TOMATO}" stroke-width="2.4"/><path d="M19 13 H31" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'),
    "sealed-note": ("0 0 120 84", f'<rect x="6" y="10" width="108" height="66" rx="5" fill="{CARD}" stroke="{INK}" stroke-width="2.5"/><path d="M6 14 L60 50 L114 14" fill="none" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/><g transform="translate(40 30) scale(.68)">' + scallop(30, 30, 20, 11, TOMATO) + f'<circle cx="30" cy="30" r="13" fill="none" stroke="{INK}" stroke-width="2"/></g>'),
}


def illo(name, w, h=None, extra=""):
    vb, inner = ILLOS[name]
    hh = f' height="{h}"' if h else ""
    return f'<svg width="{w}"{hh} viewBox="{vb}" aria-hidden="true" style="display: block; flex-shrink: 0;{extra}">{inner}</svg>'


# ---------------------------------------------------------------- maps (inner svg, 390 x 480 space)
def _pin_loft(x, y, label=None, lx=0, ly=0, lw=62):
    o = f'<circle cx="{x}" cy="{y}" r="12" fill="{SUN}" stroke="{INK}" stroke-width="2.5"/><path d="M{x - 6} {y + 1} L{x} {y - 5} L{x + 6} {y + 1} V{y + 6} H{x - 6} Z" fill="{INK}"/>'
    if label:
        o += f'<rect x="{lx}" y="{ly}" width="{lw}" height="20" rx="10" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="{lx + lw / 2}" y="{ly + 14}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="11" fill="{INK}">{esc(label)}</text>'
    return o


def _pin_sill(x, y, label=None, lx=0, ly=0, lw=104):
    o = (f'<circle cx="{x}" cy="{y}" r="13" fill="{TOMATO}" stroke="{INK}" stroke-width="2.5"/><rect x="{x - 7}" y="{y - 5}" width="14" height="10" rx="1.5" fill="{CARD}" stroke="{INK}" stroke-width="1.6"/>'
         f'<path d="M{x - 6.5} {y - 4} L{x} {y + 1} L{x + 6.5} {y - 4}" fill="none" stroke="{INK}" stroke-width="1.6"/>')
    if label:
        o += f'<rect x="{lx}" y="{ly}" width="{lw}" height="20" rx="10" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="{lx + lw / 2}" y="{ly + 14}" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="11" fill="{INK}">{esc(label)}</text>'
    return o


def _route(p0, pm, p1, casing=INK, dot=INK, quad=None):
    if quad:
        d1, d2 = quad
    else:
        d1 = f"M{p0[0]} {p0[1]} L{pm[0]} {pm[1]}"; d2 = f"M{pm[0]} {pm[1]} L{p1[0]} {p1[1]}"
    return (f'<path d="{d2}" fill="none" stroke="{dot}" stroke-width="4" stroke-linecap="round" stroke-dasharray="1 10" style="animation: coo-march 1.2s linear infinite"/>'
            f'<path d="{d1}" fill="none" stroke="{casing}" stroke-width="9" stroke-linecap="round"/><path d="{d1}" fill="none" stroke="{TOMATO}" stroke-width="5" stroke-linecap="round"/>')


def map_region(route=True, pins=True):
    o = [f'<rect x="0" y="0" width="390" height="480" fill="{LAND}"/>',
         f'<g fill="{GRASS}"><ellipse cx="60" cy="70" rx="46" ry="26"/><ellipse cx="226" cy="300" rx="40" ry="22"/><ellipse cx="250" cy="420" rx="52" ry="28"/><ellipse cx="36" cy="330" rx="34" ry="24"/><ellipse cx="190" cy="80" rx="30" ry="18"/></g>',
         f'<g stroke="{INK}" stroke-width="2" stroke-linejoin="round" fill="{MINT}"><path d="M50 64 l7 -14 l7 14 z"/><path d="M66 76 l7 -14 l7 14 z"/><path d="M240 424 l7 -14 l7 14 z"/><path d="M258 414 l7 -14 l7 14 z"/><path d="M222 304 l7 -14 l7 14 z"/><path d="M28 336 l7 -14 l7 14 z"/></g>',
         f'<path d="M394 128 L352 132 Q338 152 346 176 Q318 186 322 214 Q340 232 334 270 Q322 330 300 400 Q292 440 284 484 L394 484 Z" fill="{SKY}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>',
         f'<path d="M286 -4 Q288 60 300 104 Q310 126 352 132" fill="none" stroke="{INK}" stroke-width="13" stroke-linecap="round"/><path d="M286 -4 Q288 60 300 104 Q310 126 354 132" fill="none" stroke="{SKY}" stroke-width="8" stroke-linecap="round"/>',
         f'<path d="M104 -4 Q124 110 112 196 Q108 268 150 300 Q152 350 100 390 Q62 420 44 484" fill="none" stroke="{INK}" stroke-width="12" stroke-linecap="round"/><path d="M104 -4 Q124 110 112 196 Q108 268 150 300 Q152 350 100 390 Q62 420 44 484" fill="none" stroke="{SKY}" stroke-width="7" stroke-linecap="round"/>',
         f'<g font-family="Nunito, sans-serif" font-weight="900" fill="{INK}"><text x="10" y="252" font-size="10" letter-spacing="1.5" opacity=".5">PENNSYLVANIA</text><text x="252" y="356" font-size="11" letter-spacing="2.5" text-anchor="middle" opacity=".5">NEW JERSEY</text></g>',
         f'<g font-family="Nunito, sans-serif" font-weight="800" font-size="11.5" fill="{INK}"><circle cx="268" cy="100" r="4" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="260" y="104" text-anchor="end">Newark</text><circle cx="264" cy="194" r="4" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="272" y="198">Edison</text><circle cx="208" cy="266" r="4" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="216" y="270">Princeton</text><circle cx="170" cy="312" r="4" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="178" y="316">Trenton</text></g>']
    if route:
        o.append(_route(None, None, None, quad=("M300 118 Q266 157 224 210", "M224 210 Q161 289 80 400")))
    if pins:
        o.append(_pin_loft(300, 118)); o.append(_pin_sill(80, 400))
    return "".join(o)


def map_country(night=False, route=True, pins=True):
    land, water = (NIGHT, NIGHTWATER) if night else (LAND, SKY)
    line = PAPER if night else INK; lop = ".75" if night else "1"; top = ".72" if night else ".5"
    o = [f'<rect x="0" y="0" width="390" height="480" fill="{land}"/>',
         f'<g fill="{water}" stroke="{line}" stroke-width="2" stroke-linejoin="round" stroke-opacity="{lop}"><path d="M394 170 L352 178 L334 192 Q318 216 314 240 Q296 262 290 292 Q284 330 268 372 Q230 420 190 484 L394 484 Z"/><path d="M228 126 Q190 132 150 152 Q134 160 132 166 Q160 166 196 150 Q222 140 232 130 Z"/><ellipse cx="250" cy="108" rx="36" ry="10"/><path d="M52 160 Q40 100 50 40 Q66 30 76 44 Q84 100 72 156 Q62 166 52 160 Z"/><path d="M150 120 Q128 90 140 56 Q170 40 196 60 Q216 84 190 100 Q176 120 150 120 Z"/></g>',
         f'<g fill="none" stroke="{line}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" opacity=".5"><path d="M246 232 l6 -9 l6 9 M232 252 l6 -9 l6 9 M218 272 l6 -9 l6 9 M202 294 l6 -9 l6 9 M184 316 l6 -9 l6 9"/></g>',
         f'<g font-family="Nunito, sans-serif" font-weight="900" font-size="10" letter-spacing="1.5" fill="{line}" opacity="{top}"><text x="292" y="150">N.Y.</text><text x="258" y="212">PA.</text><text x="146" y="212">OHIO</text><text x="88" y="222">IND.</text><text x="92" y="116">MICH.</text><text x="206" y="252">W.VA.</text><text x="252" y="282">VA.</text><text x="108" y="282">KY.</text><text x="100" y="330">TENN.</text><text x="226" y="330">N.C.</text><text x="200" y="374">S.C.</text><text x="140" y="402">GA.</text></g>',
         f'<g font-family="Nunito, sans-serif" font-weight="800" font-size="11" fill="{line}"><circle cx="170" cy="168" r="3.5" fill="{land}" stroke="{line}" stroke-width="2"/><text x="170" y="190" text-anchor="middle">Cleveland</text><circle cx="206" cy="199" r="3.5" fill="{land}" stroke="{line}" stroke-width="2"/><text x="214" y="203">Pittsburgh</text></g>']
    if route:
        o.append(_route((330, 190), (204, 177), (46, 160), casing=line, dot=line))
    if pins:
        o.append(_pin_loft(330, 190)); o.append(_pin_sill(46, 160))
    return "".join(o)


def map_city():
    o = [f'<rect x="0" y="0" width="390" height="480" fill="{URBAN}"/>',
         f'<g stroke="{CARD}" stroke-width="2" opacity=".9"><path d="M230 0 L390 120 M200 40 L390 190 M170 90 L390 260 M150 150 L390 330 M150 230 L390 410 M170 300 L380 480 M130 340 L300 480"/><path d="M390 20 L230 260 M390 110 L250 340 M390 210 L290 420 M330 0 L190 190"/><path d="M0 60 L130 110 M0 130 L110 180 M0 200 L90 250 M0 270 L60 300 M30 0 L60 300 M80 0 L100 220"/></g>',
         f'<path d="M150 -4 L214 -4 Q204 120 156 220 Q116 300 66 362 L-4 424 L-4 330 Q70 280 104 200 Q140 110 150 -4 Z" fill="{SKY}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>',
         f'<g fill="{GRASS}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"><path d="M282 132 L340 176 L318 206 L260 162 Z"/><path d="M30 20 L70 30 L62 150 L22 140 Z"/><path d="M300 330 L360 372 L332 420 L270 380 Z"/></g>',
         f'<g fill="none" stroke-linecap="round"><path d="M390 46 Q300 190 250 300 Q214 380 226 484" stroke="{INK}" stroke-width="9"/><path d="M390 46 Q300 190 250 300 Q214 380 226 484" stroke="{CARD}" stroke-width="5"/><path d="M84 252 L204 190" stroke="{INK}" stroke-width="9"/><path d="M84 252 L204 190" stroke="{CARD}" stroke-width="5"/><path d="M40 330 L150 300" stroke="{INK}" stroke-width="7"/><path d="M40 330 L150 300" stroke="{CARD}" stroke-width="3.6"/></g>',
         f'<g font-family="Nunito, sans-serif" font-weight="900" font-size="10" letter-spacing="1.4" fill="{INK}"><text x="236" y="250" opacity=".7">WILLIAMSBURG</text><text x="262" y="96" opacity=".7">GREENPOINT</text><text x="8" y="230" opacity=".7">EAST VILLAGE</text><text x="250" y="454" opacity=".7">BED-STUY</text><text transform="translate(118 196) rotate(-62)" font-size="9" opacity=".7">EAST RIVER</text></g>']
    return "".join(o)


def map_block(pid="coo-blk", route=True, pins=True):
    o = [f'<defs><pattern id="{pid}" width="112" height="78" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)"><rect x="0" y="0" width="112" height="78" fill="{CARD}"/><rect x="8" y="8" width="96" height="62" rx="7" fill="{BLOCK}" stroke="{INK}" stroke-width="2.5"/><path d="M40 8 V70 M72 8 V70" stroke="{INK}" stroke-width="1.4" opacity=".3"/></pattern></defs>',
         f'<rect x="0" y="0" width="390" height="480" fill="url(#{pid})"/>',
         f'<path d="M-4 -4 L22 -4 Q10 120 26 240 Q14 300 -4 330 Z" fill="{SKY}" stroke="{INK}" stroke-width="2.5" stroke-linejoin="round"/>',
         f'<g transform="rotate(-18)"><rect x="8" y="86" width="208" height="140" rx="10" fill="{GRASS}" stroke="{INK}" stroke-width="2.5"/><g stroke="{INK}" stroke-width="2" fill="{MINT}"><circle cx="50" cy="126" r="11"/><circle cx="92" cy="182" r="13"/><circle cx="150" cy="120" r="12"/><circle cx="182" cy="190" r="10"/></g>'
         f'<rect x="232" y="164" width="96" height="62" rx="7" fill="{SUN}" stroke="{INK}" stroke-width="2.5"/><rect x="-104" y="320" width="96" height="62" rx="7" fill="{ROSE}" stroke="{INK}" stroke-width="2.5"/><rect x="120" y="242" width="96" height="62" rx="7" fill="{TOMATO}" stroke="{INK}" stroke-width="2.5"/><rect x="134" y="262" width="68" height="22" rx="5" fill="{CARD}" stroke="{INK}" stroke-width="2"/><text x="168" y="277" text-anchor="middle" font-family="Nunito, sans-serif" font-weight="900" font-size="10" letter-spacing="1" fill="{INK}">BAGELS</text>'
         f'<g font-family="Nunito, sans-serif" font-weight="900" font-size="9" letter-spacing=".6" fill="{INK}"><text x="236" y="315">N 7TH ST</text><text x="60" y="393">N 5TH ST</text><text transform="translate(227 330) rotate(90)">BEDFORD AVE</text></g></g>']
    if route:
        o.append(_route((327, 99), (177, 238), (55, 351)))
    if pins:
        o.append(_pin_loft(327, 99)); o.append(_pin_sill(55, 351))
    return "".join(o)


MAP_LAYERS = [
    ("Land", LAND, "background", "all", "Rural tone. Switches to the urban tone inside residential landuse."),
    ("Urban fabric", URBAN, "landuse: residential", "9+", "Warm butter fill so cities read as places."),
    ("Water", SKY, "water", "all", "Flat fill with a 2.5px ink shoreline."),
    ("Rivers", SKY, "waterway", "8+", "Sky line over a wider ink casing."),
    ("Parks and woods", GRASS, "park, landcover: wood, grass", "7+", "Tree stamps appear from zoom 13."),
    ("Major roads", CARD, "transportation: motorway, trunk, primary", "6+", "Card colour, ink casing. 3px at z6 to 10px at z16."),
    ("Streets", CARD, "transportation: minor, service", "13+", "No casing. The gaps between blocks are the streets."),
    ("Buildings", BLOCK, "building", "15+", "Rounded blocks with a 2.5px ink outline."),
    ("Borders", INK, "boundary: admin_level 2, 4", "3+", "Dashed, 40% opacity."),
    ("Place names", INK, "place", "3+", "Nunito 900, letter-spaced caps for states, sentence case for towns, paper halo."),
    ("Street names", INK, "transportation_name", "14+", "Nunito 900, 9 to 11px, caps."),
    ("Food", TOMATO, "poi: bakery, fast_food, cafe", "16+", "The only points of interest shown. Birds notice food."),
]
