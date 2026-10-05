const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');

const map = {
  'Alterations.jsx': 'Alterations/Alterations.jsx',
  'Barcodes.jsx': 'Barcodes/Barcodes.jsx',
  'Customers.jsx': 'Customers/Customers.jsx',
  'Dashboard.jsx': 'Dashboard/Dashboard.jsx',
  'Employees.jsx': 'Employees/Employees.jsx',
  'Expenses.jsx': 'Expenses/Expenses.jsx',
  'Login.jsx': 'Auth/Login.jsx',
  'NotFound.jsx': 'NotFound/NotFound.jsx',
  'POS.jsx': 'POS/POS.jsx',
  'RentalInventory.jsx': 'Inventory/RentalInventory.jsx',
  'Rentals.jsx': 'Rentals/Rentals.jsx',
  'Reports.jsx': 'Reports/Reports.jsx',
  'Settings.jsx': 'Settings/Settings.jsx',
  'Suppliers.jsx': 'Suppliers/Suppliers.jsx',
  'Tailoring.jsx': 'Tailoring/Tailoring.jsx',
  'WornProducts.jsx': 'WornProducts/WornProducts.jsx',
};

for (const [srcFile, destRel] of Object.entries(map)) {
  const srcPath = path.join(root, 'src/client/src/pages', srcFile);
  const destPath = path.join(root, 'src/renderer/pages', destRel);
  const destDir = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  let content = fs.readFileSync(srcPath, 'utf8');
  content = content.replace(/from '\.\.\//g, "from '../../");
  fs.writeFileSync(destPath, content, 'utf8');
  console.log(`Migrated: ${srcFile} -> ${destRel}`);
}

console.log('All pages successfully migrated to src/renderer/pages/!');
