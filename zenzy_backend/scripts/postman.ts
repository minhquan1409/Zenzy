// `npm run docs:postman`: builds docs/postman/zenzy.postman_collection.json from docs/openapi.yaml.
// One request per API operation, grouped in folders, with example bodies, the right authorisation, and
// scripts that pass tokens and ids from one request to the next. Import the file in Postman and run it
// top to bottom (see docs/postman/README.md). test/postman.e2e-spec.ts runs it against the real server code.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { parse } from 'yaml';
import { ADDRESS, localBaseUrl } from '../src/core/address';

const DOCS = join(__dirname, '..', 'docs');
export const COLLECTION_FILE = join(DOCS, 'postman', 'zenzy.postman_collection.json');

type Json = Record<string, any>;
const METHODS = ['get', 'post', 'put', 'patch', 'delete'];
const DUMMY_ID = '000000000000000000000000';

/** Collection variables. Everything a tester may need to change is here (Collection > Variables). */
const VARIABLES: Array<[string, string, string]> = [
  ['base_url', ADDRESS.deployedBaseUrl, `Server address without /v1. Local server: ${localBaseUrl}`],
  ['username', 'postman_tester', 'Account used by the collection (3-30: a-z 0-9 _ .). Change it to a name that is free'],
  ['password', 'Postman-test-123', 'Password of that account'],
  ['email', 'you@example.com', 'A real inbox of yours: the 6-digit sign-up code is sent here'],
  ['date_of_birth', '2000-05-01', ''],
  ['code', '', 'The 6-digit code from the sign-up e-mail (filled automatically on a local server)'],
  ['reset_code', '', 'The 6-digit code from the password-reset e-mail (filled automatically on a local server)'],
  ['google_id_token', 'paste-a-google-id-token-here', 'A Google ID token, only for POST /auth/google'],
  ['access_token', '', 'Filled by register/verify and login'],
  ['refresh_token', '', 'Filled by register/verify, login and refresh'],
  ['my_user_id', DUMMY_ID, 'Filled by register/verify and login'],
  ['admin_username', '', 'An ADMIN account, only for the Admin folder'],
  ['admin_password', '', ''],
  ['admin_access_token', '', 'Filled by POST /admin/login'],
  ['download_user', '', 'Only for GET /internal/download-auth'],
  ['download_password', '', ''],
  ['other_user_id', DUMMY_ID, 'Another user: filled by GET /users (first result), or paste an id'],
  ['search_username', 'zen', 'Text for GET /users (at least 3 characters)'],
  ['latitude', '10.7725', 'Centre used by the map, events and NEARBY feed requests'],
  ['longitude', '106.698', ''],
  ['friend_request_id', DUMMY_ID, 'Filled by POST /friends/requests'],
  ['event_id', DUMMY_ID, 'Filled by POST /events'],
  ['event_request_id', DUMMY_ID, 'Filled by POST /events/{event_id}/requests'],
  ['shop_id', DUMMY_ID, 'Filled by POST /shops'],
  ['deal_id', DUMMY_ID, 'Filled by POST /shops/{shop_id}/deals'],
  ['post_id', DUMMY_ID, 'Filled by POST /posts'],
  ['conversation_id', DUMMY_ID, 'Filled by POST /events (the event chat) or POST /conversations'],
  ['notification_id', DUMMY_ID, 'Filled by GET /notifications (first item)'],
  ['report_id', DUMMY_ID, 'Filled by GET /admin/reports (first item)'],
  ['push_token', 'postman-test-device-token-0001', ''],
];

const IN_2_HOURS = '{{$isoTimestamp}}'; // replaced below: Postman has no "now + n hours" variable

