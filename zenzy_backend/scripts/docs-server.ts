// `npm run docs`: serves docs/swagger.html (Swagger UI) and docs/openapi.yaml on the docs address in src/core/address.ts.
// The same openapi.yaml can also be imported into Postman or pasted into https://editor.swagger.io.
import { createReadStream } from 'fs';
import { createServer } from 'http';
import { join } from 'path';
import { ADDRESS, docsPort, localDocsUrl } from '../src/core/address';

const docs = join(__dirname, '..', 'docs');
const files: Record<string, [string, string]> = {
  '/': ['swagger.html', 'text/html; charset=utf-8'],
  '/openapi.yaml': ['openapi.yaml', 'application/yaml; charset=utf-8'],
};

createServer((req, res) => {
  const hit = files[(req.url || '/').split('?')[0]];
  if (!hit) {
    res.writeHead(404).end('Not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': hit[1], 'Cache-Control': 'no-store' });
  createReadStream(join(docs, hit[0])).pipe(res);
}).listen(docsPort, ADDRESS.host, () => console.log(`Zenzy API docs: ${localDocsUrl}`));
