import { SiPrefix, siPrefixes } from "./App";

export class CompileError {
  constructor(
    private input: string,
    public pos: InputPos,
    public errorMessage: string
  ) {}

  public get message() {
    const lineEndIndex = this.input.indexOf("\n", this.pos.lineStartPos);
    const line = this.input.substring(
      this.pos.lineStartPos,
      lineEndIndex < 0 ? undefined : lineEndIndex
    );
    return `${this.pos.lineNr}(${this.pos.linePos}): ${this.errorMessage}
${line}
${" ".repeat(this.pos.pos - this.pos.lineStartPos)}^`;
  }
  toString() {
    return this.message;
  }
}

type CharacterPredicate = string | readonly [string, (char: string) => boolean];

interface InputPos {
  pos: number;
  lineNr: number;
  linePos: number;
  lineStartPos: number;
}

export class Parser {
  private inputPos: number = 0;
  private lineStartPos: number = 0;
  private lineNr: number = 1;
  private linePos: number = 1;
  constructor(public input: string) {}

  public peek() {
    return this.input[this.inputPos];
  }

  public get isEOI() {
    return this.inputPos >= this.input.length;
  }

  public error(message: string, pos = this.pos): CompileError {
    return new CompileError(this.input, pos, message);
  }

  public get pos(): InputPos {
    return {
      pos: this.inputPos,
      lineNr: this.lineNr,
      linePos: this.linePos,
      lineStartPos: this.lineStartPos,
    };
  }

  public log(message: string) {
    console.log(`${this.lineNr}:${this.linePos} - ${message}`);
  }

  public consumeString(expected: string) {
    const mark = this.mark();
    let consumed = "";
    for (let i = 0; i < expected.length; i++) {
      const char = this.consume();
      consumed += char;
      if (char !== expected[i]) {
        this.reset(mark);
        throw this.error(
          `Expected "${expected}" but got "${consumed}" instead`
        );
      }
    }
  }

  public consume(predicate?: CharacterPredicate) {
    if (this.isEOI) {
      throw this.error("End of input reached");
    }
    const char = this.input[this.inputPos++];

    if (char === "\n") {
      this.lineNr++;
      this.linePos = 1;
      this.lineStartPos = this.inputPos;
    } else {
      this.linePos++;
    }

    if (predicate !== undefined && !this.isCharacterMatching(char, predicate)) {
      throw this.error("Expected " + this.formatCharacterPredicate(predicate));
    }

    return char;
  }

  private isCharacterMatching(char: string, predicate: CharacterPredicate) {
    if (typeof predicate === "string") {
      return new RegExp("[" + predicate + "]").test(char);
    }
    return predicate[1](char);
  }

  private formatCharacterPredicate(predicate: CharacterPredicate) {
    if (typeof predicate === "string") {
      return `one of "${predicate}"`;
    }
    return predicate[0];
  }

  public consumeZeroOrMore(predicate: CharacterPredicate) {
    let result = "";
    while (!this.isEOI && this.isCharacterMatching(this.peek(), predicate)) {
      result += this.consume();
    }
    return result;
  }

  public consumeOneOrMore(predicate: CharacterPredicate) {
    return this.consume(predicate) + this.consumeZeroOrMore(predicate);
  }

  private mark() {
    return { pos: this.inputPos, lineNr: this.lineNr, linePos: this.linePos };
  }

  private reset(mark: ReturnType<Parser["mark"]>) {
    this.inputPos = mark.pos;
    this.lineNr = mark.lineNr;
    this.linePos = mark.linePos;
  }

  public zeroOrMore<T>(f: () => T): T[] {
    const result: T[] = [];
    while (true) {
      const mark = this.mark();
      try {
        result.push(f());
      } catch (e) {
        this.reset(mark);
        break;
      }
    }
    return result;
  }

  public optional<T>(f: () => T): T | undefined {
    const mark = this.mark();
    try {
      return f();
    } catch (e) {
      this.reset(mark);
    }
    return undefined;
  }

  public choice<T>(...choices: (() => T)[]): T {
    let error: CompileError | undefined;
    for (const choice of choices) {
      const mark = this.mark();
      try {
        return choice();
      } catch (e) {
        if (e instanceof CompileError) {
          if (!error || error.pos.pos < e.pos.pos) {
            error = e;
          }
        }
        this.reset(mark);
      }
    }
    throw error ?? this.error("No choices matched");
  }

