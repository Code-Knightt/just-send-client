// src/components/DialogModal.tsx
import { useEffect, useRef, type FormEventHandler } from "react";
import { useRTCStore } from "../stores/useRTCStore";

interface DialogModalProps {
  open: boolean;
  onClose: () => void;
}

const DialogModal: React.FC<DialogModalProps> = ({ open, onClose }) => {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const sendFile = useRTCStore((s) => s.sendFile);

  const { setOnFileReceived, sendProgress } = useRTCStore.getState();
  useEffect(() => {
    setOnFileReceived((f) => {
      // e.g., auto-download:
      const a = document.createElement("a");
      a.href = f.url;
      a.download = f.name;
      a.click();
      // Later: URL.revokeObjectURL(f.url)
    });
    return () => setOnFileReceived(null);
  }, [setOnFileReceived]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  const handleSubmit: FormEventHandler<HTMLFormElement> = (e) => {
    e.preventDefault();
    const files = fileRef.current?.files;
    if (!files) return;

    const file = files[0];
    sendFile(file);
  };

  return (
    <dialog
      ref={dialogRef}
      className="rounded-xl p-0 max-w-md w-[90%] 
             top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2"
      onClose={onClose}
    >
      <form
        onSubmit={handleSubmit}
        className="space-y-4 p-6 bg-white rounded-xl"
      >
        <h2 className="text-xl font-bold">Upload File</h2>

        <input
          type="file"
          accept="image/*,application/pdf"
          className="block w-full border border-gray-300 p-2 rounded"
          ref={fileRef}
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            className="bg-gray-300 px-4 py-2 rounded"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="bg-blue-500 text-white px-4 py-2 rounded"
          >
            Upload
          </button>
        </div>
      </form>
      {sendProgress && (
        <div>
          {sendProgress.transferred} / {sendProgress.total} bytes (
          {sendProgress.percent.toFixed(1)}%)
        </div>
      )}
    </dialog>
  );
};

export default DialogModal;
