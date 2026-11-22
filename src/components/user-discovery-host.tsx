import { lazy, Suspense, useEffect, useState } from "react";
import { subscribeUserDiscoveryOpen } from "@/lib/social/user-discovery-open";
const UserDiscovery = lazy(() =>
  import("@/views/user-discovery").then((module) => ({ default: module.UserDiscoveryView })),
);
export function UserDiscoveryHost() {
  const [open, setOpen] = useState(false);
  useEffect(() => subscribeUserDiscoveryOpen(() => setOpen(true)), []);
  return open ? (
    <Suspense fallback={null}>
      <UserDiscovery onClose={() => setOpen(false)} />
    </Suspense>
  ) : null;
}