  public oneOrMore<T>(f: () => T): T[] {
    return [f(), ...this.zeroOrMore(f)];
  }
}

export type AstSymbol = { type: "symbol"; name: string; pos: InputPos };
type AstValue =
  | { type: "number"; value: AstNumericValue }
  | { type: "paren"; expression: AstExpression }
  | AstSymbol;
interface AstBinaryOp {
  type: "binaryOp";
  left: AstExpression;
  right: AstExpression;
  operator: "+" | "-" | "*" | "/";
}
export type AstExpression = AstBinaryOp | AstValue;
export interface AstCall {
  type: "call";
  name: AstSymbol;
  arguments: { parameterName: AstSymbol; argumentValue: AstExpression }[];
}
export interface AstEquationTerminal {
  type: "equationTerminal";
  left: AstExpression;
  right: AstExpression;
}
export type AstEquation = AstCall | AstEquationTerminal;
interface AstDefinition {
  name: string;
  parameters: string[];
  equations: AstEquation[];
}

interface AstVariableDeclaration {
  name: AstSymbol;
  value: AstNumericValue;
  locked: boolean;
}

export interface AstSystem {
  equations: AstEquation[];
  definitions: AstDefinition[];
  variables: AstVariableDeclaration[];
}

export type AstNumericValue = {
  real: number;
  realStart: InputPos;
  realLength: number;
  siPrefix: SiPrefix;
} & (
  | { imag: undefined; imagStart: undefined; imagLength: undefined }
  | { imag: number; imagStart: InputPos; imagLength: number }
);

export class Grammar {
  private parser: Parser;

  constructor(input: string) {
    this.parser = new Parser(input);
  }

  whitespace() {
    this.parser.oneOrMore(() => {
      this.parser.choice(
        () => {
          this.parser.consumeString("//");
          this.parser.zeroOrMore(() => this.parser.consume("^\n"));
          if (!this.parser.isEOI) this.parser.consume("\n");
        },
        () => {
          this.parser.consumeString("\r");
          this.parser.consumeString("\n");
        },
        () => {
          this.parser.consume(" \t\n");
        }
      );
    });
  }

  whitespaceOpt() {
    this.parser.optional(() => this.whitespace());
  }

  symbol(): AstSymbol {
    try {
      return {
        type: "symbol",
        pos: this.parser.pos,
        name:
          this.parser.consume("a-zA-Z_") +
          this.parser.consumeZeroOrMore("a-zA-Z0-9_"),
      };
    } finally {
      this.whitespaceOpt();
    }
  }

  isDigit = ["digit", (char: string) => "0123456789".includes(char)] as const;

  number() {
    const start = this.parser.pos;
    let result = this.parser.optional(() => this.parser.consume("-")) ?? "";
    result = this.parser.consumeOneOrMore(this.isDigit);
    this.parser.optional(() => {
      this.parser.consume(".");
      result += "." + this.parser.consumeZeroOrMore(this.isDigit);
    });
    const length = this.parser.pos.pos - start.pos;
    this.whitespaceOpt();
    return [parseFloat(result), start, length] as const;
  }

  value(): AstValue {
    const result = this.parser.choice<AstValue>(
      () => {
        this.parser.consume("(");
        this.whitespaceOpt();
        const value = this.expression();
        this.parser.consume(")");
        this.whitespaceOpt();
        return { type: "paren", expression: value };
      },
      () => ({ type: "number", value: this.numericValue() }),
      () => this.symbol()
    );
    return result;
  }

  binaryOp(operators: string, nested: () => AstExpression) {
    let result: AstValue | AstBinaryOp = nested();
    for (const operation of this.parser.zeroOrMore(() => {
      const op = this.parser.consume(operators) as AstBinaryOp["operator"];
      this.whitespaceOpt();
      return [op, nested()] as const;
    })) {
      result = {
        type: "binaryOp",
        left: result,
        right: operation[1],
        operator: operation[0],
      };
    }
    return result;
  }

  product() {
    return this.binaryOp("*/", () => this.value());
  }

  sum() {
    return this.binaryOp("+-", () => this.product());
  }

