// ============================================================
// DEMO MODE — Mock Supabase client
// ------------------------------------------------------------
// This is a drop-in replacement for the real Supabase client.
// There is NO backend. All data is stored in localStorage and
// seeded from ./demoData. It implements the subset of the
// supabase-js API the app actually uses:
//   - from(table) query builder (select/insert/update/delete/
//     upsert + filters + order/limit/range/single/count + joins)
//   - auth (role-based demo login, session persistence)
//   - functions.invoke (canned AI responses)
//   - storage (in-memory object URLs)
//   - rpc (computed demo responses)
//   - channels (no-op realtime)
// ============================================================

import { buildSeedDatabase, DEMO_USERS, type DemoDatabase, type DemoUser } from "./demoData";

// ---------- Minimal auth types (replace @supabase/supabase-js) ----------
export interface User {
  id: string;
  email: string | null;
  user_metadata: Record<string, any>;
  app_metadata: Record<string, any>;
  aud: string;
  created_at: string;
}

export interface Session {
  access_token: string;
  refresh_token: string;
  expires_at: number;
  token_type: string;
  user: User;
}

type AuthResult = { data: { user: User | null; session: Session | null }; error: AuthError | null };
type AuthError = { message: string; status?: number };

const DB_KEY = "demo_db_v1";
const SESSION_KEY = "demo_session_v1";

// User scoping is only strictly enforced for these tables. For every other
// table an `eq('user_id', x)` filter is ignored so all seeded demo data is
// visible to whichever role is currently signed in.
const STRICT_USER_SCOPE = new Set<string>(["user_roles"]);

// ---------- Persistent store ----------
function loadDb(): DemoDatabase {
  try {
    const raw = localStorage.getItem(DB_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  const seeded = buildSeedDatabase();
  localStorage.setItem(DB_KEY, JSON.stringify(seeded));
  return seeded;
}

let db: DemoDatabase = loadDb();

function persist() {
  try {
    localStorage.setItem(DB_KEY, JSON.stringify(db));
  } catch {
    /* ignore quota errors */
  }
}

function table(name: string): any[] {
  if (!db[name]) db[name] = [];
  return db[name];
}

function uuid(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return "id-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
}

// ---------- Filter / query helpers ----------
type Filter =
  | { kind: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "like" | "ilike" | "is" | "in" | "contains" | "overlaps"; column: string; value: any }
  | { kind: "or"; value: string }
  | { kind: "not"; column: string; op: string; value: any };

function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/%/g, ".*").replace(/_/g, ".");
  return new RegExp(`^${escaped}$`, "i");
}

function applySingleOp(row: any, column: string, op: string, value: any): boolean {
  const cell = row[column];
  switch (op) {
    case "eq":
      return cell == value;
    case "neq":
      return cell != value;
    case "gt":
      return cell > value;
    case "gte":
      return cell >= value;
    case "lt":
      return cell < value;
    case "lte":
      return cell <= value;
    case "like":
      return typeof cell === "string" && likeToRegex(String(value)).test(cell);
    case "ilike":
      return typeof cell === "string" && likeToRegex(String(value)).test(cell);
    case "is":
      if (value === null) return cell === null || cell === undefined;
      return cell === value;
    case "in":
      return Array.isArray(value) && value.includes(cell);
    case "contains":
      if (Array.isArray(cell) && Array.isArray(value)) return value.every((v) => cell.includes(v));
      return false;
    case "overlaps":
      if (Array.isArray(cell) && Array.isArray(value)) return value.some((v) => cell.includes(v));
      return false;
    default:
      return true;
  }
}

