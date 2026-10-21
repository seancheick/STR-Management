"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { JOBS_CHANGED_EVENT } from "@/lib/services/job-updates";
import { refreshJobViewsAction } from "@/app/actions/refresh-job-views";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

/** Database events invalidate server views; no second client-side job store. */
export function LiveJobUpdates({ ownerId, userId, cleanerId = userId, cleaner = false }: {
  ownerId: string; userId: string; cleanerId?:string; cleaner?: boolean;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  useEffect(() => { routerRef.current = router; }, [router]);
  useEffect(() => {
    const supabase = createBrowserSupabaseClient();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let connected = false;
    let disposed = false;
    let previouslyConnected = false;
    let refreshing = false;
    let refreshQueued = false;
    const refresh = () => {
      if (disposed || document.visibilityState !== "visible") return;
      if (refreshing) { refreshQueued = true; return; }
      clearTimeout(timer);
      timer = setTimeout(() => {
        refreshing = true;
        window.dispatchEvent(new Event(JOBS_CHANGED_EVENT));
        startTransition(async () => {
          try { await refreshJobViewsAction(); }
          catch { if (!disposed) routerRef.current.refresh(); }
          finally {
            refreshing = false;
            if (refreshQueued && !disposed) { refreshQueued = false; refresh(); }
          }
        });
      }, 200);
    };
    const channel = supabase.channel(`jobs:${userId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "assignments",
        filter: cleaner ? `cleaner_id=eq.${cleanerId}` : `owner_id=eq.${ownerId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "notifications", filter: `recipient_id=eq.${userId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "cleaner_payments",
        filter: cleaner ? `cleaner_id=eq.${cleanerId}` : `owner_id=eq.${ownerId}`,
      }, refresh);
    // Browser cookie sessions must be loaded before Realtime joins. Otherwise
    // the channel can report SUBSCRIBED as anon and silently receive no rows.
    void supabase.auth.getSession().then(async ({ data }) => {
      if (disposed || !data.session) return;
      await supabase.realtime.setAuth(data.session.access_token);
      if (disposed) return;
      channel.subscribe((status) => {
        connected = status === "SUBSCRIBED";
        if (connected && previouslyConnected) refresh();
        if (connected) previouslyConnected = true;
      });
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) void supabase.realtime.setAuth(session.access_token);
      else connected = false;
    });
    const fallback = setInterval(() => { if (!connected) refresh(); }, 10000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      disposed = true;
      authListener.subscription.unsubscribe();
      clearTimeout(timer);
      clearInterval(fallback);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
      void supabase.removeChannel(channel);
    };
  }, [ownerId, userId, cleanerId, cleaner]);
  return null;
}
