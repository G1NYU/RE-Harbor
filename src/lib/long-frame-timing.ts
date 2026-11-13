/**
 * Long Animation Frame timing boundaries as defined by the browser.
 *
 * A LoAF does NOT report isolated JavaScript, style, and paint durations.
 * - renderStart is the start of the rendering cycle (including rAF callbacks).
 * - styleAndLayoutStart is the end of the rendering callbacks, NOT the end of
 *   style/layout work. The remaining time includes style/layout and painting.
 * - scripts separately attribute individual JS entry points and forced layout.
 *
 * Keep this separate from the profiler so the math can be tested without a WebView.
 */
export type LongFrameLike = {
  startTime: number;
  duration: number;
  renderStart?: number;
  styleAndLayoutStart?: number;
  scripts?: ReadonlyArray<{ forcedStyleAndLayoutDuration?: number }>;
};

export type LongFrameBreakdown = {
  beforeRenderMs: number;
  renderCallbacksMs: number;
  styleLayoutAndPaintMs: number;
  forcedLayoutMs: number;
};

export function longFrameBreakdown(entry: LongFrameLike): LongFrameBreakdown {
  const start = entry.startTime;
  const duration = Number.isFinite(entry.duration) ? Math.max(0, entry.duration) : 0;
  const end = start + duration;
  const render =
    typeof entry.renderStart === "number" &&
    entry.renderStart > 0 &&
    entry.renderStart >= start &&
    entry.renderStart <= end
      ? entry.renderStart
      : null;
  const layout =
    render !== null &&
    typeof entry.styleAndLayoutStart === "number" &&
    entry.styleAndLayoutStart > 0 &&
    entry.styleAndLayoutStart >= render &&
    entry.styleAndLayoutStart <= end
      ? entry.styleAndLayoutStart
      : null;
  const forcedLayout = (entry.scripts ?? []).reduce((total, script) => {
    const forced = script.forcedStyleAndLayoutDuration;
    return (
      total + (typeof forced === "number" && Number.isFinite(forced) ? Math.max(0, forced) : 0)
    );
  }, 0);

  return {
    beforeRenderMs: render === null ? duration : render - start,
    renderCallbacksMs: render === null ? 0 : (layout ?? end) - render,
    styleLayoutAndPaintMs: layout === null ? 0 : end - layout,
    forcedLayoutMs: Math.min(duration, forcedLayout),
  };
}
