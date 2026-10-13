/* A small, safe expression language for scene specs.
 *
 * Specs written by a model never run as code: every number that can move ("a*sin(b*x - t)",
 * "1 + latency", "step >= 2 ? 1 : 0") is parsed here into a closure over a scope of numbers and
 * strings. No property access, no globals, no loops, so a spec can only compute values.
 *
 *   numbers 2, 1.5e3   strings "commit" 'leader'   identifiers a, x, t, step
 *   + - * / % ^ (or **)   unary - + !   < <= > >= == !=   && || (and, or, not)   c ? a : b
 *   implicit multiplication after a number: 2x, 3(x + 1)
 *   functions: see FUNCTIONS below; constants pi, tau, e, inf
 */

export type Value = number | string | boolean;
export type Scope = Record<string, Value>;
export type Compiled = ((scope: Scope) => Value) & { source: string; names: string[] };

type Node =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "id"; name: string }
  | { k: "call"; name: string; args: Node[] }
  | { k: "un"; op: string; a: Node }
  | { k: "bin"; op: string; a: Node; b: Node }
  | { k: "if"; c: Node; a: Node; b: Node };

const num = (v: Value): number => (typeof v === "number" ? v : typeof v === "boolean" ? (v ? 1 : 0) : Number(v));
const truthy = (v: Value) => (typeof v === "string" ? v.length > 0 : num(v) !== 0 && !Number.isNaN(num(v)));
const mod = (a: number, b: number) => ((a % b) + b) % b;
const fact = (n: number) => {
  n = Math.round(n);
  if (n < 0 || n > 170) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
};
/** Deterministic hash noise in [0, 1): the same input always gives the same value. */
const hash = (x: number, y = 0) => {
  const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return s - Math.floor(s);
};

export const FUNCTIONS: Record<string, (...args: number[]) => number> = {
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  atan2: Math.atan2,
  sinh: Math.sinh,
  cosh: Math.cosh,
  tanh: Math.tanh,
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  abs: Math.abs,
  exp: Math.exp,
  ln: Math.log,
  log: Math.log,
  log10: Math.log10,
  log2: Math.log2,
  pow: Math.pow,
  hypot: Math.hypot,
  floor: Math.floor,
  ceil: Math.ceil,
  round: (x, d = 0) => {
    const f = 10 ** d;
    return Math.round(x * f) / f;
  },
  trunc: Math.trunc,
  sign: Math.sign,
  min: Math.min,
  max: Math.max,
  clamp: (x, a = 0, b = 1) => Math.min(Math.max(x, a), b),
  lerp: (a, b, t) => a + (b - a) * t,
  mix: (a, b, t) => a + (b - a) * t,
  mod,
  fract: (x) => x - Math.floor(x),
  step: (edge, x) => (x >= edge ? 1 : 0),
  smoothstep: (a, b, x) => {
    const t = Math.min(1, Math.max(0, (x - a) / (b - a || 1e-9)));
    return t * t * (3 - 2 * t);
  },
  /** Eases 0→1 over [0, 1] (smootherstep). */
  ease: (x) => {
    const t = Math.min(1, Math.max(0, x));
    return t * t * t * (t * (t * 6 - 15) + 10);
  },
  /** 1 while a ≤ x < b, else 0. */
  between: (x, a, b) => (x >= a && x < b ? 1 : 0),
  /** A triangle wave 0→1→0 with the given period. */
  tri: (x, p = 1) => 1 - Math.abs(2 * mod(x / p, 1) - 1),
  /** A sawtooth 0→1 with the given period. */
  saw: (x, p = 1) => mod(x / p, 1),
  deg: (x) => (x * 180) / Math.PI,
  rad: (x) => (x * Math.PI) / 180,
  fact,
  choose: (n, k) => fact(n) / (fact(k) * fact(n - k)),
  hash,
  /** Gaussian bell exp(-x²/2). */
  gauss: (x, mu = 0, sigma = 1) => Math.exp(-0.5 * ((x - mu) / sigma) ** 2) / (sigma * Math.sqrt(2 * Math.PI)),
  sigmoid: (x) => 1 / (1 + Math.exp(-x)),
};

