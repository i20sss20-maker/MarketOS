import type { Candle } from "@marketos/market-core";

export type FormulaPoint = {
  time: number;
  value: number;
};

export type FormulaValidation = {
  ok: boolean;
  error?: string;
};

type SourceField = "OPEN" | "HIGH" | "LOW" | "CLOSE" | "VOLUME";
type BinaryOperator = "+" | "-" | "*" | "/";
type UnaryOperator = "+" | "-";
type FunctionName = "SMA" | "EMA" | "RSI" | "ATR" | "ABS" | "MIN" | "MAX";

type AstNode =
  | { type: "number"; value: number }
  | { type: "source"; field: SourceField }
  | { type: "unary"; operator: UnaryOperator; operand: AstNode }
  | { type: "binary"; operator: BinaryOperator; left: AstNode; right: AstNode }
  | { type: "call"; name: FunctionName; args: AstNode[] };

type TokenType =
  | "number"
  | "identifier"
  | "+"
  | "-"
  | "*"
  | "/"
  | "("
  | ")"
  | ","
  | "eof";

type Token = {
  type: TokenType;
  value?: string;
  position: number;
};

const MAX_FORMULA_LENGTH = 240;
const MAX_TOKENS = 200;
const MAX_AST_DEPTH = 32;
const MAX_PERIOD = 500;

const sourceNames = new Set<SourceField>([
  "OPEN",
  "HIGH",
  "LOW",
  "CLOSE",
  "VOLUME",
]);

const functionNames = new Set<FunctionName>([
  "SMA",
  "EMA",
  "RSI",
  "ATR",
  "ABS",
  "MIN",
  "MAX",
]);

class FormulaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FormulaError";
  }
}

function tokenize(input: string): Token[] {
  if (!input.trim()) throw new FormulaError("Formula is empty.");
  if (input.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(`Formula cannot exceed ${MAX_FORMULA_LENGTH} characters.`);
  }

  const tokens: Token[] = [];
  let index = 0;

  const push = (token: Token) => {
    tokens.push(token);
    if (tokens.length > MAX_TOKENS) {
      throw new FormulaError("Formula is too complex.");
    }
  };

  while (index < input.length) {
    const character = input[index];

    if (/\s/.test(character)) {
      index += 1;
      continue;
    }

    if ("+-*/(),".includes(character)) {
      push({ type: character as TokenType, position: index });
      index += 1;
      continue;
    }

    if (/\d|\./.test(character)) {
      const start = index;
      let seenDot = false;

      while (index < input.length) {
        const current = input[index];
        if (current === ".") {
          if (seenDot) break;
          seenDot = true;
          index += 1;
          continue;
        }
        if (!/\d/.test(current)) break;
        index += 1;
      }

      const raw = input.slice(start, index);
      if (raw === "." || !/^\d*\.?\d+$/.test(raw)) {
        throw new FormulaError(`Invalid number at position ${start + 1}.`);
      }

      const value = Number(raw);
      if (!Number.isFinite(value)) {
        throw new FormulaError(`Invalid number at position ${start + 1}.`);
      }

      push({ type: "number", value: raw, position: start });
      continue;
    }

    if (/[A-Za-z_]/.test(character)) {
      const start = index;
      index += 1;
      while (index < input.length && /[A-Za-z0-9_]/.test(input[index])) {
        index += 1;
      }

      push({
        type: "identifier",
        value: input.slice(start, index).toUpperCase(),
        position: start,
      });
      continue;
    }

    throw new FormulaError(
      `Unsupported character "${character}" at position ${index + 1}.`,
    );
  }

  tokens.push({ type: "eof", position: input.length });
  return tokens;
}

class Parser {
  private index = 0;

  constructor(private readonly tokens: Token[]) {}

  parse(): AstNode {
    const expression = this.parseExpression();
    this.expect("eof");
    validateAst(expression);
    return expression;
  }

  private current() {
    return this.tokens[this.index];
  }

  private consume(type: TokenType) {
    if (this.current().type !== type) return false;
    this.index += 1;
    return true;
  }

  private expect(type: TokenType) {
    const token = this.current();
    if (token.type !== type) {
      throw new FormulaError(
        `Expected "${type}" at position ${token.position + 1}.`,
      );
    }
    this.index += 1;
    return token;
  }

  private parseExpression(): AstNode {
    let node = this.parseTerm();

    while (this.current().type === "+" || this.current().type === "-") {
      const operator = this.current().type as BinaryOperator;
      this.index += 1;
      node = {
        type: "binary",
        operator,
        left: node,
        right: this.parseTerm(),
      };
    }

    return node;
  }

  private parseTerm(): AstNode {
    let node = this.parseUnary();

    while (this.current().type === "*" || this.current().type === "/") {
      const operator = this.current().type as BinaryOperator;
      this.index += 1;
      node = {
        type: "binary",
        operator,
        left: node,
        right: this.parseUnary(),
      };
    }

    return node;
  }

