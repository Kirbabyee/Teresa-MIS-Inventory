/**
 * Session Idle Confirmation Modal
 *
 * Shown after a period of user inactivity. Instead of auto-logging out,
 * this modal pauses everything and asks the user to confirm they're still
 * present. No background logout occurs — the session remains fully intact
 * until the user explicitly responds.
 */

import { Clock } from 'lucide-react';

export default function SessionTimeoutModal({ onConfirm }) {
  return (
    <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm z-[9999] flex items-center justify-center animate-in fade-in duration-200">
      <div className="max-w-md w-full bg-white rounded-lg p-6 md:p-8 shadow-2xl border border-slate-100 mx-4 animate-in zoom-in-95 duration-200">

        {/* Brand icon anchor */}
        <div className="flex justify-center mb-5">
          <div className="bg-[#411111]/5 p-4 rounded-lg">
            <Clock className="w-8 h-8 text-[#411111]" strokeWidth={1.8} />
          </div>
        </div>

        {/* Heading */}
        <h2 className="text-xl font-bold text-slate-900 text-center mb-2">
          Are you still there?
        </h2>

        {/* Description */}
        <p className="text-sm text-slate-500 text-center mb-8 leading-relaxed">
          Your session has been idle for a while. Click the button below to
          confirm you're still working and protect your unsaved progress.
        </p>

        {/* Primary action */}
        <button
          onClick={onConfirm}
          className="w-full bg-[#411111] hover:brightness-110 text-white font-medium text-base py-3.5 px-6 rounded-lg transition-all duration-200 shadow-md hover:shadow-lg tracking-wide cursor-pointer"
        >
          Yes, I'm Still Here
        </button>

      </div>
    </div>
  );
}
