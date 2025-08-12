import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { Transition } from "@headlessui/react";
import { motion } from "framer-motion";
import {
  Wifi,
  WifiOff,
  Loader2,
  CircleCheck,
  AlertTriangle,
  HardDrive,
  Search,
} from "lucide-react";

import { DeviceCloud } from "./components/DeviceCloud";
import CodeModal from "./components/CodeModal";
import CodeInputModal from "./components/CodeInputModal";
import FileModal from "./components/FileModal";
import Toast from "./components/Toast";

import { useWsStore } from "./stores/useWsStore";
import { useIdentityStore } from "./stores/useIdentityStore";
import { useRTCStore } from "./stores/useRTCStore";
import { useWsConnection } from "./hooks/useWsConnection";
import { useWsMessageRouter, type Message } from "./ws/wsHandler";
import type { SendData } from "./types";

function StatusBadge({
  state,
}: {
  state: "connecting" | "connected" | "error";
}) {
  const cfg =
    state === "connecting"
      ? {
          icon: Loader2,
          text: "Connecting",
          className: "text-amber-700 bg-amber-100 ring-amber-200",
        }
      : state === "connected"
      ? {
          icon: CircleCheck,
          text: "Connected",
          className: "text-emerald-700 bg-emerald-100 ring-emerald-200",
        }
      : {
          icon: AlertTriangle,
          text: "Connection Failed",
          className: "text-rose-700 bg-rose-100 ring-rose-200",
        };
  const Icon = cfg.icon;
  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm ring-1 ${cfg.className}`}
    >
      <Icon
        className={state === "connecting" ? "animate-spin" : ""}
        size={16}
      />
      {cfg.text}
    </span>
  );
}

export default function App() {
  const { name, initialize: initializeName } = useIdentityStore();
  const { message, sendData } = useWsStore();
  const [devices, setDevices] = useState<string[]>([]);
  const { recvProgress, closeConnection } = useRTCStore();

  const [openFileModal, setOpenFileModal] = useState(false);
  const [code, setCode] = useState<string | undefined>();
  const [query, setQuery] = useState("");

  // Initialize name once
  useEffect(() => {
    initializeName();
  }, [initializeName]);

  // Initialize WebSocket Connection and register with server
  const { connectionFailed, hasConnected } = useWsConnection({
    url: import.meta.env.VITE_SERVER_URL,
    name,
  });

  const handleBucketUpdate = useCallback((data: unknown) => {
    const m = data as Message & { devices: string[] };
    setDevices(m.devices);
  }, []);

  const {
    open: requireCode,
    promptForCode,
    handleSubmit: handleCodeSubmit,
    handleCancel: handleCodeCancel,
    close: closeCodeInputModal,
  } = useCodePrompt();

  // WS Message handlers
  const handleMessage = useWsMessageRouter({
    sendData: sendData as SendData,
    handleBucketUpdate: handleBucketUpdate,
    setCode,
    promptForCode,
    setOpenFileModal,
    closeCodeInputModal,
  });

  useEffect(() => {
    if (!message) return;
    handleMessage(message);
  }, [message, handleMessage]);

  const filteredDevices = useMemo(
    () =>
      devices
        .filter((d) => d !== name)
        .filter((d) => d.toLowerCase().includes(query.toLowerCase())),
    [devices, name, query]
  );

  const connectionState: "connecting" | "connected" | "error" = connectionFailed
    ? "error"
    : !hasConnected.current
    ? "connecting"
    : "connected";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 text-slate-800">
      {/* soft background blobs */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-24 -left-24 h-96 w-96 rounded-full bg-indigo-200/40 blur-3xl" />
        <div className="absolute -bottom-24 -right-24 h-96 w-96 rounded-full bg-emerald-200/40 blur-3xl" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-20 backdrop-blur supports-[backdrop-filter]:bg-white/60 bg-white/90 border-b border-slate-200">
        <div className="mx-auto max-w-5xl px-4 sm:px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 grid place-items-center rounded-xl bg-slate-900 text-white shadow-sm">
              <HardDrive size={18} />
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-semibold tracking-tight">
                File Share App
              </h1>
              <p className="text-xs text-slate-500 -mt-0.5">
                Simple peer-to-peer transfers
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge state={connectionState} />
            <span className="hidden sm:inline-flex items-center gap-2 rounded-full bg-slate-100 px-3 py-1 text-sm ring-1 ring-slate-200">
              <Wifi className="text-slate-500" size={16} />
              <span className="font-medium">{name}</span>
            </span>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="mx-auto max-w-5xl px-4 sm:px-6 py-8">
        {/* Connection banner / helper text */}
        {connectionState !== "connected" && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-6 rounded-xl border border-slate-200 bg-white/80 p-4 shadow-sm"
          >
            <div className="flex items-start gap-3">
              {connectionState === "connecting" ? (
                <Loader2 className="mt-0.5 animate-spin" />
              ) : (
                <AlertTriangle className="mt-0.5 text-rose-600" />
              )}
              <div>
                <p className="font-medium">
                  {connectionState === "connecting"
                    ? "Connecting to server"
                    : "Unable to connect"}
                </p>
                <p className="text-sm text-slate-600">
                  {connectionState === "connecting"
                    ? "Hold on a moment while we establish a secure WebSocket connection."
                    : "Please refresh the page or check your internet connection, then try again."}
                </p>
              </div>
            </div>
          </motion.div>
        )}

        {/* Receive progress */}
        {recvProgress && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-8 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold">Receiving file…</h2>
              <span className="text-sm tabular-nums text-slate-600">
                {recvProgress.transferred} / {recvProgress.total} bytes
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${recvProgress.percent}%` }}
                className="h-full rounded-full bg-slate-900"
              />
            </div>
            <div className="mt-2 text-right text-sm font-medium">
              {recvProgress.percent.toFixed(1)}%
            </div>
          </motion.div>
        )}

        {/* Devices header */}
        <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-xl font-semibold tracking-tight">Devices</h3>
            <p className="text-sm text-slate-600">
              Select a device to start a transfer.
            </p>
          </div>
          <div className="relative w-full sm:w-80">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              size={18}
            />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search devices…"
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none ring-offset-2 placeholder:text-slate-400 focus:ring-2 focus:ring-slate-400"
            />
          </div>
        </div>

        {/* Devices list */}
        {hasConnected.current && !connectionFailed && (
          <div className="mt-2">
            {filteredDevices.length === 0 ? (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="grid place-items-center h-48 rounded-2xl border border-dashed border-slate-300 bg-white/60"
              >
                <div className="flex flex-col items-center text-center">
                  <WifiOff className="mb-2 text-slate-400" />
                  <p className="font-medium">No devices found</p>
                  <p className="text-sm text-slate-600">
                    Make sure the other device is on the same network and
                    registered.
                  </p>
                </div>
              </motion.div>
            ) : (
              <DeviceCloud devices={filteredDevices} />
            )}
          </div>
        )}
      </main>

      {/* Modals / overlays */}
      <Transition show={code !== undefined} as={Fragment}>
        <CodeModal
          code={code}
          onClose={() => {
            setCode(undefined);
            closeConnection(sendData as SendData);
          }}
        />
      </Transition>

      <Transition show={requireCode} as={Fragment}>
        <CodeInputModal
          onCancel={handleCodeCancel}
          onClose={closeCodeInputModal}
          onSubmit={handleCodeSubmit}
        />
      </Transition>

      <Transition show={openFileModal} as={Fragment}>
        <FileModal
          onClose={(isReceiver) => {
            setOpenFileModal(false);
            closeConnection(sendData as SendData, isReceiver);
          }}
        />
      </Transition>

      <Toast />
    </div>
  );
}

// hook import lives at the top with others
import useCodePrompt from "./hooks/useCodePrompt";