/** Functions that take any values (strings too). */
const SPECIAL = new Set(["if", "pick", "fmt", "str"]);
export const CONSTANTS: Record<string, number> = { pi: Math.PI, tau: Math.PI * 2, e: Math.E, inf: Infinity, PI: Math.PI };
export const BUILTIN_NAMES = new Set([...Object.keys(FUNCTIONS), ...SPECIAL, ...Object.keys(CONSTANTS), "true", "false"]);

export class ExprError extends Error {}

/* ---------- tokenizer ---------- */
type Tok = { t: "num" | "str" | "id" | "op" | "end"; v: string; at: number };
const OPS = ["**", "<=", ">=", "==", "!=", "&&", "||", "+", "-", "*", "/", "%", "^", "(", ")", ",", "<", ">", "!", "?", ":", "×", "·", "−"];

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      i++;
      continue;
    }
    if (/[0-9.]/.test(c)) {
      const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
      if (!m) throw new ExprError(`bad number at ${i}`);
      out.push({ t: "num", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = src.indexOf(c, i + 1);
      if (end < 0) throw new ExprError(`unclosed string at ${i}`);
      out.push({ t: "str", v: src.slice(i + 1, end), at: i });
      i = end + 1;
      continue;
    }
    if (/[A-Za-z_Ͱ-Ͽ]/.test(c)) {
      const m = /^[A-Za-z_Ͱ-Ͽ][A-Za-z0-9_Ͱ-Ͽ]*/.exec(src.slice(i))!;
      out.push({ t: "id", v: m[0], at: i });
      i += m[0].length;
      continue;
    }
    const op = OPS.find((o) => src.startsWith(o, i));
    if (!op) throw new ExprError(`unexpected "${c}" at ${i}`);
    out.push({ t: "op", v: op === "×" || op === "·" ? "*" : op === "−" ? "-" : op, at: i });
    i += op.length;
  }
  out.push({ t: "end", v: "", at: src.length });
  return out;
}

/* ---------- parser (precedence climbing) ---------- */
function parse(src: string): Node {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => toks[p].t === "op" && toks[p].v === v;
  const isWord = (v: string) => toks[p].t === "id" && toks[p].v === v;
  const expect = (v: string) => {
    if (!isOp(v)) throw new ExprError(`expected "${v}" at ${toks[p].at}`);
    p++;
  };

  function ternary(): Node {
    const c = or();
    if (isOp("?")) {
      p++;
      const a = ternary();
      expect(":");
      const b = ternary();
      return { k: "if", c, a, b };
    }
    return c;
  }
  function or(): Node {
    let a = and();
    while (isOp("||") || isWord("or")) {
      p++;
      a = { k: "bin", op: "||", a, b: and() };
    }
    return a;
  }
  function and(): Node {
    let a = cmp();
    while (isOp("&&") || isWord("and")) {
      p++;
      a = { k: "bin", op: "&&", a, b: cmp() };
    }
    return a;
  }
  function cmp(): Node {
    let a = add();
    while (["<", "<=", ">", ">=", "==", "!="].some(isOp)) {
      const op = toks[p++].v;
      a = { k: "bin", op, a, b: add() };
    }
    return a;
  }
  function add(): Node {
    let a = mul();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++].v;
      a = { k: "bin", op, a, b: mul() };
    }
    return a;
  }
  function mul(): Node {
    let a = unary();
    for (;;) {
      if (isOp("*") || isOp("/") || isOp("%")) {
        const op = toks[p++].v;
        a = { k: "bin", op, a, b: unary() };
      } else if (a.k === "num" && (peek().t === "id" || isOp("(")) && !isWord("and") && !isWord("or")) {
        // implicit multiplication after a number literal: 2x, 3(x+1)
        a = { k: "bin", op: "*", a, b: unary() };
      } else return a;
    }
  }
  function unary(): Node {
    if (isOp("-") || isOp("+") || isOp("!") || isWord("not")) {
      const op = toks[p++].v === "not" ? "!" : toks[p - 1].v;
      return { k: "un", op, a: unary() };
    }
    return power();
  }
  function power(): Node {
    const base = primary();
    if (isOp("^") || isOp("**")) {
      p++;
      return { k: "bin", op: "^", a: base, b: unary() };
    }
    return base;
  }
  function primary(): Node {
    const tok = peek();
    if (tok.t === "num") {
      p++;
      return { k: "num", v: Number(tok.v) };
    }
    if (tok.t === "str") {
      p++;
      return { k: "str", v: tok.v };
    }
    if (tok.t === "id") {
      p++;
      if (isOp("(")) {
        p++;
        const args: Node[] = [];
        if (!isOp(")")) {
          args.push(ternary());
          while (isOp(",")) {
            p++;
            args.push(ternary());
          }
        }
        expect(")");
        if (!(tok.v in FUNCTIONS) && !SPECIAL.has(tok.v)) throw new ExprError(`unknown function "${tok.v}"`);
        return { k: "call", name: tok.v, args };
      }
      if (tok.v === "true") return { k: "num", v: 1 };
      if (tok.v === "false") return { k: "num", v: 0 };
      if (tok.v in CONSTANTS) return { k: "num", v: CONSTANTS[tok.v] };
      return { k: "id", name: tok.v };
    }
    if (isOp("(")) {
      p++;
      const inner = ternary();
      expect(")");
      return inner;
    }
    throw new ExprError(tok.t === "end" ? "unexpected end of expression" : `unexpected "${tok.v}" at ${tok.at}`);
  }

  const node = ternary();
  if (peek().t !== "end") throw new ExprError(`unexpected "${peek().v}" at ${peek().at}`);
  return node;
}

