import { useNavigate, useLocation } from "react-router-dom";
import { useEffect, useRef } from "react";

export function useGoBack(fallbackPath: string = "/") {
  const navigate = useNavigate();
  const location = useLocation();

  // Persist the "from" state on mount so it survives re-renders
  const fromRef = useRef<string | null>(
    (location.state as any)?.from ?? null
  );
  // Persist any extra state to forward back (e.g. exposeCreator)
  const forwardStateRef = useRef<Record<string, any> | null>(
    (() => {
      const state = location.state as any;
      if (!state) return null;
      const { from, ...rest } = state;
      return Object.keys(rest).length > 0 ? rest : null;
    })()
  );

  // Save list routes to sessionStorage (survives reload)
  useEffect(() => {
    const path = location.pathname;
    const isDetailPage = /^\/(candidates|clients|jobs)\/[^/]+/.test(path);
    if (!isDetailPage && path !== "/access-denied") {
      sessionStorage.setItem("lastListRoute", path);
    }
  }, [location.pathname]);

  return () => {
    // 1. Explicit state from navigate() call (persisted via ref)
    if (fromRef.current) {
      navigate(fromRef.current, { state: forwardStateRef.current || undefined });
      return;
    }

    // 2. SessionStorage (survives reload)
    const lastRoute = sessionStorage.getItem("lastListRoute");
    if (lastRoute) {
      navigate(lastRoute);
      return;
    }

    // 3. In-app history available
    if (location.key !== "default") {
      navigate(-1);
      return;
    }

    // 4. Fallback
    navigate(fallbackPath);
  };
}
