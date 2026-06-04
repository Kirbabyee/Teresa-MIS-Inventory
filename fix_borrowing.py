#!/usr/bin/env python3
"""Fix getReturnConditionLabel to use returnCondition from DB for returned items."""
import re

file_path = r'C:\Users\leele\OneDrive\Desktop\Ark\ST TERESA MIS\Teresa-MIS-Inventory\src\pages\Borrowing.jsx'

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Show exact content around line 288 (0-indexed: 287)
lines = content.split('\n')
print("Lines 286-293:")
for i in range(285, 293):
    print(f"  {i+1}: {repr(lines[i])}")

# The old block to replace (lines 288-292, 0-indexed 287-291)
old_lines = lines[287:292]
old_block = '\n'.join(old_lines)
print(f"\nOld block:\n{repr(old_block)}")

new_block = '''\t// If item has been returned, use the explicit return_condition from the DB
\tif (returnedQuantity > 0) {
\t\tconst rc = String(item.returnCondition || "").trim();
\t\tif (rc) {
\t\t\tconst ol = String(operationalLabel || "Working").toLowerCase();
\t\t\tconst ql = String(quarantineLabel || "Defective").toLowerCase();
\t\t\tif (rc.toLowerCase() === ol || rc.toLowerCase() === "working") return operationalLabel || "Working";
\t\t\tif (rc.toLowerCase() === ql || rc.toLowerCase() === "defective") return quarantineLabel || "Defective";
\t\t\treturn rc;
\t\t}
\t\treturn operationalLabel || "Working";
\t}

\t// Not yet returned \\u2014 show the original condition
\tconst rawCondition = getItemConditionRaw(item);
\tif (rawCondition) return rawCondition;

\treturn operationalLabel || "Working";'''

if old_block in content:
    content = content.replace(old_block, new_block)
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print("\nReplacement successful!")
else:
    print("\nOld block not found!")
    # Try to find what's actually there
    idx = content.find("Otherwise show the item")
    if idx >= 0:
        print(f"Found 'Otherwise show' at index {idx}")
        print(f"Context: {repr(content[idx-20:idx+200])}")