/** Example request bodies. Operations not listed get a body built from the schema (required fields only). */
const BODIES: Record<string, Json | null> = {
  'POST /auth/register': { username: '{{username}}', password: '{{password}}', date_of_birth: '{{date_of_birth}}', email: '{{email}}' },
  'POST /auth/register/resend': { email: '{{email}}' },
  'POST /auth/register/verify': { email: '{{email}}', code: '{{code}}' },
  'POST /auth/login': { username: '{{username}}', password: '{{password}}' },
  'POST /auth/google': { id_token: '{{google_id_token}}', username: '{{username}}', date_of_birth: '{{date_of_birth}}' },
  'POST /auth/password/forgot': { login: '{{username}}' },
  'POST /auth/password/reset': { login: '{{username}}', code: '{{reset_code}}', new_password: '{{password}}' },
  'POST /auth/refresh': { refresh_token: '{{refresh_token}}' },
  'POST /auth/logout': { refresh_token: '{{refresh_token}}' },
  'PATCH /me': { display_name: 'Postman Tester', bio: 'Testing the Zenzy API' },
  'PUT /me/password': { current_password: '{{password}}', new_password: '{{password}}', refresh_token: '{{refresh_token}}' },
  'DELETE /me': { password: '{{password}}' },
  'PUT /me/guardian-consent': { confirmed: true },
  'PUT /me/privacy': { ghost_mode: false, sharing_enabled: true, audience: 'FRIENDS', share_until: null, precise: true, discoverable: true },
  'PUT /me/location': { latitude: 10.7725, longitude: 106.698, accuracy: 12 },
  'PUT /me/notification-settings': { CHAT_MESSAGE: true, EVENT_UPDATE: true },
  'PUT /me/device-tokens': { token: '{{push_token}}', platform: 'ANDROID' },
  'DELETE /me/device-tokens': { token: '{{push_token}}' },
  'POST /friends/requests': { receiver_id: '{{other_user_id}}' },
  'PATCH /friends/requests/{request_id}': { action: 'ACCEPT' },
  'PUT /friends/{user_id}/close': { close: true },
  'POST /blocks': { user_id: '{{other_user_id}}' },
  'POST /events': {
    title: 'Postman test meetup',
    type: 'EVENT',
    description: 'Created by the Postman collection',
    latitude: 10.7725,
    longitude: 106.698,
    place_name: 'Ben Thanh',
    end_time: IN_2_HOURS,
    max_participants: 10,
    audience: 'EVERYONE',
  },
  'PATCH /events/{event_id}': { title: 'Postman test meetup (edited)', max_participants: 12 },
  'POST /events/{event_id}/cancel': { reason: 'Test finished' },
  'POST /events/{event_id}/requests': null,
  'PATCH /events/{event_id}/requests/{request_id}': { status: 'APPROVED' },
  'POST /shops': {
    name: 'Postman Test Cafe',
    address: '1 Le Loi, District 1',
    latitude: 10.7725,
    longitude: 106.698,
    description: 'Created by the Postman collection',
    menu: [{ name: 'Iced latte', price: 45000 }],
    hours: '07:00 – 22:00',
  },
  'PATCH /shops/{shop_id}': { description: 'Edited by the Postman collection' },
  'POST /shops/{shop_id}/deals': { title: 'Happy hour', discount: '-20%', end_time: IN_2_HOURS },
  'PATCH /shops/{shop_id}/deals/{deal_id}': { status: 'CANCELLED' },
  'POST /posts': { text: 'Hello from Postman', place_name: 'Ben Thanh', latitude: 10.7725, longitude: 106.698 },
  'PATCH /posts/{post_id}': { text: 'Hello from Postman (edited)' },
  'POST /posts/{post_id}/comments': { text: 'Nice post' },
  'POST /uploads/sign': { purpose: 'POST_PHOTO', content_type: 'image/jpeg' },
  'POST /conversations': { type: 'DIRECT', member_ids: ['{{other_user_id}}'] },
  'PATCH /conversations/{id}': { muted: true },
  'POST /conversations/{id}/messages': { content: 'Hello from Postman' },
  'PATCH /notifications/{id}': { read: true },
  'POST /reports': { target_type: 'USER', target_id: '{{other_user_id}}', reason: 'SPAM', note: 'Postman test report' },
  'POST /admin/login': { username: '{{admin_username}}', password: '{{admin_password}}' },
  'PATCH /admin/reports/{report_id}': { action: 'DISMISS', reason: 'Postman test' },
  'PATCH /admin/shops/{shop_id}': { decision: 'APPROVE' },
  'PATCH /admin/users/{user_id}/status': { status: 'ACTIVE', reason: 'Postman test' },
};

