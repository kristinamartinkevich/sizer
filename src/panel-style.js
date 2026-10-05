// Styles for everything Sizer draws inside a shop's page, injected into its shadow roots.
// Always light: it sits inside shop pages, which are light regardless of the OS theme.
(function (root) {
  root.SIZER_STYLE = `
:host {
  --fog: #f4f4f2;
  --paper: #ffffff;
  --graphite: #141413;
  --muted: #6a6a66;
  --hair: #e9e9e6;
  --accent: #141413;
  --accent-wash: #ececea;
  --signal: #b3261e;
  --serif: "Hanken Grotesk", "Helvetica Neue", Helvetica, Arial, sans-serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --ease: cubic-bezier(.2, .7, .2, 1);
  all: initial;
  font: 14px/1.45 var(--sans);
  color: var(--graphite);
  -webkit-font-smoothing: antialiased;
}
/* A shop's own "* { font: inherit }" can restyle the host element itself and beat :host; the shadow's children are out of its reach. */
:host > * { font: 14px/1.45 var(--sans); color: var(--graphite); }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }

.mark {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--accent);
  overflow: hidden;
}
.mark svg { width: 22px; height: 22px; display: block; }

/* ---- the answer line under the shop's size picker ---- */
.line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 10px 12px 10px 10px;
  background: var(--fog);
  border: 1px solid var(--hair);
  border-radius: 10px;
  min-height: 52px;
}
.line.low { border-style: dashed; border-color: #a9a9a4; }
.line .k { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.line .answer { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.line .row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.line .size { font: 600 24px/1 var(--serif); font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.02em; }
.line .why-text { color: var(--muted); }
.line .note { font-size: 13px; color: var(--muted); }
.line .note.gone { color: var(--signal); }
.line .note b { color: var(--graphite); font-weight: 600; }
.line .go {
  flex: none;
  border: 0;
  background: none;
  padding: 6px 2px 6px 8px;
  color: var(--accent);
  font-weight: 600;
  white-space: nowrap;
}
.line .go:hover { text-decoration: underline; text-underline-offset: 3px; }
.line .cta {
  flex: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--accent);
  color: var(--fog);
  font-weight: 600;
  white-space: nowrap;
}
.line .cta:hover { background: #2a2a28; }
.reading { flex: 1; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--hair), #f0f0ee, var(--hair)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; max-width: 220px; }
@keyframes shimmer { to { background-position: -200% 0; } }

/* ---- fallback pill when there's no picker to attach to ---- */
.pill {
  position: fixed;
  right: 20px;
  bottom: 20px;
  z-index: 2147483646;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px 8px 8px;
  border: 0;
  border-radius: 999px;
  background: var(--accent);
  color: var(--fog);
  box-shadow: 0 8px 28px rgba(28, 27, 24, .22);
}
.pill b { font: 600 17px/1 var(--serif); margin-left: 2px; }

/* ---- the reasoning sheet ---- */
.sheet {
  position: fixed;
  top: 0;
  right: 0;
  bottom: 0;
  z-index: 2147483647;
  width: min(400px, 100vw);
  display: flex;
  flex-direction: column;
  background: var(--paper);
  border-left: 1px solid var(--hair);
  box-shadow: -18px 0 48px rgba(28, 27, 24, .14);
  transform: translateX(0);
  animation: in .28s var(--ease);
}
.sheet:focus { outline: none; }
@keyframes in { from { transform: translateX(24px); opacity: 0; } }
.sheet header { display: flex; align-items: center; gap: 10px; padding: 18px 22px; border-bottom: 1px solid var(--hair); }
.sheet .title { flex: 1; font: 600 16px/1 var(--serif); letter-spacing: -.01em; }
.close { width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--muted); font-size: 22px; line-height: 1; }
.close:hover { background: var(--fog); color: var(--graphite); }
.body { flex: 1; overflow: auto; padding: 24px 22px 8px; }
.hero .k { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.hero .big { font: 600 64px/1 var(--serif); letter-spacing: -.03em; margin: 6px 0 8px; font-variant-numeric: lining-nums tabular-nums; }
.hero .headline { display: flex; align-items: center; gap: 10px; font: 500 19px/1.3 var(--serif); }
.meter { display: inline-flex; align-items: center; }
.dots { display: inline-flex; gap: 4px; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--hair); }
.dots i.on { background: var(--accent); }
.firm { margin: 8px 0 0; font-size: 13px; color: var(--muted); }
.stock { margin-top: 16px; padding: 12px 14px; border-radius: 10px; background: #f6e7e5; color: var(--graphite); }
.stock p { margin: 0; }
.stock .chips { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
.alt { margin: 12px 0 0; color: var(--muted); }
.alt b { color: var(--graphite); font-weight: 600; }
h3 { margin: 22px 0 6px; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.more { margin-top: 20px; border-top: 1px solid var(--hair); }
.more summary { list-style: none; cursor: pointer; display: flex; align-items: center; gap: 8px; padding: 12px 0; font-size: 13px; color: var(--muted); border-radius: 8px; }
.more summary::-webkit-details-marker { display: none; }
.more summary::before { content: ""; width: 6px; height: 6px; border-right: 1.5px solid currentColor; border-bottom: 1.5px solid currentColor; transform: rotate(-45deg); transition: transform .2s var(--ease); margin-left: 2px; }
.more[open] summary::before { transform: rotate(45deg); }
.more summary:hover { color: var(--graphite); }
.more .facts { margin-bottom: 12px; }
ol { list-style: none; margin: 0; padding: 0; counter-reset: r; }
.areas { list-style: none; margin: 0 0 18px; padding: 0; }
.areas li { padding: 6px 0; border-top: 1px solid var(--hair); font-size: 14px; }
.areas li:first-child { border-top: 0; }
.checking { margin: 14px 0 0; font-size: 13px; color: var(--muted); }
.web-note { margin: 0 0 6px; font-size: 14px; }
.sources { list-style: none; margin: 0; padding: 0; }
.sources li { padding: 5px 0; font-size: 13px; overflow-wrap: anywhere; }
.sources a { color: var(--graphite); }
ol li { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hair); counter-increment: r; }
ol li:first-child { border-top: 0; padding-top: 2px; }
ol li::before { content: counter(r); flex: none; width: 22px; height: 22px; border-radius: 50%; background: var(--accent-wash); font: 600 11px/22px var(--serif); text-align: center; color: var(--graphite); }
ol li span { flex: 1; padding-top: 2px; }
ol li em { flex: none; align-self: flex-start; font-style: normal; font-size: 12px; font-weight: 600; color: var(--accent); background: var(--accent-wash); padding: 2px 8px; border-radius: 999px; }
.facts { background: var(--fog); border-radius: 12px; padding: 2px 14px; }
.fact { display: flex; gap: 14px; padding: 9px 0; border-top: 1px solid var(--hair); }
.fact:first-child { border-top: 0; }
.fact .k { flex: none; width: 60px; padding-top: 3px; font-size: 12px; color: var(--muted); }
.fact .v { flex: 1; display: flex; flex-wrap: wrap; align-items: center; gap: 6px; overflow-wrap: anywhere; }
.chip { display: inline-block; padding: 2px 9px; border: 1px solid var(--hair); border-radius: 999px; background: var(--paper); font-size: 12px; font-variant-numeric: lining-nums tabular-nums; }
.chip.pick { background: var(--accent); border-color: var(--accent); color: var(--fog); }
.chip.gone { background: none; border-style: dashed; color: var(--muted); text-decoration: line-through; }
/* Micro-interactions: soft hover, a small press, one focus ring */
button, .chip, .fine a { transition: background-color .2s ease, border-color .2s ease, color .2s ease, box-shadow .2s ease, transform .15s ease, opacity .2s ease; }
button:active { transform: scale(.96); }
.line .go { border-radius: 999px; padding: 6px 12px; }
.line .go:hover { background: var(--accent-wash); text-decoration: none; }
.line .cta:active { transform: scale(.97); }
.pill:hover { transform: translateY(-1px); box-shadow: 0 12px 32px rgba(28, 27, 24, .26); }
.pill:active { transform: translateY(0) scale(.97); }
.close:active { transform: scale(.9); }
.link { border-radius: 999px; padding: 6px 10px; margin-right: -10px; }
.link:hover { background: var(--accent-wash); }
.chip:not(.gone):not(.pick):hover { border-color: var(--muted); }
.sheet footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 22px 18px; border-top: 1px solid var(--hair); }
.fine { font-size: 12px; color: var(--muted); }
.fine a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
.fine a:hover { color: var(--graphite); }
.link { border: 0; background: none; padding: 4px 0; color: var(--accent); font-weight: 600; white-space: nowrap; }
.empty { color: var(--muted); }
/* "Did it fit?" on a product sized on an earlier visit, first in the sheet */
.ask { margin: 0 0 20px; padding: 2px 14px 6px; border-radius: 12px; background: var(--fog); }
.ask h3 { margin-top: 12px; }
.ask .fq { border-top: 0; padding-top: 0; }

@media (max-width: 520px) {
  .sheet { top: auto; width: 100vw; max-height: 86vh; border-left: 0; border-top: 1px solid var(--hair); border-radius: 16px 16px 0 0; animation-name: up; }
  @keyframes up { from { transform: translateY(24px); opacity: 0; } }
  .hero .big { font-size: 52px; }
}
@media (prefers-reduced-motion: reduce) {
  .sheet, .reading { animation: none; }
}
`;

  // Lives in the shop's own document: rings the size option Sizer picked.
  root.SIZER_PAGE_STYLE = `
[data-sizer-pick] { box-shadow: inset 0 0 0 2px #141413 !important; border-radius: 4px; }
[data-sizer-pick="in-stock"] { box-shadow: inset 0 0 0 2px #141413 !important; outline: 1px dashed #141413; outline-offset: -5px; }
`;
})(globalThis);
