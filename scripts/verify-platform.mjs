/** Local/CI quality gates. Does not deploy, seed, charge, send messages or migrate DBs.
 * Install exact root and mobile dependencies first. Nonzero exit means NOT verified.
 */
import { spawn } from "node:child_process";
import { mkdir, writeFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
const root=fileURLToPath(new URL("../",import.meta.url));
const directory=join(root,"verification","local-gate-"+new Date().toISOString().replace(/[:.]/g,"-"));
await mkdir(directory,{recursive:true});
const npm=process.platform==="win32"?"npm.cmd":"npm";
const webTests=(await readdir(join(root,"tests"))).filter(name=>name.endsWith(".test.mjs")).map(name=>"tests/"+name);
const steps=[
 {name:"web-lint",cwd:root,command:npm,args:["run","lint"]},
 {name:"web-build",cwd:root,command:npm,args:["run","build"]},
 {name:"web-tests",cwd:root,command:process.execPath,args:["--test","--test-concurrency=1",...webTests]},
 {name:"mobile-types",cwd:join(root,"mobile"),command:npm,args:["run","typecheck"]},
 {name:"mobile-lint",cwd:join(root,"mobile"),command:npm,args:["run","lint"]},
 {name:"mobile-tests",cwd:join(root,"mobile"),command:npm,args:["test"]},
];
const results=[];
for(const step of steps){
 console.log(`Running ${step.name}`);
 const chunks=[];let error=null;
 const child=spawn(step.command,step.args,{cwd:step.cwd,env:process.env,shell:process.platform==="win32"&&step.command===npm});
 child.stdout.on("data",chunk=>chunks.push(chunk));child.stderr.on("data",chunk=>chunks.push(chunk));
 const code=await new Promise(resolve=>{child.once("error",err=>{error=err.code||"spawn_failed";resolve(1);});child.once("close",code=>resolve(code??1));});
 await writeFile(join(directory,step.name+".log"),Buffer.concat(chunks));
 results.push({name:step.name,exitCode:code,passed:code===0,error});
 console.log(`${step.name}: ${code===0?"PASS":"FAIL (see log)"}`);
}
await writeFile(join(directory,"results.json"),JSON.stringify({generatedAt:new Date().toISOString(),node:process.version,results,scope:"Source/build checks only; NOT payment, notification, DB migration, native-device or live scanner certification."},null,2)+"\n");
console.log(`Logs: ${directory}`);
if(results.some(item=>!item.passed))process.exitCode=1;
