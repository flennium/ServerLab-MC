import type { ReactNode } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X } from "lucide-react";
import { IconButton } from "./Button.js";

interface ModalProps {
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: ModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        aria-hidden="true"
      />

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
          className="max-h-[92vh] w-full max-w-3xl overflow-hidden rounded-lg border border-border bg-panel shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="flex items-center justify-between border-b border-border px-5 py-4">
            <h2 id="modal-title" className="font-display font-semibold">
              {title}
            </h2>
            <IconButton icon={X} label="Close modal" onClick={onClose} />
          </div>
          <div className="max-h-[calc(92vh-4rem)] overflow-y-auto p-5">{children}</div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
