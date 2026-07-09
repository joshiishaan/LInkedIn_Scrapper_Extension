/**
 * OtpInput — segmented 6-digit code entry (underline boxes).
 * Controlled: `value` is the code string, `onChange` gets the updated string.
 * Numeric-only, one digit per box, auto-advance, backspace-to-previous, paste.
 */

import { useRef } from "react";

interface Props {
  value: string;
  onChange: (value: string) => void;
  length?: number;
  autoFocus?: boolean;
}

export default function OtpInput({
  value,
  onChange,
  length = 6,
  autoFocus,
}: Props) {
  const inputs = useRef<Array<HTMLInputElement | null>>([]);

  const focusBox = (i: number) => {
    if (i >= 0 && i < length) inputs.current[i]?.focus();
  };

  const setDigit = (index: number, digit: string) => {
    const chars = Array.from({ length }, (_, i) => value[i] || "");
    chars[index] = digit;
    onChange(chars.join(""));
  };

  const handleChange = (index: number, raw: string) => {
    const digit = raw.replace(/\D/g, "").slice(-1); // keep last numeric char only
    setDigit(index, digit);
    if (digit) focusBox(index + 1);
  };

  const handleKeyDown = (
    index: number,
    e: React.KeyboardEvent<HTMLInputElement>,
  ) => {
    if (e.key === "Backspace") {
      if (value[index]) {
        setDigit(index, "");
      } else if (index > 0) {
        focusBox(index - 1);
        setDigit(index - 1, "");
      }
    } else if (e.key === "ArrowLeft") {
      focusBox(index - 1);
    } else if (e.key === "ArrowRight") {
      focusBox(index + 1);
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const digits = e.clipboardData
      .getData("text")
      .replace(/\D/g, "")
      .slice(0, length);
    if (!digits) return;
    onChange(digits);
    focusBox(Math.min(digits.length, length - 1));
  };

  return (
    <div className="otp-boxes" onPaste={handlePaste}>
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputs.current[i] = el;
          }}
          className="otp-box"
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? "one-time-code" : "off"}
          maxLength={1}
          value={value[i] || ""}
          autoFocus={autoFocus && i === 0}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
        />
      ))}
    </div>
  );
}
