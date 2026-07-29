import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      {/* Backdrop */}
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Panel */}
      <motion.div
        key="panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
      >
        <div
          className="w-full max-w-lg rounded-xl border border-border bg-surface-2 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="modal-title" className="font-semibold">
              {title}
            </h2>
            <button
              onClick={onClose}
              className="text-muted hover:text-white transition-colors"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>
          <div className="p-5">{children}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
