/** Deliberately small in-memory transaction double. It does not simulate real SQL
 * concurrency or constraints. Statement predicates are evaluated, not ignored.
 */
export function controlDatabase(initial={}) {
 const names=["adminOperations","aiEntitlements","auditLogs","authSessions","cartItems","courseAccess","courseAccessEvents","courseRequests","courseWaitlist","favorites","learningTrackInterests","notificationsDb","pushDevices","supportReplies","supportTickets","users","catalogCourses"];
 const state=Object.fromEntries(names.map(name=>[name,structuredClone(initial[name]||[])]));
 const tables=Object.fromEntries(names.map(name=>[name,new Proxy({_table:name},{get(target,key){return key==="_table"?name:{table:name,key};}})]));
 const controls={failInsert:null,locks:[]};
 const eq=(a,b)=>({op:"eq",a,b});const and=(...args)=>({op:"and",args});const inArray=(a,b)=>({op:"in",a,b});const isNull=a=>({op:"null",a});const sql=(parts,...values)=>({op:"sql",parts:[...parts],values});
 const value=(arg,row)=>arg&&typeof arg==="object"&&arg.table?row[arg.key]:arg;
 const matches=(expr,row)=>{
  if(!expr)return true;
  if(expr.op==="and")return expr.args.every(item=>matches(item,row));
  if(expr.op==="eq")return value(expr.a,row)===value(expr.b,row);
  if(expr.op==="null")return value(expr.a,row)==null;
  if(expr.op==="in")return (expr.b instanceof Query?expr.b.execute().map(item=>Object.values(item)[0]):expr.b).includes(value(expr.a,row));
  if(expr.op==="sql"&&expr.parts.join("").includes("NOT EXISTS"))return !state.catalogCourses.some(item=>item.slug===row.courseSlug&&(item.status!=="published"||item.enrollmentMode==="closed"));
  throw new Error("Unsupported test predicate: "+JSON.stringify(expr));
 };
 const project=(row,selection)=>selection?Object.fromEntries(Object.entries(selection).map(([key,column])=>[key,value(column,row)])):structuredClone(row);
 class Query {
  constructor(kind,table,selection,change){Object.assign(this,{kind,table,selection,change,offsetValue:0,limitValue:Infinity,orders:[]});}
  where(filter){this.filter=filter;return this;}
  limit(limit){this.limitValue=limit;return this;}
  offset(offset){this.offsetValue=offset;return this;}
  orderBy(...orders){this.orders=orders;return this;}
  for(mode,options){controls.locks.push({table:this.table,mode,options});return this;}
  returning(selection){this.returnRows=true;this.selection=selection;return this;}
  onConflictDoNothing(config){this.conflict=config.target;return this;}
  execute(){
   const rows=state[this.table];let affected=[];
   if(this.kind==="insert"){
    if(controls.failInsert===this.table)throw new Error("Injected transaction failure");
    for(const item of Array.isArray(this.change)?this.change:[this.change]){
     const targets=this.conflict?(Array.isArray(this.conflict)?this.conflict:[this.conflict]):[];
     if(targets.length&&rows.some(row=>targets.every(col=>row[col.key]===item[col.key])))continue;
     const row={id:Math.max(0,...rows.map(x=>x.id||0))+1,...structuredClone(item)};rows.push(row);affected.push(row);
    }
   } else {
    affected=rows.filter(row=>matches(this.filter,row));
    if(this.kind==="select"){
     affected.sort((a,b)=>{for(const column of this.orders){const left=a[column.key],right=b[column.key];if(left<right)return -1;if(left>right)return 1;}return 0;});
     affected=affected.slice(this.offsetValue,this.offsetValue+this.limitValue);
    }else if(this.kind==="update")for(const row of affected)Object.assign(row,structuredClone(this.change));
    else if(this.kind==="delete")state[this.table]=rows.filter(row=>!affected.includes(row));
   }
   return affected.map(row=>project(row,this.selection));
  }
  then(resolve,reject){return Promise.resolve().then(()=>this.execute()).then(resolve,reject);}
 }
 const db={select:selection=>({from:table=>new Query("select",table._table,selection)}),insert:table=>({values:change=>new Query("insert",table._table,null,change)}),update:table=>({set:change=>new Query("update",table._table,null,change)}),delete:table=>new Query("delete",table._table),execute:async expression=>{controls.locks.push(expression);return {rows:[]};},transaction:async work=>{const saved=structuredClone(state);try{return await work(db);}catch(error){for(const name of names)state[name]=saved[name];throw error;}}};
 return {state,db,tables,controls,operators:{and,eq,inArray,isNull,sql,asc:col=>col}};
}
