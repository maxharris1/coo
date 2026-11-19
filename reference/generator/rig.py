"""Version 2 of the characters: jointed birds, detailed gear, richer motion. Overrides names from lib."""
import re
from lib import *
from lib import _eye

DTOM = "#D24F2E"; DSUN = "#E0A922"; DPUR = "#7E63C9"; DMINT = "#6CC489"; NAVY = "#2B3A67"; GLASS = "#DFF3FC"


def darken(hexv, f=.84):
    r, g, b = (int(hexv[i:i + 2], 16) for i in (1, 3, 5))
    return "#%02X%02X%02X" % (int(r * f), int(g * f), int(b * f))


MOTION = [
    ("coo-flap", ".34s", "cubic-bezier(.4,0,.6,1)", "Each wing. Flips through the body, far wing 50ms behind"),
    ("coo-fly-core", ".34s", "ease-in-out", "Body, head and tail pitch against the wing beat"),
    ("coo-fly-tail", ".34s", "ease-in-out", "Tail counter-swing in flight"),
    ("coo-bob", "1.7s", "ease-in-out, alternate", "Slow float of the whole flying bird"),
    ("coo-streak", ".5s", "linear", "Speed lines behind a flying bird"),
    ("coo-flutter", ".28s", "ease-in-out, alternate", "Scarf tails trailing in flight"),
    ("coo-takeoff-crouch", "3s", "stepped per keyframe", "Release, part 1: anticipate, crouch, spring"),
    ("coo-takeoff-fly", "3s", "stepped per keyframe", "Release, part 2: flying pose climbs out top right"),
    ("coo-land-fly", "4s", "stepped per keyframe", "Arrival, part 1: glide in from top left"),
    ("coo-land-perch", "4s", "stepped per keyframe", "Arrival, part 2: touch down, squash, settle"),
    ("coo-puff", "3s", "ease-out", "Dust kicked up at takeoff"),
    ("coo-feather", "3s", "ease-in-out", "Loose feather rocking down after takeoff"),
    ("coo-headbob", "4.2s", "ease-in-out", "Idle: pigeon head bob, forward and hold"),
    ("coo-blink", "4.6s", "ease-in-out", "Idle: eyelid, two frames shut"),
    ("coo-breathe", "1.9s", "ease-in-out, alternate", "Idle: body rises and settles"),
    ("coo-tail-flick", "5.5s", "ease-in-out", "Idle: occasional tail flick with overshoot"),
    ("coo-wing-shrug", "6s", "ease-in-out", "Idle: wing lifts and resettles"),
    ("coo-tilt", "5s", "ease-in-out", "Curious head tilt and hold"),
    ("coo-sway", "2.6s", "ease-in-out, alternate", "Scarf tails, pom-poms and bells at rest"),
    ("coo-hop", "3.2s", "ease-in-out", "Hop with squash before and after"),
    ("coo-peck-body", "1.5s", "ease-in-out", "Feeding: body tips forward"),
    ("coo-peck-head", "1.5s", "ease-in-out", "Feeding: head double-pecks"),
    ("coo-sigh", "3.4s", "ease-in-out", "Sulking: a heavy sigh"),
    ("coo-sleep", "2.4s", "ease-in-out, alternate", "Asleep: slow breathing"),
    ("coo-snooze", "2.4s", "ease-out", "Asleep: z letters drift up and fade"),
    ("coo-march", "1.2s", "linear", "Dotted path still to fly"),
    ("coo-drift", "7s", "ease-in-out, alternate", "Clouds"),
    ("coo-pulse", "1.4s", "ease-in-out", "Live dot"),
    ("coo-rain", ".7s", "ease-in, alternate", "Forecast rain"),
    ("coo-twinkle", "2.2s", "ease-in-out", "Night map stars"),
    ("coo-spin", "60s", "linear", "Sunburst behind a landing"),
    ("coo-stamp", "1.8s", "cubic-bezier(.2,1.6,.4,1)", "Postmark thunk on arrival"),
    ("coo-burst", "1.8s", "ease-out", "Seeds paid out (three directions)"),
    ("coo-press", "1.6s", "ease-in-out", "Button press with a 1px rebound"),
    ("coo-point", ".6s", "ease-in-out, alternate", "Install arrow"),
]