function matchesFilter(row: any, f: Filter, tableName: string): boolean {
  // Relax user scoping for non-strict tables.
  if ("column" in f && f.column === "user_id" && !STRICT_USER_SCOPE.has(tableName)) {
    if (f.kind === "eq" || f.kind === "is" || f.kind === "in") return true;
  }
  if (f.kind === "or") {
    const parts = f.value.split(",");
    return parts.some((part) => {
      const [column, op, ...rest] = part.split(".");
      let val: any = rest.join(".");
      if (val === "null") val = null;
      return applySingleOp(row, column, op, val);
    });
  }
  if (f.kind === "not") {
    return !applySingleOp(row, f.column, f.op, f.value);
  }
  return applySingleOp(row, f.column, f.kind, f.value);
}

// ---------- Embedded relation resolution ----------
const FK_FALLBACKS: Record<string, string[]> = {
  profiles: ["user_id", "created_by", "assigned_to", "invited_by", "submitted_by"],
};

function singularize(name: string): string {
  if (name.endsWith("ies")) return name.slice(0, -3) + "y";
  if (name.endsWith("s")) return name.slice(0, -1);
  return name;
}

function parseSelect(selectStr: string): { columns: string[]; relations: { name: string; sub: string }[] } {
  const columns: string[] = [];
  const relations: { name: string; sub: string }[] = [];
  let depth = 0;
  let token = "";
  const flush = () => {
    const t = token.trim();
    token = "";
    if (!t) return;
    const parenIdx = t.indexOf("(");
    if (parenIdx !== -1 && t.endsWith(")")) {
      let name = t.slice(0, parenIdx).trim();
      // strip alias "alias:relation"
      if (name.includes(":")) name = name.split(":").pop()!.trim();
      const sub = t.slice(parenIdx + 1, -1);
      relations.push({ name, sub });
    } else {
      columns.push(t);
    }
  };
  for (const ch of selectStr) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) {
      flush();
    } else {
      token += ch;
    }
  }
  flush();
  return { columns, relations };
}

function resolveRelations(row: any, selectStr: string): any {
  if (!selectStr || selectStr.trim() === "*") return { ...row };
  const { relations } = parseSelect(selectStr);
  if (relations.length === 0) return { ...row };
  const out = { ...row };
  for (const rel of relations) {
    const relTable = rel.name;
    const fkCandidates = [singularize(relTable) + "_id", ...(FK_FALLBACKS[relTable] || [])];
    const fk = fkCandidates.find((c) => row[c] !== undefined && row[c] !== null);
    if (fk) {
      const related = table(relTable).find((r) => r.id === row[fk]);
      out[relTable] = related ? resolveRelations(related, rel.sub || "*") : null;
    } else {
      // to-many: rows in relTable pointing back to this row
      const backFk = singularize(rel.name === relTable ? "" : relTable) || "";
      const myFk = singularize(selectStr) + "_id";
      const children = table(relTable).filter((r) => r[myFk] === row.id);
      out[relTable] = children.map((c) => resolveRelations(c, rel.sub || "*"));
    }
  }
  return out;
}

// ---------- Query builder ----------
type Op = "select" | "insert" | "update" | "delete" | "upsert";

class QueryBuilder implements PromiseLike<any> {
  private tableName: string;
  private op: Op | null = null;
  private payload: any = null;
  private filters: Filter[] = [];
  private selectStr = "*";
  private returning = false;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private limitN: number | null = null;
  private rangeFromTo: [number, number] | null = null;
  private singleMode: "single" | "maybe" | null = null;
  private countMode: "exact" | "planned" | "estimated" | null = null;
  private headMode = false;
  private upsertConflict = "id";

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  select(columns?: string, options?: { count?: "exact" | "planned" | "estimated"; head?: boolean }) {
    if (this.op === null) {
      this.op = "select";
    } else {
      this.returning = true;
    }
    if (columns) this.selectStr = columns;
    if (options?.count) this.countMode = options.count;
    if (options?.head) this.headMode = true;
    return this;
  }

  insert(values: any) {
    this.op = "insert";
    this.payload = values;
    return this;
  }

  update(values: any) {
    this.op = "update";
    this.payload = values;
    return this;
  }

  upsert(values: any, options?: { onConflict?: string }) {
    this.op = "upsert";
    this.payload = values;
    if (options?.onConflict) this.upsertConflict = options.onConflict;
    return this;
  }

