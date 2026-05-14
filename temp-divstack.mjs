import fs from "fs";
const lines = fs.readFileSync("temp-tabmodal.jsx","utf8").split("\n");
const stack=[];
for(let i=0;i<lines.length;i++){
  const line=lines[i];
  let idx=0;
  while(true){
    const open=line.indexOf("<div", idx);
    const close=line.indexOf("</div>", idx);
    if(open===-1 && close===-1) break;
    if(close!==-1 && (open===-1 || close<open)){
      if(stack.length===0){ console.log('extra close at',i+1); break; }
      stack.pop();
      idx=close+6;
    } else if(open!==-1){
      // ignore self-closing <div ... /> if any
      const end = line.indexOf("/>", open);
      if(end!==-1 && end < line.indexOf(">", open)) {
        idx=open+4;
        continue;
      }
      stack.push({line:i+1, text:line.trim()});
      idx=open+4;
    }
  }
}
console.log('stack length',stack.length);
stack.forEach(item=>console.log(item.line, item.text));
