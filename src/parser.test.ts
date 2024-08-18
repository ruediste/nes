import { expect, test } from "vitest";
import { AstEquationCall, Grammar, Parser } from "./parser";

test("basic parsing", () => {
  const parser = new Parser("1 + 2 + 3");
  function whitespace() {
    parser.consumeZeroOrMore(" ");
  }

  const isDigit = ["digit", (char: string) => /\d/.test(char)] as const;

  expect(parser.peekChar()).toBe("1");

  const first = parser.consumeChar(isDigit);
  whitespace();

  var result = [
    first,
    ...parser.zeroOrMore(() => {
      parser.consumeChar("+");
      whitespace();
      var number = parser.consumeChar(isDigit);
      whitespace();
      return number;
    }),
  ];
  expect(result).toEqual(["1", "2", "3"]);
});

test("parse symbol", () => {
  const parser = new Parser("foo");
  function symbol() {
    return (
      parser.consumeChar("a-zA-Z_") + parser.consumeZeroOrMore("a-zA-Z0-9_")
    );
  }

  expect(symbol()).toEqual("foo");
});

test("parse equation", () => {
  expect(new Grammar("a *b=c;").equation()).toEqual({
    type: "equationTerminal",
    left: {
      type: "binaryOp",
      left: {
        type: "symbol",
        name: "a",
        pos: { lineNr: 1, linePos: 1, lineStartPos: 0, pos: 0 },
      },
      operator: "*",
      right: {
        type: "symbol",
        name: "b",
        pos: { lineNr: 1, linePos: 4, lineStartPos: 0, pos: 3 },
      },
    },
    right: {
      type: "symbol",
      name: "c",
      pos: { lineNr: 1, linePos: 6, lineStartPos: 0, pos: 5 },
    },
  });
});

test("equationCall", () => {
  const system = new Grammar("cap(a:foo,b:1+1);").system();
  expect(system.equations).length(1);
  const call = system.equations[0] as AstEquationCall;
  expect(call.name.name).toBe("cap");
  expect(call.namedArgs.map((a) => a.parameterName.name)).toEqual(["a", "b"]);
  expect((call.namedArgs[0].argumentValue as any).name).toEqual("foo");
});

test("simple input", () => {
  new Grammar(`
f=1/T;
eq cap(I,t, C, dU) {
  I*t = C*dU;
}`).system();
});

test("variable declaration", () => {
  const decl = new Grammar("var f=10 kHz; // Frequency").variableDeclaration();
  expect(decl.name.name).toBe("f");
  expect(decl.value.siPrefix).toBe("k");
  expect(decl.value.realStart.pos).toBe(6);
  expect(decl.value.realLength).toBe(2);
});

test("comment", () => {
  new Grammar("var f=10 kHz; // Frequency").system();
});

test("numericValue", () => {
  let value = new Grammar("10 kHz").numericValue();
  expect(value.real).toBe(10);
  expect(value.siPrefix).toBe("k");

  value = new Grammar("0:10p").numericValue();
  expect(value.real).toBe(0);
  expect(value.imag).toBe(10);
  expect(value.siPrefix).toBe("p");

  value = new Grammar("2 : 10 p").numericValue();
  expect(value.real).toBe(2);
  expect(value.imag).toBe(10);
  expect(value.siPrefix).toBe("p");

  new Grammar("2:-10p").numericValue();
  new Grammar("2:-10").numericValue();

  value = new Grammar("1.123:-0.123").numericValue();
  expect(value.realStart.pos).toBe(0);
  expect(value.realLength).toBe(5);
  expect(value.imagStart!.pos).toBe(6);
  expect(value.imagLength).toBe(6);
});

test("call", () => {
  new Grammar("foo()").call();
  new Grammar("foo(1)").call();
  new Grammar("foo(a:1)").call();
  new Grammar("foo ( a : 1 ) ").call();
  new Grammar("foo(12, foo:bar)").call();
  expect(() => new Grammar("foo(foo:bar,1)").call()).toThrow();
});

test("number", () => {
  expect(new Grammar("1").number()[0]).toBe(1);
  expect(new Grammar("-1").number()[0]).toBe(-1);
  expect(new Grammar("1.1").number()[0]).toBe(1.1);
  expect(new Grammar("1.1e1").number()[0]).toBe(11);
  expect(new Grammar("1.1e-32").number()[0]).toBe(1.1e-32);
  expect(new Grammar("1.1e+32").number()[0]).toBe(1.1e32);
  expect(new Grammar("1e1").number()[0]).toBe(10);
  expect(new Grammar("1e-1").number()[0]).toBe(0.1);
  expect(new Grammar("1e+1").number()[0]).toBe(10);
});
