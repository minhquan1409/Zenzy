import { readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parse } from 'yaml';
import { buildCollection, COLLECTION_FILE } from '../scripts/postman';
import { makeAdmin, registerUser, startApp, stopApp, TestContext } from './helpers';

interface Outcome {
  operation: string;
  status: number;
  code?: string;
  passed: boolean;
}

/**
 * docs/postman/zenzy.postman_collection.json is what client developers import in Postman. These tests
 * keep it in step with the server and run it, top to bottom, the way Postman's collection runner does.
 */
describe('Postman collection', () => {
  let ctx: TestContext;
  const collection = buildCollection();
  const requests: any[] = collection.item.flatMap((folder: any) => folder.item);
  const operationOf = (item: any): string => String(item.event[0].script.exec[0]).match(/^pm\.test\("(\w+ \S+) answers/)![1];

  beforeAll(async () => {
    process.env.MEDIA_LOCAL_DIR = join(tmpdir(), `zenzy-media-postman-${Date.now()}`); // uploads on, as on the deployed server
    ctx = await startApp();
  });
  afterAll(async () => {
    delete process.env.MEDIA_LOCAL_DIR;
    await stopApp(ctx);
  });

  it('the committed file is what scripts/postman.ts generates (run "npm run docs:postman" after an API change)', () => {
    // Compared as text: a failed toEqual on a file this large takes minutes to print its difference.
    const onDisk = JSON.stringify(JSON.parse(readFileSync(COLLECTION_FILE, 'utf8')));
    const upToDate = onDisk === JSON.stringify(collection);
    expect(upToDate).toBe(true);
  });

  it('has exactly one request for every operation of openapi.yaml', () => {
    const doc = parse(readFileSync(join(__dirname, '..', 'docs', 'openapi.yaml'), 'utf8'));
    const documented: string[] = [];
    for (const [path, item] of Object.entries<Record<string, unknown>>(doc.paths)) {
      for (const m of ['get', 'post', 'put', 'patch', 'delete']) if (item[m]) documented.push(`${m.toUpperCase()} ${path}`);
    }
    expect(requests.map(operationOf).sort()).toEqual(documented.sort());
  });

  it('runs top to bottom: tokens and ids flow between requests, bodies are valid, the right token is sent', async () => {
    const vars = new Map<string, string>(collection.variable.map((v: { key: string; value: string }) => [v.key, v.value]));
    // What a tester fills in by hand: a free username, an e-mail, another user to interact with, an admin.
    const suffix = Date.now().toString(36);
    const other = await registerUser(ctx, `zenother_${suffix}`);
    const admin = await registerUser(ctx, `zenadmin_${suffix}`);
    await makeAdmin(ctx, admin);
    vars.set('username', `pm_${suffix}`);
    vars.set('email', `pm_${suffix}@example.com`);
    vars.set('search_username', 'zenother');
    vars.set('admin_username', admin.username);
    vars.set('admin_password', 'password123');
    vars.set('download_user', 'tester');
    vars.set('download_password', 'download-pass');

    const fill = (text: string) =>
      text.replace(/\{\{(\$?\w+)\}\}/g, (_m, name: string) => (name === '$guid' ? `guid-${Math.random()}` : (vars.get(name) ?? '')));
    const pmVariables = { set: (k: string, v: unknown) => vars.set(k, String(v)), get: (k: string) => vars.get(k) };
    const run = (lines: string[], pm: object) => new Function('pm', lines.join('\n'))(pm);

    const outcomes: Outcome[] = [];
    for (const item of requests) {
      run(collection.event[0].script.exec, { collectionVariables: pmVariables });
      const { request } = item;
      const url = fill(request.url.raw).replace(vars.get('base_url')!, '');
      let call = (ctx.http() as any)[request.method.toLowerCase()](url);
      for (const h of request.header) call = call.set(h.key, fill(h.value));
      const auth = request.auth ?? collection.auth;
      if (auth.type === 'bearer') call = call.set('Authorization', `Bearer ${fill(auth.bearer[0].value)}`);
      if (auth.type === 'basic') call = call.auth(fill(auth.basic[0].value), fill(auth.basic[1].value));
      const res = request.body?.mode === 'raw' ? await call.send(fill(request.body.raw)) : await call;

      let passed = true;
      const pm = {
        collectionVariables: pmVariables,
        response: { code: res.status, text: () => res.text ?? '', json: () => res.body },
        test: (_name: string, fn: () => void) => {
          try {
            fn();
          } catch {
            passed = false;
          }
        },
      };
      run(item.event[0].script.exec, pm);
      outcomes.push({ operation: operationOf(item), status: res.status, code: res.body?.code, passed });
    }

    const of = (operation: string) => outcomes.find((o) => o.operation === operation)!;
    // No request is broken: nothing crashes the server, every example body passes validation, and the
    // token each request sends is accepted. (uploads/local needs a real signed file.)
    const broken = outcomes.filter(
      (o) =>
        o.status >= 500 ||
        (o.code === 'UNAUTHENTICATED' && o.operation !== 'GET /internal/download-auth') ||
        (o.code === 'INVALID_INPUT' && o.operation !== 'POST /uploads/local') ||
        o.code === 'FORBIDDEN',
    );
    expect(broken).toEqual([]);

    // Requests that cannot succeed with a single account, or that need something outside the server.
    const expectedFailures: Record<string, string> = {
      'POST /auth/google': 'INVALID_GOOGLE_TOKEN', // needs a real Google token
      'PATCH /friends/requests/{request_id}': 'NOT_RECIPIENT', // only the receiver answers
      'PUT /friends/{user_id}/close': 'NOT_FOUND', // the request above was not accepted
      'POST /events/{event_id}/requests': 'OWN_EVENT', // a host cannot join their own event
      'PATCH /events/{event_id}/requests/{request_id}': 'NOT_FOUND',
      'DELETE /events/{event_id}/requests/me': 'NOT_FOUND',
      'DELETE /events/{event_id}/members/{user_id}': 'NOT_FOUND',
      'POST /shops/{shop_id}/deals': 'SHOP_NOT_APPROVED', // an admin approves the shop later in the run
      'PATCH /shops/{shop_id}/deals/{deal_id}': 'NOT_FOUND',
      'POST /conversations': 'NOT_FRIENDS',
      'POST /uploads/local': 'INVALID_INPUT',
      'PATCH /notifications/{id}': 'NOT_FOUND', // a new account has no notification yet
    };
    const failed = outcomes.filter((o) => !o.passed).map((o) => [o.operation, o.code]);
    expect(failed.sort()).toEqual(Object.entries(expectedFailures).sort());

    // The chain worked end to end.
    expect(of('POST /auth/register/verify').status).toBe(201);
    expect(of('POST /auth/login').status).toBe(200);
    expect(of('POST /admin/login').status).toBe(200);
    expect(vars.get('other_user_id')).toBe(other.id);
    for (const id of ['event_id', 'shop_id', 'post_id', 'report_id', 'friend_request_id']) expect([id, vars.get(id)]).not.toEqual([id, '000000000000000000000000']);
    expect(of('DELETE /me').status).toBe(202);
    expect(await ctx.db.users.countDocuments({ username: vars.get('username') })).toBe(0);
  });
});
