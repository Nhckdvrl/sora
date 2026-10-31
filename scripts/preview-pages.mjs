import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Strict, read-only preview under the same subdirectory as GitHub Pages.
const root = fileURLToPath(new URL('../dist/', import.meta.url));
const prefix = '/sora/';
const mime = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.txt':'text/plain; charset=utf-8'};
const server = http.createServer(async(req,res)=>{
  if(!['GET','HEAD'].includes(req.method)) {res.writeHead(405);res.end();return;}
  try {
    const url = new URL(req.url,'http://127.0.0.1');
    if(url.pathname==='/sora') {res.writeHead(301,{Location:prefix});res.end();return;}
    if(!url.pathname.startsWith(prefix)) {res.writeHead(404);res.end();return;}
    const relative = decodeURIComponent(url.pathname.slice(prefix.length)) || 'index.html';
    const filename = path.resolve(root,relative),within = path.relative(root,filename);
    if(within.startsWith('..')||path.isAbsolute(within)) {res.writeHead(404);res.end();return;}
    const data = await fs.readFile(filename);
    res.writeHead(200,{'Content-Type':mime[path.extname(filename)]||'application/octet-stream','Cache-Control':'no-cache'});
    res.end(req.method==='HEAD'?undefined:data);
  } catch {res.writeHead(404);res.end();}
});
server.listen(5182,'127.0.0.1',()=>console.log('Static GitHub Pages preview: http://127.0.0.1:5182/sora/'));
