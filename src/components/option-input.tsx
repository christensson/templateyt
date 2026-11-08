import Button from "@jetbrains/ring-ui-built/components/button/button";
import ButtonGroup from "@jetbrains/ring-ui-built/components/button-group/button-group";
import React from "react";
import { formatOptionAnswer } from "../../@types/template";

interface OptionAnswerInputProps {
  label: string;
  // The answer, or null while not answered.
  value: boolean | null;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}

const ANSWERS = [true, false];

// Yes/No answer to a template option: two buttons, the chosen one pressed. Neither is pressed
// while the option is not answered, so a required choice stays visibly open.
const OptionAnswerInput: React.FunctionComponent<OptionAnswerInputProps> = ({
  label,
  value,
  onChange,
  disabled,
}) => (
  <ButtonGroup role="group" aria-label={label}>
    {ANSWERS.map((answer) => (
      <Button
        key={String(answer)}
        active={value === answer}
        aria-pressed={value === answer}
        disabled={disabled}
        onClick={() => onChange(answer)}
      >
        {formatOptionAnswer(answer)}
      </Button>
    ))}
  </ButtonGroup>
);

export default OptionAnswerInput;