  delete() {
    this.op = "delete";
    return this;
  }

  eq(column: string, value: any) { this.filters.push({ kind: "eq", column, value }); return this; }
  neq(column: string, value: any) { this.filters.push({ kind: "neq", column, value }); return this; }
  gt(column: string, value: any) { this.filters.push({ kind: "gt", column, value }); return this; }
  gte(column: string, value: any) { this.filters.push({ kind: "gte", column, value }); return this; }
  lt(column: string, value: any) { this.filters.push({ kind: "lt", column, value }); return this; }
  lte(column: string, value: any) { this.filters.push({ kind: "lte", column, value }); return this; }
  like(column: string, value: any) { this.filters.push({ kind: "like", column, value }); return this; }
  ilike(column: string, value: any) { this.filters.push({ kind: "ilike", column, value }); return this; }
  is(column: string, value: any) { this.filters.push({ kind: "is", column, value }); return this; }
  in(column: string, value: any[]) { this.filters.push({ kind: "in", column, value }); return this; }
  contains(column: string, value: any) { this.filters.push({ kind: "contains", column, value }); return this; }
  overlaps(column: string, value: any) { this.filters.push({ kind: "overlaps", column, value }); return this; }
  or(value: string) { this.filters.push({ kind: "or", value }); return this; }
  not(column: string, op: string, value: any) { this.filters.push({ kind: "not", column, op, value }); return this; }
  filter(column: string, op: string, value: any) { this.filters.push({ kind: op as any, column, value }); return this; }
  match(criteria: Record<string, any>) {
    for (const [column, value] of Object.entries(criteria)) this.filters.push({ kind: "eq", column, value });
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }
  limit(n: number) { this.limitN = n; return this; }
  range(from: number, to: number) { this.rangeFromTo = [from, to]; return this; }
  single() { this.singleMode = "single"; return this; }
  maybeSingle() { this.singleMode = "maybe"; return this; }

  private filtered(): any[] {
    let rows = table(this.tableName);
    for (const f of this.filters) rows = rows.filter((r) => matchesFilter(r, f, this.tableName));
    return rows;
  }

  private withSystemFields(rowInput: any): any {
    const row = { ...rowInput };
    if (row.id === undefined || row.id === null) row.id = uuid();
    const nowIso = new Date().toISOString();
    if (row.created_at === undefined) row.created_at = nowIso;
    row.updated_at = nowIso;
    if (row.user_id === undefined && currentSession) row.user_id = currentSession.user.id;
    return row;
  }

