import { expect, test } from "vitest";
import { calculate } from "./calculation";

test("solve multiplication", () => {
  const result = calculate("var a=1; lvar b=3; var c=1; a * b=c;c=6;");

  expect(result.updatedSourceCode).toEqual(
    "var a=2; lvar b=3; var c=6; a * b=c;c=6;"
  );
});
