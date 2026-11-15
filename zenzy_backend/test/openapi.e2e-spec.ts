import { readFileSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { startApp, stopApp, TestContext } from './helpers';

const METHODS = ['get', 'post', 'put', 'patch', 'delete'];

/** docs/openapi.yaml (the Swagger file given to client developers) must describe exactly the routes of the server. */
describe('OpenAPI document', () => {
  let ctx: TestContext;
  const doc = parse(readFileSync(join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));

  beforeAll(async () => {
    ctx = await startApp();
  });
  afterAll(async () => stopApp(ctx));

  function resolve(ref: string): any {
    return ref
      .replace(/^#\//, '')
      .split('/')
      .reduce((node: any, key) => node?.[key], doc);
  }

  /** "GET /users/{user_id}" for every route registered in Express, without the /v1 prefix. */
  function serverRoutes(): string[] {
    const express = ctx.app.getHttpAdapter().getInstance();
    const stack: any[] = (express.router ?? express._router).stack;
    const out: string[] = [];
    for (const layer of stack) {
      if (!layer.route) continue;
      const path = String(layer.route.path)
        .replace(/^\/v1(?=\/)/, '')
        .replace(/:(\w+)/g, '{$1}');
      for (const m of METHODS) if (layer.route.methods[m]) out.push(`${m.toUpperCase()} ${path}`);
    }
    return [...new Set(out)].sort();
  }

  function documentedRoutes(): string[] {
    const out: string[] = [];
    for (const [path, item] of Object.entries<Record<string, unknown>>(doc.paths)) {
      for (const m of METHODS) if (item[m]) out.push(`${m.toUpperCase()} ${path}`);
    }
    return out.sort();
  }

  it('lists every route of the server, and nothing else', () => {
    const server = serverRoutes();
    expect(server.length).toBeGreaterThan(80);
    expect(documentedRoutes()).toEqual(server);
  });

  it('every operation has a summary, a tag and responses; every $ref resolves', () => {
    const tags = new Set((doc.tags as Array<{ name: string }>).map((t) => t.name));
    for (const [path, item] of Object.entries<Record<string, any>>(doc.paths)) {
      for (const m of METHODS) {
        const op = item[m];
        if (!op) continue;
        const where = `${m.toUpperCase()} ${path}`;
        expect([where, typeof op.summary]).toEqual([where, 'string']);
        expect([where, op.tags?.length === 1 && tags.has(op.tags[0])]).toEqual([where, true]);
        expect([where, Object.keys(op.responses ?? {}).length > 0]).toEqual([where, true]);
        // path parameters in the URL are declared
        const declared = new Set([...(item.parameters ?? []), ...(op.parameters ?? [])].map((p: any) => (p.$ref ? resolve(p.$ref).name : p.name)));
        for (const name of path.match(/\{(\w+)\}/g) ?? []) expect([where, declared.has(name.slice(1, -1))]).toEqual([where, true]);
      }
    }
    const refs: string[] = [];
    const walk = (v: unknown): void => {
      if (Array.isArray(v)) v.forEach(walk);
      else if (v && typeof v === 'object') {
        for (const [k, x] of Object.entries(v)) {
          if (k === '$ref' && typeof x === 'string') refs.push(x);
          else walk(x);
        }
      }
    };
    walk(doc);
    expect(refs.length).toBeGreaterThan(100);
    for (const ref of refs) expect([ref, resolve(ref) !== undefined]).toEqual([ref, true]);
  });

  it('public routes in the document are the routes that work without a token', async () => {
    for (const [path, item] of Object.entries<Record<string, any>>(doc.paths)) {
      for (const m of METHODS) {
        const op = item[m];
        if (!op) continue;
        const where = `${m.toUpperCase()} ${path}`;
        const isPublic = Array.isArray(op.security) && (op.security.length === 0 || 'basicAuth' in op.security[0]);
        const url = (path === '/health' ? '' : '/v1') + path.replace(/\{\w+\}/g, 'aaaaaaaaaaaaaaaaaaaaaaaa');
        const res = await (ctx.http() as any)[m](url).send({});
        const refusedForNoToken = res.status === 401 && res.body.code === 'UNAUTHENTICATED' && !res.headers['www-authenticate'];
        expect([where, !refusedForNoToken]).toEqual([where, isPublic]);
      }
    }
  });
});
