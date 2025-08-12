import {
  Description,
  Dialog,
  DialogPanel,
  DialogTitle,
} from "@headlessui/react";
import { forwardRef } from "react";

interface CodeModalProps {
  code?: string;
  onClose: () => void;
}

const CodeModal = forwardRef<HTMLDivElement, CodeModalProps>(
  ({ code, onClose }, ref) => {
    if (!code) return null;

    return (
      <Dialog as="div" className="relative z-10" onClose={onClose} ref={ref}>
        <div className="fixed inset-0 bg-black/30" aria-hidden="true" />
        <div className="fixed inset-0 flex items-center rounded-lg justify-center p-4">
          <DialogPanel className="bg-white p-6 rounded shadow-lg">
            <DialogTitle className="text-xl font-bold">
              Waiting for confirmation
            </DialogTitle>
            <Description>Enter this code on the receiving device</Description>
            <div className="flex justify-center my-10">
              <p className="text-5xl font-thin tracking-widest">{code}</p>
            </div>
            <button
              onClick={onClose}
              className="mt-4 px-4 py-2 bg-red-500 text-white rounded"
            >
              Cancel
            </button>
          </DialogPanel>
        </div>
      </Dialog>
    );
  }
);

export default CodeModal;