  private execute(): { data: any; error: any; count: number | null } {
    try {
      switch (this.op) {
        case "insert":
        case "upsert": {
          const arr = Array.isArray(this.payload) ? this.payload : [this.payload];
          const rowsTable = table(this.tableName);
          const inserted: any[] = [];
          for (const item of arr) {
            const row = this.withSystemFields(item);
            if (this.op === "upsert") {
              const idx = rowsTable.findIndex((r) => r[this.upsertConflict] === row[this.upsertConflict]);
              if (idx !== -1) {
                rowsTable[idx] = { ...rowsTable[idx], ...row };
                inserted.push(rowsTable[idx]);
                continue;
              }
            }
            rowsTable.push(row);
            inserted.push(row);
          }
          persist();
          const data = this.returning ? this.shape(inserted) : null;
          return { data, error: null, count: inserted.length };
        }
        case "update": {
          const matches = this.filtered();
          const nowIso = new Date().toISOString();
          for (const m of matches) {
            Object.assign(m, this.payload, { updated_at: nowIso });
          }
          persist();
          const data = this.returning ? this.shape(matches) : null;
          return { data, error: null, count: matches.length };
        }
        case "delete": {
          const matches = this.filtered();
          const rowsTable = table(this.tableName);
          db[this.tableName] = rowsTable.filter((r) => !matches.includes(r));
          persist();
          const data = this.returning ? this.shape(matches) : null;
          return { data, error: null, count: matches.length };
        }
        case "select":
        default: {
          let rows = this.filtered();
          const count = rows.length;
          if (this.orderBy.length) {
            rows = [...rows].sort((a, b) => {
              for (const o of this.orderBy) {
                const av = a[o.column];
                const bv = b[o.column];
                if (av === bv) continue;
                if (av === null || av === undefined) return 1;
                if (bv === null || bv === undefined) return -1;
                const cmp = av > bv ? 1 : -1;
                return o.ascending ? cmp : -cmp;
              }
              return 0;
            });
          }
          if (this.rangeFromTo) rows = rows.slice(this.rangeFromTo[0], this.rangeFromTo[1] + 1);
          if (this.limitN !== null) rows = rows.slice(0, this.limitN);
          if (this.headMode) return { data: null, error: null, count };
          const shaped = rows.map((r) => resolveRelations(r, this.selectStr));
          if (this.singleMode) {
            if (shaped.length === 0) {
              if (this.singleMode === "maybe") return { data: null, error: null, count };
              return { data: null, error: { message: "No rows found", code: "PGRST116" }, count };
            }
            return { data: shaped[0], error: null, count };
          }
          return { data: shaped, error: null, count };
        }
      }
    } catch (err: any) {
      return { data: null, error: { message: err?.message || "Demo query error" }, count: null };
    }
  }

  private shape(rows: any[]): any {
    const shaped = rows.map((r) => resolveRelations(r, this.returning ? this.selectStr : "*"));
    if (this.singleMode) return shaped[0] ?? null;
    return shaped;
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: any) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return Promise.resolve(this.execute()).then(onfulfilled as any, onrejected as any);
  }

  catch(onrejected?: ((reason: any) => any) | null) {
    return this.then(undefined, onrejected);
  }
}

// ---------- Auth ----------
let currentSession: Session | null = loadSession();
type AuthListener = (event: string, session: Session | null) => void;
const authListeners: AuthListener[] = [];

function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* ignore */
  }
  return null;
}

function makeSession(u: DemoUser): Session {
  const user: User = {
    id: u.id,
    email: u.email,
    user_metadata: { full_name: u.full_name },
    app_metadata: { provider: "demo" },
    aud: "authenticated",
    created_at: new Date().toISOString(),
  };
  return {
    access_token: "demo-token-" + u.id,
    refresh_token: "demo-refresh-" + u.id,
    expires_at: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    token_type: "bearer",
    user,
  };
}

function setSession(session: Session | null, event: string) {
  currentSession = session;
  if (session) localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  else localStorage.removeItem(SESSION_KEY);
  // Notify asynchronously, mirroring supabase behaviour.
  setTimeout(() => authListeners.forEach((cb) => cb(event, session)), 0);
}

