import Matrix, { solve } from "ml-matrix";
import { Project, ProjectData, siPrefixMap } from "./App";
import {
  AstEquation,
  AstExpression,
  AstSymbol,
  CompileError,
  Grammar,
} from "./parser";
import { createRange } from "./utils";

class CalculationValue {
  constructor(public value: number, public derivatives: number[]) {}

  mul(right: CalculationValue) {
    return new CalculationValue(
      this.value * right.value,
      this.derivatives.map(
        (d, idx) => d * right.value + right.derivatives[idx] * this.value
      )
    );
  }

  inverse() {
    const value = 1 / this.value;
    const derivative = -1 / (this.value * this.value);
    return new CalculationValue(
      value,
      this.derivatives.map((x) => x * derivative)
    );
  }

  add(right: CalculationValue) {
    return new CalculationValue(
      this.value + right.value,
      this.derivatives.map((d, idx) => d + right.derivatives[idx])
    );
  }
  sub(right: CalculationValue) {
    return new CalculationValue(
      this.value - right.value,
      this.derivatives.map((d, idx) => d - right.derivatives[idx])
    );
  }
}

interface VariableMap {
  [key: string]: CalculationValue;
}

export function calculate(
  { data }: Project,
  updateProject: (fn: (p: Project) => Partial<ProjectData>) => void
) {
  const system = new Grammar(data.sourceCode).system();

  const errors: CompileError[] = [];
  // build variables
  const unknownCount =
    data.variables.flatMap((x) => x).filter((v) => !v.locked).length +
    system.variables.filter((x) => !x.locked).length;
  let unknownIndex = 0;
  const unknowns: { value: CalculationValue }[] = [];
  const variables: VariableMap = {};
  for (const variable of data.variables.flatMap((x) => x)) {
    if (variable.name in variables) {
      errors.push(
        new CompileError(
          data.sourceCode,
          { lineNr: 1, linePos: 1, lineStartPos: 0, pos: 0 },
          "Duplicate variable " + variable.name
        )
      );
      continue;
    }
    const value = variable.value * siPrefixMap[variable.siPrefix];
    if (variable.locked) {
      variables[variable.name] = new CalculationValue(
        value,
        createRange(unknownCount, () => 0)
      );
    } else {
      const v = new CalculationValue(
        value,
        createRange(unknownCount, (idx) => (idx == unknownIndex ? 1 : 0))
      );
      variables[variable.name] = v;
      unknowns.push({ value: v });
      unknownIndex++;
    }
  }
  for (const variable of system.variables) {
    if (variable.name.name in variables) {
      errors.push(
        new CompileError(
          data.sourceCode,
          variable.name.pos,
          "Duplicate variable " + variable.name.name
        )
      );
      continue;
    }
    if (variable.locked) {
      variables[variable.name.name] = new CalculationValue(
        variable.value,
        createRange(unknownCount, () => 0)
      );
    } else {
      const value = new CalculationValue(
        variable.value,
        createRange(unknownCount, (idx) => (idx == unknownIndex ? 1 : 0))
      );
      variables[variable.name.name] = value;
      unknowns.push({ value });
      unknownIndex++;
    }
  }

  const definitions = Object.fromEntries(
    system.definitions.map((d) => [d.name, d])
  );

  function evaluateExpression(
    exp: AstExpression,
    resolveVariable: (name: AstSymbol) => CalculationValue
  ): () => CalculationValue {
    if (exp.type == "number") {
      const value = new CalculationValue(
        exp.value,
        createRange(unknownCount, () => 0)
      );
      return () => value;
    } else if (exp.type == "symbol") {
      const value = resolveVariable(exp);
      return () => value;
    } else if (exp.type === "binaryOp") {
      const left = evaluateExpression(exp.left, resolveVariable);
      const right = evaluateExpression(exp.right, resolveVariable);
      switch (exp.operator) {
        case "*":
          return () => left().mul(right());
        case "/":
          return () => left().mul(right().inverse());
        case "+":
          return () => left().add(right());
        case "-":
          return () => left().sub(right());
      }
    }
    throw "Unknown expression " + exp;
  }

  function pushEquation(
    eq: AstEquation,
    resolveVariable: (name: AstSymbol) => CalculationValue
  ) {
    if (eq.type == "equationTerminal") {
      const left = evaluateExpression(eq.left, resolveVariable);
      const right = evaluateExpression(eq.right, resolveVariable);
      equations.push(() => left().sub(right()));
    } else {
      const def = definitions[eq.name.name];
      if (!def) {
        throw "Unknown definition " + eq.name.name;
      }
      const args = Object.fromEntries(
        eq.arguments.map((a) => [
          a.parameterName.name,
          evaluateExpression(a.argumentValue, resolveVariable),
        ])
      );

      // check if arguments and parameters match
      const argSet = new Set(Object.keys(args));
      const parameterSet = new Set(def.parameters);
      Object.keys(args).forEach((arg) => {
        if (!parameterSet.has(arg)) {
          throw "Unknown parameter " + arg;
        }
      });

      def.parameters.forEach((param) => {
        if (!argSet.has(param)) {
          throw "Missing argument " + param;
        }
      });

      def.equations.map((eq) =>
        pushEquation(eq, (name) => {
          if (name.name in args) {
            return args[name.name]();
          }
          return resolveVariable(name);
        })
      );
    }
  }

  // collect equations
  const equations: (() => CalculationValue)[] = [];
  system.equations.forEach((eq) =>
    pushEquation(eq, (name) => {
      if (name.name in variables) {
        return variables[name.name];
      }

      errors.push(
        new CompileError(
          data.sourceCode,
          name.pos,
          "Unknown variable " + name.name
        )
      );
      return new CalculationValue(
        0,
        createRange(unknownCount, () => 0)
      );
    })
  );

  if (errors.length > 0) {
    throw errors;
  }

  // solve equations
  let lastError: number | undefined;
  let alpha = 1;
  let n = 0;

  console.log("Solving...");

  while (true) {
    const aRows: number[][] = [];
    const b: number[] = [];

    /* Multidimensional newton method
      f(x + δ) ≈ f(x) + J(x) δ = 0
      J(x) δ = −f(x)

      x = x + αδ
    */

    // build the equations
    for (const eq of equations) {
      const value = eq();
      aRows.push(value.derivatives);
      b.push(-value.value);
    }

    const A = new Matrix(aRows);
    const B = Matrix.columnVector(b);

    // calculate the error and break loop if applicable
    const e = B.norm();

    if (e < 1e-15) {
      console.log("Solution found");
      // apply the solution
      updateProject((p) => {
        let src = p.data.sourceCode;
        [...system.variables]
          .reverse()
          .filter((x) => !x.locked)
          .forEach((v) => {
            src =
              src.substring(0, v.valueStart.pos) +
              variables[v.name.name].value / siPrefixMap[v.siPrefix] +
              src.substring(v.valueStart.pos + v.valueLength);
          });
        return {
          sourceCode: src,
          variables: p.data.variables.map((group) =>
            group.map((v) => ({
              ...v,
              value: v.locked ? v.value : variables[v.name].value,
            }))
          ),
        };
      });
      break;
    }

    let d = solve(A, B);

    console.log(
      "alpha",
      alpha,
      "A",
      A.toString(),
      "B",
      B.toString(),
      "d",
      d.toString(),
      "Error: ",
      e,
      "\n"
    );

    // perform the step
    unknowns.forEach((u, idx) => (u.value.value += alpha * d.get(idx, 0)));

    if (lastError !== undefined && e > lastError * 0.99) {
      alpha *= 0.9;
    }

    if (alpha < 0.1 || n > 100) {
      break;
    }

    lastError = e;
    n++;
  }
}
