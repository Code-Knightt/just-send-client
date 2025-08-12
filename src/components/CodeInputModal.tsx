import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import React, { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useRTCStore } from "../stores/useRTCStore";

interface CodeInputModalProps {
  onCancel: () => void;
  onClose: () => void;
  onSubmit: (code: string) => void;
}

const CodeInputModal = forwardRef<HTMLDivElement, CodeInputModalProps>(
  ({ onCancel, onClose, onSubmit }, ref) => {
    const [code, setCode] = useState<string>("");
    const { sender } = useRTCStore.getState();

    // Keep 4 controlled inputs in sync with a single `code` string
    const values = useMemo(() => {
      const chars = code.split("");
      return [0, 1, 2, 3].map((i) => chars[i] ?? "");
    }, [code]);

    const inputsRef = useRef<Array<HTMLInputElement | null>>([
      null,
      null,
      null,
      null,
    ]);

    useEffect(() => {
      if (inputsRef.current[0]) {
        inputsRef.current[0]?.focus();
      }
    }, []);

    const focusIndex = (idx: number) => {
      const el = inputsRef.current[idx];
      if (el) el.focus();
    };

    const handleChange = (idx: number, v: string) => {
      // Accept only digits
      const digit = v.replace(/\D/g, "").slice(0, 1);
      const next = values.slice();
      next[idx] = digit;
      const joined = next.join("").slice(0, 4);
      setCode(joined);

      // Auto-advance if a digit was entered
      if (digit && idx < 3) focusIndex(idx + 1);
    };

    const handleKeyDown: React.KeyboardEventHandler<HTMLInputElement> = (e) => {
      const target = e.target as HTMLInputElement;
      const idx = Number(target.dataset.index);
      if (Number.isNaN(idx)) return;

      if (e.key === "Enter") {
        if (code.length === 4) {
          handleSubmit();
        }
        return;
      }

      if (e.key === "Backspace") {
        if (target.value === "" && idx > 0) {
          // Move back if this box is already empty
          e.preventDefault();
          const prevIdx = idx - 1;
          focusIndex(prevIdx);
          // Clear previous box
          setCode((prev) => {
            const chars = prev.split("");
            chars[prevIdx] = "";
            return chars.join("");
          });
        } else {
          // Clear current box
          setCode((prev) => {
            const chars = prev.split("");
            chars[idx] = "";
            return chars.join("");
          });
        }
      }

      if (e.key === "ArrowLeft" && idx > 0) {
        e.preventDefault();
        focusIndex(idx - 1);
      }
      if (e.key === "ArrowRight" && idx < 3) {
        e.preventDefault();
        focusIndex(idx + 1);
      }
    };

    const handlePaste: React.ClipboardEventHandler<HTMLInputElement> = (e) => {
      e.preventDefault();
      const text = e.clipboardData
        .getData("text")
        .replace(/\D/g, "")
        .slice(0, 4);
      if (!text) return;
      setCode(text);
      // Focus last filled (or last box if full)
      const lastIdx = Math.min(text.length, 4) - 1;
      focusIndex(Math.max(lastIdx, 0));
    };

    const clearAll = () => setCode("");

    const handleSubmit = () => {
      if (code.length === 4) {
        onSubmit(code);
        onClose();
      }
    };

    const canSubmit = code.length === 4;

    return (
      <Dialog as="div" className="relative z-10" onClose={onClose} ref={ref}>
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <DialogPanel className="w-full max-w-md bg-white p-6 rounded-2xl shadow-lg">
            <DialogTitle className="text-xl font-bold">Enter Code</DialogTitle>
            <Description className="mt-1 text-sm text-gray-600">
              {/* Enter the 4-digit code visible on the sender device. */}
              {sender} wants to send a file
            </Description>

            <div className="mt-8 flex items-center justify-center gap-3">
              {[0, 1, 2, 3].map((i) => (
                <input
                  key={i}
                  ref={(el) => {
                    inputsRef.current[i] = el;
                  }}
                  data-index={i}
                  value={values[i]}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={handleKeyDown}
                  onPaste={handlePaste}
                  type="tel"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  autoComplete={i === 0 ? "one-time-code" : "off"}
                  enterKeyHint="done"
                  maxLength={1}
                  className="h-14 w-12 text-center text-2xl tracking-widest rounded-xl border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none"
                  aria-label={`Digit ${i + 1}`}
                />
              ))}
            </div>

            <div className="mt-3 text-center text-gray-500 text-sm">
              {code.length < 4
                ? `${4 - code.length} digit${
                    4 - code.length === 1 ? "" : "s"
                  } remaining`
                : "Ready to submit"}
            </div>

            <div className="mt-8 flex justify-between flex-wrap gap-2">
              <button
                onClick={() => {
                  clearAll();
                  onCancel();
                }}
                className="px-4 py-2 bg-red-500 text-white rounded-xl"
              >
                Cancel
              </button>
              <div className="flex gap-2">
                <button
                  onClick={clearAll}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-xl"
                  type="button"
                >
                  Clear
                </button>
                <button
                  onClick={handleSubmit}
                  disabled={!canSubmit}
                  className={`px-4 py-2 rounded-xl text-white transition
                    ${
                      canSubmit
                        ? "bg-blue-600 hover:bg-blue-700"
                        : "bg-blue-300 cursor-not-allowed"
                    }`}
                >
                  Submit
                </button>
              </div>
            </div>
          </DialogPanel>
        </div>
      </Dialog>
    );
  }
);

CodeInputModal.displayName = "CodeInputModal";
export default CodeInputModal;
