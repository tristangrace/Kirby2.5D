import { FONT_STACK } from './fonts.js';

/**
 * UI stylesheet, ported from the 3D Kirby repo's theme: indigo pills with a
 * cream rim, octagonal text outlines, one rounded display font. Everything
 * lives under `.kb-layer` so it never leaks into the canvas or the page.
 */
const CSS = `
.kb-layer{
  --kb-u: clamp(11px, 1.16vw, 18px);
  --kb-ink:#1b1640; --kb-ink-2:#0d0a26;
  --kb-rim:#fffaf0;
  --kb-rim-w: max(2.5px, calc(var(--kb-u)*.2));
  --kb-key-w: max(2px, calc(var(--kb-u)*.12));
  --kb-body: linear-gradient(180deg, rgba(84,80,158,.97) 0%, rgba(43,38,96,.98) 55%, rgba(28,24,70,.99) 100%);
  --kb-key: 0 0 0 var(--kb-key-w) rgba(18,14,48,.92);
  --kb-drop: var(--kb-key), 0 calc(var(--kb-u)*.32) 0 rgba(14,10,40,.85);
  position:fixed; inset:0; pointer-events:none; overflow:hidden;
  font-family:${FONT_STACK};
  font-weight:800; color:#fff; -webkit-font-smoothing:antialiased;
  text-rendering:optimizeLegibility; user-select:none; -webkit-user-select:none;
}
.kb-layer *{box-sizing:border-box; margin:0; padding:0;}
.kb-layer [hidden]{display:none !important;}
.kb-layer svg{display:block; overflow:visible;}
.kb-ico{width:100%; height:100%;}

.kb-out{
  text-shadow:
    -2px 0 var(--kb-ink), 2px 0 var(--kb-ink), 0 -2px var(--kb-ink), 0 2px var(--kb-ink),
    -2px -2px var(--kb-ink), 2px -2px var(--kb-ink), -2px 2px var(--kb-ink), 2px 2px var(--kb-ink),
    -3px 1px var(--kb-ink), 3px 1px var(--kb-ink), 0 3px var(--kb-ink), 0 -3px var(--kb-ink),
    0 calc(var(--kb-u)*.24) 0 rgba(16,12,44,.55), 0 calc(var(--kb-u)*.5) calc(var(--kb-u)*.6) rgba(8,6,30,.5);
  letter-spacing:.02em;
}
.kb-out-sm{
  text-shadow:
    -1.5px 0 var(--kb-ink), 1.5px 0 var(--kb-ink), 0 -1.5px var(--kb-ink), 0 1.5px var(--kb-ink),
    -1.5px -1.5px var(--kb-ink), 1.5px -1.5px var(--kb-ink), -1.5px 1.5px var(--kb-ink), 1.5px 1.5px var(--kb-ink),
    0 calc(var(--kb-u)*.3) calc(var(--kb-u)*.45) rgba(8,6,30,.55);
}
.kb-track{letter-spacing:.16em; text-indent:.16em;}
.kb-track-w{letter-spacing:.3em; text-indent:.3em;}

.kb-pill{display:inline-flex; align-items:center; gap:calc(var(--kb-u)*.45);
  padding:calc(var(--kb-u)*.4) calc(var(--kb-u)*.9); border-radius:999px;
  background:var(--kb-body); border:var(--kb-rim-w) solid var(--kb-rim); box-shadow:var(--kb-drop);}

/* ---------- HUD ---------- */
.kb-hud{position:absolute; left:max(12px, env(safe-area-inset-left)); bottom:max(12px, env(safe-area-inset-bottom));
  display:flex; flex-direction:column; align-items:flex-start; gap:calc(var(--kb-u)*.5);}
.kb-hud-row{display:flex; align-items:center; gap:calc(var(--kb-u)*.5);}
.kb-heart{width:calc(var(--kb-u)*1.9); height:calc(var(--kb-u)*1.9); flex:none; transition:filter .15s, transform .15s;}
.kb-heart.is-off{filter:grayscale(1) brightness(.42); transform:scale(.86);}
.kb-lives-face{width:calc(var(--kb-u)*2.2); height:calc(var(--kb-u)*2.2); flex:none;}
.kb-lives-n{font-size:calc(var(--kb-u)*1.4); line-height:1; color:#fff3c4;}
.kb-mouth-ico{width:calc(var(--kb-u)*1.7); height:calc(var(--kb-u)*1.7); flex:none;}
.kb-mouth-t{font-size:calc(var(--kb-u)*1.05); line-height:1; text-transform:uppercase; color:#fff3c4;}
.kb-hint{font-size:calc(var(--kb-u)*.95); line-height:1.2; color:#fff; opacity:.92;}

.kb-boss{position:absolute; top:max(14px, env(safe-area-inset-top)); left:50%; transform:translateX(-50%);
  display:flex; flex-direction:column; align-items:center; gap:calc(var(--kb-u)*.3); width:min(60vw, 380px);}
.kb-boss-head{display:flex; align-items:center; gap:calc(var(--kb-u)*.5);}
.kb-boss-crest{width:calc(var(--kb-u)*2); height:calc(var(--kb-u)*2); flex:none;}
.kb-boss-name{font-size:calc(var(--kb-u)*1.15); text-transform:uppercase; color:#fff3c4;}
.kb-boss-bar{width:100%; height:calc(var(--kb-u)*1.1); border-radius:999px; overflow:hidden;
  background:rgba(8,6,26,.7); border:var(--kb-rim-w) solid var(--kb-rim); box-shadow:var(--kb-drop);}
.kb-boss-fill{height:100%; border-radius:999px; transition:width .2s;
  background:linear-gradient(180deg, #ff7a8f, #ff2f5e 60%, #b8123b);}

.kb-banner{position:absolute; left:0; right:0; top:34%; text-align:center;
  font-size:calc(var(--kb-u)*3.4); line-height:1.05; color:#ffd964; text-transform:uppercase;}

/* ---------- Title screen ---------- */
.kb-title{position:absolute; inset:0; pointer-events:auto; cursor:pointer;}
.kb-title[hidden]{display:none;}
.kb-title-sky{position:absolute; inset:0; opacity:0; will-change:opacity;
  background:
    radial-gradient(ellipse 62% 44% at 50% 40%, rgba(255,196,232,.24), rgba(255,196,232,0) 70%),
    linear-gradient(180deg, rgba(14,10,46,.56) 0%, rgba(40,24,84,.12) 40%, rgba(8,6,28,.68) 100%);}
.kb-title-stars{position:absolute; inset:0; pointer-events:none;}
.kb-tstar{position:absolute; left:0; top:0; will-change:transform, opacity;}
.kb-logo{position:absolute; left:50%; top:38%; width:min(72vw, 880px); will-change:transform, opacity; opacity:0;}
.kb-logo svg{width:100%; height:auto;}
.kb-logo-sub{position:absolute; left:50%; transform:translateX(-50%);
  bottom:calc(var(--kb-u)*-1.4); padding:calc(var(--kb-u)*.34) calc(var(--kb-u)*1.7);
  border-radius:999px; white-space:nowrap; color:#fff3c4;
  font-size:calc(var(--kb-u)*1.05); text-transform:uppercase;
  background:var(--kb-body); border:var(--kb-rim-w) solid var(--kb-rim);
  box-shadow:var(--kb-drop);}
.kb-press{position:absolute; left:50%; top:74%; will-change:transform, opacity; opacity:0;
  padding:calc(var(--kb-u)*.5) calc(var(--kb-u)*2.2); border-radius:999px;
  font-size:calc(var(--kb-u)*1.3); text-transform:uppercase; white-space:nowrap;
  background:linear-gradient(180deg, rgba(96,90,178,.88), rgba(30,26,78,.92));
  border:var(--kb-rim-w) solid var(--kb-rim);
  box-shadow:0 0 0 var(--kb-key-w) rgba(18,14,48,.92), 0 calc(var(--kb-u)*.28) 0 rgba(14,11,42,.6),
             0 0 calc(var(--kb-u)*1.8) rgba(255,214,120,.4);}
.kb-wipe{position:absolute; inset:0; opacity:0; pointer-events:none; background:#fff;}
@media (max-width: 720px){ .kb-logo{top:34%; width:88vw;} .kb-press{top:66%;} }

/* ---------- Touch controls ---------- */
#touch-controls{position:fixed; inset:0; pointer-events:auto;}
#touch-controls .stick{
  position:absolute; width:96px; height:96px; margin:-48px 0 0 -48px; border-radius:50%;
  border:3px solid rgba(255,255,255,.7); background:rgba(26,20,36,.35); display:none; pointer-events:none;}
#touch-controls .stick.active{display:block;}
#touch-controls .knob{
  position:absolute; left:50%; top:50%; width:44px; height:44px; margin:-22px 0 0 -22px;
  border-radius:50%; background:rgba(255,176,207,.9); border:3px solid #fff; box-sizing:border-box;}
#touch-controls .btn{position:absolute; width:84px; height:84px; padding:0; border:0; background:none;
  pointer-events:auto; touch-action:none; opacity:.9;}
#touch-controls .btn svg{width:100%; height:100%; display:block; overflow:visible;}
#touch-controls .btn:active{opacity:1; transform:scale(.94);}
#touch-controls .btn-a{right:max(28px, env(safe-area-inset-right)); bottom:max(64px, env(safe-area-inset-bottom));}
#touch-controls .btn-b{right:calc(max(28px, env(safe-area-inset-right)) + 96px); bottom:max(28px, env(safe-area-inset-bottom));}
`;

let installed = false;

/** Inject the stylesheet once. */
export function useStyles() {
  if (installed) return;
  installed = true;
  const style = document.createElement('style');
  style.id = 'kb-theme';
  style.textContent = CSS;
  document.head.appendChild(style);
}
