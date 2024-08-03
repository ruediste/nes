import { expect, test } from "vitest";
import { Project } from "./App";
import { calculate } from "./calculation";

test("solve multiplication", () => {
  const project = new Project({
    sourceCode: "a * b=c;c=6;",
    variables: [
      [
        {
          id: 1,
          name: "a",
          value: 1,
          locked: false,
          siPrefix: "",
          unit: "",
          description: "",
        },
        {
          id: 2,
          name: "b",
          value: 3,
          locked: true,
          siPrefix: "",
          unit: "",
          description: "",
        },
        {
          id: 3,
          name: "c",
          value: 1,
          locked: false,
          siPrefix: "",
          unit: "",
          description: "",
        },
      ],
    ],
    nextId: 4,
  });

  let updated = project;
  calculate(
    project,
    (fn) => (updated = new Project({ ...project.data, ...fn(project) }))
  );

  expect(updated.data.variables).toEqual([
    [
      {
        id: 1,
        name: "a",
        value: 2,
        locked: false,
        siPrefix: "",
        unit: "",
        description: "",
      },
      {
        id: 2,
        name: "b",
        value: 3,
        locked: true,
        siPrefix: "",
        unit: "",
        description: "",
      },
      {
        id: 3,
        name: "c",
        value: 6,
        locked: false,
        siPrefix: "",
        unit: "",
        description: "",
      },
    ],
  ]);
});
