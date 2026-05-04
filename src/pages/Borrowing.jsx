import { useState } from "react";
import { Link } from "react-router-dom";

export default function Borrowing() {
  const [sortOrder, setSortOrder] = useState("desc");
  const [search, setSearch] = useState("");
  const [showModal, setShowModal] = useState(false);

  const [form, setForm] = useState({
    name: "",
    studentId: "",
    role: "",
  });

  const [data, setData] = useState([
    {
      id: 1,
      name: "Leo Carlo Atay",
      studentId: "20220069-L",
      role: "Student",
      date: "2026-05-29T17:36:00",
      items: [],
    },
  ]);

  // Filter + Sort
  const filteredData = data
    .filter((d) =>
      d.name.toLowerCase().includes(search.toLowerCase())
    )
    .sort((a, b) =>
      sortOrder === "asc"
        ? new Date(a.date) - new Date(b.date)
        : new Date(b.date) - new Date(a.date)
    );

  // Return
  const handleReturn = (id) => {
    setData((prev) => prev.filter((item) => item.id !== id));
  };

  // Handle form input
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Add borrower
  const handleSubmit = () => {
    if (!form.name || !form.studentId || !form.role) return;

    const newEntry = {
      id: Date.now(),
      name: form.name,
      studentId: form.studentId,
      role: form.role,
      date: new Date().toISOString(),
      items: [],
    };

    setData((prev) => [newEntry, ...prev]);
    setShowModal(false);
    setForm({ name: "", studentId: "", role: "" });
  };

  return (
    <div className="min-h-screen bg-slate-100 py-10 px-6">
      <div className="max-w-6xl mx-auto">

        {/* Header */}
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-2xl font-semibold text-slate-800">
            Borrowed Items
          </h1>

          <Link
            to="/login"
            className="text-sm text-slate-500 hover:text-red-500"
          >
            Sign out
          </Link>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-8">
          <button
            onClick={() => setSortOrder("desc")}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              sortOrder === "desc"
                ? "bg-[#4a1111] text-white border-[#4a1111]"
                : "text-[#4a1111] border-[#4a1111] hover:bg-[#4a1111] hover:text-white"
            }`}
          >
            Descending
          </button>

          <button
            onClick={() => setSortOrder("asc")}
            className={`px-4 py-1.5 rounded-full text-sm border transition ${
              sortOrder === "asc"
                ? "bg-[#4a1111] text-white border-[#4a1111]"
                : "text-[#4a1111] border-[#4a1111] hover:bg-[#4a1111] hover:text-white"
            }`}
          >
            Ascending
          </button>

          <input
            type="text"
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 border rounded-full px-4 py-2 text-sm"
          />

          <button
            onClick={() => setShowModal(true)}
            className="bg-[#4a1111] text-white px-5 py-2 rounded-full text-sm hover:opacity-90 transition"
          >
            + Borrow
          </button>
        </div>

        {/* Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {filteredData.map((person) => (
            <div key={person.id}
              className="bg-white border rounded-xl p-5">
              
              <div className="flex justify-between mb-3">
                <div>
                  <h3 className="font-medium">{person.name}</h3>
                  <p className="text-xs text-gray-400">
                    {person.studentId}
                  </p>
                  <p className="text-xs text-gray-400">
                    {person.role}
                  </p>
                </div>

                <button
                  onClick={() => handleReturn(person.id)}
                  className="text-xs border px-3 py-1 rounded"
                >
                  Return
                </button>
              </div>

              <p className="text-xs text-gray-400">
                {new Date(person.date).toLocaleString()}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* MODAL */}
      {showModal && (
  <div className="fixed inset-0 bg-black/30 flex items-center justify-center">
    <div className="bg-white rounded-2xl p-6 w-full max-w-2xl border shadow-md">

      {/* Title */}
      <h2 className="text-xl font-bold mb-6 text-[#4a1111]">
        BORROWER'S INFORMATION
      </h2>

      {/* Form Grid */}
      <div className="grid grid-cols-3 gap-4 items-center">

        <label className="text-sm font-semibold text-[#4a1111]">
          NAME
        </label>
        <input
          name="name"
          placeholder="Enter full name"
          value={form.name}
          onChange={handleChange}
          className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
        />

        <label className="text-sm font-semibold text-[#4a1111]">
          ID NUMBER
        </label>
        <input
          name="studentId"
          placeholder="Enter ID number"
          value={form.studentId}
          onChange={handleChange}
          className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
        />

        <label className="text-sm font-semibold text-[#4a1111]">
          ROLE
        </label>
        <select
          name="role"
          value={form.role}
          onChange={handleChange}
          className="col-span-2 border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4a1111]"
        >
          <option value="">Select role</option>
          <option value="Student">Student</option>
          <option value="Teacher">Teacher</option>
        </select>

      </div>

      {/* Buttons */}
      <div className="flex justify-end gap-4 mt-8">

        <button
          onClick={() => setShowModal(false)}
          className="px-6 py-2 rounded-lg text-sm border border-[#4a1111] text-[#4a1111] hover:bg-[#4a1111] hover:text-white transition"
        >
          CANCEL
        </button>

        <button
          onClick={handleSubmit}
          className="px-6 py-2 rounded-lg text-sm bg-[#4a1111] text-white hover:opacity-90 transition"
        >
          PROCEED
        </button>

      </div>

    </div>
  </div>
)}  
    </div>
  );
}