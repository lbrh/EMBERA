/** Single source of truth for the top-level tab routes, used by the header (tab list +
 * active-tab highlight), the last-visited-tab tracker, and any click-through page (such as
 * incident detail) that needs to know which tab it was reached from. */
export const TABS = [
  { href: "/", label: "Map", short: "Map", backLabel: "Back to map" },
  { href: "/dispatch", label: "Dispatch order", short: "Order", backLabel: "Back to dispatch order" },
  { href: "/review", label: "Manual review", short: "Review", backLabel: "Back to manual review" },
  { href: "/resolved", label: "Resolved", short: "Resolved", backLabel: "Back to resolved" },
  { href: "/archive", label: "Archive", short: "Archive", backLabel: "Back to archive" },
  { href: "/submit", label: "Submit image", short: "Submit", backLabel: "Back to submit image" },
  // every crew and where it is; each links to the crew's own view (/crew), which stays under this tab
  { href: "/crews", label: "Crews", short: "Crews", backLabel: "Back to crews" },
] as const;

export type TabHref = (typeof TABS)[number]["href"];

const TAB_HREFS: readonly string[] = TABS.map((t) => t.href);

export function isTabPath(path: string): path is TabHref {
  return TAB_HREFS.includes(path);
}

export function backLabelForPath(path: string): string {
  return TABS.find((t) => t.href === path)?.backLabel ?? "Back to map";
}
