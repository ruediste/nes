import { expect, test } from "vitest";
import { AstCall, Grammar, Parser } from "./parser";

test("basic parsing", () => {
  const parser = new Parser("1 + 2 + 3");
  function whitespace() {
    parser.consumeZeroOrMore(" ");
  }

  const isDigit = ["digit", (char: string) => /\d/.test(char)] as const;

  expect(parser.peek()).toBe("1");

  const first = parser.consume(isDigit);
  whitespace();

  var result = [
    first,
    ...parser.zeroOrMore(() => {
      parser.consume("+");
      whitespace();
      var number = parser.consume(isDigit);
      whitespace();
      return number;
    }),
  ];
  expect(result).toEqual(["1", "2", "3"]);
});

test("parse symbol", () => {
  const parser = new Parser("foo");
  function symbol() {
    return parser.consume("a-zA-Z_") + parser.consumeZeroOrMore("a-zA-Z0-9_");
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

test("call", () => {
  const system = new Grammar("cap(a:foo,b:1+1);").system();
  expect(system.equations).length(1);
  const call = system.equations[0] as AstCall;
  expect(call.name.name).toBe("cap");
  expect(call.arguments.map((a) => a.parameterName.name)).toEqual(["a", "b"]);
  expect((call.arguments[0].argumentValue as any).name).toEqual("foo");
});

test("simple input", () => {
  const system = new Grammar(
    `
f=1/T;


def cap(I,t, C, dU) {
  I*t = C*dU;
}
`
  ).system();
});
