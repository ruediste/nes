import { CSSProperties, useEffect, useState } from "react";

type InputProps<T> = {
  value: T;
  disabled?: boolean;
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
  style?: CSSProperties;
} & ({ inline?: false } | { inline?: true });

export function Input<T>(
  props: InputProps<T> & {
    formatValue: (value: T) => string;
    parseValue: (value: string) => T;
    type: string;
  }
) {
  const [editing, setEditing] = useState(false);
  const [valueInternal, setValueInternal] = useState(
    props.formatValue(props.value)
  );
  useEffect(() => {
    setValueInternal(props.formatValue(props.value));
  }, [props.value]);

  if (props.disabled || (props.inline && !editing))
    return (
      <span
        className={props.inline ? "Input-inlineContainer" : undefined}
        onClick={() => props.inline && setEditing(true)}
        style={{ cursor: props.disabled ? "not-allowed" : "pointer" }}
      >
        {props.formatValue(props.value)}
      </span>
    );
  else
    return (
      <input
        disabled={props.disabled}
        className={
          "form-control nodrag" + (props.className ? " " + props.className : "")
        }
        style={props.style}
        type={props.type}
        value={valueInternal}
        onChange={(e) => setValueInternal(e.target.value)}
        placeholder={props.placeholder}
        onBlur={() => {
          setEditing(false);
          props.onChange(props.parseValue(valueInternal));
        }}
      />
    );
}

export function StringInput(props: InputProps<string>) {
  return (
    <Input
      {...props}
      type="text"
      formatValue={(x) => x}
      parseValue={(x) => x}
    />
  );
}

export function NumberInput(props: InputProps<number>) {
  return (
    <Input
      {...props}
      type="number"
      formatValue={(x) => "" + x}
      parseValue={(x) => +x}
    />
  );
}
