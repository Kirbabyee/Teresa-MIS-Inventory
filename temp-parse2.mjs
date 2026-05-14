import * as parser from "@babel/parser";
const src = "function Test(){ return (<div className=\"x\">Hi</div>); }";
try {
  parser.parse(src, { sourceType: "module", plugins: ["jsx"] });
  console.log("BABEL_OK");
} catch (e) {
  console.error(e.message);
}
