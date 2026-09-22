export function createPlayerGestures(callbacks: { rate: () => number; playing: () => boolean; setRate: (value:number) => void; seek: (seconds:number) => void; hint: (text:string) => void }) {
  let previous: { side:number; at:number } | null = null, saved:number|null=null, suppressTap=false;
  return {
    hold(){if(saved!==null||!callbacks.playing())return;saved=callbacks.rate();suppressTap=true;previous=null;callbacks.setRate(2);callbacks.hint("2× تشغيل سريع مؤقت");},
    release(){if(saved!==null){callbacks.setRate(saved);saved=null;callbacks.hint("");}},
    tap(x:number,width:number,at=Date.now()){if(suppressTap){suppressTap=false;return;}const side=x>=width/2?1:-1;if(previous&&previous.side===side&&at-previous.at>=0&&at-previous.at<=320){callbacks.seek(side*10);callbacks.hint(side>0?"تقديم 10 ثوانٍ":"رجوع 10 ثوانٍ");previous=null;}else previous={side,at};},
    cancel(){this.release();previous=null;suppressTap=false;},
  };
}
