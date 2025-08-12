import { motion } from "framer-motion";
import { ArrowUpRight } from "lucide-react";
import { useWsStore } from "../stores/useWsStore";
import { useRTCStore } from "../stores/useRTCStore";
import { useIdentityStore } from "../stores/useIdentityStore";

interface DeviceProps {
  deviceName: string;
}

function hash(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h << 5) - h + str.charCodeAt(i);
  return Math.abs(h);
}

function initials(name: string) {
  const parts = name.split(/[-_ ]+/).filter(Boolean);
  const first = parts[0]?.[0] ?? "?";
  const second = parts[1]?.[0] ?? parts[0]?.[1] ?? "";
  return (first + (second ?? "")).toUpperCase();
}

export default function DeviceBubble({ deviceName }: DeviceProps) {
  const { isReady, sendData } = useWsStore();
  const { setPeers, createOffer } = useRTCStore();
  const name = useIdentityStore((s) => s.name);

  const establishConnection = async () => {
    setPeers({ sender: name, receiver: deviceName });
    const offer = await createOffer(deviceName);
    if (sendData && isReady) {
      sendData(
        JSON.stringify({
          type: "offer",
          sdp: offer.sdp,
          sender: name,
          receiver: deviceName,
        })
      );
    }
  };

  const h = hash(deviceName);
  const gradients: [string, string][] = [
    ["#6366f1", "#22d3ee"], // indigo -> cyan
    ["#06b6d4", "#34d399"], // cyan -> emerald
    ["#f97316", "#ef4444"], // orange -> red
    ["#a78bfa", "#60a5fa"], // violet -> blue
    ["#f43f5e", "#f59e0b"], // rose -> amber
  ];
  const [from, to] = gradients[h % gradients.length];

  return (
    <motion.button
      onClick={establishConnection}
      disabled={!isReady}
      whileHover={{ scale: 1.06 }}
      whileTap={{ scale: 0.98 }}
      className={`group flex w-[7.5rem] flex-col items-center text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
        isReady ? "cursor-pointer" : "cursor-not-allowed opacity-60"
      }`}
      aria-label={`Send to ${deviceName}`}
    >
      <span
        className="relative grid h-16 w-16 sm:h-20 sm:w-20 place-items-center rounded-full text-white shadow-md ring-1 ring-white/40"
        style={{ backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }}
      >
        <span className="pointer-events-none select-none text-sm sm:text-base font-semibold drop-shadow-sm">
          {initials(deviceName)}
        </span>
        {/* hover cue */}
        <span className="absolute -right-1 -top-1 grid h-5 w-5 place-items-center rounded-full bg-white/90 text-slate-900 shadow-sm ring-1 ring-white/60 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <ArrowUpRight size={12} />
        </span>
        {/* subtle inner gloss */}
        <span className="pointer-events-none absolute inset-px rounded-full bg-white/10 mix-blend-overlay" />
      </span>

      {/* FULL name below, wraps */}
      <span className="mt-2 max-w-[7.5rem] break-all text-[11px] leading-tight text-slate-700">
        {deviceName}
      </span>
    </motion.button>
  );
}
