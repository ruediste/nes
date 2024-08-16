import Matrix, { solve } from "ml-matrix";
import { Project, ProjectData, siPrefixMap } from "./App";
import {
  AstCall,
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
  mulC(right: number) {
    return new DualReal(
      this.value * right,
      this.derivatives.map((d) => d * right)
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

  sqrt() {
    const value = Math.sqrt(this.value);
    const derivative = 1 / (2 * value);
    return new DualReal(
      value,
      this.derivatives.map((x) => x * derivative)
    );
  }

  atan2(x: DualReal) {
    const value = Math.atan2(this.value, x.value);
    const divisor = this.value * this.value + x.value * x.value;
    const dy = x.value / divisor;
    const dx = -this.value / divisor;
    return new DualReal(
      value,
      this.derivatives.map((d, idx) => dy * d + dx * x.derivatives[idx])
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

interface ArgumentSet {
  [x: string]: () => DualComplex;
}

const builtinFunctions: {
  [key: string]: {
    parameters: string[];
    fn: (args: ArgumentSet) => DualComplex;
  };
} = {
  abs: {
    parameters: ["x"],
    fn: (args) => {
      const x = args.x();
      return new DualComplex(
        x.real.mul(x.real).add(x.imag.mul(x.imag)).sqrt(),
        new DualReal(
          0,
          createRange(x.real.derivatives.length, () => 0)
        )
      );
    },
  },
  phase: {
    parameters: ["x"],
    fn: (args) => {
      const x = args.x();
      return new DualComplex(
        x.imag.atan2(x.real),
        new DualReal(
          0,
          createRange(x.real.derivatives.length, () => 0)
        )
      );
    },
  },
  rad2dec: {
    parameters: ["x"],
    fn: (args) => {
      const x = args.x();
      return new DualComplex(
        x.real.mulC(180 / Math.PI),
        new DualReal(
          0,
          createRange(x.real.derivatives.length, () => 0)
        )
      );
    },
  },
  dec2rad: {
    parameters: ["x"],
    fn: (args) => {
      const x = args.x();
      return new DualComplex(
        x.real.mulC(Math.PI / 180),
        new DualReal(
          0,
          createRange(x.real.derivatives.length, () => 0)
        )
      );
    },
  },
};

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
    system.equationDefinitions.map((d) => [d.name, d])
  );

  function buildArguments(
    parameters: string[],
    call: AstCall,
    resolveVariable: (name: AstSymbol) => DualComplex
  ): ArgumentSet {
    // check positional argument count
    if (parameters.length < call.positionalArgs.length) {
      throw new CompileError(
        data.sourceCode,
        call.name.pos,
        "Too many arguments"
      );
    }

    const positionalArgs = Object.fromEntries(
      call.positionalArgs.map((a, idx) => [
        parameters[idx],
        evaluateExpression(a, resolveVariable),
      ])
    );

    const namedArgs = Object.fromEntries(
      call.namedArgs.map((a) => [
        a.parameterName.name,
        evaluateExpression(a.argumentValue, resolveVariable),
      ])
    );

    // check if arguments and parameters match
    const namedParameterSet = new Set(
      parameters.slice(call.positionalArgs.length)
    );
    Object.keys(namedArgs).forEach((arg) => {
      if (!namedParameterSet.has(arg)) {
        throw "Unknown parameter " + arg;
      }
    });
    namedParameterSet.forEach((param) => {
      if (namedArgs.hasOwnProperty(param)) {
        throw "Missing argument " + param;
      }
    });

    return { ...positionalArgs, ...namedArgs };
  }

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
    } else if (exp.type == "functionCall") {
      if (!(exp.name.name in builtinFunctions)) {
        throw new CompileError(
          data.sourceCode,
          exp.name.pos,
          "Unknown function " + exp.name.name
        );
      }
      const fn = builtinFunctions[exp.name.name];
      const args = buildArguments(fn.parameters, exp, resolveVariable);
      return () => fn.fn(args);
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

      const allArgs = buildArguments(def.parameters, eq, resolveVariable);

      def.equations.map((eq) =>
        pushEquation(eq, (name) => {
          if (name.name in allArgs) {
            return allArgs[name.name]();
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

    if (e < 1e-14) {
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