MOTION_CSS = """@keyframes coo-flap{0%,100%{transform:scaleY(1) rotate(-5deg)}50%{transform:scaleY(-.72) rotate(7deg)}}
@keyframes coo-fly-core{0%,100%{transform:translateY(1.6px) rotate(1.6deg)}50%{transform:translateY(-2.2px) rotate(-2deg)}}
@keyframes coo-fly-tail{0%,100%{transform:rotate(7deg)}50%{transform:rotate(-9deg)}}
@keyframes coo-bob{from{transform:translateY(2px) rotate(-1.2deg)}to{transform:translateY(-5px) rotate(1.2deg)}}
@keyframes coo-streak{0%{transform:translateX(12px);opacity:0}30%{opacity:.5}100%{transform:translateX(-18px);opacity:0}}
@keyframes coo-flutter{from{transform:rotate(56deg) scaleY(1)}to{transform:rotate(76deg) scaleY(1.1)}}
@keyframes coo-takeoff-crouch{0%{transform:translate(0,0) scale(1,1);opacity:1;animation-timing-function:ease-out}6%{transform:translate(0,-3px) scale(.97,1.04);opacity:1;animation-timing-function:ease-in-out}15%{transform:translate(0,9px) scale(1.13,.78);opacity:1}20%{transform:translate(0,10px) scale(1.14,.76);opacity:1;animation-timing-function:cubic-bezier(.3,0,.2,1)}24.4%{transform:translate(8px,-42px) scale(.9,1.16);opacity:1}24.5%{transform:translate(8px,-42px) scale(.9,1.16);opacity:0}94%{transform:translate(0,0) scale(1,1);opacity:0}100%{transform:translate(0,0) scale(1,1);opacity:1}}
@keyframes coo-takeoff-fly{0%,24.4%{transform:translate(6px,-30px) rotate(-32deg) scale(1);opacity:0}24.5%{transform:translate(6px,-34px) rotate(-32deg) scale(1);opacity:1;animation-timing-function:cubic-bezier(.3,.6,.5,1)}36%{transform:translate(44px,-130px) rotate(-26deg) scale(.95);opacity:1;animation-timing-function:ease-in}60%{transform:translate(280px,-580px) rotate(-18deg) scale(.55);opacity:1}61%,100%{transform:translate(290px,-600px) rotate(-18deg) scale(.55);opacity:0}}
@keyframes coo-land-fly{0%{transform:translate(-190px,-170px) rotate(20deg) scale(.6);opacity:0}4%{opacity:1;animation-timing-function:cubic-bezier(.2,.6,.3,1)}30%{transform:translate(-14px,-20px) rotate(4deg) scale(1);opacity:1}31%,100%{transform:translate(-14px,-20px) rotate(4deg) scale(1);opacity:0}}
@keyframes coo-land-perch{0%,30.9%{transform:translate(0,-8px) scale(.96,1.05);opacity:0}31%{transform:translate(0,-8px) scale(.96,1.05);opacity:1;animation-timing-function:ease-in}36%{transform:translate(0,3px) scale(1.14,.8);opacity:1;animation-timing-function:ease-out}43%{transform:translate(0,-7px) scale(.95,1.07);opacity:1;animation-timing-function:ease-in}50%{transform:translate(0,1px) scale(1.05,.94);opacity:1}57%{transform:translate(0,0) scale(1,1);opacity:1}94%{transform:translate(0,0) scale(1,1);opacity:1}100%{transform:translate(0,0) scale(1,1);opacity:0}}
@keyframes coo-puff{0%,18%{transform:scale(.2);opacity:0}22%{transform:scale(.7);opacity:1}48%{transform:translateY(-8px) scale(1.6);opacity:0}100%{transform:translateY(-8px) scale(1.6);opacity:0}}
@keyframes coo-feather{0%,24%{transform:translate(0,0) rotate(0deg);opacity:0}28%{opacity:1}46%{transform:translate(-20px,54px) rotate(70deg);opacity:1}64%{transform:translate(8px,108px) rotate(-30deg);opacity:1}82%{transform:translate(-12px,160px) rotate(46deg);opacity:1}92%,100%{transform:translate(-6px,178px) rotate(20deg);opacity:0}}
@keyframes coo-headbob{0%,34%{transform:translate(0,0) rotate(0deg)}40%,58%{transform:translate(4px,1px) rotate(5deg)}64%,82%{transform:translate(-1.5px,0) rotate(-3deg)}88%,100%{transform:translate(0,0) rotate(0deg)}}
@keyframes coo-blink{0%,90%,100%{transform:scaleY(0)}93%,96%{transform:scaleY(1)}}
@keyframes coo-breathe{from{transform:scale(1,1)}to{transform:scale(1.025,.972)}}
@keyframes coo-tail-flick{0%,78%,100%{transform:rotate(0deg)}83%{transform:rotate(-17deg)}88%{transform:rotate(9deg)}93%{transform:rotate(-5deg)}}
@keyframes coo-wing-shrug{0%,58%,100%{transform:rotate(0deg)}64%{transform:rotate(-16deg)}70%{transform:rotate(4deg)}76%{transform:rotate(-9deg)}84%{transform:rotate(0deg)}}
@keyframes coo-tilt{0%,28%{transform:rotate(0deg)}38%,68%{transform:rotate(-14deg)}74%{transform:rotate(3deg)}80%,100%{transform:rotate(0deg)}}
@keyframes coo-sway{from{transform:rotate(-6deg)}to{transform:rotate(6deg)}}
@keyframes coo-hop{0%,62%,100%{transform:translateY(0) scale(1,1)}68%{transform:translateY(2px) scale(1.08,.9)}76%{transform:translateY(-13px) scale(.95,1.07)}84%{transform:translateY(1px) scale(1.07,.92)}90%{transform:translateY(-3px) scale(.99,1.02)}95%{transform:translateY(0) scale(1.01,.99)}}
@keyframes coo-peck-body{0%,100%{transform:rotate(0deg)}22%,30%{transform:rotate(15deg)}38%{transform:rotate(9deg)}46%,54%{transform:rotate(15deg)}72%{transform:rotate(0deg)}}
@keyframes coo-peck-head{0%,100%{transform:rotate(0deg)}22%,30%{transform:rotate(36deg)}38%{transform:rotate(14deg)}46%,54%{transform:rotate(38deg)}72%{transform:rotate(0deg)}}
@keyframes coo-sigh{0%,55%,100%{transform:scale(1,1)}70%{transform:scale(.97,1.05)}86%{transform:scale(1.05,.94)}94%{transform:scale(.995,1.01)}}
@keyframes coo-wobble{0%,100%{transform:rotate(0deg)}25%{transform:rotate(-3deg)}75%{transform:rotate(3deg)}}
@keyframes coo-sleep{from{transform:scale(1,1)}to{transform:scale(1.04,.96)}}
@keyframes coo-snooze{0%{transform:translate(0,0) scale(.5);opacity:0}15%{opacity:1}100%{transform:translate(12px,-26px) scale(1.25);opacity:0}}
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
@keyframes coo-press{0%,36%,100%{transform:translateY(0);box-shadow:0 4px 0 #2A2140}46%,62%{transform:translateY(3px);box-shadow:0 1px 0 #2A2140}72%{transform:translateY(-1px);box-shadow:0 5px 0 #2A2140}82%{transform:translateY(0);box-shadow:0 4px 0 #2A2140}}
@keyframes coo-point{from{transform:translateY(0)}to{transform:translateY(7px)}}
@media (prefers-reduced-motion: reduce){*{animation:none !important}}"""