  expression(): AstExpression {
    return this.sum();
  }

  equationTerminal(): AstEquationTerminal {
    const left = this.expression();
    this.parser.consume("=");
    this.whitespaceOpt();
    const right = this.expression();
    this.parser.consume(";");
    this.whitespaceOpt();
    return {
      type: "equationTerminal",
      left,
      right,
    };
  }
  equation(): AstEquation {
    return this.parser.choice<AstEquation>(
      () => this.equationTerminal(),
      () => this.call()
    );
  }

  definition(): AstDefinition {
    this.parser.consumeString("def");
    this.whitespace();
    const name = this.symbol().name;
    this.parser.consume("(");
    this.whitespaceOpt();
    const parameters =
      this.parser
        .optional(() => {
          const first = this.symbol();
          return [
            first,
            ...this.parser.zeroOrMore(() => {
              this.parser.consume(",");
              this.whitespaceOpt();
              const p = this.symbol();
              return p;
            }),
          ];
        })
        ?.map((x) => x.name) ?? [];
    this.parser.consume(")");
    this.whitespaceOpt();
    this.parser.consume("{");
    this.whitespaceOpt();

    const equations = this.parser.zeroOrMore(() => this.equation());

    this.parser.consume("}");
    this.whitespaceOpt();
    return {
      name,
      parameters,
      equations,
    };
  }

  callArgument() {
    const parameterName = this.symbol();
    this.parser.consume(":");
    this.whitespaceOpt();
    const argumentValue = this.expression();
    return { parameterName, argumentValue };
  }

  call(): AstCall {
    const name = this.symbol();
    this.parser.consume("(");
    this.whitespaceOpt();
    const args =
      this.parser.optional(() => [
        this.callArgument(),
        ...this.parser.zeroOrMore(() => {
          this.parser.consume(",");
          this.whitespaceOpt();
          return this.callArgument();
        }),
      ]) ?? [];
    this.parser.consume(")");
    this.whitespaceOpt();
    this.parser.consume(";");
    this.whitespaceOpt();
    return {
      type: "call",
      name,
      arguments: args,
    };
  }

  numericValue(): AstNumericValue {
    const real = this.number();
    this.whitespaceOpt();
    const imag = this.parser.optional(() => {
      this.parser.consume(":");
      this.whitespaceOpt();
      const [imag, imagStart, imagLength] = this.number();
      return [imag, imagStart, imagLength] as const;
    });
    const siPrefix =
      this.parser.optional(
        () =>
          this.parser.consume([
            "SI prefix",
            (char) => siPrefixes.some((p) => p.prefix == char),
          ]) as SiPrefix
      ) ?? "";

    // unit
    this.parser.zeroOrMore(() => this.parser.consume("a-zA-Z0-9"));
    this.whitespaceOpt();

    return {
      real: real[0],
      realStart: real[1],
      realLength: real[2],
      siPrefix,
      ...(imag === undefined
        ? { imag: undefined, imagStart: undefined, imagLength: undefined }
        : { imag: imag[0], imagStart: imag[1], imagLength: imag[2] }),
    };
  }

  variableDeclaration(): AstVariableDeclaration {
    const locked = this.parser.choice(
      () => {
        this.parser.consumeString("var");
        return false;
      },
      () => {
        this.parser.consumeString("lvar");
        return true;
      }
    );
    this.whitespace();
    const name = this.symbol();
    this.parser.consumeString("=");
    this.whitespaceOpt();
    const value = this.numericValue();
    this.parser.consumeString(";");
    this.whitespaceOpt();

    return {
      name: name,
      value,
      locked,
    };
  }

  system(): AstSystem {
    this.whitespaceOpt();

    const system: AstSystem = {
      equations: [],
      definitions: [],
      variables: [],
    };

    let lastError: CompileError | undefined;
    try {
      while (true) {
        this.parser.choice(
          () => system.variables.push(this.variableDeclaration()),
          () => system.definitions.push(this.definition()),
          () => system.equations.push(this.equation())
        );
      }
    } catch (e) {
      if (e instanceof CompileError) {
        lastError = e;
      } else {
        throw e;
      }
    }
    if (!this.parser.isEOI) {
      throw lastError ?? this.parser.error("Expected Equation or Definition");
    }
    return system;
  }
}
