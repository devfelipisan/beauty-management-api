export interface WorkerRuntimeEnv { [key:string]: unknown }
export function json(data:unknown,status=200):Response { return new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8'}}); }
export function dispatchHealth(request:Request,service:string):Response|undefined { const url=new URL(request.url); if(request.method==='GET'&&url.pathname==='/health') return json({status:'ok',service,version:'local'}); return undefined; }
export function notFound():Response { return json({status:'error',code:'NOT_FOUND'},404); }
