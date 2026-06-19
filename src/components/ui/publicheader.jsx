import React from "react";

export default function publicHeader() {
    return (
        <header class= "flex items-center justify-between bg and pc -4 px-6 py-4    ">
            <div>
                <img src="/logo.svg" alt="Logo" className="h-8 w-8" />
                <h1 className="text-xl font-bold">MIS Inventory Borrow</h1>
            </div>
            <div className="flex flex-wrap items-center gap-2 xl:justify-end">
            {statusFilter !== "all" && (
              <button
                type="button"
                onClick={() => {
                  setShowModal(true);
                  setActiveStep(1);
                  setBorrowCart([]);
                  setGlobalSearch("");
                  setFormErrors({});
                  setFormError("");
                }}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#4a1111] px-4 text-sm font-medium text-white transition hover:bg-[#5a1717]"
                title="Open borrow modal"
                aria-label="Open borrow modal"
              >
                <span className="text-base leading-none">+</span>
                <span>Borrow</span>
              </button>
                )}
            </div>
        </header>
    )
}
