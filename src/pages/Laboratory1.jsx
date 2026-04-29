import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/api/supabaseClient";

export default function Laboratory1() {
  const tableHeading = [
    "COMPUTER #",
    "MOTHERBOARD",
    "PROCESSOR",
    "MEMORY",
    "SSD",
    "HDD",
    "VIDEO CARD",
    "AVR",
    "MOUSE",
    "POWER SUPPLY",
    "KEYBOARD",
    "MONITOR",
    "OPERATING SYSTEM",
  ];

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const validTypes = new Set(tableHeading.map((heading) => heading.toUpperCase()));

  useEffect(() => {
    const fetchLabComponents = async () => {
      setLoading(true);
      setError("");

      const { data, error: fetchError } = await supabase
        .from("computers_components")
        .select("computer_number, type, brand, description, status")
        .eq("lab_number", 1)
        .order("computer_number", { ascending: true });

      if (fetchError) {
        console.error("Failed to load laboratory components:", fetchError.message);
        setError(fetchError.message || "Failed to load laboratory components.");
        setRows([]);
        setLoading(false);
        return;
      }

      const grouped = Object.values(
        (data || []).reduce((acc, item) => {
          const computerKey = item.computer_number ?? "Unknown";
          if (!acc[computerKey]) {
            acc[computerKey] = { "COMPUTER #": item.computer_number, components: {} };
          }

          const type = item.type?.toString().trim().toUpperCase();
          if (type && validTypes.has(type)) {
            acc[computerKey].components[type] = {
              brand: item.brand || "-",
              description: item.description || "-",
              remarks: item.status || "-",
            };
          } else if (type) {
            console.warn(`Unknown component type ignored: ${type}`);
          }

          return acc;
        }, {}),
      )
        .sort((a, b) => Number(a["COMPUTER #"]) - Number(b["COMPUTER #"]));

      setRows(grouped);
      setLoading(false);
    };

    fetchLabComponents();
  }, []);

  return (
    <div className="h-full overflow-hidden bg-slate-100 p-6 sm:p-10">
      <div className="flex min-h-full flex-col mx-auto max-w-8xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Laboratory 1</h1>
            <p className="text-slate-500 text-sm mt-1">Live component inventory from the database.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to="/laboratory/inventory"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go to Inventory
            </Link>
            <Link
              to="/borrowing"
              className="rounded-md border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Go to Borrowing
            </Link>
          </div>
        </div>

        <div className="mt-6 max-h-[65vh] min-h-0 overflow-x-auto overflow-y-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                {tableHeading.map((heading) => (
                  <th
                    key={heading}
                    scope="col"
                    className="text-center whitespace-nowrap px-4 py-3 text-left text-sm font-semibold text-slate-700"
                  >
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 bg-white">
              {loading ? (
                <tr>
                  <td className="px-4 py-12 text-center" colSpan={tableHeading.length}>
                    <div className="flex flex-col items-center justify-center gap-3">
                      <div className="h-12 w-12 rounded-full border-4 border-slate-200 border-t-slate-700 animate-spin" />
                      <p className="text-sm text-slate-500">Loading components...</p>
                    </div>
                  </td>
                </tr>
              ) : error ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-red-600" colSpan={tableHeading.length}>
                    {error}
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td className="px-4 py-4 text-sm text-slate-500" colSpan={tableHeading.length}>
                    No component records found for Laboratory 1.
                  </td>
                </tr>
              ) : (
                rows.flatMap((row) => {
                  const componentTypes = tableHeading.slice(1);
                  return [
                    ["Brand", "brand"],
                    ["Description", "description"],
                    ["Remarks", "remarks"],
                  ].map(([label, field], rowIndex) => (
                    <tr key={`${row["COMPUTER #"]}-${field}`}> 
                      {rowIndex === 0 && (
                        <td
                          rowSpan={3}
                          className="text-center px-4 py-4 text-sm font-semibold text-slate-900 align-center whitespace-nowrap"
                        >
                          {row["COMPUTER #"]}
                        </td>
                      )}
                      {componentTypes.map((component) => {
                        const componentData = row.components?.[component] || {};
                        const value = componentData[field] || "-";
                        return (
                          <td
                            key={`${row["COMPUTER #"]}-${component}-${field}`}
                            className="px-4 py-4 text-sm text-slate-600"
                          >
                            <div className="text-[10px] uppercase tracking-[0.18em] text-slate-400">
                              {label}
                            </div>
                            <div className="mt-1 font-medium text-slate-900">{value}</div>
                          </td>
                        );
                      })}
                    </tr>
                  ));
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
