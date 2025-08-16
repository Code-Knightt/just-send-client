import { Fragment, useState } from "react";
import { Transition } from "@headlessui/react";
import { motion } from "framer-motion";
import { Shield, Info, Check } from "lucide-react";

interface DeclarationModalProps {
  isOpen: boolean;
  onAccept: () => void;
}

export default function DeclarationModal({
  isOpen,
  onAccept,
}: DeclarationModalProps) {
  const [hasAccepted, setHasAccepted] = useState(false);

  const handleAccept = () => {
    setHasAccepted(true);
    // Store acceptance timestamp in localStorage
    localStorage.setItem("declarationAccepted", Date.now().toString());
    onAccept();
  };

  return (
    <Transition show={isOpen} as={Fragment}>
      <div className="fixed inset-0 z-50 overflow-y-auto">
        <div className="flex min-h-full items-center justify-center p-4">
          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0"
            enterTo="opacity-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100"
            leaveTo="opacity-0"
          >
            <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm" />
          </Transition.Child>

          <Transition.Child
            as={Fragment}
            enter="ease-out duration-300"
            enterFrom="opacity-0 scale-95"
            enterTo="opacity-100 scale-100"
            leave="ease-in duration-200"
            leaveFrom="opacity-100 scale-100"
            leaveTo="opacity-0 scale-95"
          >
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative w-full max-w-md transform rounded-2xl bg-white p-6 shadow-xl ring-1 ring-slate-200"
            >
              <div className="flex items-center gap-3 mb-4">
                <div className="h-10 w-10 grid place-items-center rounded-xl bg-blue-100 text-blue-600">
                  <Shield size={20} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">
                    Privacy Declaration
                  </h2>
                  <p className="text-sm text-slate-600">
                    Important information about data usage
                  </p>
                </div>
              </div>

              <div className="space-y-4 text-sm text-slate-700">
                <div className="flex items-start gap-3">
                  <Info
                    className="mt-0.5 text-slate-500 flex-shrink-0"
                    size={16}
                  />
                  <div>
                    <p className="font-medium mb-1">IP Address Usage</p>
                    <p>
                      This site uses your publicly available IP address to group
                      you with devices on your network. Your IP is only stored
                      temporarily while connected and is deleted after
                      disconnection.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <Info
                    className="mt-0.5 text-slate-500 flex-shrink-0"
                    size={16}
                  />
                  <div>
                    <p className="font-medium mb-1">Device Fingerprinting</p>
                    <p>
                      The site uses device fingerprinting for identification
                      purposes, but no fingerprint data is stored on our
                      servers.
                    </p>
                  </div>
                </div>

                <div className="rounded-lg bg-slate-50 p-3">
                  <p className="text-xs text-slate-600">
                    By accepting this declaration, you acknowledge that you
                    understand how your data is used. This declaration will not
                    appear again for 24 hours.
                  </p>
                </div>
              </div>

              <div className="mt-6 flex gap-3">
                <button
                  onClick={handleAccept}
                  disabled={hasAccepted}
                  className="flex-1 rounded-xl bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {hasAccepted ? (
                    <span className="flex items-center justify-center gap-2">
                      <Check size={16} />
                      Accepted
                    </span>
                  ) : (
                    "I Accept"
                  )}
                </button>
              </div>
            </motion.div>
          </Transition.Child>
        </div>
      </div>
    </Transition>
  );
}
