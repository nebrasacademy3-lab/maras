/** Lifecycle controller: network work stops on pagehide/hidden and resumes without replaying stale data. */
export type RealtimeSnapshot = { ok: true; version: string; serverTime: string; channels?: Record<string,string>; changed?: string[] };
export type RealtimeDependencies = {
  fetchSnapshot: (signal: AbortSignal) => Promise<RealtimeSnapshot>;
  createStream: () => EventSource | null;
  deliver: (payload: RealtimeSnapshot) => void;
  timer: (callback: () => void, milliseconds: number) => ReturnType<typeof setTimeout>;
  clearTimer: (id: ReturnType<typeof setTimeout>) => void;
};
export function createRealtimeController(deps: RealtimeDependencies) {
  let disposed=false, active=false, generation=0, inFlight=false, pending=false;
  let request:AbortController|null=null,stream:EventSource|null=null,connected=false;
  let poll:ReturnType<typeof setTimeout>|undefined,reconnect:ReturnType<typeof setTimeout>|undefined,debounce:ReturnType<typeof setTimeout>|undefined;
  let previous:Record<string,string>|null=null,backoff=1000;
  const clear=(kind:"poll"|"reconnect"|"debounce")=>{const id=kind==="poll"?poll:kind==="reconnect"?reconnect:debounce;if(id!==undefined)deps.clearTimer(id);if(kind==="poll")poll=undefined;else if(kind==="reconnect")reconnect=undefined;else debounce=undefined;};
  const schedule=(delay=connected?45000:5000)=>{clear("poll");if(active&&!disposed)poll=deps.timer(()=>void snapshot(),delay);};
  async function snapshot(){
    if(!active||disposed)return;if(inFlight){pending=true;return;}
    inFlight=true;const epoch=generation,controller=new AbortController();request=controller;
    try{
      const payload=await deps.fetchSnapshot(controller.signal);
      if(disposed||!active||controller.signal.aborted||epoch!==generation)return;
      if(!payload||payload.ok!==true||typeof payload.version!=="string")throw new Error("Invalid synchronization snapshot");
      const next=payload.channels||{catalog:payload.version};
      if(previous){const changed=[...new Set([...Object.keys(previous),...Object.keys(next)])].filter(key=>previous![key]!==next[key]);if(changed.length)deps.deliver({...payload,changed});}
      previous=next;
    }catch{if(active&&!disposed&&epoch===generation)connected=false;}
    finally{
      // A previous page lifecycle must not clear or schedule work for a resumed lifecycle.
      if(epoch===generation){inFlight=false;request=null;if(pending){pending=false;void snapshot();}else schedule();}
    }
  }
  function queueSnapshot(){if(!active||disposed)return;clear("debounce");debounce=deps.timer(()=>void snapshot(),80);}
  function connect(){
    if(!active||disposed||stream)return;
    clear("reconnect");const source=deps.createStream();if(!source)return;stream=source;
    source.addEventListener("ready",()=>{if(!active||disposed||stream!==source)return;connected=true;backoff=1000;schedule(45000);});
    source.addEventListener("change",queueSnapshot);
    source.onerror=()=>{if(!active||disposed||stream!==source)return;source.close();stream=null;connected=false;schedule();const delay=backoff;backoff=Math.min(backoff*2,30000);reconnect=deps.timer(connect,delay);};
  }
  function pause(){active=false;generation++;pending=false;inFlight=false;request?.abort();request=null;stream?.close();stream=null;connected=false;clear("poll");clear("reconnect");clear("debounce");}
  function resume(){if(disposed)return;if(active){queueSnapshot();if(!stream)connect();return;}active=true;generation++;void snapshot();connect();}
  return{resume,pause,dispose(){pause();disposed=true;previous=null;}};
}