  private parseUnary(): AstNode {
    if (this.current().type === "+" || this.current().type === "-") {
      const operator = this.current().type as UnaryOperator;
      this.index += 1;
      return {
        type: "unary",
        operator,
        operand: this.parseUnary(),
      };
    }

    return this.parsePrimary();
  }

  private parsePrimary(): AstNode {
    const token = this.current();

    if (token.type === "number") {
      this.index += 1;
      return {
        type: "number",
        value: Number(token.value),
      };
    }

    if (token.type === "identifier") {
      this.index += 1;
      const name = token.value ?? "";

      if (this.consume("(")) {
        if (!functionNames.has(name as FunctionName)) {
          throw new FormulaError(`Unknown function "${name}".`);
        }

        const args: AstNode[] = [];
        if (this.current().type !== ")") {
          do {
            args.push(this.parseExpression());
          } while (this.consume(","));
        }
        this.expect(")");

        return {
          type: "call",
          name: name as FunctionName,
          args,
        };
      }

      if (!sourceNames.has(name as SourceField)) {
        throw new FormulaError(`Unknown source "${name}".`);
      }

      return {
        type: "source",
        field: name as SourceField,
      };
    }

    if (this.consume("(")) {
      const expression = this.parseExpression();
      this.expect(")");
      return expression;
    }

    throw new FormulaError(
      `Unexpected token at position ${token.position + 1}.`,
    );
  }
}

function requireArity(node: Extract<AstNode, { type: "call" }>, allowed: number[]) {
  if (!allowed.includes(node.args.length)) {
    throw new FormulaError(
      `${node.name} expects ${allowed.join(" or ")} argument(s).`,
    );
  }
}

function periodFromNode(node: AstNode, label: string) {
  if (node.type !== "number" || !Number.isInteger(node.value)) {
    throw new FormulaError(`${label} period must be an integer literal.`);
  }

  if (node.value < 2 || node.value > MAX_PERIOD) {
    throw new FormulaError(
      `${label} period must be between 2 and ${MAX_PERIOD}.`,
    );
  }

  return node.value;
}

function validateAst(node: AstNode, depth = 0): void {
  if (depth > MAX_AST_DEPTH) {
    throw new FormulaError("Formula nesting is too deep.");
  }

  if (node.type === "number" || node.type === "source") return;

  if (node.type === "unary") {
    validateAst(node.operand, depth + 1);
    return;
  }

  if (node.type === "binary") {
    validateAst(node.left, depth + 1);
    validateAst(node.right, depth + 1);
    return;
  }

  for (const arg of node.args) validateAst(arg, depth + 1);

  if (node.name === "SMA" || node.name === "EMA") {
    requireArity(node, [2]);
    periodFromNode(node.args[1], node.name);
    return;
  }

  if (node.name === "RSI") {
    requireArity(node, [1, 2]);
    periodFromNode(node.args[node.args.length - 1], "RSI");
    return;
  }

  if (node.name === "ATR") {
    requireArity(node, [1]);
    periodFromNode(node.args[0], "ATR");
    return;
  }

  if (node.name === "ABS") {
    requireArity(node, [1]);
    return;
  }

  requireArity(node, [2]);
}

type SeriesValue = number | undefined;
type Series = SeriesValue[];

function sourceSeries(candles: Candle[], field: SourceField): Series {
  return candles.map((candle) => {
    if (field === "OPEN") return candle.open;
    if (field === "HIGH") return candle.high;
    if (field === "LOW") return candle.low;
    if (field === "CLOSE") return candle.close;
    return candle.volume;
  });
}

function constantSeries(length: number, value: number): Series {
  return Array.from({ length }, () => value);
}

function smaSeries(source: Series, period: number): Series {
  const output: Series = new Array(source.length).fill(undefined);
  let sum = 0;
  let valid = 0;

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];
    if (current !== undefined && Number.isFinite(current)) {
      sum += current;
      valid += 1;
    }

    if (index >= period) {
      const leaving = source[index - period];
      if (leaving !== undefined && Number.isFinite(leaving)) {
        sum -= leaving;
        valid -= 1;
      }
    }

    if (index >= period - 1 && valid === period) {
      output[index] = sum / period;
    }
  }

  return output;
}

function emaSeries(source: Series, period: number): Series {
  const output: Series = new Array(source.length).fill(undefined);
  const multiplier = 2 / (period + 1);
  let previous: number | undefined;
  let seed: number[] = [];

  for (let index = 0; index < source.length; index += 1) {
    const current = source[index];

    if (current === undefined || !Number.isFinite(current)) {
      output[index] = undefined;
      continue;
    }

    if (previous === undefined) {
      seed.push(current);
      if (seed.length > period) seed = seed.slice(-period);

      if (seed.length === period) {
        previous = seed.reduce((sum, value) => sum + value, 0) / period;
        output[index] = previous;
      }
      continue;
    }

    previous = (current - previous) * multiplier + previous;
    output[index] = previous;
  }

  return output;
}

