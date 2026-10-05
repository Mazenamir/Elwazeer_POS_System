const fs = require('fs');
const content = fs.readFileSync('D:/WORK/new_elwazeer/src/client/src/pages/Employees.jsx', 'utf8');

const iconRegex = /icon=\{([A-Za-z0-9_]+)\}/g;
let match;
const icons = new Set();
while ((match = iconRegex.exec(content)) !== null) {
  icons.add(match[1]);
}
console.log('Icons used in icon={...}:', Array.from(icons));

// Also check <IconName ... /> tags
const jsxTagRegex = /<([A-Z][A-Za-z0-9_]+)/g;
const jsxTags = new Set();
while ((match = jsxTagRegex.exec(content)) !== null) {
  jsxTags.add(match[1]);
}
console.log('JSX Component tags used:', Array.from(jsxTags));

const imports = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]lucide-react['"]/);
if (imports) {
  const imported = new Set(imports[1].split(',').map(s => s.trim()).filter(Boolean));
  console.log('Imported from lucide-react:', Array.from(imported));
  for (const ic of icons) {
    if (!imported.has(ic)) {
      console.log('MISSING ICON IN ICON PROP:', ic);
    }
  }
}
