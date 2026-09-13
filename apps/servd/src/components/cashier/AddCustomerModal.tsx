"use client";

import { AddCustomerForm } from "@/components/customers/AddCustomerForm";

/** Cashier modal to add a walk-in customer by name + phone. */
export function AddCustomerModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-tile bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-lg font-bold">Add customer</h2>
          <button onClick={onClose} className="text-plum-ink/40 hover:text-plum-ink">
            ✕
          </button>
        </div>
        <p className="mb-3 text-sm text-plum-ink/50">
          Saves the customer to your book and enrolls them in rewards.
        </p>
        <AddCustomerForm compact />
      </div>
    </div>
  );
}