# ---------------------------------------------------------------- gear, version 2
_G = f'stroke="{INK}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"'
_T = f'fill="none" stroke-linecap="round" stroke-linejoin="round"'
ON_PRE = {
    "goggles": (f'<path d="M68.5 30 Q74 21.5 83 25" fill="none" stroke="{INK}" stroke-width="6.6" stroke-linecap="round"/><path d="M68.5 30 Q74 21.5 83 25" fill="none" stroke="{WOOD}" stroke-width="3.6" stroke-linecap="round"/>'
                f'<rect x="71.5" y="22.6" width="4.6" height="5.6" rx="1.2" fill="{SUN}" stroke="{INK}" stroke-width="1.6" transform="rotate(-28 73.8 25.4)"/>'
                f'<circle cx="92" cy="30" r="11.2" fill="{SUN}" stroke="{INK}" stroke-width="2.6"/><circle cx="92" cy="30" r="8.6" fill="{GLASS}" stroke="{INK}" stroke-width="2"/>'),
}
ON = {
    "goggles": f'<path d="M85.6 25.4 Q88 22.4 91.6 22" {_T} stroke="{CARD}" stroke-width="2.2"/>',
    "scarf": (f'<g§scarf§><path d="M79 59 L78 84 L87.5 83 L86 61 Z" fill="{DTOM}" {_G}/><path d="M78.3 76 H86.8 M78.2 80 H87" {_T} stroke="{CARD}" stroke-width="2"/><path d="M79.5 84 v4 M83 83.8 v4 M86.4 83.4 v4" {_T} stroke="{INK}" stroke-width="1.6"/>'
              f'<path d="M73 57 L66 80 L76 83 L80.5 61 Z" fill="{TOMATO}" {_G}/><path d="M68.6 72 L77.6 74.6 M67.4 76.4 L76.8 79" {_T} stroke="{CARD}" stroke-width="2"/><path d="M66.4 80.4 l-1 4 M69.8 81.4 l-.7 4 M73.2 82.3 l-.3 4" {_T} stroke="{INK}" stroke-width="1.6"/></g>'
              f'<ellipse cx="83" cy="53" rx="17.5" ry="9" fill="{TOMATO}" {_G}/><path d="M67.5 51 Q83 60.5 98.5 51" {_T} stroke="{DTOM}" stroke-width="2.4"/><path d="M71 49.5 Q83 55 95 49.5" {_T} stroke="{CARD}" stroke-width="2.2"/>'),
    "bow": (f'<path d="M99 53 C94 45.5 88 44.5 87 47 V59 C88 61.5 94 60.5 99 53 Z" fill="{PURPLE}" {_G}/><path d="M99 53 C104 45.5 110 44.5 111 47 V59 C110 61.5 104 60.5 99 53 Z" fill="{PURPLE}" {_G}/>'
            f'<path d="M90.5 49.5 L94.5 53 L90.5 56.5 M107.5 49.5 L103.5 53 L107.5 56.5" {_T} stroke="{DPUR}" stroke-width="1.8"/>'
            f'<g fill="{CARD}"><circle cx="89.6" cy="48.4" r="1.1"/><circle cx="89.6" cy="57.6" r="1.1"/><circle cx="108.4" cy="48.4" r="1.1"/><circle cx="108.4" cy="57.6" r="1.1"/></g>'
            f'<rect x="96" y="49.4" width="6" height="7.2" rx="2.4" fill="{DPUR}" stroke="{INK}" stroke-width="2"/>'),
    "bandana": (f'<path d="M69 50 L60.5 44.5 L63 53 Z M69 52 L60 56.5 L66.5 58.5 Z" fill="{SUN}" stroke="{INK}" stroke-width="2.2" stroke-linejoin="round"/>'
                f'<path d="M67 48 Q83 56.5 99 48 L86 75 Z" fill="{SUN}" {_G}/><path d="M67 48 Q83 56.5 99 48 Q83 62 67 48 Z" fill="{DSUN}"/><path d="M67 48 Q83 56.5 99 48" {_T} stroke="{INK}" stroke-width="2.4"/>'
                f'<g fill="{INK}"><circle cx="79.5" cy="59.5" r="1.6"/><circle cx="88.5" cy="59.5" r="1.6"/><circle cx="84.5" cy="66" r="1.6"/></g><g fill="{CARD}"><circle cx="84" cy="62" r="1"/><circle cx="86" cy="70" r="1"/></g>'),
    "beanie": (f'<path d="M67.5 27 Q66 4 87 4 Q106 5 105.5 25 Q86 15 67.5 27 Z" fill="{TOMATO}" {_G}/><path d="M77 8 Q75 15 76 21 M87 5.5 Q86 12 87 17.5 M97 8 Q97.5 14 97 20" {_T} stroke="{DTOM}" stroke-width="2"/>'
               f'<path d="M66.5 28.5 Q86 15.5 106.5 26.5" fill="none" stroke="{INK}" stroke-width="9.6" stroke-linecap="round"/><path d="M66.5 28.5 Q86 15.5 106.5 26.5" fill="none" stroke="{CARD}" stroke-width="5.8" stroke-linecap="round"/>'
               f'<path d="M72 23.2 l1.5 3.8 M79 19.8 l1.2 4 M86 18.4 l.6 4.2 M93 19 l-.2 4.2 M100 21 l-1 4" {_T} stroke="{DASH}" stroke-width="1.6"/>'
               f'<g§pom§><circle cx="87" cy="0" r="6.2" fill="{CARD}" stroke="{INK}" stroke-width="2.2"/><path d="M84 -2 l2 2 M89.5 -3 l-1 3 M86 3 l3 -1.2" {_T} stroke="{DASH}" stroke-width="1.4"/></g>'),
    "rainhat": (f'<path d="M68 24 Q69 3 87 3 Q104 4 106 21 Z" fill="{SUN}" {_G}/><path d="M87 3 V18" {_T} stroke="{DSUN}" stroke-width="2.2"/>'
                f'<path d="M55 34 Q70 17 87 18 Q106 18 121 27 Q104 25.5 88 26.5 Q70 27.5 55 34 Z" fill="{SUN}" {_G}/><path d="M61 30.5 Q73 24 88 23.4 Q101 23.2 112 25.4" {_T} stroke="{DSUN}" stroke-width="2.2"/>'
                f'<path d="M117 9 q3.4 4.4 0 6.6 q-3.4 -2.2 0 -6.6 Z" fill="{SKY}" stroke="{INK}" stroke-width="1.6" stroke-linejoin="round"/>'),
    "cap": (f'<path d="M69 21 Q68 5.5 86 5 Q104 5.5 103 21 Q86 14 69 21 Z" fill="{CARD}" {_G}/>'
            f'<path d="M68.5 22 Q86 14.5 103.5 22" fill="none" stroke="{INK}" stroke-width="7.8" stroke-linecap="round"/><path d="M68.5 22 Q86 14.5 103.5 22" fill="none" stroke="{NAVY}" stroke-width="4.4" stroke-linecap="round"/>'
            f'<path d="M96 19.5 Q110 18.5 115 26 Q105 23.6 97 25 Z" fill="{INK}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/><path d="M101 21.4 Q106 20.8 110.5 23.4" {_T} stroke="{CARD}" stroke-width="1.4" opacity=".75"/>'
            f'<circle cx="86.5" cy="11" r="3.6" fill="{SUN}" stroke="{INK}" stroke-width="1.6"/><path d="M86.5 9 V13 M84.8 11.8 Q86.5 13.8 88.2 11.8" {_T} stroke="{INK}" stroke-width="1.1"/>'),
    "party": (f'<path d="M77.5 20 Q80 44 97 47.5" {_T} stroke="{INK}" stroke-width="1.3" opacity=".55"/>'
              f'<path d="M75 19 L89 -11 L100 18 Q88 14 75 19 Z" fill="{PURPLE}" {_G}/><path d="M80.4 8 L95.4 5.4 M77.6 14.4 L98.2 11.4 M84.6 -1.4 L92 -2.8" {_T} stroke="{SUN}" stroke-width="3"/>'
              f'<path d="M75 19 L89 -11 L100 18 Q88 14 75 19 Z" fill="none" {_G}/><path d="M74.5 19.6 q3 -3 6 -.8 q3 -2.6 6.2 -.7 q3 -2.4 6.2 -.3 q3 -2 7 .5" {_T} stroke="{CARD}" stroke-width="4.4"/><path d="M74.5 19.6 q3 -3 6 -.8 q3 -2.6 6.2 -.7 q3 -2.4 6.2 -.3 q3 -2 7 .5" {_T} stroke="{INK}" stroke-width="1.6"/>'
              f'<g§pom§><circle cx="89" cy="-12" r="4.6" fill="{SUN}" stroke="{INK}" stroke-width="2"/><path d="M84 -17 l2 2.4 M94 -17 l-2 2.4 M89 -19.5 v3" {_T} stroke="{INK}" stroke-width="1.5"/></g>'),
    "earmuffs": (f'<path d="M71 33 Q70 10 87 10 Q103 10 103.5 23" fill="none" stroke="{INK}" stroke-width="6.6" stroke-linecap="round"/><path d="M71 33 Q70 10 87 10 Q103 10 103.5 23" fill="none" stroke="{SUN}" stroke-width="3.2" stroke-linecap="round"/>'
                 + scallop(76, 37, 9, 9, TOMATO, 2.2) + f'<circle cx="76" cy="37" r="5.4" fill="{DTOM}"/><path d="M72.6 34.6 Q74 32.6 76.4 32.4" {_T} stroke="{CARD}" stroke-width="1.6" opacity=".8"/>'),
    "band": f'<rect x="63" y="90.8" width="10" height="6.8" rx="2.6" fill="{SUN}" stroke="{INK}" stroke-width="2"/><path d="M65.2 93 H69" {_T} stroke="{CARD}" stroke-width="1.5"/><path d="M65 95.4 H71" {_T} stroke="{DSUN}" stroke-width="1.2"/>',
    "bell": (f'<rect x="48.4" y="89.6" width="7.2" height="3.8" rx="1.6" fill="{WOOD}" stroke="{INK}" stroke-width="1.6"/>'
             f'<g§bell§><path d="M52 93.2 Q58 94.4 57.4 100.4 Q52 103 46.6 100.4 Q46 94.4 52 93.2 Z" fill="{SUN}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/><path d="M49.4 100 H54.6" {_T} stroke="{INK}" stroke-width="1.6"/><path d="M49 97 Q49.4 95.6 50.8 95.2" {_T} stroke="{CARD}" stroke-width="1.4"/></g>'),
    "tube": (f'<rect x="57.5" y="87.6" width="21.5" height="10.4" rx="5.2" fill="{CARD}" stroke="{INK}" stroke-width="2.2"/><path d="M57.5 92.8 a5.2 5.2 0 0 1 5.2 -5.2 h1.8 v10.4 h-1.8 a5.2 5.2 0 0 1 -5.2 -5.2 Z" fill="{SUN}" stroke="{INK}" stroke-width="2" stroke-linejoin="round"/>'
             f'<path d="M72.4 87.8 V97.8" {_T} stroke="{TOMATO}" stroke-width="2.4"/><path d="M66.6 90.6 H70" {_T} stroke="{DASH}" stroke-width="1.4"/>'),
    "booties": "".join(f'<path d="M{47 + dx} 93 H{57 + dx} V98 Q{62 + dx} 98 {62.5 + dx} 101.6 V103 H{47 + dx} Z" fill="{SUN}" {_G}/><rect x="{46.4 + dx}" y="102.4" width="16.8" height="3.2" rx="1.4" fill="{CARD}" stroke="{INK}" stroke-width="1.8"/>'
                       f'<path d="M{47.4 + dx} 95.6 H{56.6 + dx}" {_T} stroke="{DSUN}" stroke-width="1.8"/><path d="M{49.2 + dx} 97.6 V100.4" {_T} stroke="{CARD}" stroke-width="1.5"/>' for dx in (0, 16)),
    "backpack": (f'<path d="M47 44 Q62 39 77 51" fill="none" stroke="{INK}" stroke-width="5.4" stroke-linecap="round"/><path d="M47 44 Q62 39 77 51" fill="none" stroke="{WOOD}" stroke-width="2.8" stroke-linecap="round"/>'
                 f'<rect x="26" y="26.6" width="20" height="8" rx="4" fill="{PEACH}" stroke="{INK}" stroke-width="2"/><path d="M30 28.6 q2.4 2 0 4" {_T} stroke="{INK}" stroke-width="1.3"/>'
                 f'<rect x="23" y="33" width="26" height="28" rx="8" fill="{MINT}" {_G}/><path d="M23 43 Q36 51.5 49 43 V41 Q49 33 41 33 H31 Q23 33 23 41 Z" fill="{DMINT}" {_G}/>'
                 f'<rect x="33.4" y="44.6" width="5.2" height="6.4" rx="1.4" fill="{SUN}" stroke="{INK}" stroke-width="1.6"/><path d="M27.5 55.4 H44.5" {_T} stroke="{DMINT}" stroke-width="1.6" stroke-dasharray="2.4 2.4"/>'),
}
_NECK = ("scarf", "bow", "bandana")
_HEAD = ("beanie", "rainhat", "cap", "party", "earmuffs")
_LEG = ("band", "bell", "tube", "booties")

