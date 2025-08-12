import { Description, Dialog, DialogTitle } from "@headlessui/react";
import { forwardRef, useCallback, useEffect, useMemo, useState } from "react";
import { useRTCStore } from "../stores/useRTCStore";
import { useIdentityStore } from "../stores/useIdentityStore";

interface FileModalProps {
  onClose: (isReceiver?: boolean) => void;
}

type FileRow = {
  file: File;
  progress: number; // 0..100
};

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const num = bytes / Math.pow(1024, i);
  return `${num.toFixed(num >= 100 || i === 0 ? 0 : 1)} ${units[i]}`;
}

const FileModal = forwardRef<HTMLDivElement, FileModalProps>(
  ({ onClose }, ref) => {
    // Identity & role
    const name = useIdentityStore((s) => s.name);
    const rtcReceiver = useRTCStore((s) => s.receiver);
    const isReceiver = name && rtcReceiver && name === rtcReceiver;

    // Store bindings
    const sendFiles = useRTCStore((s) => s.sendFiles);
    const sendProg = useRTCStore((s) => s.sendProgress);
    const batchProg = useRTCStore((s) => s.batchSendProgress);
    const recvProg = useRTCStore((s) => s.recvProgress);
    const receivedFiles = useRTCStore((s) => s.receivedFiles);

    // Sender local UI state
    const [rows, setRows] = useState<FileRow[]>([]);
    const [sending, setSending] = useState(false);
    const [currentIndex, setCurrentIndex] = useState(0);

    // When user picks files
    const onPick: React.ChangeEventHandler<HTMLInputElement> = (e) => {
      const files = Array.from(e.target.files ?? []);
      setRows(files.map((f) => ({ file: f, progress: 0 })));
      setCurrentIndex(0);
    };

    // Kick off batch send
    const onSend = useCallback(async () => {
      if (rows.length === 0 || sending) return;
      setSending(true);
      setCurrentIndex(0);
      try {
        await sendFiles(rows.map((r) => r.file));
      } finally {
        // Ensure all marked done on completion
        setRows((prev) => prev.map((r) => ({ ...r, progress: 100 })));
        setSending(false);
      }
    }, [rows, sendFiles, sending]);

    // Track per-file progress using store's current-file sendProgress
    useEffect(() => {
      if (!sending || !sendProg || rows.length === 0) return;

      setRows((prev) => {
        const next = prev.slice();
        const i = currentIndex;
        if (i >= 0 && i < next.length) {
          next[i] = { ...next[i], progress: Math.floor(sendProg.percent) };
        }
        return next;
      });

      if (sendProg.finishedAt) {
        // Lock this file at 100 and move pointer forward
        setRows((prev) => {
          const next = prev.slice();
          const i = currentIndex;
          if (i >= 0 && i < next.length) {
            next[i] = { ...next[i], progress: 100 };
          }
          return next;
        });
        setCurrentIndex((i) => Math.min(i + 1, rows.length - 1));
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [sendProg]); // intentionally only when store progress changes

    const totalSelectedBytes = useMemo(
      () => rows.reduce((sum, r) => sum + (r.file.size || 0), 0),
      [rows]
    );

    return (
      <Dialog as="div" onClose={onClose} ref={ref} className="relative z-50">
        {/* Backdrop */}
        <div className="fixed inset-0 bg-black/40" aria-hidden="true" />
        {/* Panel */}
        <div className="fixed inset-0 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between gap-6">
              <div>
                <DialogTitle className="text-2xl font-bold">
                  {isReceiver ? "Incoming Transfers" : "Transfer Files"}
                </DialogTitle>
                <Description className="text-sm text-gray-600">
                  {isReceiver
                    ? "Files you receive will appear below. You can download them once they arrive."
                    : "Select files and send them to the connected peer."}
                </Description>
              </div>
              <button
                onClick={() => {
                  onClose(isReceiver as boolean);
                }}
                className="rounded-xl px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100"
              >
                Close
              </button>
            </div>

            {/* Body */}
            {!isReceiver ? (
              // SENDER UI
              <div className="mt-6 space-y-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <label className="block">
                    <span className="sr-only">Choose files</span>
                    <input
                      type="file"
                      multiple
                      onChange={onPick}
                      className="block w-full cursor-pointer rounded-lg border border-gray-300 p-2"
                      disabled={sending}
                    />
                  </label>
                  <button
                    onClick={onSend}
                    disabled={rows.length === 0 || sending}
                    className="inline-flex items-center justify-center rounded-xl bg-blue-600 px-4 py-2 text-white disabled:cursor-not-allowed disabled:bg-blue-300"
                  >
                    {sending
                      ? "Sending..."
                      : `Send ${rows.length} file${
                          rows.length === 1 ? "" : "s"
                        }`}
                  </button>
                </div>

                {rows.length > 0 && (
                  <div className="rounded-xl border border-gray-200">
                    <div className="flex items-center justify-between border-b p-3 text-sm text-gray-600">
                      <div>
                        Total selected: {rows.length} file
                        {rows.length === 1 ? "" : "s"}
                      </div>
                      <div>{formatBytes(totalSelectedBytes)}</div>
                    </div>

                    {/* Batch progress */}
                    {sending && batchProg && (
                      <div className="px-3 py-2">
                        <div className="mb-1 flex justify-between text-xs text-gray-600">
                          <span>Batch progress</span>
                          <span>{Math.floor(batchProg.percent)}%</span>
                        </div>
                        <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                          <div
                            className="h-2 rounded bg-blue-600 transition-[width]"
                            style={{ width: `${batchProg.percent}%` }}
                          />
                        </div>
                      </div>
                    )}

                    <ul className="divide-y">
                      {rows.map((r, i) => (
                        <li
                          key={`${r.file.name}-${r.file.size}-${i}`}
                          className="p-3"
                        >
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {r.file.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatBytes(r.file.size)}
                              </div>
                            </div>
                            <div className="w-40 text-right text-sm tabular-nums">
                              {r.progress}%
                            </div>
                          </div>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded bg-gray-200">
                            <div
                              className={`h-2 rounded ${
                                r.progress === 100
                                  ? "bg-green-600"
                                  : "bg-blue-600"
                              } transition-[width]`}
                              style={{ width: `${r.progress}%` }}
                            />
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              // RECEIVER UI
              <div className="mt-6 space-y-6">
                {/* Current receive progress */}
                {recvProg && recvProg.transferred < recvProg.total && (
                  <div className="rounded-xl border border-gray-200 p-3">
                    <div className="mb-1 flex justify-between text-sm text-gray-700">
                      <span>Receiving...</span>
                      <span className="tabular-nums">
                        {Math.floor(recvProg.percent)}%
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded bg-gray-200">
                      <div
                        className="h-2 rounded bg-blue-600 transition-[width]"
                        style={{ width: `${recvProg.percent}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Received files list */}
                <div className="rounded-xl border border-gray-200">
                  <div className="border-b p-3 text-sm text-gray-600">
                    Received files ({receivedFiles.length})
                  </div>
                  {receivedFiles.length === 0 ? (
                    <div className="p-4 text-sm text-gray-500">
                      No files received yet.
                    </div>
                  ) : (
                    <ul className="divide-y">
                      {receivedFiles.map((f, idx) => (
                        <li key={`${f.name}-${f.size}-${idx}`} className="p-3">
                          <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                              <div className="truncate font-medium">
                                {f.name}
                              </div>
                              <div className="text-xs text-gray-500">
                                {formatBytes(f.size)} •{" "}
                                {f.mime || "unknown type"}
                              </div>
                            </div>
                            <a
                              href={f.url}
                              download={f.name}
                              className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-black"
                            >
                              Download
                            </a>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </Dialog>
    );
  }
);

export default FileModal;
