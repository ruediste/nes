import { useCallback, useEffect, useId, useState } from "react";
import { NumberInput, StringInput } from "./Input";
import { SortableList } from "./sortableList/SortableList";

import { checkType, debounce } from "./utils";

import Split from "@uiw/react-split";
import Prism, { highlight } from "prismjs";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-javascript";
import "prismjs/themes/prism.css";
import Editor from "react-simple-code-editor";
import { toast, ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { calculate } from "./calculation";
import { CompileError, Grammar } from "./parser";

export const siPrefixes = [
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

export type SiPrefix = (typeof siPrefixes)[number]["prefix"];

export const siPrefixMap: { [key in SiPrefix]: number } = Object.fromEntries(
  siPrefixes.map((x) => [x.prefix, x.factor])
) as any;

export interface VariableDefinition {
  locked: boolean;
  id: number;
  name: string;
  description: string;
  siPrefix: SiPrefix;
  unit: string;
  value: number;
}

interface ProjectSerialized {
  sourceCode: string;
  variables: VariableDefinition[][];
  nextId: number;
}

export interface ProjectData extends ProjectSerialized {}

export class Project {
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
      variables: this.data.variables.map((vlist) =>
        vlist.map((v) => (v.id === id ? { ...v, ...update } : v))
      ),
    });
  }
  public updateVariableGroup(
    groupIndex: number,
    fn: (group: VariableDefinition[]) => VariableDefinition[]
  ) {
    return this.update({
      variables: this.data.variables.map((group, idx) =>
        idx === groupIndex ? fn(group) : group
      ),
    });
  }
}

function serializeProject(project: Project) {
  return JSON.stringify(
    checkType<ProjectSerialized>({
      sourceCode: project.data.sourceCode,
      variables: project.data.variables,
      nextId: project.data.nextId,
    })
  );
}

const debouncedSave = debounce((project: Project) => {
  localStorage.setItem("project1", serializeProject(project));
}, 500);

function DownloadButton(props: { project: Project }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        const data = serializeProject(props.project);
        if (data) {
          const blob = new Blob([data], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "project.json";
          a.click();
          URL.revokeObjectURL(url);
        }
      }}
    >
      Download
    </button>
  );
}

function UploadButton(props: { onUpload: (project: Project) => void }) {
  return (
    <div className="mb-3">
      <label className="form-label">Import Project</label>
      <input
        type="file"
        className="form-control"
        onChange={(e) => {
          const input = e.target;
          const file = e.target.files?.[0];
          if (file) {
            const reader = new FileReader();
            reader.onload = (e1) => {
              const data = e1.target?.result;
              if (typeof data === "string") {
                props.onUpload(Project.fromSerialized(JSON.parse(data)));
              }
              input.value = "";
              toast("Project loaded");
            };
            reader.readAsText(file);
          }
        }}
      />
    </div>
  );
}

function App() {
  const [project, setProject] = useState<Project>(() => {
    const stored = localStorage.getItem("project1");

    if (stored) {
      return Project.fromSerialized(JSON.parse(stored) as ProjectSerialized);
    } else {
      return Project.fromSerialized({
        sourceCode: "",
        variables: [[], []],
        nextId: 1,
      });
    }
  });

  const [output, setOutput] = useState("");
  const id = useId();

  useEffect(() => {
    debouncedSave(project);
  }, [project]);

  const performCalculation = useCallback(() => {
    try {
      const system = new Grammar(project.data.sourceCode).system();
      calculate(project, (fn) => setProject((p) => p.update(fn(p))));
      setOutput("");
    } catch (e) {
      if (e instanceof CompileError) {
        setOutput(e.message);
        console.log(e.message);
      } else if (e instanceof Array) {
        e.forEach((e) => console.log(e.message));
        setOutput(e.map((e) => e.message).join("\n"));
      } else throw e;
    }
  }, [project]);

  return (
    <div
      style={{
        margin: "8px",
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", flexDirection: "row" }}>
        <SortableList
          items={project.data.variables}
          onChange={(newVariables) =>
            setProject((p) => p.update({ variables: newVariables }))
          }
          renderContainer={(children, groupIndex) => (
            <div
              style={{
                flexGrow: 1,
              }}
            >
              <div className="list-group" style={{ minHeight: "40px" }}>
                {children}
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() =>
                  setProject((p) =>
                    p
                      .updateVariableGroup(groupIndex, (g) => [
                        ...g,
                        {
                          id: p.data.nextId,
                          name: "new",
                          description: "",
                          siPrefix: "",
                          unit: "",
                          value: 0,
                          locked: false,
                        },
                      ])
                      .update({ nextId: p.data.nextId + 1 })
                  )
                }
                style={{}}
              >
                Add
              </button>
            </div>
          )}
          renderItem={({
            item: variable,
            isDragPlaceholder,
            setNodeRef,
            style,
            groupIndex,
          }) => {
            function update(data: Partial<VariableDefinition>) {
              setProject((p) => p.updateVariable(variable.id, data));
            }
            return (
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
                <SortableList.DragHandle />
                <StringInput
                  value={variable.name}
                  placeholder="Name"
                  onChange={(name) => update({ name })}
                />
                <StringInput
                  value={variable.description}
                  placeholder="Description"
                  onChange={(description) => update({ description })}
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
                <StringInput
                  style={{ width: "75px" }}
                  value={variable.unit}
                  placeholder="Unit"
                  onChange={(unit) => update({ unit })}
                />
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

                <button
                  type="button"
                  className="btn btn-secondary"
                  style={{ marginLeft: "8px" }}
                  onClick={() =>
                    setProject((p) =>
                      p.updateVariableGroup(groupIndex, (g) =>
                        g.filter((x) => x.id !== variable.id)
                      )
                    )
                  }
                >
                  Delete
                </button>
              </li>
            );
          }}
        ></SortableList>
      </div>
      <Split style={{ minHeight: "200px", flexGrow: 1 }}>
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
            width: "75%",
            fontFamily: '"Fira code", "Fira Mono", monospace',
            fontSize: 18,
            outline: 0,
          }}
        />
        <div style={{ width: "25%" }}>
          <pre>{output}</pre>
        </div>
      </Split>

      <div>
        <button
          style={{ marginTop: "16px" }}
          type="button"
          className="btn btn-primary"
          onClick={performCalculation}
        >
          Calculate
        </button>
      </div>

      <div
        style={{
          marginTop: "16px",
          gap: "8px",
          display: "flex",
          alignItems: "center",
        }}
      >
        <DownloadButton project={project} />
        <UploadButton onUpload={setProject} />
      </div>
      <ToastContainer />
    </div>
  );
}

const highlightWithLineNumbers = (input: string, language: Prism.Grammar) =>
  highlight(input, language, "javascript")
    .split("\n")
    .map((line, i) => `<span class='editorLineNumber'>${i + 1}</span>${line}`)
    .join("\n");

export default App;
