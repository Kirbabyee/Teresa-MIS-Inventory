import * as parser from "@babel/parser";
const src = `
const existingColumns = [];
const form = { subColumns: [] };
const existingFieldsLibrary = useMemo(() => {
  const fields = new Map();
  existingColumns.forEach((col) => {
    if (Array.isArray(col.subColumns)) {
      col.subColumns.forEach((sc) => {
        if (sc.key && sc.label) fields.set(sc.key, sc);
      });
    }
  });
  return Array.from(fields.values()).filter((f) => !form.subColumns.some((sc) => sc.key === f.key));
}, [existingColumns, form.subColumns]);

function Test() {
  return (
    <div className="x">Hi</div>
  );
}
`;
try {
  parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
  console.log("OK");
} catch (e) {
  console.error(e.message);
  console.error(e.loc);
}
