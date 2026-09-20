/** Creates an element, optionally with a class and text content. */
export function mk<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

/** `getElementById`, but throws instead of silently returning null — every id here is expected to exist in index.html. */
function must<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`#${id} not found in index.html`);
  return el as T;
}

/**
 * Wraps `resolve` in a Proxy that defers calling it until the first actual
 * property access, then caches the result. This means importing this module
 * (or anything that transitively imports it) never touches the DOM by
 * itself — only actually using an element does — so pure logic elsewhere in
 * the module graph stays unit-testable without a full `index.html` in jsdom.
 */
function lazy<T extends object>(resolve: () => T): T {
  let cached: T | undefined;
  const resolveCached = (): T => (cached ??= resolve());
  return new Proxy({} as T, {
    get(_target, prop) {
      const real = resolveCached();
      const value = Reflect.get(real, prop, real);
      return typeof value === "function" ? value.bind(real) : value;
    },
    set(_target, prop, value) {
      const real = resolveCached();
      return Reflect.set(real, prop, value, real);
    },
    has(_target, prop) {
      return prop in resolveCached();
    },
  });
}

const lazyEl = <T extends HTMLElement>(id: string): T => lazy(() => must<T>(id));

// ============ Cached DOM bindings — one place mirroring index.html's ids ============
export const dom = {
  frame: lazyEl<HTMLDivElement>("frame"),
  stage: lazyEl<HTMLDivElement>("stage"),
  boardArea: lazyEl<HTMLDivElement>("boardArea"),

  canvas: lazyEl<HTMLCanvasElement>("board"),
  fxCanvas: lazyEl<HTMLCanvasElement>("fxCanvas"),

  logEl: lazyEl<HTMLDivElement>("log"),

  lbLeader: lazyEl<HTMLDivElement>("lbLeader"),
  lbView: lazyEl<HTMLDivElement>("lbView"),
  lbTrack: lazyEl<HTMLDivElement>("lbTrack"),
  streakBadge: lazyEl<HTMLDivElement>("streakBadge"),

  roundTimerBar: lazyEl<HTMLDivElement>("roundTimerBar"),
  roundTimerFill: lazyEl<HTMLDivElement>("roundTimerFill"),
  roundTimerLabel: lazyEl<HTMLDivElement>("roundTimerLabel"),
  roundIntro: lazyEl<HTMLDivElement>("roundIntro"),
  timeUpBanner: lazyEl<HTMLDivElement>("timeUpBanner"),
  roundSummary: lazyEl<HTMLDivElement>("roundSummary"),
  roundSummaryTitle: lazyEl<HTMLDivElement>("roundSummaryTitle"),
  roundSummaryList: lazyEl<HTMLOListElement>("roundSummaryList"),
  roundSummaryFeatured: lazyEl<HTMLDivElement>("roundSummaryFeatured"),
  roundSummarySolvers: lazyEl<HTMLDivElement>("roundSummarySolvers"),

  letterWheelWrap: lazyEl<HTMLDivElement>("letterWheelWrap"),
  actionShuffle: lazyEl<HTMLDivElement>("actionShuffle"),
  actionHint: lazyEl<HTMLDivElement>("actionHint"),
  actionTarget: lazyEl<HTMLDivElement>("actionTarget"),
  actionFirework: lazyEl<HTMLDivElement>("actionFirework"),
  simShuffleBtn: lazyEl<HTMLButtonElement>("simShuffleBtn"),
  simHintBtn: lazyEl<HTMLButtonElement>("simHintBtn"),
  simTargetBtn: lazyEl<HTMLButtonElement>("simTargetBtn"),
  simFireworkBtn: lazyEl<HTMLButtonElement>("simFireworkBtn"),

  giftBanner: lazyEl<HTMLDivElement>("giftBanner"),
  giftAvatar: lazyEl<HTMLDivElement>("giftAvatar"),
  giftName: lazyEl<HTMLDivElement>("giftName"),
  giftWords: lazyEl<HTMLElement>("giftWords"),
  giftWordsLbl: lazyEl<HTMLElement>("giftWordsLbl"),
  giftBonusVal: lazyEl<HTMLElement>("giftBonusVal"),
  giftBonusChip: lazyEl<HTMLDivElement>("giftBonusChip"),
  giftPoints: lazyEl<HTMLElement>("giftPoints"),

  featStage: lazyEl<HTMLDivElement>("featStage"),
  featLetters: lazyEl<HTMLDivElement>("featLetters"),
  featAv: lazyEl<HTMLSpanElement>("featAv"),
  featName: lazyEl<HTMLElement>("featName"),
  featPts: lazyEl<HTMLElement>("featPts"),

  devPanel: lazyEl<HTMLDivElement>("devPanel"),
  panelToggle: lazyEl<HTMLButtonElement>("panelToggle"),
  soundBtn: lazyEl<HTMLButtonElement>("soundBtn"),

  tiktokStatus: lazyEl<HTMLDivElement>("tiktokStatus"),
  tiktokHandleInput: lazyEl<HTMLInputElement>("tiktokHandleInput"),
  tiktokConnectBtn: lazyEl<HTMLButtonElement>("tiktokConnectBtn"),
  tiktokDisconnectBtn: lazyEl<HTMLButtonElement>("tiktokDisconnectBtn"),
  usernameInput: lazyEl<HTMLInputElement>("usernameInput"),
  guessInput: lazyEl<HTMLInputElement>("guessInput"),
  newBoardBtn: lazyEl<HTMLButtonElement>("newBoardBtn"),
  resetLeaderboardBtn: lazyEl<HTMLButtonElement>("resetLeaderboardBtn"),
  musicOn: lazyEl<HTMLInputElement>("musicOn"),
  musicVol: lazyEl<HTMLInputElement>("musicVol"),
  sfxOn: lazyEl<HTMLInputElement>("sfxOn"),
  sfxVol: lazyEl<HTMLInputElement>("sfxVol"),
  roundPause: lazyEl<HTMLInputElement>("roundPause"),
  forceTimeUpBtn: lazyEl<HTMLButtonElement>("forceTimeUpBtn"),
  roundDurationOverride: lazyEl<HTMLInputElement>("roundDurationOverride"),
  roundDurationApplyBtn: lazyEl<HTMLButtonElement>("roundDurationApplyBtn"),
};

export const ctx = lazy<CanvasRenderingContext2D>(() => dom.canvas.getContext("2d")!);
export const fxCtx = lazy<CanvasRenderingContext2D>(() => dom.fxCanvas.getContext("2d")!);