/** Example query values (parameter name -> value). Parameters not listed are added switched off. */
const QUERIES: Record<string, Record<string, string>> = {
  'GET /users': { username: '{{search_username}}' },
  'GET /map/nearby': { latitude: '{{latitude}}', longitude: '{{longitude}}', radius: '5000' },
  'GET /events': { latitude: '{{latitude}}', longitude: '{{longitude}}', radius: '5000' },
  'GET /search': { q: 'cafe', latitude: '{{latitude}}', longitude: '{{longitude}}' },
  'GET /posts': { feed: 'FOR_YOU' },
  'GET /friends': { status: 'ACCEPTED' },
  'GET /shops/{shop_id}/deals': { status: 'ACTIVE' },
  'GET /admin/reports': { status: 'OPEN' },
  'GET /admin/shops': { status: 'PENDING' },
};

/** Lines added to a request's test script: they copy values of the response into collection variables. */
const SESSION = [
  'var j = pm.response.json();',
  'if (j.tokens) {',
  '  pm.collectionVariables.set("access_token", j.tokens.access_token);',
  '  pm.collectionVariables.set("refresh_token", j.tokens.refresh_token);',
  '  pm.collectionVariables.set("my_user_id", j.user.id);',
  '}',
];
const save = (variable: string, expr: string) => ['var j = pm.response.json();', `if (${expr}) pm.collectionVariables.set("${variable}", ${expr});`];
const SAVES: Record<string, string[]> = {
  'POST /auth/register': save('code', 'j.dev_code'),
  'POST /auth/register/resend': save('code', 'j.dev_code'),
  'POST /auth/register/verify': SESSION,
  'POST /auth/login': SESSION,
  'POST /auth/google': SESSION,
  'POST /auth/password/forgot': save('reset_code', 'j.dev_code'),
  'POST /auth/refresh': [
    'var j = pm.response.json();',
    'if (j.access_token) {',
    '  pm.collectionVariables.set("access_token", j.access_token);',
    '  pm.collectionVariables.set("refresh_token", j.refresh_token);',
    '}',
  ],
  'POST /admin/login': ['var j = pm.response.json();', 'if (j.tokens) pm.collectionVariables.set("admin_access_token", j.tokens.access_token);'],
  'GET /users': save('other_user_id', 'j.items && j.items[0] && j.items[0].id'),
  'POST /friends/requests': save('friend_request_id', 'j.request_id'),
  'POST /events': [...save('event_id', 'j.id'), 'if (j.conversation_id) pm.collectionVariables.set("conversation_id", j.conversation_id);'],
  'POST /events/{event_id}/requests': save('event_request_id', 'j.request_id'),
  'POST /shops': save('shop_id', 'j.id'),
  'POST /shops/{shop_id}/deals': save('deal_id', 'j.id'),
  'POST /posts': save('post_id', 'j.id'),
  'POST /conversations': save('conversation_id', 'j.id'),
  'GET /notifications': save('notification_id', 'j.items && j.items[0] && j.items[0].id'),
  'GET /admin/reports': save('report_id', 'j.items && j.items[0] && j.items[0].report_id'),
};

