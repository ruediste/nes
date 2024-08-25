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

class ErrorAggregator {
  private errors: CompileError[] = [];
  private errorPos: number | undefined;
  public add(e: any) {
    if (e instanceof Array) {
      e.forEach((x) => this.add(x));
    } else if (e instanceof CompileError) {
      if (this.errorPos === undefined || this.errorPos < e.pos.pos) {
        this.errors = [e];
        this.errorPos = e.pos.pos;
      }
    } else {
      throw e;
    }
  }

  public getErrors() {
    return this.errors;
  }

  public get hasErrors() {
    return this.errors.length > 0;
  }
}
export class Parser {
  private inputPos: number = 0;
  private lineStartPos: number = 0;
  private lineNr: number = 1;
  private linePos: number = 1;
  constructor(public input: string) {}

  public peekChar() {
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
      const char = this.consumeChar();
      consumed += char;
      if (char !== expected[i]) {
        this.reset(mark);
        throw this.error(
          `Expected "${expected}" but got "${consumed}" instead`
        );
      }
    }
  }

  public consumeChar(predicate?: CharacterPredicate) {
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
    while (
      !this.isEOI &&
      this.isCharacterMatching(this.peekChar(), predicate)
    ) {
      result += this.consumeChar();
    }
    return result;
  }

  public consumeOneOrMore(predicate: CharacterPredicate) {
    return this.consumeChar(predicate) + this.consumeZeroOrMore(predicate);
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

  public peek(f: () => void) {
    const mark = this.mark();
    f();
    this.reset(mark);
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
    const errors = new ErrorAggregator();

    for (const choice of choices) {
      const mark = this.mark();
      try {
        return choice();
      } catch (e) {
        errors.add(e);
        this.reset(mark);
      }
    }
    throw errors.getErrors();
  }

  public oneOrMore<T>(f: () => T): T[] {
    return [f(), ...this.zeroOrMore(f)];
  }
}

export type AstSymbol = { type: "symbol"; name: string; pos: InputPos };
type AstValue =
  | { type: "number"; value: AstNumericValue }
  | { type: "paren"; expression: AstExpression }
  | AstFunctionCall
  | AstSymbol;

interface AstBinaryOp {
  type: "binaryOp";
  left: AstExpression;
  right: AstExpression;
  operator: "+" | "-" | "*" | "/";
}
export type AstExpression = AstBinaryOp | AstValue;

export interface AstCall {
  name: AstSymbol;
  positionalArgs: AstExpression[];
  namedArgs: { parameterName: AstSymbol; argumentValue: AstExpression }[];
}

export interface AstEquationCall extends AstCall {
  type: "equationCall";
}
export interface AstFunctionCall extends AstCall {
  type: "functionCall";
}

export interface AstEquationTerminal {
  type: "equationTerminal";
  left: AstExpression;
  right: AstExpression;
}
export type AstEquation = AstEquationCall | AstEquationTerminal;

interface AstEquationDefinition {
  name: string;
  parameters: string[];
  equations: AstEquation[];
}
interface AstFunctionDefinition {
  name: string;
  parameters: string[];
  expression: AstExpression;
}

interface AstVariableDeclaration {
  name: AstSymbol;
  value: AstNumericValue;
  locked: boolean;
}

export interface AstSystem {
  equations: AstEquation[];
  equationDefinitions: AstEquationDefinition[];
  functionDefinitions: AstFunctionDefinition[];
  variables: AstVariableDeclaration[];
}

