import type { DocumentClient } from "../src/relay.ts";

/**
 * A DynamoDB document client that lives in a Map.
 *
 * The ledger's rules *are* its condition expressions, so a fake that ignored
 * them would test nothing. This one reads them: a small recursive-descent
 * evaluator for the grammar `credits.ts` actually uses, and an applier for
 * `SET`/`ADD`/`DELETE`. Anything outside that grammar throws rather than
 * quietly passing, so a new expression cannot slip past the tests.
 */

type Row = Record<string, unknown>;

interface Input {
  TableName?: string;
  Key?: Record<string, string>;
  KeyConditionExpression?: string;
  Limit?: number;
  Item?: Row;
  ConditionExpression?: string;
  UpdateExpression?: string;
  FilterExpression?: string;
  ProjectionExpression?: string;
  ExpressionAttributeNames?: Record<string, string>;
  ExpressionAttributeValues?: Record<string, unknown>;
  ReturnValues?: string;
  TransactItems?: { Update: Input }[];
  ExclusiveStartKey?: unknown;
}

export class ConditionalCheckFailed extends Error {
  override name = "ConditionalCheckFailedException";
}
export class TransactionCancelled extends Error {
  override name = "TransactionCanceledException";
}

/** Which attributes make up the primary key. The ledger is keyed by a single
 *  `token`; the relay by `account` + `sk`, so the fake takes both shapes. */
export interface KeySpec {
  hash: string;
  range?: string;
}

export class FakeDynamo implements DocumentClient {
  readonly rows = new Map<string, Row>();
  /** Every command the ledger sent, in order — handy for asserting round trips. */
  readonly sent: string[] = [];
  private readonly spec: KeySpec;

  constructor(spec: KeySpec = { hash: "token" }) {
    this.spec = spec;
  }

  async send(command: { constructor: { name: string }; input: Input }): Promise<any> {
    const kind = command.constructor.name;
    this.sent.push(kind);
    const input = command.input;
    switch (kind) {
      case "GetCommand":
        return { Item: this.clone(this.rows.get(this.key(input))) };
      case "PutCommand": {
        const key = this.keyOf(input.Item!);
        if (!evaluate(input.ConditionExpression, this.rows.get(key), input)) {
          throw new ConditionalCheckFailed("put");
        }
        this.rows.set(key, this.clone(input.Item)!);
        return {};
      }
      case "UpdateCommand": {
        const row = this.update(input);
        return input.ReturnValues === "ALL_NEW" ? { Attributes: this.clone(row) } : {};
      }
      case "TransactWriteCommand": {
        const before = new Map(this.rows);
        try {
          for (const item of input.TransactItems ?? []) this.update(item.Update);
        } catch (error) {
          this.rows.clear();
          for (const [k, v] of before) this.rows.set(k, v);
          throw new TransactionCancelled((error as Error).message);
        }
        return {};
      }
      case "DeleteCommand": {
        this.rows.delete(this.key(input));
        return {};
      }
      case "QueryCommand": {
        const hash = input.Key ? undefined : input.ExpressionAttributeValues?.[":a"];
        let Items = [...this.rows.values()]
          .filter((row) => row[this.spec.hash] === hash)
          .filter((row) => matchesKeyCondition(input.KeyConditionExpression, row, input, this.spec))
          .sort((a, b) => String(a[this.spec.range!]).localeCompare(String(b[this.spec.range!])));
        if (input.Limit) Items = Items.slice(0, input.Limit);
        return { Items: Items.map((row) => this.clone(row)) };
      }
      case "ScanCommand": {
        const Items = [...this.rows.values()]
          .filter((row) => evaluate(input.FilterExpression, row, input))
          .map((row) => ({ token: row.token }));
        return { Items };
      }
      default:
        throw new Error(`The fake table does not implement ${kind}.`);
    }
  }

  private key(input: Input): string {
    return this.keyOf(input.Key!);
  }

  private keyOf(item: Row): string {
    const hash = String(item[this.spec.hash]);
    return this.spec.range ? `${hash}\u0000${String(item[this.spec.range])}` : hash;
  }

