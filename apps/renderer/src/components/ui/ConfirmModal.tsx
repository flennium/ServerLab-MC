import { motion, AnimatePresence } from "framer-motion";
import { Button } from "./Button.js";

interface ConfirmModalProps {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmModal({
  title,
  message,
  confirmLabel = "Confirm",
  danger = false,
  onConfirm,
  onCancel,
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      <motion.div
        key="backdrop"
        className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
        aria-hidden="true"
      />
      <motion.div
        key="panel"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        transition={{ duration: 0.15 }}
      >
        <div
          role="alertdialog"
          aria-modal="true"
          aria-labelledby="confirm-title"
          aria-describedby="confirm-desc"
          className="w-full max-w-sm rounded-lg border border-border bg-panel shadow-2xl"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="px-5 pb-4 pt-5">
            <h2 id="confirm-title" className="font-display font-semibold">
              {title}
            </h2>
            <p id="confirm-desc" className="mt-2 text-sm leading-relaxed text-muted">
              {message}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <Button onClick={onCancel} variant="secondary">
              Cancel
            </Button>
            <Button onClick={onConfirm} variant={danger ? "danger" : "primary"}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
