import { useCallback, useEffect, useId, useState } from "react";

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
import { CompileError } from "./parser";

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

interface ProjectSerialized {
  sourceCode: string;
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
}

function serializeProject(project: Project) {
  return JSON.stringify(
    checkType<ProjectSerialized>({
      sourceCode: project.data.sourceCode,
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
      setOutput(calculate(project, (fn) => setProject((p) => p.update(fn(p)))));
    } catch (e) {
      if (e instanceof CompileError) {
        setOutput(e.message);
        console.log(e.message);
      } else if (e instanceof Array) {
        e.forEach((e) => console.log(e.message));
        setOutput(e.map((e) => e.message).join("\n"));
      } else {
        setOutput("" + e);
        console.error(e);
      }
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
