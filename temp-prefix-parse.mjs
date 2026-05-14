import * as parser from "@babel/parser";
import fs from "fs";
const src = fs.readFileSync("temp-prefix.jsx","utf8");
try {
  parser.parse(src,{sourceType:"module",plugins:["jsx","optionalChaining","nullishCoalescingOperator"]});
  console.log("PREFIX_OK");
} catch (e) {
  console.error("PREFIX_ERROR", e.message);
  console.error("line", e.loc?.line, "col", e.loc?.column);
}
