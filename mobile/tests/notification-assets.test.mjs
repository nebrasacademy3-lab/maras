import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import test from 'node:test';
const asset=name=>readFileSync(new URL('../assets/'+name,import.meta.url));
function decodeRgba(png) {
  assert.equal(png.subarray(0,8).toString('hex'),'89504e470d0a1a0a');
  const width=png.readUInt32BE(16),height=png.readUInt32BE(20);
  assert.equal(png[24],8);assert.equal(png[25],6,'notification masks require alpha');assert.equal(png[28],0);
  const idat=[];for(let offset=8;offset<png.length;){const length=png.readUInt32BE(offset);if(png.toString('ascii',offset+4,offset+8)==='IDAT')idat.push(png.subarray(offset+8,offset+8+length));offset+=length+12;}
  const raw=inflateSync(Buffer.concat(idat)),stride=width*4,bytes=Buffer.alloc(stride*height);assert.equal(raw.length,(stride+1)*height);
  for(let y=0;y<height;y++)for(let x=0;x<stride;x++){
    const filter=raw[y*(stride+1)],i=y*stride+x,a=x>=4?bytes[i-4]:0,b=y?bytes[i-stride]:0,c=y&&x>=4?bytes[i-stride-4]:0;
    let predictor=0;
    if(filter===1)predictor=a;else if(filter===2)predictor=b;else if(filter===3)predictor=Math.floor((a+b)/2);else if(filter===4){const p=a+b-c,pa=Math.abs(p-a),pb=Math.abs(p-b),pc=Math.abs(p-c);predictor=pa<=pb&&pa<=pc?a:pb<=pc?b:c;}else assert.equal(filter,0);
    bytes[i]=(raw[y*(stride+1)+x+1]+predictor)&255;
  }
  return {width,height,bytes};
}
test('notification icon is a white transparent mask with the M and separate complete star',()=>{
  const {width,height,bytes}=decodeRgba(asset('notification-icon.png'));assert.equal(width,96);assert.equal(height,96);
  let visible=0;const points=new Set();
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4,alpha=bytes[i+3];
    if(x===0||y===0||x===width-1||y===height-1)assert.equal(alpha,0,'transparent outer margin');
    if(alpha){assert.deepEqual([...bytes.subarray(i,i+3)],[255,255,255]);visible++;}
    if(alpha>128)points.add(y*width+x);
  }
  assert.ok(visible>500&&visible<width*height/2,'not an opaque square or empty mask');
  const components=[];
  while(points.size){const todo=[points.values().next().value];points.delete(todo[0]);let size=0;while(todo.length){const at=todo.pop();size++;for(const next of [at-1,at+1,at-width,at+width])if(points.delete(next))todo.push(next);}components.push(size);}
  assert.equal(components.filter(size=>size>=10).length,2,'M and star remain separate visible components');
});
test('App Store icon keeps the required opaque 1024 square source',()=>{
  const png=asset('icon.png');assert.equal(png.readUInt32BE(16),1024);assert.equal(png.readUInt32BE(20),1024);assert.equal(png[25],2,'RGB source without transparency');
});