_I = f'stroke="{INK}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"'
GEAR_ICON = {
    "goggles": (f'<path d="M1.6 13.4 H5 M27 13.4 H30.4" {_T} stroke="{INK}" stroke-width="5"/><path d="M1.6 13.4 H5 M27 13.4 H30.4" {_T} stroke="{WOOD}" stroke-width="2.4"/><path d="M13.6 15 Q16 12.6 18.4 15" {_T} stroke="{INK}" stroke-width="2.4"/>'
                f'<circle cx="9.6" cy="16" r="6.6" fill="{SUN}" {_I}/><circle cx="22.4" cy="16" r="6.6" fill="{SUN}" {_I}/><circle cx="9.6" cy="16" r="4.2" fill="{GLASS}" stroke="{INK}" stroke-width="1.6"/><circle cx="22.4" cy="16" r="4.2" fill="{GLASS}" stroke="{INK}" stroke-width="1.6"/>'
                f'<path d="M7.4 15 Q8 13.4 9.6 13 M20.2 15 Q20.8 13.4 22.4 13" {_T} stroke="{CARD}" stroke-width="1.5"/>'),
    "beanie": (f'<path d="M6 21 Q6 8.4 16 8.4 Q26 8.4 26 21 Z" fill="{TOMATO}" {_I}/><path d="M11 11.6 V19 M16 9.4 V19 M21 11.6 V19" {_T} stroke="{DTOM}" stroke-width="1.8"/><rect x="4" y="19.6" width="24" height="7.4" rx="3.7" fill="{CARD}" {_I}/>'
               f'<path d="M9 21.4 V25.2 M13.6 21.4 V25.2 M18.4 21.4 V25.2 M23 21.4 V25.2" {_T} stroke="{DASH}" stroke-width="1.5"/><circle cx="16" cy="6" r="3.8" fill="{CARD}" {_I}/>'),
    "rainhat": (f'<path d="M9 18 Q9 5.4 16 5.4 Q23 5.4 23 17 Z" fill="{SUN}" {_I}/><path d="M16 5.4 V15" {_T} stroke="{DSUN}" stroke-width="1.8"/><path d="M2.6 24.6 Q8 16.4 16 16.6 Q24 16.4 29.4 21.4 Q22 20.2 16 20.8 Q8 21.4 2.6 24.6 Z" fill="{SUN}" {_I}/>'
                f'<path d="M26.4 6.6 q2.6 3.6 0 5.4 q-2.6 -1.8 0 -5.4 Z" fill="{SKY}" stroke="{INK}" stroke-width="1.5" stroke-linejoin="round"/>'),
    "cap": (f'<path d="M6 18 Q5 6.6 15 6.4 Q25 6.6 24 18 Z" fill="{CARD}" {_I}/><path d="M5.4 19 H24.6" {_T} stroke="{INK}" stroke-width="6.4"/><path d="M5.4 19 H24.6" {_T} stroke="{NAVY}" stroke-width="3.2"/>'
            f'<path d="M19 20.4 Q28 19.6 30.4 25 Q24 23.4 19.4 24.6 Z" fill="{INK}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/><circle cx="15" cy="12.4" r="3" fill="{SUN}" stroke="{INK}" stroke-width="1.5"/>'),
    "party": (f'<path d="M7.6 26.4 L16 5.4 L24.4 26.4 Q16 23.6 7.6 26.4 Z" fill="{PURPLE}" {_I}/><path d="M12.2 15.4 L20 13.4 M10 21 L22 18.6" {_T} stroke="{SUN}" stroke-width="2.6"/><path d="M7.6 26.4 L16 5.4 L24.4 26.4 Q16 23.6 7.6 26.4 Z" fill="none" {_I}/>'
              f'<circle cx="16" cy="4.6" r="3" fill="{SUN}" {_I}/>'),
    "earmuffs": (f'<path d="M6.4 19 Q6.4 5.6 16 5.6 Q25.6 5.6 25.6 19" {_T} stroke="{INK}" stroke-width="5"/><path d="M6.4 19 Q6.4 5.6 16 5.6 Q25.6 5.6 25.6 19" {_T} stroke="{SUN}" stroke-width="2.2"/>'
                 + scallop(6.6, 21.4, 5, 8, TOMATO, 1.8) + scallop(25.4, 21.4, 5, 8, TOMATO, 1.8) + f'<circle cx="6.6" cy="21.4" r="2.8" fill="{DTOM}"/><circle cx="25.4" cy="21.4" r="2.8" fill="{DTOM}"/>'),
    "scarf": (f'<path d="M20 16 L21.6 29 L27.2 27.6 L24.6 14.6 Z" fill="{DTOM}" {_I}/><path d="M21 22.6 L26 21.4 M21.6 25.6 L26.6 24.4" {_T} stroke="{CARD}" stroke-width="1.6"/>'
              f'<path d="M5 9 Q16 15 27 9 V15.4 Q16 21.4 5 15.4 Z" fill="{TOMATO}" {_I}/><path d="M5 12.2 Q16 18.2 27 12.2" {_T} stroke="{CARD}" stroke-width="1.8"/>'),
    "bow": (f'<path d="M16 16 C11 8.6 5.6 8 4.6 10.4 V21.6 C5.6 24 11 23.4 16 16 Z" fill="{PURPLE}" {_I}/><path d="M16 16 C21 8.6 26.4 8 27.4 10.4 V21.6 C26.4 24 21 23.4 16 16 Z" fill="{PURPLE}" {_I}/>'
            f'<path d="M8 12.6 L11.6 16 L8 19.4 M24 12.6 L20.4 16 L24 19.4" {_T} stroke="{DPUR}" stroke-width="1.6"/><rect x="13" y="12.4" width="6" height="7.2" rx="2.4" fill="{DPUR}" {_I}/>'),
    "bandana": (f'<path d="M3 8.6 Q16 15.6 29 8.6 L17 27.4 Z" fill="{SUN}" {_I}/><path d="M3 8.6 Q16 15.6 29 8.6 Q16 20 3 8.6 Z" fill="{DSUN}"/><path d="M3 8.6 Q16 15.6 29 8.6" {_T} stroke="{INK}" stroke-width="2"/>'
                f'<g fill="{INK}"><circle cx="13" cy="17.4" r="1.4"/><circle cx="19.4" cy="17.4" r="1.4"/><circle cx="16.4" cy="22" r="1.4"/></g>'),
    "band": (f'<ellipse cx="16" cy="17" rx="10.4" ry="7.2" fill="none" stroke="{INK}" stroke-width="6.4"/><ellipse cx="16" cy="17" rx="10.4" ry="7.2" fill="none" stroke="{SUN}" stroke-width="3.2"/>'
             f'<path d="M8.4 12.6 Q11 10.2 14.4 9.8" {_T} stroke="{CARD}" stroke-width="1.5"/><path d="M12.6 4.6 l1 2.2 l2.4 .3 l-1.8 1.6 l.5 2.4 l-2.1 -1.2 l-2.1 1.2 l.5 -2.4 l-1.8 -1.6 l2.4 -.3 z" fill="{CARD}" stroke="{INK}" stroke-width="1.3" stroke-linejoin="round"/>'),
    "bell": (f'<rect x="11" y="3.6" width="10" height="4.6" rx="2" fill="{WOOD}" stroke="{INK}" stroke-width="1.7"/><path d="M16 8 Q25.4 9.6 24.6 20 Q16 25 7.4 20 Q6.6 9.6 16 8 Z" fill="{SUN}" {_I}/><path d="M11.6 20 H20.4" {_T} stroke="{INK}" stroke-width="1.8"/>'
             f'<circle cx="16" cy="25.6" r="2.2" fill="{INK}"/><path d="M10.4 15.4 Q10.8 12.4 13.4 11.4" {_T} stroke="{CARD}" stroke-width="1.6"/>'),
    "tube": (f'<g transform="rotate(-35 16 16)"><rect x="4.4" y="10.6" width="23.2" height="10.8" rx="5.4" fill="{CARD}" {_I}/><path d="M4.4 16 a5.4 5.4 0 0 1 5.4 -5.4 h1.6 v10.8 h-1.6 a5.4 5.4 0 0 1 -5.4 -5.4 Z" fill="{SUN}" {_I}/>'
             f'<path d="M21.4 10.8 V21.2" {_T} stroke="{TOMATO}" stroke-width="2.2"/><path d="M14 13.6 H18.4" {_T} stroke="{DASH}" stroke-width="1.4"/></g>'),
    "booties": "".join(f'<path d="M{4 + dx} 8.6 H{11.6 + dx} V17 Q{15.4 + dx} 17 {15.8 + dx} 21 V23 H{4 + dx} Z" fill="{SUN}" {_I}/><rect x="{3.4 + dx}" y="22.4" width="13" height="3.4" rx="1.5" fill="{CARD}" stroke="{INK}" stroke-width="1.6"/>'
                       f'<path d="M{4.6 + dx} 11.6 H{11 + dx}" {_T} stroke="{DSUN}" stroke-width="1.6"/>' for dx in (0, 13.6)),
    "backpack": (f'<path d="M11.6 9 V7 a4.4 4.4 0 0 1 8.8 0 V9" {_T} stroke="{INK}" stroke-width="2"/><rect x="8" y="3.2" width="16" height="5.6" rx="2.8" fill="{PEACH}" stroke="{INK}" stroke-width="1.7"/>'
                 f'<rect x="6" y="8.6" width="20" height="20" rx="6" fill="{MINT}" {_I}/><path d="M6 16 Q16 22 26 16 V14.6 Q26 8.6 20 8.6 H12 Q6 8.6 6 14.6 Z" fill="{DMINT}" {_I}/>'
                 f'<rect x="13.6" y="17" width="4.8" height="5.6" rx="1.3" fill="{SUN}" stroke="{INK}" stroke-width="1.5"/>'),
}


