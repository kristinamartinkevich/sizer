// Styles for everything Sizer draws inside a shop's page, injected into its shadow roots.
// Always light: it sits inside shop pages, which are light regardless of the OS theme.
(function (root) {
  root.SIZER_STYLE = `
:host {
  --ecru: #F6F3EC;
  --paper: #FDFCF8;
  --graphite: #1C1B18;
  --muted: #5F5B52;
  --hair: #DDD7CA;
  --loden: #2F4A3A;
  --loden-wash: #E6ECE5;
  --madder: #9A3B2E;
  --serif: "Jost", "Avenir Next", "Futura", "Century Gothic", -apple-system, "Segoe UI", sans-serif;
  --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif;
  --ease: cubic-bezier(.2, .7, .2, 1);
  all: initial;
  font: 14px/1.45 var(--sans);
  color: var(--graphite);
  -webkit-font-smoothing: antialiased;
}
* { box-sizing: border-box; }
button { font: inherit; color: inherit; cursor: pointer; }
:focus-visible { outline: 2px solid var(--loden); outline-offset: 2px; }

.mark {
  flex: none;
  display: inline-grid;
  place-items: center;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  background: var(--loden);
  overflow: hidden;
}
.mark img { width: 22px; height: 22px; display: block; }

/* ---- the answer line under the shop's size picker ---- */
.line {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 10px;
  padding: 10px 12px 10px 10px;
  background: var(--ecru);
  border: 1px solid var(--hair);
  border-radius: 10px;
  min-height: 52px;
}
.line.low { border-style: dashed; border-color: #B8B1A2; }
.line .k { display: block; font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: var(--muted); }
.line .answer { display: flex; flex-direction: column; gap: 3px; min-width: 0; flex: 1; }
.line .row { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; }
.line .size { font: 500 24px/1 var(--serif); font-variant-numeric: lining-nums tabular-nums; letter-spacing: -.01em; }
.line .why-text { color: var(--muted); }
.line .note { font-size: 13px; color: var(--muted); }
.line .note.gone { color: var(--madder); }
.line .note b { color: var(--graphite); font-weight: 600; }
.line .go {
  flex: none;
  border: 0;
  background: none;
  padding: 6px 2px 6px 8px;
  color: var(--loden);
  font-weight: 600;
  white-space: nowrap;
}
.line .go:hover { text-decoration: underline; text-underline-offset: 3px; }
.line .cta {
  flex: none;
  border: 0;
  border-radius: 999px;
  padding: 8px 14px;
  background: var(--loden);
  color: var(--ecru);
  font-weight: 600;
  white-space: nowrap;
}
.line .cta:hover { background: #253C2F; }
.reading { flex: 1; height: 10px; border-radius: 5px; background: linear-gradient(90deg, var(--hair), #EEE9DE, var(--hair)); background-size: 200% 100%; animation: shimmer 1.4s linear infinite; max-width: 220px; }
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
  background: var(--loden);
  color: var(--ecru);
  box-shadow: 0 8px 28px rgba(28, 27, 24, .22);
}
.pill b { font: 500 17px/1 var(--serif); margin-left: 2px; }

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
.sheet .title { flex: 1; font: 500 16px/1 var(--serif); letter-spacing: .01em; }
.close { width: 34px; height: 34px; border: 0; border-radius: 50%; background: none; color: var(--muted); font-size: 22px; line-height: 1; }
.close:hover { background: var(--ecru); color: var(--graphite); }
.body { flex: 1; overflow: auto; padding: 24px 22px 8px; }
.hero .k { font-size: 11px; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
.hero .big { font: 500 64px/1 var(--serif); letter-spacing: -.02em; margin: 6px 0 8px; font-variant-numeric: lining-nums tabular-nums; }
.hero .headline { font: 500 19px/1.3 var(--serif); }
.hero .headline.moved { font-style: italic; }
.meter { display: flex; align-items: center; gap: 8px; margin-top: 14px; font-size: 13px; color: var(--muted); }
.dots { display: inline-flex; gap: 4px; }
.dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--hair); }
.dots i.on { background: var(--loden); }
.firm { margin: 6px 0 0; font-size: 13px; color: var(--muted); }
.stock { margin-top: 18px; padding: 12px 14px; border-radius: 10px; background: #F6E9E5; color: var(--graphite); }
.alt { margin: 14px 0 0; color: var(--muted); }
.alt b { color: var(--graphite); font-weight: 600; }
h3 { margin: 26px 0 8px; font-size: 11px; font-weight: 600; letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
ol { list-style: none; margin: 0; padding: 0; counter-reset: r; }
ol li { display: flex; gap: 12px; padding: 10px 0; border-top: 1px solid var(--hair); counter-increment: r; }
ol li:first-child { border-top: 0; padding-top: 2px; }
ol li::before { content: counter(r); flex: none; width: 16px; font: 500 13px/1.6 var(--serif); color: var(--muted); }
ol li span { flex: 1; }
ol li em { flex: none; align-self: flex-start; font-style: normal; font-size: 12px; font-weight: 600; color: var(--loden); background: var(--loden-wash); padding: 2px 8px; border-radius: 999px; }
dl { display: grid; grid-template-columns: auto 1fr; gap: 6px 14px; margin: 0; }
dt { color: var(--muted); }
dd { margin: 0; overflow-wrap: anywhere; }
dd s { color: var(--muted); }
.sheet footer { display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 14px 22px 18px; border-top: 1px solid var(--hair); }
.fine { font-size: 12px; color: var(--muted); }
.link { border: 0; background: none; padding: 4px 0; color: var(--loden); font-weight: 600; white-space: nowrap; }
.empty { color: var(--muted); }

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
[data-sizer-pick] { box-shadow: inset 0 0 0 2px #2F4A3A !important; border-radius: 4px; }
[data-sizer-pick="in-stock"] { box-shadow: inset 0 0 0 2px #2F4A3A !important; outline: 1px dashed #2F4A3A; outline-offset: -5px; }
`;
})(globalThis);