  private update(input: Input): Row {
    const key = this.key(input);
    const row = this.rows.get(key);
    if (!evaluate(input.ConditionExpression, row, input)) throw new ConditionalCheckFailed(key);
    const next = { ...(row ?? this.blank(input)) };
    apply(next, input.UpdateExpression!, input);
    this.rows.set(key, next);
    return next;
  }

  /** An update against a row that does not exist creates one carrying just its
   *  key, which is what DynamoDB does. */
  private blank(input: Input): Row {
    const key = input.Key!;
    return this.spec.range
      ? { [this.spec.hash]: key[this.spec.hash], [this.spec.range]: key[this.spec.range] }
      : { [this.spec.hash]: key[this.spec.hash] };
  }

  private clone<T>(row: T): T {
    if (!row) return row;
    return Object.fromEntries(
      Object.entries(row as Row).map(([k, v]) => [k, v instanceof Set ? new Set(v) : v]),
    ) as T;
  }
}

// --- Condition expressions -------------------------------------------------

const TOKEN = /\s*(\(|\)|\bAND\b|\bOR\b|\bNOT\b|[a-z_]+\s*\([^)]*\)|>=|<=|<>|=|<|>|[#:]?[\w.]+)/giy;

function evaluate(expression: string | undefined, row: Row | undefined, input: Input): boolean {
  if (!expression) return true;
  const tokens: string[] = [];
  TOKEN.lastIndex = 0;
  let read = 0;
  let match: RegExpExecArray | null;
  // A sticky regex resets lastIndex on the failed match that ends the loop,
  // so remember how far it got before that.
  while ((match = TOKEN.exec(expression))) {
    tokens.push(match[1]!);
    read = TOKEN.lastIndex;
  }
  if (read < expression.trimEnd().length) {
    throw new Error(`The fake table cannot parse: ${expression}`);
  }
  const parser = new Parser(tokens, row, input);
  const value = parser.expression();
  if (!parser.done) throw new Error(`Trailing tokens in: ${expression}`);
  return value;
}

class Parser {
  private at = 0;
  private readonly tokens: string[];
  private readonly row: Row | undefined;
  private readonly input: Input;

  constructor(tokens: string[], row: Row | undefined, input: Input) {
    this.tokens = tokens;
    this.row = row;
    this.input = input;
  }

  get done() { return this.at >= this.tokens.length; }
  private peek() { return this.tokens[this.at]; }
  private next() { return this.tokens[this.at++]!; }

  expression(): boolean {
    let value = this.term();
    while (this.peek()?.toUpperCase() === "OR") { this.next(); value = this.term() || value; }
    return value;
  }

  private term(): boolean {
    let value = this.factor();
    while (this.peek()?.toUpperCase() === "AND") { this.next(); value = this.factor() && value; }
    return value;
  }

  private factor(): boolean {
    const token = this.next();
    if (token.toUpperCase() === "NOT") return !this.factor();
    if (token === "(") {
      const value = this.expression();
      if (this.next() !== ")") throw new Error("Unbalanced parentheses.");
      return value;
    }
    const call = token.match(/^([a-z_]+)\s*\((.*)\)$/i);
    if (call) return this.callFunction(call[1]!, call[2]!.split(",").map((a) => a.trim()));
    // A comparison: the token just read is its left-hand side.
    const operator = this.next();
    const right = this.resolve(this.next());
    const left = this.resolve(token);
    if (left === undefined || right === undefined) return false;
    switch (operator) {
      case "=": return left === right;
      case "<>": return left !== right;
      case ">": return (left as number) > (right as number);
      case ">=": return (left as number) >= (right as number);
      case "<": return (left as number) < (right as number);
      case "<=": return (left as number) <= (right as number);
      default: throw new Error(`The fake table does not implement "${operator}".`);
    }
  }

  private callFunction(name: string, args: string[]): boolean {
    switch (name.toLowerCase()) {
      case "attribute_exists": return this.resolve(args[0]!) !== undefined;
      case "attribute_not_exists": return this.resolve(args[0]!) === undefined;
      case "begins_with": {
        const value = this.resolve(args[0]!);
        const prefix = this.resolve(args[1]!);
        return typeof value === "string" && value.startsWith(String(prefix));
      }
      case "contains": {
        const haystack = this.resolve(args[0]!);
        const needle = this.resolve(args[1]!);
        if (haystack instanceof Set) return haystack.has(needle);
        if (Array.isArray(haystack)) return haystack.includes(needle);
        if (typeof haystack === "string") return haystack.includes(String(needle));
        return false;
      }
      default: throw new Error(`The fake table does not implement ${name}().`);
    }
  }

  private resolve(token: string): unknown {
    return resolve(token, this.row, this.input);
  }
}

function resolve(token: string, row: Row | undefined, input: Input): unknown {
  if (token.startsWith(":")) {
    if (!(token in (input.ExpressionAttributeValues ?? {}))) {
      throw new Error(`No value bound for ${token}.`);
    }
    return input.ExpressionAttributeValues![token];
  }
  const name = token.startsWith("#") ? input.ExpressionAttributeNames?.[token] : token;
  if (!name) throw new Error(`No name bound for ${token}.`);
  return row?.[name];
}

// --- Update expressions ----------------------------------------------------

function apply(row: Row, expression: string, input: Input): void {
  for (const [keyword, body] of clauses(expression)) {
    for (const clause of split(body)) {
      if (keyword === "SET") {
        const [target, value] = clause.split("=").map((s) => s.trim());
        row[nameOf(target!, input)] = arithmetic(value!, row, input);
      } else {
        const [target, value] = clause.split(/\s+/);
        const attribute = nameOf(target!, input);
        const operand = resolve(value!, row, input);
        if (operand instanceof Set) {
          const set = new Set((row[attribute] as Set<string>) ?? []);
          for (const member of operand) keyword === "ADD" ? set.add(member) : set.delete(member);
          if (set.size === 0) delete row[attribute];
          else row[attribute] = set;
        } else if (keyword === "ADD") {
          row[attribute] = ((row[attribute] as number) ?? 0) + (operand as number);
        } else {
          throw new Error("The fake table only DELETEs from sets.");
        }
      }
    }
  }
}

function clauses(expression: string): [string, string][] {
  const parts = expression.split(/\b(SET|ADD|DELETE|REMOVE)\b/).map((s) => s.trim()).filter(Boolean);
  const out: [string, string][] = [];
  for (let i = 0; i < parts.length; i += 2) {
    const keyword = parts[i]!;
    if (keyword === "REMOVE") throw new Error("The fake table does not implement REMOVE.");
    out.push([keyword, parts[i + 1]!]);
  }
  return out;
}

/** Split on commas that are not inside a function call. */
function split(body: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    if (body[i] === "(") depth++;
    else if (body[i] === ")") depth--;
    else if (body[i] === "," && depth === 0) { out.push(body.slice(start, i).trim()); start = i + 1; }
  }
  out.push(body.slice(start).trim());
  return out.filter(Boolean);
}