def _st(anim, key, origin):
    a = (anim or {}).get(key)
    if not a or a is True:
        return ""
    return f' style="transform-box: fill-box; transform-origin: {origin}; animation: {a}"'


def _tok(s, anim):
    for key, origin in (("scarf", "50% 0%"), ("pom", "50% 100%"), ("bell", "50% 0%")):
        s = s.replace(f"§{key}§", _st(anim, key, origin))
    return s


IDLE = {"head": "coo-headbob 4.2s ease-in-out infinite", "tail": "coo-tail-flick 5.5s ease-in-out infinite", "torso": "coo-breathe 1.9s ease-in-out infinite alternate",
        "wing": "coo-wing-shrug 6s ease-in-out 1.4s infinite", "blink": True, "scarf": "coo-sway 2.6s ease-in-out infinite alternate", "pom": "coo-sway 1.8s ease-in-out infinite alternate", "bell": "coo-sway 1.4s ease-in-out infinite alternate"}
CALM = {"torso": "coo-breathe 1.9s ease-in-out infinite alternate", "blink": True, "tail": "coo-tail-flick 5.5s ease-in-out 1s infinite"}
SLEEPING = {"torso": "coo-sleep 2.4s ease-in-out infinite alternate"}
CURIOUS = {"head": "coo-tilt 5s ease-in-out infinite", "torso": "coo-breathe 1.9s ease-in-out infinite alternate", "blink": True, "tail": "coo-tail-flick 5.5s ease-in-out infinite"}
PECKING = {"all": "coo-peck-body 1.5s ease-in-out infinite", "head": "coo-peck-head 1.5s ease-in-out infinite", "tail": "coo-tail-flick 3s ease-in-out infinite"}
HOPPING = {"all": "coo-hop 3.2s ease-in-out infinite", "blink": True, "tail": "coo-tail-flick 3.2s ease-in-out infinite", "head": "coo-headbob 4.2s ease-in-out infinite"}
SULKING = {"torso": "coo-sigh 3.4s ease-in-out infinite", "all": "coo-wobble 3.4s ease-in-out infinite"}
FLYING = {"wing": "coo-flap .34s cubic-bezier(.4,0,.6,1) infinite", "wing2": "coo-flap .34s cubic-bezier(.4,0,.6,1) -.05s infinite", "core": "coo-fly-core .34s ease-in-out infinite",
          "tail": "coo-fly-tail .34s ease-in-out infinite", "blink": True, "scarf": "coo-flutter .28s ease-in-out infinite alternate", "streak": True}


