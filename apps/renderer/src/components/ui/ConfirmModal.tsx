import { motion, AnimatePresence } from "framer-motion";

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
          className="w-full max-w-sm rounded-xl border border-border bg-surface-2 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="px-5 pt-5 pb-4">
            <h2 id="confirm-title" className="font-semibold">
              {title}
            </h2>
            <p id="confirm-desc" className="mt-2 text-sm text-muted leading-relaxed">
              {message}
            </p>
          </div>
          <div className="flex justify-end gap-2 border-t border-border px-5 py-3">
            <button
              onClick={onCancel}
              className="rounded bg-surface-3 px-4 py-2 text-sm font-medium hover:bg-border transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={onConfirm}
              className={`rounded px-4 py-2 text-sm font-medium text-white transition-colors ${
                danger
                  ? "bg-danger hover:bg-red-600"
                  : "bg-accent hover:bg-accent-hover"
              }`}
            >
              {confirmLabel}
            </button>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
