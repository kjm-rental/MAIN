/* eslint-disable @typescript-eslint/no-require-imports -- Restricted local tunnel gateway. */
const http=require('node:http');
const {load}=require('./paymongo-test-env.cjs');
load(); // Refuse a production/mixed-project environment before listening.
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://127.0.0.1:3101');
 if(req.method==='GET'&&u.pathname==='/paymongo/return'){
  const id=u.searchParams.get('bookingId');
  if(!/^[0-9a-f-]{36}$/i.test(id||'')){res.writeHead(400).end();return;}
  res.writeHead(302,{Location:`http://localhost:3000/booking/status/${id}`,'Cache-Control':'no-store'}).end();return;
 }
 if(req.method!=='POST'||!['/api/paymongo/webhook','/api/paymongo/reconcile'].includes(u.pathname)||u.search){res.writeHead(404).end();return;}
 try{
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65536){res.writeHead(413).end();return;}chunks.push(chunk);}
  const headers={'Content-Type':'application/json'};
  for(const name of ['paymongo-signature','authorization'])if(req.headers[name])headers[name]=req.headers[name];
  const r=await fetch(`http://127.0.0.1:3000${u.pathname}`,{method:'POST',headers,body:Buffer.concat(chunks),redirect:'error',signal:AbortSignal.timeout(60000)});
  res.writeHead(r.status,{'Content-Type':'application/json','Cache-Control':'no-store'}).end(await r.text());
 }catch{res.writeHead(503,{'Cache-Control':'no-store'}).end();}
}).listen(3101,'127.0.0.1',()=>console.log('Restricted webhook gateway listening on loopback:3101; app/documents are not exposed.'));