def bird(v="gerald", eye="open", sw=3, gear=(), scroll=False, anim=None, holes=None):
    """Perched pigeon, facing right, built from jointed parts: tail, legs, torso (with wing), head, neck."""
    b = ALL[v]; body, wing, collar = b["body"], b["wing"], b["collar"]
    breed = b.get("breed"); rx, ry = b.get("rx", 35), b.get("ry", 27)
    gear = tuple(gear) + tuple(b.get("own", ())); holes = holes or {}
    w = round(sw * .82, 1); t = round(sw * .56, 1); wd = darken(wing)
    S = f'stroke="{INK}" stroke-width="{sw}"'; J = S + ' stroke-linejoin="round"'

    def g(gid, src=ON):
        if gid not in src:
            return ""
        if gid in holes:
            return f'<g display="{{{{ {holes[gid]} }}}}">{_tok(src[gid], anim)}</g>'
        return _tok(src[gid], anim) if gid in gear else ""

    def part(key, origin, inner):
        return f'<g{_st(anim, key, origin)}>{inner}</g>'
    if breed == "fantail":
        tail = f'<path d="M30 76 L-6 62 Q-10 36 8 20 Q24 10 40 20 Z" fill="{wing}" {J}/><path d="M30 74 L0 48 M30 74 L10 30 M30 74 L26 20" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>'
    else:
        tail = f'<path d="M26 62 L4 52 L8 72 L24 78 Z" fill="{wing}" {J}/><path d="M10.5 58.5 L24 67 M9.5 66 L24 72.5" stroke="{INK}" stroke-width="{t}" fill="none" stroke-linecap="round"/>'
    legs = (f'<path d="M52 86 V100 M52 100 L45.5 103.5 M52 100 L53 104.6 M52 100 L59 102.6 M68 86 V100 M68 100 L61.5 103.5 M68 100 L69 104.6 M68 100 L75 102.6" '
            f'stroke="{TOMATO}" stroke-width="{sw + .3}" stroke-linecap="round" stroke-linejoin="round" fill="none"/>')
    feath = (f'<path d="M46 66 q4 -7 9 0 q-4 5 -7 0 M57 71 q4 -7 9 0 q-4 5 -7 0 M54 58 q4 -7 9 0 q-4 5 -7 0" stroke="{INK}" stroke-width="{w}" fill="none" stroke-linecap="round"/>' if breed == "frillback"
             else f'<path d="M50 70 L58 56 M60 72 L67 59" stroke="{INK}" stroke-width="{w}" stroke-linecap="round"/>')
    wingp = part("wing", "88% 20%", f'<path d="M36 58 Q56 42 78 60 Q66 80 40 74 Z" fill="{wing}" {J}/><path d="M40.5 73.6 Q54 80.6 67.5 73 Q58 66.6 45.5 68 Z" fill="{wd}" stroke="{INK}" stroke-width="{t}" stroke-linejoin="round"/>'
                 f'{feath}<path d="M45 56.6 Q54 50.4 65 52.8" fill="none" stroke="{CARD}" stroke-width="{t}" stroke-linecap="round" opacity=".45"/>')
    torso = part("torso", "50% 100%", f'<ellipse cx="56" cy="62" rx="{rx}" ry="{ry}" fill="{body}" {S}/><ellipse cx="60" cy="72" rx="{rx - 12}" ry="{ry - 16}" fill="{CARD}" opacity=".32"/>' + wingp + g("backpack"))
    hd = []
    if breed == "jacobin":
        hood = "#B5553C"
        for i in range(10):
            a = math.radians(36 * i + 10)
            hd.append(f'<circle cx="{84 + 20 * math.cos(a):.1f}" cy="{36 + 20 * math.sin(a):.1f}" r="9" fill="{hood}" {S}/>')
        hd.append(f'<circle cx="84" cy="36" r="21" fill="{hood}"/><circle cx="88" cy="34" r="14" fill="{body}" {S}/>')
    else:
        hd.append(f'<circle cx="86" cy="34" r="18" fill="{body}" {S}/><path d="M73.6 27.4 Q77.6 19.4 86.6 18.6" fill="none" stroke="{CARD}" stroke-width="{t}" stroke-linecap="round" opacity=".55"/>')
    hd.append(g("goggles", ON_PRE))
    hd.append(_eye(eye, body, sw))
    if anim and anim.get("blink") and eye in ("open", "wide"):
        hd.append(f'<circle cx="92" cy="30" r="7.6" fill="{body}" stroke="{INK}" stroke-width="{w}" style="transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: coo-blink 4.6s ease-in-out infinite"/>')
    hd.append(g("goggles"))
    hd.append(f'<path d="M104 31 L118 36 L104 41 Z" fill="{SUN}" stroke="{INK}" stroke-width="{w}" stroke-linejoin="round"/><path d="M104.6 36 H114.6" stroke="{INK}" stroke-width="{t}" stroke-linecap="round"/>')
    hd.append(f'<ellipse cx="104.5" cy="30.5" rx="3.4" ry="2.5" fill="{CARD}" stroke="{INK}" stroke-width="{w * .8:.1f}"/>')
    if eye != "lid":
        hd.append(f'<circle cx="84" cy="43" r="3.2" fill="{ROSE}"/>')
    hd += [g(x) for x in _HEAD]
    head = part("head", "36% 100%", "".join(hd))
    if breed == "pouter":
        neck = f'<circle cx="92" cy="63" r="20" fill="{body}" {S}/><path d="M82 50 Q92 45 102 50" fill="none" stroke="{INK}" stroke-width="{w}" stroke-linecap="round"/><path d="M80 58 Q84 52 90 50.6" fill="none" stroke="{CARD}" stroke-width="{t}" stroke-linecap="round" opacity=".6"/>'
    elif breed == "jacobin":
        neck = ""
    else:
        neck = f'<ellipse cx="83" cy="53" rx="15" ry="7" fill="{collar}" stroke="{INK}" stroke-width="{w}"/>' + (f'<ellipse cx="79" cy="54" rx="6" ry="2.6" fill="{b["sheen"]}"/>' if b.get("sheen") else "")
        neck += f'<path d="M72 50.6 Q78 48 85 48.4" fill="none" stroke="{CARD}" stroke-width="{t}" stroke-linecap="round" opacity=".5"/>'
    neck += "".join(g(x) for x in _NECK)
    leg = "".join(g(x) for x in _LEG)
    if scroll and "tube" not in gear:
        leg += f'<rect x="62" y="91.4" width="12.6" height="7.4" rx="2.2" fill="{CARD}" stroke="{INK}" stroke-width="2"/><path d="M65.2 91.4 V98.8" stroke="{TOMATO}" stroke-width="2"/>'
    return part("all", "46% 100%", part("tail", "100% 36%", tail) + legs + torso + head + neck + leg)


