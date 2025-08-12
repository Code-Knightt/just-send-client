import { AnimatePresence, motion } from "framer-motion";
import DeviceBubble from "./DeviceBubble";

export function DeviceCloud({ devices }: { devices: string[] }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/70 p-5 shadow-sm">
      <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-x-6 gap-y-8">
        <AnimatePresence mode="popLayout" initial={false}>
          {devices.map((d) => (
            <motion.div
              key={d}
              layout
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.6 }}
              transition={{
                type: "spring",
                stiffness: 700,
                damping: 18,
                mass: 0.6,
              }}
              className="grid place-items-center"
            >
              <DeviceBubble deviceName={d} />
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
