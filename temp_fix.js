const fs = require('fs');
const filePath = 'src/pages/Borrowing.jsx';
let content = fs.readFileSync(filePath, 'utf8');

// Show the exact bytes around line 288
const lines = content.split('\n');
for (let i = 286; i < 294; i++) {
  console.log((i+1) + ': ' + JSON.stringify(lines[i]));
}

// Replace the old block with the new one
const oldBlock = lines[287] + '\n' + lines[288] + '\n' + lines[289] + '\n\n' + lines[290] + '\n' + lines[291];
const newBlock = `  // If item has been returned, use the explicit return_condition from the DB
  if (returnedQuantity > 0) {
    const rc = String(item.returnCondition || "").trim();
    if (rc) {
      const ol = String(operationalLabel || "Working").toLowerCase();
      const ql = String(quarantineLabel || "Defective").toLowerCase();
      if (rc.toLowerCase() === ol || rc.toLowerCase() === "working") return operationalLabel || "Working";
      if (rc.toLowerCase() === ql || rc.toLowerCase() === "defective") return quarantineLabel || "Defective";
      return rc;
    }
    return operationalLabel || "Working";
  }

  // Not yet returned — show the original condition
  const rawCondition = getItemConditionRaw(item);
  if (rawCondition) return rawCondition;

  return operationalLabel || "Working";`;

if (content.includes(oldBlock)) {
  content = content.replace(oldBlock, newBlock);
  fs.writeFileSync(filePath, content, 'utf8');
  console.log('Replacement successful!');
} else {
  console.log('Old block not found. Trying alternative approach...');
  // Try to find and replace using a regex approach
  const regex = /\/\/ Otherwise show the item's actual condition\/remarks value\n\s+const rawCondition = getItemConditionRaw\(item\);\n\s+if \(rawCondition\) return rawCondition;\n\n\s+return operationalLabel \|\| "Working";/;
  if (regex.test(content)) {
    content = content.replace(regex, newBlock);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('Regex replacement successful!');
  } else {
    console.log('Regex also failed. Exact content around line 288:');
    console.log(JSON.stringify(content.substring(content.indexOf('Otherwise show'), content.indexOf('Otherwise show') + 200)));
  }
}