const auth = {
  async getSession() {
    return { data: { session: currentSession }, error: null };
  },
  async getUser() {
    return { data: { user: currentSession?.user ?? null }, error: null };
  },
  onAuthStateChange(cb: AuthListener) {
    authListeners.push(cb);
    // Fire current state asynchronously like supabase does.
    setTimeout(() => cb(currentSession ? "SIGNED_IN" : "INITIAL_SESSION", currentSession), 0);
    return {
      data: {
        subscription: {
          unsubscribe() {
            const idx = authListeners.indexOf(cb);
            if (idx !== -1) authListeners.splice(idx, 1);
          },
        },
      },
    };
  },
  async signInWithPassword({ email, password }: { email: string; password: string }): Promise<AuthResult> {
    const u = DEMO_USERS.find((d) => d.email.toLowerCase() === (email || "").toLowerCase());
    if (!u || (password && password !== u.password)) {
      return { data: { user: null, session: null }, error: { message: "Invalid login credentials" } };
    }
    const session = makeSession(u);
    setSession(session, "SIGNED_IN");
    return { data: { user: session.user, session }, error: null };
  },
  async signUp({ email, options }: { email: string; password: string; options?: any }): Promise<AuthResult> {
    // In demo mode we just create a transient internal user session.
    const id = "u-" + uuid().slice(0, 8);
    const fullName = options?.data?.full_name || "New User";
    const existingProfile = table("profiles").find((p) => p.email === email);
    if (!existingProfile) {
      table("profiles").push({
        id,
        full_name: fullName,
        email,
        avatar_url: null,
        user_type: "internal",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      table("user_roles").push({ id: "role-" + id, user_id: id, role: "user", created_at: new Date().toISOString() });
      persist();
    }
    return { data: { user: null, session: null }, error: null };
  },
  async signOut() {
    setSession(null, "SIGNED_OUT");
    return { error: null };
  },
  async resetPasswordForEmail(_email: string, _options?: any) {
    return { data: {}, error: null };
  },
  async updateUser(_attrs: any) {
    return { data: { user: currentSession?.user ?? null }, error: null };
  },
  async refreshSession() {
    return { data: { session: currentSession, user: currentSession?.user ?? null }, error: null };
  },
};

// ---------- Functions (canned AI responses) ----------
function cannedFunction(name: string, body: any): any {
  switch (name) {
    case "ai-candidate-search":
    case "ai-job-search":
      return { results: [], ids: [], message: "Demo mode: AI search returns seeded results only." };
    case "analyze-match":
      return {
        match_score: 86,
        skills_score: 88,
        experience_score: 84,
        salary_score: 85,
        summary: "Strong overall match based on skills and experience (demo analysis).",
        strengths: ["Relevant technical skills", "Seniority alignment"],
        gaps: ["Limited domain experience"],
        risks: [],
        reasons: ["Skills overlap", "Location compatible"],
      };
    case "calculate-commute":
      return { auto_distance: "24 km", auto_duration: "31 min", oepnv_distance: "27 km", oepnv_duration: "48 min" };
    case "process-candidate-info":
    case "parse-cv":
    case "structure-cv-with-gemini":
    case "jidatit-structure-with-gemini":
      return {
        name: body?.name || "Parsed Candidate",
        email: null,
        phone: null,
        skills: ["Communication", "Teamwork"],
        work_experience: [],
        education: [],
        summary: "Demo mode: CV parsing is simulated. Edit fields manually.",
      };
    case "parse-job-posting":
    case "parse-job-pdf":
    case "process-job-info":
      return {
        title: "Parsed Job Title",
        description: "Demo mode: job parsing is simulated.",
        requirements: "",
        responsibilities: "",
        skills: [],
        location: "",
        employment_type: "Full-time",
      };
    case "generate-candidate-summary":
      return { summary: "Demo mode: AI-generated candidate summary placeholder." };
    case "generate-company-description":
      return { description: "Demo mode: AI-generated company description placeholder." };
    case "parse-company-website":
    case "enrich-client":
      return { name: body?.name || "", description: "Demo enriched description.", industry: "Software & IT", benefits: "" };
    case "fetch-company-logo":
      return { logo_url: null };
    case "places-autocomplete":
      return { predictions: [] };
    case "check-url-validity":
    case "validate-job-urls":
      return { valid: true, status: "valid" };
    case "verify-invitation":
      return { email: "newhire@demo.test", valid: true };
    case "analyze-placement-probability":
      return { probability: 0.72, confidence: 0.8, summary: "Demo: solid placement probability.", key_signals: [] };
    case "generate-blog-post":
      return { title: "Demo Blog Post", content: "# Demo\n\nGenerated content placeholder.", excerpt: "Demo excerpt." };
    case "generate-cv":
    case "generate-expose":
    case "generate-interview-prep":
      return { content: "Demo generated document content.", url: null };
    default:
      return { success: true, message: `Demo mode: '${name}' is simulated.` };
  }
}

const functions = {
  async invoke(name: string, options?: { body?: any }) {
    await new Promise((r) => setTimeout(r, 250)); // simulate latency
    try {
      return { data: cannedFunction(name, options?.body || {}), error: null };
    } catch (err: any) {
      return { data: null, error: { message: err?.message || "Demo function error" } };
    }
  },
};

// ---------- Storage (in-memory object URLs) ----------
const storageObjects = new Map<string, string>();

function storageFrom(bucket: string) {
  return {
    async upload(path: string, file: any, _opts?: any) {
      try {
        if (file instanceof Blob) {
          const url = URL.createObjectURL(file);
          storageObjects.set(`${bucket}/${path}`, url);
        }
      } catch {
        /* ignore */
      }
      return { data: { path, fullPath: `${bucket}/${path}`, id: uuid() }, error: null };
    },
    getPublicUrl(path: string) {
      const url = storageObjects.get(`${bucket}/${path}`) || "";
      return { data: { publicUrl: url } };
    },
    async createSignedUrl(path: string, _expiresIn: number) {
      const url = storageObjects.get(`${bucket}/${path}`) || "";
      return { data: { signedUrl: url }, error: null };
    },
    async remove(paths: string[]) {
      paths.forEach((p) => storageObjects.delete(`${bucket}/${p}`));
      return { data: {}, error: null };
    },
    async list() {
      return { data: [], error: null };
    },
  };
}

// ---------- RPC (computed demo responses) ----------
const rpcHandlers: Record<string, (args: any) => any> = {
  get_dashboard_stats: () => {
    const candidates = table("candidates");
    const jobsT = table("jobs");
    const clientsT = table("clients");
    const placementsT = table("placements");
    const tasksT = table("tasks");
    const invitationsT = table("invitations");
    return {
      activeCandidates: candidates.filter((c) => c.status === "Active").length,
      openJobs: jobsT.filter((j) => ["Active", "Offen", "Assignment"].includes(j.status)).length,
      activeClients: clientsT.filter((c) => c.status !== "N/D").length,
      totalCandidates: candidates.length,
      totalJobs: jobsT.length,
      totalMatches: placementsT.length,
      sharedMatches: placementsT.filter((p) => p.stage === "Shared").length,
      sentMatches: placementsT.filter((p) => !!p.shared_at).length,
      invitations: invitationsT.filter((i) => i.status === "pending").length,
      totalTasks: tasksT.filter((t) => !t.completed).length,
    };
  },
  match_candidates_by_embedding: () =>
    table("candidates")
      .slice(0, 5)
      .map((c) => ({ id: c.id, name: c.name, similarity: 0.8 })),
  match_jobs_by_embedding: () =>
    table("jobs")
      .slice(0, 5)
      .map((j) => ({ id: j.id, title: j.title, similarity: 0.8 })),
  has_role: () => true,
  has_manager_or_admin_role: () => true,
  is_team_member: () => true,
};

// ---------- Channels (no-op realtime) ----------
function channel(_name: string) {
  const ch: any = {
    on() {
      return ch;
    },
    subscribe(cb?: (status: string) => void) {
      if (cb) setTimeout(() => cb("SUBSCRIBED"), 0);
      return ch;
    },
    unsubscribe() {
      return Promise.resolve("ok");
    },
  };
  return ch;
}

// ---------- Exported client ----------
export const supabase = {
  from(tableName: string) {
    return new QueryBuilder(tableName);
  },
  auth,
  functions,
  storage: { from: storageFrom },
  async rpc(name: string, args?: any) {
    const handler = rpcHandlers[name];
    if (handler) {
      try {
        return { data: handler(args || {}), error: null };
      } catch (err: any) {
        return { data: null, error: { message: err?.message || "Demo rpc error" } };
      }
    }
    return { data: null, error: null };
  },
  channel,
  removeChannel(_ch: any) {
    return Promise.resolve("ok");
  },
  removeAllChannels() {
    return Promise.resolve("ok");
  },
};

// Helper used by the demo login UI.
export { DEMO_USERS };