/* ---------- compiler ---------- */
export function formatNumber(value: number, digits = 2): string {
  if (!Number.isFinite(value)) return value > 0 ? "∞" : value < 0 ? "−∞" : "—";
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e6 || abs < 10 ** -Math.max(digits, 3))) return value.toExponential(Math.max(1, digits)).replace("e+", "e");
  return value.toFixed(Math.max(0, Math.min(8, digits))).replace("-", "−");
}

function build(node: Node, names: Set<string>): (s: Scope) => Value {
  switch (node.k) {
    case "num": {
      const v = node.v;
      return () => v;
    }
    case "str": {
      const v = node.v;
      return () => v;
    }
    case "id": {
      const name = node.name;
      names.add(name);
      return (s) => {
        const v = s[name];
        if (v === undefined) throw new ExprError(`unknown name "${name}"`);
        return v;
      };
    }
    case "un": {
      const a = build(node.a, names);
      if (node.op === "-") return (s) => -num(a(s));
      if (node.op === "+") return (s) => num(a(s));
      return (s) => (truthy(a(s)) ? 0 : 1);
    }
    case "if": {
      const c = build(node.c, names),
        a = build(node.a, names),
        b = build(node.b, names);
      return (s) => (truthy(c(s)) ? a(s) : b(s));
    }
    case "bin": {
      const a = build(node.a, names),
        b = build(node.b, names);
      switch (node.op) {
        case "+":
          return (s) => {
            const x = a(s),
              y = b(s);
            return typeof x === "string" || typeof y === "string" ? `${x}${y}` : num(x) + num(y);
          };
        case "-":
          return (s) => num(a(s)) - num(b(s));
        case "*":
          return (s) => num(a(s)) * num(b(s));
        case "/":
          return (s) => num(a(s)) / num(b(s));
        case "%":
          return (s) => mod(num(a(s)), num(b(s)));
        case "^":
          return (s) => Math.pow(num(a(s)), num(b(s)));
        case "<":
          return (s) => (num(a(s)) < num(b(s)) ? 1 : 0);
        case "<=":
          return (s) => (num(a(s)) <= num(b(s)) ? 1 : 0);
        case ">":
          return (s) => (num(a(s)) > num(b(s)) ? 1 : 0);
        case ">=":
          return (s) => (num(a(s)) >= num(b(s)) ? 1 : 0);
        case "==":
          return (s) => {
            const x = a(s),
              y = b(s);
            return (typeof x === "string" || typeof y === "string" ? String(x) === String(y) : Math.abs(num(x) - num(y)) < 1e-9) ? 1 : 0;
          };
        case "!=":
          return (s) => {
            const x = a(s),
              y = b(s);
            return (typeof x === "string" || typeof y === "string" ? String(x) !== String(y) : Math.abs(num(x) - num(y)) >= 1e-9) ? 1 : 0;
          };
        case "&&":
          return (s) => (truthy(a(s)) ? b(s) : a(s));
        case "||":
          return (s) => (truthy(a(s)) ? a(s) : b(s));
      }
      throw new ExprError(`bad operator ${node.op}`);
    }
    case "call": {
      const args = node.args.map((arg) => build(arg, names));
      if (node.name === "if") {
        if (args.length !== 3) throw new ExprError("if(cond, a, b) takes three arguments");
        const [c, a, b] = args;
        return (s) => (truthy(c(s)) ? a(s) : b(s));
      }
      if (node.name === "pick") {
        // pick(i, a, b, c…): the i-th of the options (0-based), clamped
        if (args.length < 2) throw new ExprError("pick(i, a, b, …) needs options");
        const [i, ...opts] = args;
        return (s) => opts[Math.max(0, Math.min(opts.length - 1, Math.round(num(i(s))) || 0))](s);
      }
      if (node.name === "fmt") {
        const [x, d] = args;
        return (s) => formatNumber(num(x(s)), d ? num(d(s)) : 2);
      }
      if (node.name === "str") {
        const [x] = args;
        return (s) => String(x(s));
      }
      const fn = FUNCTIONS[node.name];
      if (args.length === 1) {
        const [a] = args;
        return (s) => fn(num(a(s)));
      }
      if (args.length === 2) {
        const [a, b] = args;
        return (s) => fn(num(a(s)), num(b(s)));
      }
      return (s) => fn(...args.map((arg) => num(arg(s))));
    }
  }
}

