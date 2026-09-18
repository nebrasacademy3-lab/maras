"use client";

import { startTransition, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createRealtimeController } from "@/lib/realtime-client";

export const REALTIME_SYNC_EVENT = "meras:sync";

export type SyncPayload = {
  ok: true;
  version: string;
  serverTime: string;
  channels?: Record<string, string>;
  changed?: string[];
};

export function useRealtimeSync(callback: (payload: SyncPayload) => void) {
  const callbackRef = useRef(callback);
  useEffect(() => { callbackRef.current = callback; }, [callback]);
  useEffect(() => {
    const listener = (event: Event) => callbackRef.current((event as CustomEvent<SyncPayload>).detail);
    window.addEventListener(REALTIME_SYNC_EVENT, listener);
    return () => window.removeEventListener(REALTIME_SYNC_EVENT, listener);
  }, []);
}

export function RealtimeSync({ children }: { children: React.ReactNode }) {
  const router = useRouter();

  useEffect(() => {
    const sync = createRealtimeController({
      fetchSnapshot: async signal => { const response = await fetch("/api/sync", {credentials:"same-origin",cache:"no-store",signal,headers:{accept:"application/json"}}); if(!response.ok)throw new Error(`sync-${response.status}`); return response.json() as Promise<SyncPayload>; },
      createStream: () => typeof EventSource === "undefined" ? null : new EventSource("/api/sync/stream", {withCredentials:true}),
      deliver: payload => {
        window.dispatchEvent(new CustomEvent(REALTIME_SYNC_EVENT,{detail:payload}));
        if(payload.changed?.some(channel=>["catalog","settings","announcements"].includes(channel)))startTransition(()=>router.refresh());
      },
      timer: (callback,ms) => setTimeout(callback,ms),
      clearTimer: id => clearTimeout(id),
    });
    const visibility=()=>{if(document.visibilityState === "visible")sync.resume();else sync.pause();};
    const pause=()=>sync.pause();
    const wake=()=>{if(document.visibilityState === "visible")sync.resume();};
    document.addEventListener("visibilitychange",visibility);
    window.addEventListener("pagehide",pause);
    window.addEventListener("pageshow",wake);
    window.addEventListener("focus",wake);
    window.addEventListener("online",wake);
    visibility();
    return()=>{sync.dispose();document.removeEventListener("visibilitychange",visibility);window.removeEventListener("pagehide",pause);window.removeEventListener("pageshow",wake);window.removeEventListener("focus",wake);window.removeEventListener("online",wake);};
  },[router]);

  return <>{children}</>;
}
