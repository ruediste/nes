import { useCallback, useEffect, useState } from "react";

import { debounce } from "./utils";

import Split from "@uiw/react-split";
import Prism, { highlight } from "prismjs";
import "prismjs/themes/prism.css";
import Editor from "react-simple-code-editor";
import { ToastContainer } from "react-toastify";
import "react-toastify/dist/ReactToastify.css";
import { calculate } from "./calculation";
import { CompileError } from "./parser";

export const siPrefixes = [
  { prefix: "T", factor: 1e12 },
  { prefix: "G", factor: 1e9 },
  { prefix: "M", factor: 1e6 },
  { prefix: "k", factor: 1e3 },
  { prefix: "h", factor: 100 },
  { prefix: "", factor: 1 },
  { prefix: "%", factor: 0.01 },
  { prefix: "d", factor: 1e-1 },
  { prefix: "c", factor: 1e-2 },
  { prefix: "m", factor: 1e-3 },
  { prefix: "u", factor: 1e-6 },
  { prefix: "n", factor: 1e-9 },
  { prefix: "p", factor: 1e-12 },
] as const;

Prism.languages["nes"] = {
  keyword: [/\bvar\b/, /\blvar\b/, /\beq\b/],
  number: /-?\d+(\.\d+)?(e-?\d+)?/,
  comment: { pattern: /\/\/.*/, greedy: true },
  operator: /[\-+*\/=]/,
  punctuation: /[];:\(\)]/,
  function: { pattern: /\b[a-zA-Z_][a-zA-Z0-9]*\b(?=\()/, greedy: true },
  selector: { pattern: /\b[a-zA-Z_][a-zA-Z0-9]*\b/, greedy: true },
};

export type SiPrefix = (typeof siPrefixes)[number]["prefix"];

export const siPrefixMap: { [key in SiPrefix]: number } = Object.fromEntries(
  siPrefixes.map((x) => [x.prefix, x.factor])
) as any;

const debouncedSave = debounce((sourceCode: string) => {
  localStorage.setItem("sourceCode", sourceCode);
}, 500);

function App() {
  const [sourceCode, setSourceCode] = useState<string>(
    () => localStorage.getItem("sourceCode") ?? ""
  );

  const [output, setOutput] = useState("");

  useEffect(() => {
    debouncedSave(sourceCode);
  }, [sourceCode]);

  const performCalculation = useCallback(() => {
    try {
      const result = calculate(sourceCode);
      setSourceCode(result.updatedSourceCode);
      setOutput(result.output);
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
  }, [sourceCode]);

  return (
    <div
      style={{
        padding: "8px",
        height: "100vh",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <Split style={{ minHeight: "200px", flexGrow: 1 }}>
        <div style={{ overflow: "auto", width: "75%" }}>
          <Editor
            value={sourceCode}
            onValueChange={(code) => setSourceCode(code)}
            highlight={(code) =>
              highlightWithLineNumbers(code, Prism.languages.nes)
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
        {/* <DownloadButton sourceCode={sourceCode} />
        <UploadButton onUpload={setSourceCode} /> */}
      </div>
      <ToastContainer />
    </div>
  );
}

const highlightWithLineNumbers = (input: string, language: Prism.Grammar) =>
  highlight(input, language, "nes")
    .split("\n")
    .map((line, i) => `<span class='editorLineNumber'>${i + 1}</span>${line}`)
    .join("\n");

export default App;
