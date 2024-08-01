import { useEffect, useId, useState } from "react";
import { NumberInput, StringInput } from "./Input";
import { SortableList } from "./sortableList/SortableList";

import { checkType, debounce } from "./utils";

import Prism, { Grammar, highlight } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism.css";
import Editor from "react-simple-code-editor";

const siPrefixes = [
  { prefix: "T", factor: 1e12 },
  { prefix: "G", factor: 1e9 },
  { prefix: "M", factor: 1e6 },
  { prefix: "k", factor: 1e3 },
  { prefix: "", factor: 1 },
  { prefix: "%", factor: 0.01 },
  { prefix: "m", factor: 1e-3 },
  { prefix: "u", factor: 1e-6 },
  { prefix: "n", factor: 1e-9 },
  { prefix: "p", factor: 1e-12 },
] as const;

type SiPrefix = (typeof siPrefixes)[number]["prefix"];

const siPrefixMap: { [key in SiPrefix]: number } = Object.fromEntries(
  siPrefixes.map((x) => [x.prefix, x.factor])
) as any;

interface VariableDefinition {
  locked: boolean;
  id: number;
  name: string;
  siPrefix: SiPrefix;
  unit: string;
  value: number;
}

interface ProjectSerialized {
  sourceCode: string;
  variables: VariableDefinition[];
  nextId: number;
}

interface ProjectData extends ProjectSerialized {}

class Project {
  constructor(public data: ProjectData) {}
  static fromSerialized(data: ProjectSerialized) {
    return new Project({
      ...data,
    });
  }

  public update(data: Partial<ProjectData>) {
    return new Project({ ...this.data, ...data });
  }

  public updateVariable(id: number, update: Partial<VariableDefinition>) {
    return this.update({
      variables: this.data.variables.map((v) =>
        v.id === id ? { ...v, ...update } : v
      ),
    });
  }
}

const debouncedSave = debounce((project: Project) => {
  localStorage.setItem(
    "project1",
    JSON.stringify(
      checkType<ProjectSerialized>({
        sourceCode: project.data.sourceCode,
        variables: project.data.variables,
        nextId: project.data.nextId,
      })
    )
  );
}, 500);

function App() {
  const [project, setProject] = useState<Project>(() => {
    const stored = localStorage.getItem("project1");

    if (stored) {
      return Project.fromSerialized(JSON.parse(stored) as ProjectSerialized);
    } else {
      return Project.fromSerialized({
        sourceCode: "",
        variables: [],
        nextId: 1,
      });
    }
  });
  const id = useId();

  useEffect(() => {
    debouncedSave(project);
  }, [project]);

  return (
    <div>
      <SortableList
        items={project.data.variables}
        onChange={(newVariables) =>
          setProject((p) => p.update({ variables: newVariables }))
        }
        renderContainer={(children) => (
          <div className="list-group">{children}</div>
        )}
        renderItem={(variable, isDragPlaceholder) => {
          function update(data: Partial<VariableDefinition>) {
            setProject((p) => p.updateVariable(variable.id, data));
          }
          return (
            <SortableList.Item id={variable.id}>
              {(setNodeRef, style) => (
                <li
                  className="list-group-item"
                  ref={setNodeRef}
                  style={{
                    ...style,
                    display: "flex",
                    flexDirection: "row",
                    ...(isDragPlaceholder
                      ? {
                          backgroundColor: "white",
                          border: "solid black 1px",
                          borderRadius: "5px",
                        }
                      : {}),
                  }}
                >
                  <StringInput
                    value={variable.name}
                    onChange={(name) => update({ name })}
                  />
                  <NumberInput
                    className="w-auto"
                    value={variable.value / siPrefixMap[variable.siPrefix]}
                    onChange={(value) =>
                      update({
                        value: value * siPrefixMap[variable.siPrefix],
                      })
                    }
                  />
                  <select
                    className="form-select"
                    style={{ width: "75px" }}
                    value={variable.siPrefix}
                    onChange={(e) =>
                      update({ siPrefix: e.target.value as SiPrefix })
                    }
                  >
                    {siPrefixes.map((prefix) => (
                      <option key={prefix.prefix} value={prefix.prefix}>
                        {prefix.prefix}
                      </option>
                    ))}
                  </select>
                  <div className="form-check form-switch">
                    <input
                      className="form-check-input"
                      type="checkbox"
                      role="switch"
                      id={`${id}-${variable.id}-locked`}
                      checked={variable.locked}
                      onChange={(e) => update({ locked: e.target.checked })}
                    />
                    <label
                      className="form-check-label"
                      htmlFor={`${id}-${variable.id}-locked`}
                    >
                      Locked
                    </label>
                  </div>
                  <SortableList.DragHandle />
                </li>
              )}
            </SortableList.Item>
          );
        }}
      ></SortableList>
      <button
        type="button"
        className="btn btn-primary"
        onClick={() =>
          setProject((p) =>
            p.update({
              nextId: p.data.nextId + 1,
              variables: [
                ...p.data.variables,
                {
                  id: p.data.nextId,
                  name: "new",
                  siPrefix: "",
                  unit: "",
                  value: 0,
                  locked: false,
                },
              ],
            })
          )
        }
        style={{ marginTop: "16px" }}
      >
        Add
      </button>
      <Editor
        value={project.data.sourceCode}
        onValueChange={(code) =>
          setProject((p) => p.update({ sourceCode: code }))
        }
        highlight={(code) =>
          highlightWithLineNumbers(code, Prism.languages.javascript)
        }
        padding={10}
        textareaId="codeArea"
        className="editor"
        style={{
          fontFamily: '"Fira code", "Fira Mono", monospace',
          fontSize: 18,
          outline: 0,
        }}
      />
    </div>
  );
}

const highlightWithLineNumbers = (input: string, language: Grammar) =>
  highlight(input, language, "javascript")
    .split("\n")
    .map((line, i) => `<span class='editorLineNumber'>${i + 1}</span>${line}`)
    .join("\n");

export default App;