/** Extra explanation shown in Postman under a request. */
const NOTES: Record<string, string> = {
  'POST /auth/register':
    'Set the collection variables `username` and `email` first. On the deployed server the 6-digit code arrives by e-mail: copy it into the variable `code`, then send "verify".',
  'POST /auth/register/verify': 'Needs the variable `code` (from the sign-up e-mail). Saves the tokens for every later request.',
  'POST /auth/google': 'Needs a real Google ID token in the variable `google_id_token`; without one the answer is 401 INVALID_GOOGLE_TOKEN.',
  'POST /auth/password/reset': 'Needs the variable `reset_code` (from the password-reset e-mail).',
  'GET /users': 'Saves the first result as `other_user_id`, used by the friend, block, chat and report requests.',
  'PATCH /friends/requests/{request_id}': 'Only the user who received the request can answer it, so with one account this answers 403 NOT_RECIPIENT.',
  'POST /events/{event_id}/requests': 'A host cannot join their own event (400 OWN_EVENT): use an `event_id` of another user to see the 201.',
  'POST /shops/{shop_id}/deals': 'The shop must be approved by an admin first (PATCH /admin/shops/{shop_id}); otherwise 403 SHOP_NOT_APPROVED.',
  'POST /conversations': 'Direct chats are only possible between friends (403 NOT_FRIENDS otherwise).',
  'POST /uploads/local': 'Local development only. Use the `upload_url` and `fields` returned by POST /uploads/sign; clients never build this call themselves.',
  'DELETE /me': 'Deletes the test account and all of its data. Keep it as the last request.',
  'GET /internal/download-auth': 'Called by the web server for the /download/ page, not by apps. 10 wrong passwords block your IP for 24 hours.',
  'POST /admin/login': 'Careful: 3 wrong passwords block your IP from the admin area for 24 hours.',
};

/** Folder order. The last folder holds the requests that end the session, so a full run can go top to bottom. */
const LAST_FOLDER = 'Sign out and delete the test account';
const MOVE_TO_LAST = ['POST /auth/logout', 'DELETE /me'];
/** Order inside the Auth folder (a full sign-up, then the rest). */
const AUTH_ORDER = [
  'POST /auth/register',
  'POST /auth/register/resend',
  'POST /auth/register/verify',
  'POST /auth/password/forgot',
  'POST /auth/password/reset',
  'POST /auth/login',
  'POST /auth/refresh',
  'POST /auth/google',
];

function pathVariable(path: string, name: string): string {
  if (name === 'user_id') return 'other_user_id';
  if (name === 'id') return path.startsWith('/conversations') ? 'conversation_id' : 'notification_id';
  if (name === 'request_id') return path.startsWith('/friends') ? 'friend_request_id' : 'event_request_id';
  return name;
}