export type AstNumericValue = {
  real: number;
  realStart: InputPos;
  realLength: number;
  siPrefix: SiPrefix;
  unit: string | undefined;
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
          this.parser.zeroOrMore(() => this.parser.consumeChar("^\n"));
          if (!this.parser.isEOI) this.parser.consumeChar("\n");
        },
        () => {
          this.parser.consumeString("\r");
          this.parser.consumeString("\n");
        },
        () => {
          this.parser.consumeChar(" \t\n");
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
          this.parser.consumeChar("a-zA-Z_") +
          this.parser.consumeZeroOrMore("a-zA-Z0-9_"),
      };
    } finally {
      this.whitespaceOpt();
    }
  }

  isDigit = ["digit", (char: string) => "0123456789".includes(char)] as const;

  number() {
    const start = this.parser.pos;
    let result = this.parser.optional(() => this.parser.consumeChar("-")) ?? "";
    result += this.parser.consumeOneOrMore(this.isDigit);
    this.parser.optional(() => {
      this.parser.consumeChar(".");
      result += "." + this.parser.consumeZeroOrMore(this.isDigit);
    });
    this.parser.optional(() => {
      this.parser.consumeChar("e");
      result +=
        "e" +
        this.parser.consumeZeroOrMore("+-") +
        this.parser.consumeOneOrMore(this.isDigit);
    });
    const length = this.parser.pos.pos - start.pos;
    this.whitespaceOpt();
    return [parseFloat(result), start, length] as const;
  }

  functionCall(): AstFunctionCall {
    const call = this.call();
    return {
      type: "functionCall",
      ...call,
    };
  }

  value(): AstValue {
    const result = this.parser.choice<AstValue>(
      () => {
        this.parser.consumeChar("(");
        this.whitespaceOpt();
        const value = this.expression();
        this.parser.consumeChar(")");
        this.whitespaceOpt();
        return { type: "paren", expression: value };
      },
      () => ({ type: "number", value: this.numericValue() }),
      () => this.functionCall(),
      () => this.symbol()
    );
    return result;
  }

  binaryOp(operators: string, nested: () => AstExpression) {
    let result: AstExpression = nested();

    const operatorUsages = this.parser.zeroOrMore(() => {
      const op = this.parser.consumeChar(operators) as AstBinaryOp["operator"];
      this.whitespaceOpt();
      return [op, nested()] as const;
    });

    for (const operation of operatorUsages) {
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
    this.parser.consumeChar("=");
    this.whitespaceOpt();
    const right = this.expression();
    this.parser.consumeChar(";");
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
      () => this.equationCall()
    );
  }

  parameterList() {
    return (
      this.parser
        .optional(() => {
          const first = this.symbol();
          return [
            first,
            ...this.parser.zeroOrMore(() => {
              this.parser.consumeChar(",");
              this.whitespaceOpt();
              const p = this.symbol();
              return p;
            }),
          ];
        })
        ?.map((x) => x.name) ?? []
    );
  }

  equationDefinition(): AstEquationDefinition {
    this.parser.consumeString("eq");
    this.whitespace();
    const name = this.symbol().name;
    this.parser.consumeString("(");
    this.whitespaceOpt();
    const parameters = this.parameterList();
    this.parser.consumeString(")");
    this.whitespaceOpt();
    this.parser.consumeString("{");
    this.whitespaceOpt();

    const equations = this.parser.zeroOrMore(() => this.equation());

    this.parser.consumeString("}");
    this.whitespaceOpt();
    return {
      name,
      parameters,
      equations,
    };
  }

  functionDefinition(): AstFunctionDefinition {
    this.parser.consumeString("fun");
    this.whitespace();
    const name = this.symbol().name;
    this.parser.consumeString("(");
    this.whitespaceOpt();
    const parameters = this.parameterList();
    this.parser.consumeString(")");
    this.whitespaceOpt();
    this.parser.consumeString("=");
    this.whitespaceOpt();
    const expression = this.expression();
    this.parser.consumeString(";");
    this.whitespaceOpt();
    return {
      name,
      parameters,
      expression,
    };
  }

  call(): AstCall {
    const name = this.symbol();
    this.parser.consumeChar("(");
    this.whitespaceOpt();

    const positionalArg = () => {
      const value = this.expression();
      this.parser.peek(() =>
        this.parser.choice(
          () => this.parser.consumeString(","),
          () => this.parser.consumeString(")")
        )
      );
      return value;
    };

    const positionalArgs =
      this.parser.optional(() => [
        positionalArg(),
        ...this.parser.zeroOrMore(() => {
          this.parser.consumeString(",");
          this.whitespaceOpt();
          return positionalArg();
        }),
      ]) ?? [];

    const namedArg = () => {
      const parameterName = this.symbol();
      this.whitespaceOpt();
      this.parser.consumeString(":");
      this.whitespaceOpt();
      const argumentValue = this.expression();
      return { parameterName, argumentValue };
    };

    const namedArgs =
      this.parser.optional(() => {
        if (positionalArgs.length > 0) {
          this.parser.consumeString(",");
          this.whitespaceOpt();
        }
        return [
          namedArg(),
          ...this.parser.zeroOrMore(() => {
            this.parser.consumeString(",");
            this.whitespaceOpt();
            return namedArg();
          }),
        ];
      }) ?? [];

    this.parser.consumeString(")");
    this.whitespaceOpt();
    return {
      name,
      positionalArgs,
      namedArgs,
    };
  }

  equationCall(): AstEquationCall {
    const call = this.call();
    this.parser.consumeChar(";");
    this.whitespaceOpt();
    return {
      type: "equationCall",
      ...call,
    };
  }

  numericValue(): AstNumericValue {
    const real = this.number();
    this.whitespaceOpt();
    const imag = this.parser.optional(() => {
      this.parser.consumeChar(":");
      this.whitespaceOpt();
      const [imag, imagStart, imagLength] = this.number();
      return [imag, imagStart, imagLength] as const;
    });
    let siPrefix =
      this.parser.optional(
        () =>
          this.parser.consumeChar([
            "SI prefix",
            (char) => siPrefixes.some((p) => p.prefix == char),
          ]) as SiPrefix
      ) ?? "";

    // unit
    let unit = this.parser.optional(() => {
      this.parser.consumeString("[");
      this.whitespaceOpt();
      var result = this.parser
        .zeroOrMore(() => this.parser.consumeChar("a-zA-Z0-9/"))
        .join("");
      this.parser.consumeString("]");
      return result;
    });
    this.whitespaceOpt();

    if (unit === "" && siPrefix === "m") {
      unit = "m";
      siPrefix = "";
    }

    return {
      real: real[0],
      realStart: real[1],
      realLength: real[2],
      siPrefix,
      unit,
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
      equationDefinitions: [],
      functionDefinitions: [],
      variables: [],
    };

    const errors = new ErrorAggregator();
    try {
      while (true) {
        this.parser.choice(
          () => system.variables.push(this.variableDeclaration()),
          () => system.equationDefinitions.push(this.equationDefinition()),
          () => system.functionDefinitions.push(this.functionDefinition()),
          () => system.equations.push(this.equation())
        );
      }
    } catch (e) {
      errors.add(e);
    }
    if (!this.parser.isEOI) {
      throw errors.hasErrors
        ? errors.getErrors()
        : this.parser.error("Expected Equation or Definition");
    }
    return system;
  }
}