FLY_VB = "-24 -12 164 120"
_WING = "M46 55 Q32 22 62 2 Q70 8 72 20 Q80 27 78 39 Q83 47 77 58 Z"


def fly(v="gerald", wing="up", sw=3, anim=None, gear=()):
    """Flying pigeon, facing right. Two wings, tail fan, tucked feet with the note."""
    if anim is True:
        anim = FLYING
    b = ALL[v]; body, wc, collar = b["body"], b["wing"], b["collar"]
    gear = tuple(gear) + tuple(b.get("own", ()))
    w = round(sw * .82, 1); t = round(sw * .56, 1); wd = darken(wc); wf = darken(wc, .72)
    S = f'stroke="{INK}" stroke-width="{sw}"'; J = S + ' stroke-linejoin="round"'
    down = "" if (anim or wing == "up") else ' transform="translate(0 57) scale(1 -.74) translate(0 -57)"'

    def wst(key):
        a = (anim or {}).get(key)
        return f' style="transform-box: fill-box; transform-origin: 50% 97%; animation: {a}"' if a else ""
    far = f'<g transform="translate(13 -3)"><g{down}><path d="{_WING}" fill="{wf}" {J}{wst("wing2")}/></g></g>'
    near = (f'<g{down}><g{wst("wing")}><path d="{_WING}" fill="{wc}" {J}/><path d="M55.6 50 Q50.6 30 60.6 12 M66 52 Q63 34 70 22" fill="none" stroke="{INK}" stroke-width="{t}" stroke-linecap="round"/>'
            f'<path d="M48.6 53 Q62 60 76 55 Q70 47.6 60 46.6 Q52 46.6 48.6 53 Z" fill="{wd}" stroke="{INK}" stroke-width="{t}" stroke-linejoin="round"/></g></g>')
    streak = ""
    if anim and anim.get("streak"):
        streak = (f'<g stroke="{INK}" stroke-width="3" stroke-linecap="round" fill="none"><path d="M-6 38 H-20" style="animation: coo-streak .5s linear infinite"/><path d="M-8 60 H-18" style="animation: coo-streak .5s linear .18s infinite"/>'
                  f'<path d="M-2 76 H-14" style="animation: coo-streak .5s linear .33s infinite"/></g>')
    tail = f'<g{_st(anim, "tail", "100% 50%")}><path d="M26 52 L0 41 L5 52 L-2 62 L8 61.6 L24 65 Z" fill="{wc}" {J}/><path d="M6 52 L23 57 M9 60.4 L24 61" stroke="{INK}" stroke-width="{t}" fill="none" stroke-linecap="round"/></g>'
    feet = (f'<path d="M46 72 L34 80 M34 80 L29 78 M34 80 L31 84.6 M58 74 L48 83 M48 83 L43 81.6 M48 83 L45.6 87.6" stroke="{TOMATO}" stroke-width="{sw + .3}" stroke-linecap="round" fill="none"/>'
            f'<rect x="33" y="72.6" width="12.6" height="7.4" rx="2.2" fill="{CARD}" stroke="{INK}" stroke-width="2" transform="rotate(-36 39 76)"/>')
    hd = f'<circle cx="96" cy="44" r="15" fill="{body}" {S}/><path d="M85.6 38.4 Q89 31.6 96.6 31" fill="none" stroke="{CARD}" stroke-width="{t}" stroke-linecap="round" opacity=".55"/>'
    hg_pre = f'<g transform="translate(96 44) scale(.84) translate(-86 -34)">{ON_PRE["goggles"]}</g>' if "goggles" in gear else ""
    eye = f'<circle cx="101" cy="41" r="5.5" fill="#FFB03A" stroke="{INK}" stroke-width="{w}"/><circle cx="102.4" cy="41" r="2.2" fill="{INK}"/><circle cx="103.2" cy="40" r=".8" fill="{CARD}"/>'
    if anim and anim.get("blink"):
        eye += f'<circle cx="101" cy="41" r="6.4" fill="{body}" stroke="{INK}" stroke-width="{w}" style="transform-box: fill-box; transform-origin: 50% 0%; transform: scaleY(0); animation: coo-blink 3.8s ease-in-out infinite"/>'
    hg = "".join(f'<g transform="translate(96 44) scale(.84) translate(-86 -34)">{_tok(ON[x], anim)}</g>' for x in ("goggles",) + _HEAD if x in gear)
    beak = f'<path d="M109 41 L122 45 L109 49 Z" fill="{SUN}" stroke="{INK}" stroke-width="{w}" stroke-linejoin="round"/><path d="M109.6 45 H119" stroke="{INK}" stroke-width="{t}" stroke-linecap="round"/><ellipse cx="110" cy="40.5" rx="3" ry="2.2" fill="{CARD}" stroke="{INK}" stroke-width="{w * .7:.1f}"/>'
    collar_ = f'<ellipse cx="84" cy="55" rx="8" ry="9" fill="{collar}" stroke="{INK}" stroke-width="{w}"/>'
    ng = ""
    for x in _NECK:
        if x in gear:
            src = ON[x]
            if x == "scarf":
                a = (anim or {}).get("scarf")
                st = (f' style="transform-box: fill-box; transform-origin: 60% 0%; animation: {a}"' if a else ' transform="rotate(64 78 58)"')
                src = src.replace("§scarf§", st)
            ng += f'<g transform="translate(84 55) scale(.56 .95) translate(-83 -53)">{_tok(src, None)}</g>'
    core = (f'<g{_st(anim, "core", "50% 50%")}>' + tail + feet + f'<ellipse cx="58" cy="56" rx="36" ry="19" fill="{body}" {S}/><ellipse cx="60" cy="63" rx="24" ry="8" fill="{CARD}" opacity=".32"/>'
            + hd + hg_pre + eye + beak + hg + collar_ + ng + "</g>")
    return streak + far + core + near


