/**
 * Test infrastructure for API handler unit tests.
 *
 * Provides fakes for the three `HandlerDeps`:
 *  - `makeFakeSdk()` — a PluginContext-shaped fake whose `auth.requireAdmin`
 *    / `auth.getUser` can be made to throw (auth-fail tests) or resolve
 *    (happy-path / error-wrap tests).
 *  - `makeCtx()` — a fake Astro APIContext with a real `Request` and `params`.
 *  - `poisonDb()` — a Proxy that throws on ANY property access or function call,
 *    used to prove a handler never touched the db (auth-fail) or that the catch
 *    block wraps unexpected errors (error-wrap).
 *
 * Reuses the real-SQLite harness from `tests/db/harness.ts` for happy-path tests.
 */

/** Build an Error with a `.status` property, mirroring the CMS's requireAdmin. */
function authError(message: string, status: number): Error {
  return Object.assign(new Error(message), { status });
}

/** A 401 Unauthorized error (no session). */
export function unauthorizedError(): Error {
  return authError('Unauthorized', 401);
}

/** A 403 Forbidden error (authenticated, non-admin / banned). */
export function forbiddenError(): Error {
  return authError('Forbidden', 403);
}

export interface FakeSdkOptions {
  /** If set, requireAdmin throws this error. */
  authThrows?: Error;
  /** If authThrows not set, requireAdmin/getUser resolve to this (default: a stub admin user). */
  user?: any;
  /** Fake storage configuration. */
  storage?: {
    uploadResult?: { url?: string; key?: string; width?: number; height?: number };
    uploadThrows?: boolean;
  };
}

interface RecordedUpload { buf: Buffer; key: string; mime: string }

/**
 * Build a fake PluginContext. Only the `auth` namespace is exercised by the
 * plugin's handlers (requireAdmin 94×, getUser 2×); other namespaces are stubs.
 */
export function makeFakeSdk(opts: FakeSdkOptions = {}): any {
  const defaultUser = { id: 'admin-user-1', email: 'admin@example.com', role: 'admin' };
  const user = opts.user === undefined ? defaultUser : opts.user;

  const uploadCalls: RecordedUpload[] = [];
  const deleteCalls: string[] = [];
  const uploadResult = opts.storage?.uploadResult;
  const uploadThrows = opts.storage?.uploadThrows === true;

  return {
    auth: {
      requireAdmin: async (_req: any) => {
        if (opts.authThrows) throw opts.authThrows;
        return user;
      },
      getUser: async (_req: any) => {
        if (opts.authThrows) throw opts.authThrows;
        return user;
      },
    },
    collections: {},
    db: undefined,
    storage: {
      // Mirrors the CMS storage SDK: upload(buf, key, mime) → { url, key, width, height }
      upload: async (buf: Buffer, key: string, mime: string) => {
        uploadCalls.push({ buf: Buffer.from(buf), key, mime });
        if (uploadThrows) throw new Error('fake storage upload failure');
        if (uploadResult) return { ...uploadResult, key: uploadResult.key ?? key };
        return { url: '/uploads/' + key, key, width: 100, height: 50 };
      },
      delete: async (key: string) => {
        deleteCalls.push(key);
      },
      getUrl: (key: string) => '/uploads/' + key,
      // Recorded-call inspection hooks (not part of the real SDK)
      uploadCalls,
      deleteCalls,
    },
    webhooks: { trigger: async () => {} },
  };
}

export interface FakeCtxOptions {
  url?: string;
  method?: string;
  body?: any;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  /** When set, builds a multipart/form-data request with a `file` field (Blob) + extra fields. */
  formData?: {
    file: Buffer | string;
    fileName: string;
    fileType: string;
    fields?: Record<string, string>;
  };
}

/**
 * Build a fake Astro APIContext with a real `Request` (so `.json()` etc. work)
 * and a `params` object for dynamic route segments.
 */
export function makeCtx(opts: FakeCtxOptions = {}): any {
  const hasFormData = opts.formData !== undefined;
  const hasBody = opts.body !== undefined;
  const method = opts.method ?? (hasFormData ? 'POST' : hasBody ? 'POST' : 'GET');
  const url = opts.url ?? 'http://localhost/api';
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };

  let bodyInit: BodyInit | undefined;
  if (hasFormData) {
    // Build a real FormData; let the platform set the multipart boundary. Do NOT
    // set Content-Type manually — the Request/FormData integration sets it.
    const fd = new FormData();
    const buf = typeof opts.formData!.file === 'string' ? Buffer.from(opts.formData!.file) : opts.formData!.file;
    const blob = new Blob([buf], { type: opts.formData!.fileType });
    // Blob has no .name; use File when available so file.name is populated.
    const file = typeof File !== 'undefined' ? new File([buf], opts.formData!.fileName, { type: opts.formData!.fileType }) : blob;
    fd.append('file', file as any, opts.formData!.fileName);
    if (opts.formData!.fields) {
      for (const [k, v] of Object.entries(opts.formData!.fields)) fd.append(k, v);
    }
    bodyInit = fd as any;
  } else if (hasBody) {
    bodyInit = JSON.stringify(opts.body);
    headers['Content-Type'] = headers['Content-Type'] ?? 'application/json';
  }

  const request = new Request(url, { method, headers, body: bodyInit });
  return {
    request,
    params: { ...(opts.params ?? {}) },
    url: new URL(url),
    site: new URL('http://localhost'),
    cookies: {
      get: () => undefined,
      set: () => {},
      delete: () => {},
    },
    redirect: () => new Response(null, { status: 302 }),
    locals: {},
  };
}

/**
 * A Proxy that throws `Error('poison')` on ANY property access or function call.
 * Used to prove a handler never touched the db (auth-fail: handler returns 401
 * before any db call) or that the catch block wraps unexpected errors (error-
 * wrap: handler reaches a db call, the poison throws, the catch returns 500).
 */
export function poisonDb(): any {
  const thrower = () => {
    throw new Error('poison: db was touched');
  };
  const throwOnAccess = () => {
    throw new Error('poison: db was touched');
  };
  return new Proxy(thrower, {
    get: throwOnAccess,
    apply: thrower,
    construct: thrower,
    has: throwOnAccess,
  });
}
