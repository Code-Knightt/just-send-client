import { useCallback, useRef, useState } from "react";
import { useRTCStore } from "../stores/useRTCStore";
import { useWsStore } from "../stores/useWsStore";

export default function useCodePrompt() {
  const [open, setOpen] = useState(false);
  const resolveRef = useRef<((code: string) => void) | null>(null);
  const rejectRef = useRef<(() => void) | null>(null);
  const { sendData } = useWsStore();
  const { sender, receiver, closeConnection } = useRTCStore.getState();
  const promptForCode = useCallback(() => {
    setOpen(true);
    return new Promise<string>((resolve, reject) => {
      resolveRef.current = (code: string) => {
        resolve(code);
        resolveRef.current = null;
        rejectRef.current = null;
        setOpen(false);
      };
      rejectRef.current = () => {
        resolveRef.current = null;
        rejectRef.current = null;
        setOpen(false);
        reject(new Error("User canceled PIN entry"));
      };
    });
  }, []);

  const handleSubmit = useCallback((code: string) => {
    resolveRef.current?.(code);
  }, []);

  const handleCancel = useCallback(() => {
    rejectRef.current?.();
    closeConnection();
    if (sendData) {
      sendData(
        JSON.stringify({
          type: "close",
          sender: receiver,
          receiver: sender,
        })
      );
    }
  }, [sendData, sender, receiver, closeConnection]);

  const handleClose = useCallback(() => {
    setOpen(false);
  }, []);

  return {
    open,
    promptForCode,
    handleSubmit,
    handleCancel,
    close: handleClose,
  };
}
