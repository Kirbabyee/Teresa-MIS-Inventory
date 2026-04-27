import { useState, useEffect } from "react";
import { backend } from "@/api/backendClient";

export default function FinancialStatements() {
  const [entries, setEntries] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState("income");
  useEffect(() => {
    Promise.all([backend.entities.JournalEntry.list(), backend.entities.Account.list()])
      .then(([j,a])=>{ setEntries(j.filter(e=>e.status==="posted")); setAccounts(a); setLoading(false); });
  }, []);
  const totalRevenue = accounts.filter(a=>a.type==="revenue").length;
  const totalExpense = accounts.filter(a=>a.type==="expense").length;
  const totalAssets = accounts.filter(a=>a.type==="asset").length;
  return (
    <div className="p-6 space-y-5">
      <div><h1 className="text-2xl font-bold text-slate-900">Financial Statements</h1><p className="text-sm text-slate-500 mt-1">Income Statement · Balance Sheet · Cash Flow</p></div>
      <div className="flex gap-2">
        {[["income","Income Statement"],["balance","Balance Sheet"],["cashflow","Cash Flow"]].map(([k,l])=>(
          <button key={k} onClick={()=>setTab(k)} className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab===k?"bg-slate-900 text-white":"bg-white border border-slate-200 text-slate-600 hover:bg-slate-50"}`}>{l}</button>
        ))}
      </div>
      {loading ? <div className="flex justify-center py-16"><div className="w-8 h-8 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"/></div> : (
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm space-y-4">
          {tab==="income" && (
            <>
              <h3 className="font-bold text-slate-900 text-lg border-b pb-3">Income Statement</h3>
              <div className="space-y-2">
                <div className="flex justify-between py-1"><span className="text-slate-600">Revenue Accounts</span><span className="font-semibold">{totalRevenue} accounts configured</span></div>
                <div className="flex justify-between py-1"><span className="text-slate-600">Expense Accounts</span><span className="font-semibold">{totalExpense} accounts configured</span></div>
                <div className="flex justify-between py-1"><span className="text-slate-600">Posted Journal Entries</span><span className="font-semibold">{entries.length}</span></div>
              </div>
              {entries.length===0 && <p className="text-sm text-slate-400 mt-4">Post journal entries and configure accounts in Chart of Accounts to generate full financial statements.</p>}
            </>
          )}
          {tab==="balance" && (
            <>
              <h3 className="font-bold text-slate-900 text-lg border-b pb-3">Balance Sheet</h3>
              <div className="grid grid-cols-2 gap-6">
                <div><p className="font-semibold text-slate-700 mb-2">Assets</p><p className="text-slate-500 text-sm">{totalAssets} asset accounts configured</p></div>
                <div><p className="font-semibold text-slate-700 mb-2">Liabilities & Equity</p><p className="text-slate-500 text-sm">{accounts.filter(a=>["liability","equity"].includes(a.type)).length} accounts configured</p></div>
              </div>
            </>
          )}
          {tab==="cashflow" && (
            <>
              <h3 className="font-bold text-slate-900 text-lg border-b pb-3">Cash Flow Statement</h3>
              <p className="text-sm text-slate-500">Cash flow analysis will be available once journal entries are posted with cash account classifications.</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}