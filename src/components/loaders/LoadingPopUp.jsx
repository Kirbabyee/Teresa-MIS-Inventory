import React from "react";
import { motion, AnimatePresence } from "framer-motion";

export const LoadingPopup = ({
  show,
  message = "Loading...",
  color = "#ffffff",
}) => {
  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/70 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col items-center gap-3 text-center">
            <div
              className="h-14 w-14 animate-spin rounded-full border-4 border-white/20 border-t-white"
              style={{ borderTopColor: color }}
              role="status"
              aria-label="loading"
            />

            <p className="text-[1.2rem] font-bold text-white">
              {message}
            </p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};