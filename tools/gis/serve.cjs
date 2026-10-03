// Local preview only. No writes, publishing, or external interfaces.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const mime = {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8',
  '.js':'text/javascript; charset=utf-8','.json':'application/json',
  '.geojson':'application/geo+json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.glb':'model/gltf-binary'};
function handler(req,res) {
  let pathname;
  try {pathname=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/bcbd-wiki(?=\/)/,'');}
  catch {res.writeHead(400).end();return;}
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=path.resolve(root,'.'+pathname);
  if(!file.startsWith(root+path.sep) || /(^|[\\/])\.[^\\/]/.test(path.relative(root,file))) {res.writeHead(403).end();return;}
  fs.readFile(file,(error,content) => {
    if(error){res.writeHead(404).end();return;}
    res.setHeader('Content-Type',mime[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options','nosniff');res.end(content);
  });
}
module.exports={handler,root};
if(require.main === module) {
  const port=Number(process.env.BCBD_MAP_PORT || 8765);
  const server=http.createServer(handler);
  server.on('error',error => {console.error(error.message);process.exitCode=1;});
  server.listen(port,'127.0.0.1',() => console.log(`BCBD map preview: http://127.0.0.1:${port}/herramientas/mapa-daule/`));
}