export function buildCollection(): Json {
  const doc = parse(readFileSync(join(DOCS, 'openapi.yaml'), 'utf8'));
  const resolve = (node: any): any => {
    let n = node;
    while (n?.$ref) n = String(n.$ref).replace(/^#\//, '').split('/').reduce((x: any, k) => x?.[k], doc);
    return n;
  };

  /** Smallest valid example of a schema: required properties only. */
  const example = (schema: any): any => {
    const s = resolve(schema);
    if (!s) return null;
    if (s.example !== undefined) return s.example;
    if (s.allOf) return Object.assign({}, ...s.allOf.map((p: any) => example(p)));
    if (s.enum) return s.enum[0];
    if (s.type === 'object' || s.properties) {
      const out: Json = {};
      for (const key of s.required ?? []) out[key] = example(s.properties?.[key]);
      return out;
    }
    if (s.type === 'array') return [example(s.items)];
    if (s.type === 'boolean') return true;
    if (s.type === 'integer' || s.type === 'number') return s.minimum ?? 1;
    if (s.format === 'date-time') return IN_2_HOURS;
    if (s.format === 'date') return '2000-05-01';
    if (s.format === 'email') return '{{email}}';
    return 'text';
  };

  const folders = new Map<string, Json[]>();
  for (const tag of doc.tags as Array<{ name: string }>) folders.set(tag.name, []);
  folders.set(LAST_FOLDER, []);

  for (const [path, item] of Object.entries<Json>(doc.paths)) {
    for (const method of METHODS) {
      const op = item[method];
      if (!op) continue;
      const key = `${method.toUpperCase()} ${path}`;
      const security = op.security ?? doc.security;
      const isPublic = security.length === 0;
      const isBasic = !isPublic && 'basicAuth' in security[0];
      const isAdmin = op.tags[0] === 'Admin' && !isPublic;

      const segments = [...(path === '/health' ? [] : ['v1']), ...path.split('/').filter(Boolean)].map((seg) =>
        seg.replace(/^\{(\w+)\}$/, (_m, name) => `{{${pathVariable(path, name)}}}`),
      );
      const parameters: Json[] = [...(item.parameters ?? []), ...(op.parameters ?? [])].map(resolve);
      const wanted = QUERIES[key] ?? {};
      const query = parameters
        .filter((p) => p.in === 'query')
        .map((p) => ({
          key: p.name,
          value: wanted[p.name] ?? String(example(p.schema) ?? ''),
          ...(p.description ? { description: p.description } : {}),
          ...(p.name in wanted ? {} : { disabled: true }),
        }));
      const enabled = query.filter((q) => !('disabled' in q)).map((q) => `${q.key}=${q.value}`);
      const raw = `{{base_url}}/${segments.join('/')}${enabled.length ? `?${enabled.join('&')}` : ''}`;

      const header: Json[] = [];
      if (parameters.some((p) => p.in === 'header' && p.name === 'Idempotency-Key')) {
        header.push({ key: 'Idempotency-Key', value: '{{$guid}}', description: 'Optional: a retry with the same key returns the first response' });
      }

      const content = op.requestBody?.content ?? {};
      let body: Json | undefined;
      if (content['application/json']) {
        const value = key in BODIES ? BODIES[key] : example(content['application/json'].schema);
        if (value !== null) {
          body = { mode: 'raw', raw: JSON.stringify(value, null, 2), options: { raw: { language: 'json' } } };
          header.push({ key: 'Content-Type', value: 'application/json' });
        }
      } else if (content['multipart/form-data']) {
        body = { mode: 'formdata', formdata: [{ key: 'file', type: 'file', src: [] }] };
      }

      const success = Object.keys(op.responses)
        .map(Number)
        .filter((code) => code >= 200 && code < 300);
      const test = [
        `pm.test("${key} answers ${success.join(' or ')}", function () {`,
        `  if (${JSON.stringify(success)}.indexOf(pm.response.code) < 0) throw new Error("status " + pm.response.code + ": " + pm.response.text());`,
        '});',
        ...(SAVES[key] ? ['try {', ...SAVES[key].map((l) => `  ${l}`), '} catch (e) {}'] : []),
      ];

      const errors = Object.entries<Json>(op.responses)
        .filter(([code]) => Number(code) >= 400)
        .map(([code, r]) => `- ${code}: ${String(resolve(r).description).replace(/\s+/g, ' ').trim()}`);
      const description = [NOTES[key], op.description?.trim(), errors.length ? `Errors:\n${errors.join('\n')}` : '']
        .filter(Boolean)
        .join('\n\n');

      const request: Json = {
        method: method.toUpperCase(),
        header,
        ...(body ? { body } : {}),
        url: { raw, host: ['{{base_url}}'], path: segments, ...(query.length ? { query } : {}) },
        description,
      };
      if (isPublic) request.auth = { type: 'noauth' };
      else if (isBasic) {
        request.auth = {
          type: 'basic',
          basic: [
            { key: 'username', value: '{{download_user}}', type: 'string' },
            { key: 'password', value: '{{download_password}}', type: 'string' },
          ],
        };
      } else if (isAdmin) request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{admin_access_token}}', type: 'string' }] };

      const entry = { name: `${op.summary}`, zenzyOperation: key, event: [{ listen: 'test', script: { type: 'text/javascript', exec: test } }], request };
      folders.get(MOVE_TO_LAST.includes(key) ? LAST_FOLDER : op.tags[0])!.push(entry);
    }
  }

  const auth = folders.get('Auth')!;
  auth.sort((a, b) => AUTH_ORDER.indexOf(a.zenzyOperation) - AUTH_ORDER.indexOf(b.zenzyOperation));
  folders.get(LAST_FOLDER)!.sort((a, b) => MOVE_TO_LAST.indexOf(a.zenzyOperation) - MOVE_TO_LAST.indexOf(b.zenzyOperation));
  // Creating comes before reading and changing, so ids exist when a folder runs top to bottom.
  for (const [name, items] of folders) {
    if (name === 'Auth' || name === LAST_FOLDER) continue;
    const rank = (e: Json) => {
      const [method, path] = String(e.zenzyOperation).split(' ');
      const depth = path.split('/').length;
      // Blocking comes after the friend requests (a blocked user cannot be befriended), unblocking last.
      if (path.startsWith('/blocks')) return 950 + ['POST', 'GET', 'DELETE'].indexOf(method);
      // Deleting comes last, the innermost thing first (a like before its post).
      if (method === 'DELETE' || /\/cancel$/.test(path)) return 920 - depth;
      if (method === 'POST' && depth === 2) return 0; // POST /events, /shops, /posts, ...
      return 100;
    };
    const order = new Map(items.map((e, i) => [e, i]));
    items.sort((a, b) => rank(a) - rank(b) || order.get(a)! - order.get(b)!);
  }

  const descriptions = new Map((doc.tags as Json[]).map((t) => [t.name, t.description]));
  descriptions.set(LAST_FOLDER, 'Ends the session and removes the test account. Run this folder last.');
  const collection = {
    info: {
      name: `Zenzy API (${doc.info.version})`,
      description: [
        'Every operation of the Zenzy server, generated from docs/openapi.yaml.',
        '',
        '**Start here**',
        '1. Open the collection > Variables and set `username` (a free name) and `email` (an inbox you can read).',
        '2. Send Auth > "Sign-up step 1", copy the 6-digit code from the e-mail into the variable `code`, send "Sign-up step 2".',
        '   The tokens are stored automatically and every other request uses them. Later, "Sign in" does the same.',
        '3. Requests that create something (event, shop, post, chat) store its id for the requests after them.',
        '',
        'Access tokens live 15 minutes: send Auth > "Exchange a refresh token" (or "Sign in") when requests start answering 401.',
        'The Admin folder needs an ADMIN account in `admin_username` / `admin_password`.',
        'The server limits how often some routes may be called (429 with `retry_after`), so do not run the collection in a loop.',
      ].join('\n'),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: { type: 'bearer', bearer: [{ key: 'token', value: '{{access_token}}', type: 'string' }] },
    variable: VARIABLES.map(([key, value, description]) => ({ key, value, type: 'string', ...(description ? { description } : {}) })),
    item: [...folders]
      .filter(([, items]) => items.length)
      .map(([name, items]) => ({
        name,
        ...(descriptions.get(name) ? { description: descriptions.get(name) } : {}),
        item: items.map(({ zenzyOperation: _op, ...rest }) => rest),
      })),
  };
  // "{{$isoTimestamp}}" is now; events and deals need an end time in the future, computed before each request.
  const text = JSON.stringify(collection, null, 2).split(IN_2_HOURS).join('{{in_2_hours}}');
  const out = JSON.parse(text);
  out.event = [
    {
      listen: 'prerequest',
      script: { type: 'text/javascript', exec: ['pm.collectionVariables.set("in_2_hours", new Date(Date.now() + 2 * 3600 * 1000).toISOString());'] },
    },
  ];
  return out;
}

if (require.main === module) {
  mkdirSync(join(DOCS, 'postman'), { recursive: true });
  writeFileSync(COLLECTION_FILE, `${JSON.stringify(buildCollection(), null, 2)}\n`);
  console.log(`wrote ${COLLECTION_FILE}`);
}
