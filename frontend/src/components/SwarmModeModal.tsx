import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Cpu, X } from "lucide-react";

interface SwarmModeModalProps {
  isOpen: boolean;
  onClose: () => void;
  iframeUrl?: string;
}

const DEFAULT_SWARM_UI_URL =
  import.meta.env.VITE_ECHOSWARM_UI_URL ?? "http://localhost:8000/ui/swarm";

export function SwarmModeModal({
  isOpen,
  onClose,
  iframeUrl = DEFAULT_SWARM_UI_URL,
}: SwarmModeModalProps) {
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen, onClose]);

  return (
    <AnimatePresence>
      {isOpen ? (
        <motion.section
          className="fixed inset-0 z-[200] flex flex-col bg-slate-950/95 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          role="dialog"
          aria-modal="true"
          aria-label="EchoSwarm mission control"
        >
          <div className="flex items-center justify-between border-b border-cyan-500/20 bg-slate-900/95 px-4 py-3 shadow-lg">
            <div className="flex items-center gap-3 text-cyan-200">
              <span className="flex h-8 w-8 items-center justify-center rounded-full border border-cyan-400/35 bg-cyan-400/10">
                <Cpu className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.26em] text-cyan-300/70">
                  Swarm Mode
                </p>
                <h2 className="text-sm font-semibold text-slate-100">
                  EchoSwarm Mission Control
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="rounded-md border border-slate-700 bg-slate-800/85 p-2 text-slate-300 transition hover:border-slate-500 hover:bg-slate-700 hover:text-white"
              aria-label="Close Swarm Mode"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <iframe
            src={iframeUrl}
            className="h-full w-full flex-1 border-0 bg-slate-950"
            title="EchoSwarm Simulation"
            allow="clipboard-write"
          />
        </motion.section>
      ) : null}
    </AnimatePresence>
  );
}
