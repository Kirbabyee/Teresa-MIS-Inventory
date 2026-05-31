import * as icons from 'lucide-react';

const checks = [
  'CheckCircle', 'FolderOpen', 'Columns2', 'LayoutTemplate',
  'FileText', 'Check', 'Edit', 'Plus', 'Trash2', 'X',
  'CircleCheck', 'LayoutGrid', 'Columns', 'FolderCheck', 'File'
];

for (const name of checks) {
  const val = icons[name];
  const isFn = typeof val === 'function';
  const isObj = typeof val === 'object' && val !== null;
  const isReact = isObj && val.$$typeof != null;
  console.log(`${name}: type=${typeof val} function=${isFn} object=${isObj} react=${isReact}`);
}
