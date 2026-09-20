import { dom, mk } from "../core/dom";

/** Event log (last 12 events) — dev/test-panel only, not part of the video frame. */
export function log(msg: string, cls?: string): void {
  const d = mk("div", cls, msg);
  dom.logEl.prepend(d);
  while (dom.logEl.children.length > 12) dom.logEl.removeChild(dom.logEl.lastChild!);
}
