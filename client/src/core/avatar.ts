import type { Player } from "../game/types";
import { mk } from "./dom";

export const initials = (name: string): string => name.slice(0, 2).toUpperCase();

/** Paints colour + initials for any `.avatar` element (in place, so callers can reuse a cached node). */
export function paintAvatar<T extends HTMLElement>(el: T, player: Player): T {
  el.style.background = player.color;
  el.textContent = initials(player.name);
  return el;
}

export function avatarEl(player: Player, cls = ""): HTMLDivElement {
  return paintAvatar(mk("div", `avatar ${cls}`.trim()), player);
}