const cache = new Map<string, Compiled>();

/** Parses and compiles an expression (cached). Throws ExprError with a readable message. */
export function compile(source: string | number): Compiled {
  const src = typeof source === "number" ? String(source) : String(source ?? "").trim();
  const hit = cache.get(src);
  if (hit) return hit;
  if (!src) throw new ExprError("empty expression");
  if (src.length > 600) throw new ExprError("expression too long");
  const names = new Set<string>();
  let fn: (s: Scope) => Value;
  try {
    fn = build(parse(src), names);
  } catch (error) {
    throw new ExprError(`${(error as Error).message} in "${src}"`);
  }
  const compiled = Object.assign((scope: Scope) => fn(scope), { source: src, names: [...names] });
  if (cache.size > 5000) cache.clear();
  cache.set(src, compiled);
  return compiled;
}

/** Evaluates to a number (NaN when it can't). Never throws. */
export function evalNum(source: string | number | undefined | null, scope: Scope, fallback = NaN): number {
  if (typeof source === "number") return source;
  if (source === undefined || source === null || source === "") return fallback;
  try {
    const v = num(compile(source)(scope));
    return Number.isNaN(v) ? fallback : v;
  } catch {
    return fallback;
  }
}

export function evalAny(source: string | number, scope: Scope): Value {
  if (typeof source === "number") return source;
  return compile(source)(scope);
}

export const isTruthy = truthy;
export const toNumber = num;

/**
 * Fills a template: "v = {v:2} m/s" → "v = 3.14 m/s". {expr} or {expr:digits}. A ':' inside a
 * ternary is told apart from the digits suffix by requiring the suffix to be a bare integer.
 */
export function fillTemplate(template: string, scope: Scope): string {
  if (!template || !template.includes("{")) return template || "";
  return template.replace(/\{([^{}]+)\}/g, (_, inner: string) => {
    const m = /^(.*?):(\d)$/.exec(inner.trim());
    const src = m ? m[1] : inner;
    const digits = m ? Number(m[2]) : undefined;
    try {
      const v = compile(src)(scope);
      if (typeof v === "number") return formatNumber(v, digits ?? (Number.isInteger(v) ? 0 : 2));
      return String(v);
    } catch {
      return "—";
    }
  });
}

/** Names a template refers to (for validation). */
export function templateExprs(template: string): string[] {
  if (!template || !template.includes("{")) return [];
  return [...template.matchAll(/\{([^{}]+)\}/g)].map((m) => {
    const inner = m[1].trim();
    const d = /^(.*?):(\d)$/.exec(inner);
    return d ? d[1] : inner;
  });
}