PERCH_VB = "-10 -22 140 132"
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


def pose(v, p, sw=3, gear=(), anim=None):
    """Returns (viewBox, inner svg) for a named pose. Pass anim to get the moving version."""
    if p == "sleep":
        zst = lambda d: f' style="transform-box: fill-box; transform-origin: 0% 100%; animation: coo-snooze 2.4s ease-out {d}s infinite"' if anim else ""
        z = (f'<text x="110" y="8" font-family="Nunito, sans-serif" font-weight="900" font-size="15" fill="{INK}"{zst(0)}>z</text>'
             f'<text x="119" y="-3" font-family="Nunito, sans-serif" font-weight="900" font-size="11" fill="{INK}"{zst(.8)}>z</text>')
        return PERCH_VB, bird(v, "closed", sw, gear, anim=SLEEPING if anim else None) + z
    if p == "eat":
        seeds = "".join(f'<ellipse cx="{x}" cy="{y}" rx="3" ry="2" fill="{SUN}" stroke="{INK}" stroke-width="1.6"/>' for x, y in ((120, 103), (128, 101), (136, 104), (112, 105)))
        if anim:
            return "-10 -22 160 132", bird(v, "happy", sw, gear, anim=PECKING) + seeds
        return "-10 -22 170 132", f'<g transform="rotate(30 60 101)">{bird(v, "happy", sw, gear)}</g>' + "".join(f'<ellipse cx="{x}" cy="{y}" rx="3" ry="2" fill="{SUN}" stroke="{INK}" stroke-width="1.6"/>' for x, y in ((126, 101), (136, 103), (144, 100)))
    if p == "sulk":
        cloud = f'<path d="M92 -4 q-6 -1 -5 -7 q1 -6 8 -5 q4 -6 11 -3 q7 -1 8 6 q5 1 4 6 q-1 4 -6 4 z" fill="{LILAC}" stroke="{INK}" stroke-width="2"/><path d="M96 2 l-2 5 M104 2 l-2 5 M112 2 l-2 5" stroke="{INK}" stroke-width="2" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "lid", sw, gear, anim=SULKING if anim else None) + cloud
    if p == "surprise":
        marks = f'<path d="M112 14 L120 4 M116 22 L126 18 M104 8 L106 -4" stroke="{INK}" stroke-width="2.6" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "wide", sw, gear, anim={"tail": "coo-tail-flick 1.6s ease-in-out infinite"} if anim else None) + marks
    if p == "crouch":
        return PERCH_VB, f'<g transform="translate(-6 17) scale(1.1 .84)">{bird(v, "open", sw, gear)}</g>'
    if p == "landed":
        lines = f'<path d="M30 105 H20 M100 105 H112 M26 97 L18 93" stroke="{INK}" stroke-width="2.4" stroke-linecap="round"/>'
        return PERCH_VB, bird(v, "open", sw, gear, scroll=True, anim=HOPPING if anim else None) + ("" if anim else lines)
    if p == "proud":
        spark = f'<path d="M112 6 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 z" fill="{SUN}" stroke="{INK}" stroke-width="1.8" stroke-linejoin="round"/>'
        return PERCH_VB, f'<g transform="rotate(-6 60 101)">{bird(v, "happy", sw, gear, anim=CALM if anim else None)}</g>' + spark
    return PERCH_VB, bird(v, "open", sw, gear, anim=(IDLE if anim is True else anim))


def avatar_svg(v, size=42, bg=SKY, eye="open", gear=(), extra_style=""):
    return (f'<svg width="{size}" height="{size}" viewBox="60 2 62 62" aria-hidden="true" style="background: {bg}; border: 2px solid {INK}; border-radius: 50%; flex-shrink: 0;{extra_style}">'
            f'{bird(v, eye, 3, gear)}</svg>')


def perch_svg(v, w, p="perched", gear=(), label=None, anim=None, extra=""):
    vb, inner = pose(v, p, 3, gear, anim)
    x0, y0, vw, vh = [float(n) for n in vb.split()]
    a = f'role="img" aria-label="{esc(label)}"' if label else 'aria-hidden="true"'
    return f'<svg width="{w}" height="{round(w * vh / vw)}" viewBox="{vb}" {a} style="display: block; flex-shrink: 0; overflow: visible;{extra}">{inner}</svg>'


def fly_svg(v, w, gear=(), label=None, anim=FLYING, flip=False, extra=""):
    a = f'role="img" aria-label="{esc(label)}"' if label else 'aria-hidden="true"'
    f = " transform: scaleX(-1);" if flip else ""
    return f'<svg width="{w}" height="{round(w * 120 / 164)}" viewBox="{FLY_VB}" {a} style="display: block; flex-shrink: 0; overflow: visible;{f}{extra}">{fly(v, "up", 3, anim, gear)}</svg>'


def fly_sprite(v, w, gear=(), label=None, flip=False, style=""):
    """Flying bird with wing beat plus a slow float. Wrap position in `style`."""
    return f'<div style="{style} animation: coo-bob 1.7s ease-in-out infinite alternate">{fly_svg(v, w, gear, label, FLYING, flip)}</div>'


def takeoff_html(v, gear=(), w=160, label="", style=""):
    """Two stacked sprites: the perched bird crouches and springs, the flying bird climbs away."""
    fw = round(w * 1.12)
    return (f'<div style="{style} width: {w}px">'
            f'<div style="transform-origin: 46% 100%; animation: coo-takeoff-crouch 3s linear infinite">{perch_svg(v, w, "landed", gear, label, CALM)}</div>'
            f'<div style="position: absolute; left: {round(-w * .08)}px; bottom: {round(w * .1)}px; transform-origin: 50% 60%; opacity: 0; animation: coo-takeoff-fly 3s linear infinite">{fly_svg(v, fw, gear)}</div></div>')


def landing_html(v, gear=(), w=150, style=""):
    fw = round(w * 1.12)
    return (f'<div style="{style} width: {w}px">'
            f'<div style="transform-origin: 46% 100%; opacity: 0; animation: coo-land-perch 4s linear infinite">{perch_svg(v, w, "landed", gear, None, CALM)}</div>'
            f'<div style="position: absolute; left: {round(-w * .08)}px; bottom: {round(w * .1)}px; transform-origin: 50% 60%; opacity: 0; animation: coo-land-fly 4s linear infinite">{fly_svg(v, fw, gear)}</div></div>')