function rsiSeries(source: Series, period: number): Series {
  const output: Series = new Array(source.length).fill(undefined);
  if (source.length <= period) return output;

  let gains = 0;
  let losses = 0;

  for (let index = 1; index <= period; index += 1) {
    const current = source[index];
    const previous = source[index - 1];

    if (current === undefined || previous === undefined) {
      return output;
    }

    const change = current - previous;
    gains += Math.max(change, 0);
    losses += Math.max(-change, 0);
  }

  let averageGain = gains / period;
  let averageLoss = losses / period;

  const value = () =>
    averageLoss === 0
      ? 100
      : 100 - 100 / (1 + averageGain / averageLoss);

  output[period] = value();

  for (let index = period + 1; index < source.length; index += 1) {
    const current = source[index];
    const previous = source[index - 1];
    if (current === undefined || previous === undefined) continue;

    const change = current - previous;
    averageGain = (averageGain * (period - 1) + Math.max(change, 0)) / period;
    averageLoss = (averageLoss * (period - 1) + Math.max(-change, 0)) / period;
    output[index] = value();
  }

  return output;
}

function atrSeries(candles: Candle[], period: number): Series {
  const output: Series = new Array(candles.length).fill(undefined);
  if (candles.length <= period) return output;

  const trueRanges: number[] = [];
  for (let index = 1; index < candles.length; index += 1) {
    const candle = candles[index];
    const previous = candles[index - 1];
    trueRanges[index] = Math.max(
      candle.high - candle.low,
      Math.abs(candle.high - previous.close),
      Math.abs(candle.low - previous.close),
    );
  }

  let atr = 0;
  for (let index = 1; index <= period; index += 1) {
    atr += trueRanges[index];
  }
  atr /= period;
  output[period] = atr;

  for (let index = period + 1; index < candles.length; index += 1) {
    atr = ((atr * (period - 1)) + trueRanges[index]) / period;
    output[index] = atr;
  }

  return output;
}

function evaluateAst(
  node: AstNode,
  candles: Candle[],
  memo: WeakMap<object, Series>,
): Series {
  const memoized = memo.get(node as object);
  if (memoized) return memoized;

  let result: Series;

  if (node.type === "number") {
    result = constantSeries(candles.length, node.value);
  } else if (node.type === "source") {
    result = sourceSeries(candles, node.field);
  } else if (node.type === "unary") {
    const source = evaluateAst(node.operand, candles, memo);
    result = source.map((value) =>
      value === undefined
        ? undefined
        : node.operator === "-"
          ? -value
          : value,
    );
  } else if (node.type === "binary") {
    const left = evaluateAst(node.left, candles, memo);
    const right = evaluateAst(node.right, candles, memo);

    result = left.map((leftValue, index) => {
      const rightValue = right[index];
      if (leftValue === undefined || rightValue === undefined) return undefined;

      let value: number;
      if (node.operator === "+") value = leftValue + rightValue;
      else if (node.operator === "-") value = leftValue - rightValue;
      else if (node.operator === "*") value = leftValue * rightValue;
      else {
        if (rightValue === 0) return undefined;
        value = leftValue / rightValue;
      }

      return Number.isFinite(value) ? value : undefined;
    });
  } else if (node.name === "SMA" || node.name === "EMA") {
    const source = evaluateAst(node.args[0], candles, memo);
    const period = periodFromNode(node.args[1], node.name);
    result = node.name === "SMA"
      ? smaSeries(source, period)
      : emaSeries(source, period);
  } else if (node.name === "RSI") {
    const period = periodFromNode(node.args[node.args.length - 1], "RSI");
    const source = node.args.length === 1
      ? sourceSeries(candles, "CLOSE")
      : evaluateAst(node.args[0], candles, memo);
    result = rsiSeries(source, period);
  } else if (node.name === "ATR") {
    result = atrSeries(candles, periodFromNode(node.args[0], "ATR"));
  } else if (node.name === "ABS") {
    result = evaluateAst(node.args[0], candles, memo).map((value) =>
      value === undefined ? undefined : Math.abs(value),
    );
  } else {
    const left = evaluateAst(node.args[0], candles, memo);
    const right = evaluateAst(node.args[1], candles, memo);

    result = left.map((leftValue, index) => {
      const rightValue = right[index];
      if (leftValue === undefined || rightValue === undefined) return undefined;
      return node.name === "MIN"
        ? Math.min(leftValue, rightValue)
        : Math.max(leftValue, rightValue);
    });
  }

  memo.set(node as object, result);
  return result;
}

function parseFormula(formula: string) {
  return new Parser(tokenize(formula)).parse();
}

export function validateFormula(formula: string): FormulaValidation {
  try {
    parseFormula(formula);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Invalid formula.",
    };
  }
}

export function evaluateFormula(
  candles: Candle[],
  formula: string,
): FormulaPoint[] {
  if (candles.length === 0) return [];

  const ast = parseFormula(formula);
  const values = evaluateAst(ast, candles, new WeakMap());

  return values.flatMap((value, index) => {
    if (value === undefined || !Number.isFinite(value)) return [];
    return [{
      time: candles[index].time,
      value,
    }];
  });
}
