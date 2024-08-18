import { expect, test } from "vitest";
import { Project } from "./App";
import { calculate } from "./calculation";

test("solve multiplication", () => {
  const project = new Project({
    sourceCode: "var a=1; lvar b=3; var c=1; a * b=c;c=6;",
  });

  let updated = project;
  calculate(
    project,
    (fn) => (updated = new Project({ ...project.data, ...fn(project) }))
  );

  expect(updated.data.sourceCode).toEqual(
    "var a=2; lvar b=3; var c=6; a * b=c;c=6;"
  );
});
