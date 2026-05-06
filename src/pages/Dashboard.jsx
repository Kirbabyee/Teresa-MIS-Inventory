import { useEffect, useState } from "react";
import { Package, Cpu, AlertCircle } from "lucide-react";
import { supabase } from "@/api/supabaseClient";
import { Link } from "react-router-dom";

export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [labs, setLabs] = useState([]);
  const [overall, setOverall] = useState({ total: 0, defective: 0 });
  const [error, setError] = useState("");

  const defectiveRate = overall.total
    ? Math.round((overall.defective / overall.total) * 100)
    : 0;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");

      try {
        // 1. Fetch all laboratories
        const { data: labRows, error: labErr } = await supabase
          .from("lab_numbers")
          .select("id, lab_number, name")
          .order("lab_number", { ascending: true });

        if (labErr) throw labErr;

        if (!labRows || labRows.length === 0) {
          setLabs([]);
          setOverall({ total: 0, defective: 0 });
          setLoading(false);
          return;
        }

        // 2. Fetch ALL components with batching
        let allComponents = [];
        let from = 0;
        const batchSize = 1000;

        while (true) {
          const { data, error } = await supabase
            .from("computers_components")
            .select("computer_number, status, lab_number_id")
            .range(from, from + batchSize - 1);

          if (error) throw error;
          if (!data || data.length === 0) break;

          allComponents = [...allComponents, ...data];
          from += batchSize;

          if (data.length < batchSize) break;
        }

        console.log("<<< FETCH COMPLETE. TOTAL RECORDS:", allComponents.length);

        // 3. Calculate Totals and Group Data
        let totalComponentCount = 0;
        let totalDefectiveCount = 0;
        const grouped = {};

        for (const comp of allComponents) {
          if (!comp.lab_number_id) continue;

          const labId = comp.lab_number_id;
          const computerKey = String(comp.computer_number).trim();

          if (!grouped[labId]) {
            grouped[labId] = {};
          }

          // Initialize PC record if it doesn't exist
          if (!grouped[labId] [computerKey]) {
            grouped[labId] [computerKey] = { 
              pcTotal: 0,
              defectiveComponentCount: 0 
            };
          }

          // Count total components for this PC
          grouped[labId] [computerKey].pcTotal++;
          totalComponentCount++;

          // Normalize status
          const rawStatus = comp.status || "";
          const normalizedStatus = rawStatus.trim().toUpperCase();

          // Check for defect
          const isDef = 
            normalizedStatus.includes("DEFECT") || 
            normalizedStatus === "DEFECTIVE" || 
            normalizedStatus === "DEFECTIVE PC" ||
            normalizedStatus === "BROKEN";

          if (isDef) {
            // Increment global defective row count
            totalDefectiveCount++;
            
            // Increment the specific count for this PC
            grouped[labId] [computerKey].defectiveComponentCount += 1;
          }
        }

        console.log("<<< FINAL TOTAL COMPONENTS (ROWS):", totalComponentCount);
        console.log("<<< FINAL DEFECTIVE COMPONENTS (ROWS):", totalDefectiveCount);

        // 4. Build Lab Summaries
        // NOW: Summing defectiveComponentCount instead of counting unique PCs
        let overallTotal = 0;
        let labSummaries = [];

        labRows.forEach((lab) => {
          const comps = grouped[lab.id] || {};
          const values = Object.values(comps);

          const total = values.length; // Total PCs in this lab
          
          // NEW LOGIC: Sum of all defective components across all PCs in this lab
          const defectiveComponentTotal = values.reduce((sum, pc) => sum + pc.defectiveComponentCount, 0);

          overallTotal += total;

          labSummaries.push({
            id: lab.id,
            label: lab.name || `Laboratory ${lab.lab_number}`,
            total,
            defective: defectiveComponentTotal, // This is now the count of components, not PCs
          });
        });

        console.log("<<< FINAL LABS COUNT:", labSummaries.length);

        if (!cancelled) {
          setLabs(labSummaries);
          setOverall({
            total: overallTotal,
            defective: totalDefectiveCount, 
          });
        }

      } catch (err) {
        console.error("Failed to load dashboard data:", err);
        if (!cancelled) setError(err.message || "Failed to load dashboard data");
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6 p-6">
        <div className="text-center py-12">
          <p className="text-slate-500">Loading dashboard data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 p-6">
      {error && (
        <div className="rounded-md bg-rose-50 p-4 text-sm text-rose-700 border border-rose-100">
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="md:flex md:gap-6">
        <div className="md:w-1/2 space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {/* Total PCs Card */}
            <div className="group rounded-xl bg-gradient-to-r from-white to-slate-50 p-6 shadow-lg border border-transparent hover:shadow-xl transition">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Total PCs</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-900">
                    {overall.total.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Across all labs</p>
                </div>
                <div className="flex flex-col items-center justify-center bg-[#4a1111] rounded-full p-3">
                  <Cpu className="h-6 w-6 text-white" />
                </div>
              </div>
              {overall.total > 0 && (
                <div className="mt-4">
                  <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                    <div 
                      className="h-2 bg-[#4a1111]" 
                      style={{ width: `${Math.min(defectiveRate, 100)}%` }} 
                    />
                  </div>
                  <p className="mt-2 text-xs text-slate-400">Defective rate: {defectiveRate}%</p>
                </div>
              )}
            </div>

            {/* Defective Components Card */}
            <div className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Defective Components</p>
                  <p className="mt-2 text-3xl font-extrabold text-rose-600">
                    {overall.defective.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Total defective parts</p>
                </div>
                <div className="flex flex-col items-center justify-center bg-rose-500 rounded-full p-3">
                  <AlertCircle className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>

            {/* Labs Card */}
            <div className="group rounded-xl bg-white p-6 shadow-lg border border-transparent hover:shadow-xl transition">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-slate-500">Sections/Labs</p>
                  <p className="mt-2 text-3xl font-extrabold text-slate-900">
                    {labs.length.toLocaleString()}
                  </p>
                  <p className="mt-2 text-xs text-slate-400">Active sections</p>
                </div>
                <div className="flex flex-col items-center justify-center bg-slate-700 rounded-full p-3">
                  <Package className="h-6 w-6 text-white" />
                </div>
              </div>
            </div>
          </div>

          {/* Lab Details Table */}
          <div className="overflow-hidden rounded-lg border border-slate-100 bg-white">
            {labs.length === 0 ? (
              <div className="p-8 text-center">
                <Package className="mx-auto h-12 w-12 text-slate-300" />
                <p className="mt-2 text-sm text-slate-500">No laboratories found</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">NAME</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">NUMBER OF PC</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase">DEFECTIVE COMPONENTS</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-slate-200">
                    {labs.map((lab) => (
                      <tr key={lab.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-4 py-3 text-sm">
                          <Link 
                            to={`/inventory/laboratory?labId=${lab.id}`} 
                            className="font-medium text-slate-800 hover:text-slate-600 hover:underline"
                          >
                            {lab.label}
                          </Link>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {lab.total}
                        </td>
                        <td className="px-4 py-3 text-sm font-medium">
                          <span className={lab.defective > 0 ? "text-rose-600" : "text-slate-600"}>
                            {lab.defective}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Right Side Placeholder */}
        <div className="md:w-1/2">
          <div className="h-full rounded-lg border border-dashed border-slate-300 bg-gradient-to-b from-slate-50 to-white p-6 flex items-center justify-center">
            <div className="text-center max-w-sm">
              <Package className="mx-auto h-12 w-12 text-slate-300" />
              <p className="mt-3 text-sm font-medium text-slate-600">Borrowing Management</p>
              <p className="mt-1 text-xs text-slate-400">This feature is currently under development.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}