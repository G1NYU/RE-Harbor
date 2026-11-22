import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchDiscoveredUsers,
  type DiscoveredUser,
  type UserDiscoveryFilters,
} from "@/lib/social/user-discovery";

export function useUserDiscovery(filters: UserDiscoveryFilters, viewer: string | undefined) {
  const [users, setUsers] = useState<DiscoveredUser[]>([]);
  const [total, setTotal] = useState(0);
  const [cursor, setCursor] = useState<string>();
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const request = useRef<AbortController | null>(null);
  const {
    query,
    sort,
    rated,
    canvas,
    minRatings,
    match,
    minMatch,
    minShared,
    seed,
    reviewDirection,
  } = filters;
  const orderKey = filters.orders?.join(",") ?? "";
  const shortQuery = [...query.trim().replace(/^@+/, "")].length === 1;

  useEffect(() => {
    const controller = new AbortController();
    request.current = controller;
    setUsers([]);
    setCursor(undefined);
    setTotal(0);
    setError(null);
    setLoadingMore(false);
    setLoading(!shortQuery);
    const timer = window.setTimeout(() => {
      if (shortQuery) return;
      fetchDiscoveredUsers(
        {
          query,
          sort,
          rated,
          canvas,
          minRatings,
          match,
          minMatch,
          minShared,
          seed,
          reviewDirection,
          orders: orderKey ? (orderKey.split(",") as UserDiscoveryFilters["orders"]) : undefined,
        },
        controller.signal,
      )
        .then((page) => {
          if (controller.signal.aborted) return;
          setUsers(page.users);
          setTotal(page.total);
          setCursor(page.nextCursor);
        })
        .catch((reason: unknown) => {
          if (!controller.signal.aborted)
            setError(reason instanceof Error ? reason.message : "Could not load people.");
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 280);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [
    query,
    sort,
    seed,
    reviewDirection,
    orderKey,
    rated,
    canvas,
    minRatings,
    match,
    minMatch,
    minShared,
    shortQuery,
    retry,
    viewer,
  ]);

  const loadMore = async () => {
    const controller = request.current;
    if (!cursor || loadingMore || loading || !controller || controller.signal.aborted) return;
    setLoadingMore(true);
    setError(null);
    try {
      const page = await fetchDiscoveredUsers(filters, controller.signal, cursor);
      if (controller.signal.aborted) return;
      if (page.nextCursor === cursor)
        throw new Error("The next page could not be loaded. Try again.");
      setUsers((previous) => [
        ...new Map([...previous, ...page.users].map((user) => [user.id, user])).values(),
      ]);
      setCursor(page.nextCursor);
      setTotal(page.total);
    } catch (reason) {
      if (!controller.signal.aborted)
        setError(reason instanceof Error ? reason.message : "Could not load people.");
    } finally {
      if (!controller.signal.aborted) setLoadingMore(false);
    }
  };
  const reload = useCallback(() => setRetry((value) => value + 1), []);
  return {
    users,
    total,
    loading,
    loadingMore,
    error,
    shortQuery,
    hasMore: !!cursor,
    loadMore,
    reload,
  };
}
