import Matrix, { solve } from "ml-matrix";
import { Project, ProjectData, siPrefixMap } from "./App";
import {
  AstEquation,
  AstExpression,
  AstSymbol,
  AstSystem,
  CompileError,
  Grammar,
} from "./parser";
import { createRange } from "./utils";

class DualReal {
  constructor(public value: number, public derivatives: number[]) {}

  mul(right: DualReal) {
    return new DualReal(
      this.value * right.value,
      this.derivatives.map(
        (d, idx) => d * right.value + right.derivatives[idx] * this.value
      )
    );
  }

  inverse() {
    const value = 1 / this.value;
    const derivative = -1 / (this.value * this.value);
    return new DualReal(
      value,
      this.derivatives.map((x) => x * derivative)
    );
  }

  divide(right: DualReal) {
    return this.mul(right.inverse());
  }

  add(right: DualReal) {
    return new DualReal(
      this.value + right.value,
      this.derivatives.map((d, idx) => d + right.derivatives[idx])
    );
  }

  sub(right: DualReal) {
    return new DualReal(
      this.value - right.value,
      this.derivatives.map((d, idx) => d - right.derivatives[idx])
    );
  }

  neg() {
    return new DualReal(
      -this.value,
      this.derivatives.map((x) => -x)
    );
  }
}

class DualComplex {
  constructor(public real: DualReal, public imag: DualReal) {}

  mul(right: DualComplex) {
    return new DualComplex(
      this.real.mul(right.real).sub(this.imag.mul(right.imag)),
      this.real.mul(right.imag).add(this.imag.mul(right.real))
    );
  }

  inverse() {
    const dividend = this.real
      .mul(this.real)
      .add(this.imag.mul(this.imag))
      .inverse();
    return new DualComplex(
      this.real.mul(dividend),
      this.imag.neg().mul(dividend)
    );
  }

  add(right: DualComplex) {
    return new DualComplex(
      this.real.add(right.real),
      this.imag.add(right.imag)
    );
  }
  sub(right: DualComplex) {
    return new DualComplex(
      this.real.sub(right.real),
      this.imag.sub(right.imag)
    );
  }
}

interface VariableMap {
  [key: string]: DualComplex;
}

function buildVariables(
  data: ProjectData,
  system: AstSystem,
  errors: CompileError[]
) {
  let derivativeIndex = 0;
  const actions: (() => void)[] = [];
  const mutables: { value: DualReal }[] = [];
  const variables: VariableMap = {};

  function lockedDualReal(value: number) {
    return () =>
      new DualReal(
        value,
        createRange(derivativeIndex, () => 0)
      );
  }

  function mutableDualReal(value: number) {
    const idx = derivativeIndex++;
    return () => {
      const result = new DualReal(
        value,
        createRange(derivativeIndex, (e) => (e == idx ? 1 : 0))
      );
      mutables.push({ value: result });
      return result;
    };
  }

  function unknownVariable(name: string, r: number, i: number) {
    const real = mutableDualReal(r);
    const imag = mutableDualReal(i);
    actions.push(() => (variables[name] = new DualComplex(real(), imag())));
  }

  function lockedVariable(name: string, r: number, i: number) {
    const real = lockedDualReal(r);
    const imag = lockedDualReal(i);
    actions.push(() => (variables[name] = new DualComplex(real(), imag())));
  }

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
      lockedVariable(variable.name, value, 0);
    } else {
      unknownVariable(variable.name, value, 0);
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
    const factor = siPrefixMap[variable.value.siPrefix];
    if (variable.locked) {
      lockedVariable(
        variable.name.name,
        variable.value.real * factor,
        (variable.value.imag ?? 0) * factor
      );
    } else {
      unknownVariable(
        variable.name.name,
        variable.value.real * factor,
        (variable.value.imag ?? 0) * factor
      );
    }
  }
  actions.forEach((a) => a());
  return [mutables, variables, derivativeIndex] as const;
}

export function calculate(
  { data }: Project,
  updateProject: (fn: (p: Project) => Partial<ProjectData>) => void
) {
  const system = new Grammar(data.sourceCode).system();
  const errors: CompileError[] = [];

  const [mutables, variables, derivativeCount] = buildVariables(
    data,
    system,
    errors
  );

  const definitions = Object.fromEntries(
    system.definitions.map((d) => [d.name, d])
  );

  function evaluateExpression(
    exp: AstExpression,
    resolveVariable: (name: AstSymbol) => DualComplex
  ): () => DualComplex {
    if (exp.type == "number") {
      const factor = siPrefixMap[exp.value.siPrefix];

      const value = new DualComplex(
        new DualReal(
          exp.value.real * factor,
          createRange(derivativeCount, () => 0)
        ),
        new DualReal(
          (exp.value.imag ?? 0) * factor,
          createRange(derivativeCount, () => 0)
        )
      );
      return () => value;
    } else if (exp.type == "symbol") {
      const value = resolveVariable(exp);
      return () => value;
    } else if (exp.type == "paren") {
      const value = evaluateExpression(exp.expression, resolveVariable);
      return () => value();
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
    resolveVariable: (name: AstSymbol) => DualComplex
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
  const equations: (() => DualComplex)[] = [];
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
      return new DualComplex(
        new DualReal(
          0,
          createRange(derivativeCount, () => 0)
        ),
        new DualReal(
          0,
          createRange(derivativeCount, () => 0)
        )
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

      aRows.push(value.real.derivatives);
      b.push(-value.real.value);

      aRows.push(value.imag.derivatives);
      b.push(-value.imag.value);
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
            const variableValue = variables[v.name.name];
            if (v.value.imag !== undefined) {
              src =
                src.substring(0, v.value.imagStart.pos) +
                variableValue.imag.value / siPrefixMap[v.value.siPrefix] +
                src.substring(v.value.imagStart.pos + v.value.imagLength);
            }
            src =
              src.substring(0, v.value.realStart.pos) +
              variableValue.real.value / siPrefixMap[v.value.siPrefix] +
              src.substring(v.value.realStart.pos + v.value.realLength);
          });
        return {
          sourceCode: src,
          variables: p.data.variables.map((group) =>
            group.map((v) => ({
              ...v,
              value: v.locked ? v.value : variables[v.name].real.value,
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
    mutables.forEach((u, idx) => (u.value.value += alpha * d.get(idx, 0)));

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
