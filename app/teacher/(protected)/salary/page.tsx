"use client";

import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/api";

interface LedgerEntry {
  id: string;
  type: "CHARGE" | "PAYMENT";
  description: string;
  amount: number;
  entryDate: string;
  paymentMethod?: string | null;
  category?: { name: string } | null;
}

interface LedgerData {
  entries: LedgerEntry[];
  totalCharged: number;
  totalPaid: number;
  balance: number;
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  try {
    return new Date(value).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });
  } catch {
    return value;
  }
}

export default function TeacherSalaryPage() {
  const [data, setData] = useState<LedgerData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Financial figures are never cached anywhere in this app — always read live.
  useEffect(() => {
    let alive = true;
    api
      .get("/ledger/staff/me")
      .then((res: any) => {
        if (alive) setData(res);
      })
      .catch((e: any) => {
        if (alive) setError(e?.message || "Failed to load finance data");
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="p-4 md:p-8">
      <div className="mb-8">
        <h1 className="text-3xl mb-2">Salary</h1>
        <p className="text-gray-600">Your pay history and outstanding balance</p>
      </div>

      {loading && <Card className="p-6 text-gray-500">Loading...</Card>}

      {error && (
        <Card className="p-6 text-red-600">
          {/reach database|connect|ECONNREFUSED|ETIMEDOUT/i.test(error)
            ? "Unable to connect to the database. Please try again in a moment."
            : "Failed to load finance data. Please try again."}
        </Card>
      )}

      {!loading && !error && data && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2 md:gap-4">
            <Card className="p-2 md:p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Charged</p>
              <p className="text-xs md:text-xl font-medium text-gray-900">
                {data.totalCharged.toLocaleString()} FCFA
              </p>
            </Card>
            <Card className="p-2 md:p-4">
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Total Paid</p>
              <p className="text-xs md:text-xl font-medium text-green-600">
                {data.totalPaid.toLocaleString()} FCFA
              </p>
            </Card>
            <Card className={`p-2 md:p-4 ${data.balance > 0 ? "bg-red-50 border-red-200" : ""}`}>
              <p className="text-xs text-gray-400 uppercase tracking-wide mb-1">Balance Owed</p>
              <p
                className={`text-xs md:text-xl font-medium ${
                  data.balance > 0 ? "text-red-600" : "text-gray-900"
                }`}
              >
                {data.balance.toLocaleString()} FCFA
              </p>
            </Card>
          </div>

          <Card>
            {data.entries.length === 0 ? (
              <p className="p-6 text-gray-500">No financial records yet.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left text-xs text-gray-500 uppercase tracking-wide">
                      <th className="px-4 py-3 font-medium">Date</th>
                      <th className="px-4 py-3 font-medium">Type</th>
                      <th className="px-4 py-3 font-medium">Category</th>
                      <th className="px-4 py-3 font-medium">Description</th>
                      <th className="px-4 py-3 font-medium text-right">Amount</th>
                      <th className="px-4 py-3 font-medium">Method</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.entries.map((entry) => (
                      <tr key={entry.id} className="border-b last:border-0 hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-600 whitespace-nowrap">
                          {formatDate(entry.entryDate)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                              entry.type === "CHARGE"
                                ? "bg-orange-100 text-orange-700"
                                : "bg-green-100 text-green-700"
                            }`}
                          >
                            {entry.type === "CHARGE" ? "Charge" : "Payment"}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-600">{entry.category?.name ?? "—"}</td>
                        <td className="px-4 py-3 text-gray-900">{entry.description}</td>
                        <td
                          className={`px-4 py-3 text-right font-medium whitespace-nowrap ${
                            entry.type === "CHARGE" ? "text-orange-700" : "text-green-600"
                          }`}
                        >
                          {entry.type === "PAYMENT" ? "+" : ""}
                          {entry.amount.toLocaleString()} FCFA
                        </td>
                        <td className="px-4 py-3 text-gray-500">{entry.paymentMethod ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}
