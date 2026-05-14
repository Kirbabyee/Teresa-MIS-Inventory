import * as espree from "espree";
const src = `const existingColumns=[]; const form={subColumns:[]}; const existingFieldsLibrary = useMemo(() => { const fields = new Map(); existingColumns.forEach((col) => { if (Array.isArray(col.subColumns)) { col.subColumns.forEach((sc) => { if (sc.key && sc.label) fields.set(sc.key, sc); }); } }); return Array.from(fields.values()).filter((f) => !form.subColumns.some((sc) => sc.key === f.key)); }, [existingColumns, form.subColumns]); function Test(){ return (<div className="x">Hi</div>); }`;
try {
  espree.parse(src,{ecmaVersion:2024,sourceType:'module',jsx:true});
  console.log('PARSE_OK');
} catch(e) {
  console.error('PARSE_ERROR', e.message);
}
