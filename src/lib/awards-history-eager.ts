import { setBundledAwards } from "./awards-history";

// Desktop's boot decision. main.tsx imports this and waits for the promise with its other boot
// reads, so the table is still set before the root renders and every reader keeps its
// synchronous timing.
//
// The import is dynamic so that rollup gives the table a chunk of its own. As part of the entry
// chunk the browser had to fetch and compile its 2.3MB before the first line of the app could
// run. On its own it is requested once the entry chunk has run (the bundler's preload helper
// defers the import by a microtask), while the boot reads are in flight. The television entry
// never reaches this file, so its boot graph stays free of the table as before.
//
// A rejection is left for main.tsx to record as a boot fallback. Without the table there are no
// bundled award marks, award pages or award-winner rows; live lookups still work. If the table
// only arrives after main.tsx stopped waiting, readers that subscribe or compute later pick it
// up, while award pages and rows computed in the gap stay empty until the next start.
export const bundledAwardsReady: Promise<void> = import("@/data/awards.json").then((table) =>
  setBundledAwards(table.default),
);