function nameOf(token: string, input: Input): string {
  return token.startsWith("#") ? input.ExpressionAttributeNames![token]! : token;
}

/** `a`, `:v`, `a + :v`, `a - :v`, `if_not_exists(a, :v) + :one`. */
function arithmetic(source: string, row: Row, input: Input): unknown {
  const parts = source.split(/\s+([+-])\s+/);
  let value = operand(parts[0]!, row, input);
  for (let i = 1; i < parts.length; i += 2) {
    const rhs = operand(parts[i + 1]!, row, input) as number;
    value = parts[i] === "+" ? (value as number) + rhs : (value as number) - rhs;
  }
  return value;
}

function operand(source: string, row: Row, input: Input): unknown {
  const call = source.match(/^if_not_exists\s*\((.+),\s*(.+)\)$/);
  if (call) return resolve(call[1]!.trim(), row, input) ?? resolve(call[2]!.trim(), row, input);
  return resolve(source, row, input);
}


/**
 * A key condition is an ordinary condition expression over the row, except that
 * the hash equality has already been applied by the caller. Evaluating the
 * whole thing again is simplest and cannot disagree with itself.
 */
function matchesKeyCondition(
  expression: string | undefined,
  row: Row,
  input: Input,
  _spec: KeySpec,
): boolean {
  if (!expression) return true;
  return evaluate(expression, row, input);
}
