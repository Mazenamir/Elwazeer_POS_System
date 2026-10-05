const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pagesDir = path.join(root, 'src/renderer/pages');

const indexExports = {
  'Dashboard': 'Dashboard',
  'POS': 'POS',
  'Rentals': 'Rentals',
  'Inventory': 'RentalInventory',
  'Alterations': 'Alterations',
  'Tailoring': 'Tailoring',
  'Customers': 'Customers',
  'Suppliers': 'Suppliers',
  'Employees': 'Employees',
  'Expenses': 'Expenses',
  'Reports': 'Reports',
  'Barcodes': 'Barcodes',
  'Settings': 'Settings',
  'WornProducts': 'WornProducts',
  'Auth': 'Login',
  'NotFound': 'NotFound',
  'Setup': 'Setup',
};

for (const [folder, component] of Object.entries(indexExports)) {
  const indexPath = path.join(pagesDir, folder, 'index.js');
  const content = `export { ${component}, default } from './${component}';\n`;
  fs.writeFileSync(indexPath, content, 'utf8');
}

// Write src/renderer/pages/index.js
const masterExports = `export { default as Dashboard } from './Dashboard';
export { default as POS } from './POS';
export { default as Rentals } from './Rentals';
export { default as RentalInventory } from './Inventory';
export { default as Alterations } from './Alterations';
export { default as Tailoring } from './Tailoring';
export { default as Customers } from './Customers';
export { default as Suppliers } from './Suppliers';
export { default as Employees } from './Employees';
export { default as Expenses } from './Expenses';
export { default as Reports } from './Reports';
export { default as Barcodes } from './Barcodes';
export { default as Settings } from './Settings';
export { default as WornProducts } from './WornProducts';
export { default as Login } from './Auth';
export { default as Setup } from './Setup';
export { default as NotFound } from './NotFound';
`;
fs.writeFileSync(path.join(pagesDir, 'index.js'), masterExports, 'utf8');

console.log('All page index files generated successfully!');
