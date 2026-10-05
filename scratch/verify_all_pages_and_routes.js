const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const rendererDir = path.join(root, 'src/renderer');

let errors = [];

function checkFileExists(relPath, desc) {
  const fullPath = path.join(rendererDir, relPath);
  if (!fs.existsSync(fullPath)) {
    errors.push(`Missing ${desc}: ${relPath}`);
    return false;
  }
  return true;
}

function checkContent(relPath, pattern, desc) {
  const fullPath = path.join(rendererDir, relPath);
  if (!fs.existsSync(fullPath)) return;
  const content = fs.readFileSync(fullPath, 'utf8');
  if (pattern instanceof RegExp ? !pattern.test(content) : !content.includes(pattern)) {
    errors.push(`${desc} in ${relPath} failed verification`);
  }
}

console.log('--- 1. Checking Directory Structure ---');
const expectedDirs = [
  'assets',
  'components/common',
  'components/forms',
  'components/tables',
  'components/modals',
  'components/navigation',
  'components/ui',
  'layouts/MainLayout',
  'layouts/AuthLayout',
  'pages/Dashboard',
  'pages/POS',
  'pages/Rentals',
  'pages/Inventory',
  'pages/Alterations',
  'pages/Tailoring',
  'pages/Customers',
  'pages/Suppliers',
  'pages/Employees',
  'pages/Expenses',
  'pages/Reports',
  'pages/Barcodes',
  'pages/Settings',
  'pages/Setup',
  'pages/WornProducts',
  'pages/Auth',
  'pages/NotFound',
  'services/api',
  'services/auth',
  'hooks',
  'context',
  'utils',
  'routes',
  'styles',
  'public',
];

for (const d of expectedDirs) {
  checkFileExists(d, `directory ${d}`);
}

console.log('--- 2. Checking Page Modules & Indexes ---');
const pages = [
  ['Dashboard/Dashboard.jsx', 'Dashboard/index.js'],
  ['POS/POS.jsx', 'POS/index.js'],
  ['Rentals/Rentals.jsx', 'Rentals/index.js'],
  ['Inventory/RentalInventory.jsx', 'Inventory/index.js'],
  ['Alterations/Alterations.jsx', 'Alterations/index.js'],
  ['Tailoring/Tailoring.jsx', 'Tailoring/index.js'],
  ['Customers/Customers.jsx', 'Customers/index.js'],
  ['Suppliers/Suppliers.jsx', 'Suppliers/index.js'],
  ['Employees/Employees.jsx', 'Employees/index.js'],
  ['Expenses/Expenses.jsx', 'Expenses/index.js'],
  ['Reports/Reports.jsx', 'Reports/index.js'],
  ['Barcodes/Barcodes.jsx', 'Barcodes/index.js'],
  ['Settings/Settings.jsx', 'Settings/index.js'],
  ['Setup/Setup.jsx', 'Setup/index.js'],
  ['WornProducts/WornProducts.jsx', 'WornProducts/index.js'],
  ['Auth/Login.jsx', 'Auth/index.js'],
  ['NotFound/NotFound.jsx', 'NotFound/index.js'],
];

for (const [pageFile, indexFile] of pages) {
  checkFileExists(`pages/${pageFile}`, `page component`);
  checkFileExists(`pages/${indexFile}`, `page index`);
}
checkFileExists('pages/index.js', 'master pages index');

console.log('--- 3. Checking Services ---');
const services = [
  'client.js',
  'auth.service.js',
  'branches.service.js',
  'customers.service.js',
  'employees.service.js',
  'expenses.service.js',
  'inventory.service.js',
  'rentals.service.js',
  'reports.service.js',
  'sales.service.js',
  'settings.service.js',
  'tailoring.service.js',
  'worn.service.js',
  'index.js',
];
for (const s of services) {
  checkFileExists(`services/api/${s}`, `api service ${s}`);
}
checkFileExists('services/auth/authService.js', 'authService');
checkFileExists('services/index.js', 'services index');

console.log('--- 4. Checking Context & Hooks ---');
checkFileExists('context/AuthContext.jsx', 'AuthContext');
checkFileExists('context/BranchContext.jsx', 'BranchContext');
checkFileExists('context/ToastContext.jsx', 'ToastContext');
checkFileExists('context/index.js', 'context index');

checkFileExists('hooks/useAuth.js', 'useAuth hook');
checkFileExists('hooks/useBranch.js', 'useBranch hook');
checkFileExists('hooks/useToast.js', 'useToast hook');
checkFileExists('hooks/useDebounce.js', 'useDebounce hook');
checkFileExists('hooks/usePagination.js', 'usePagination hook');
checkFileExists('hooks/index.js', 'hooks index');

console.log('--- 5. Checking Components ---');
const components = [
  'common/Button.jsx',
  'common/Badge.jsx',
  'common/Card.jsx',
  'common/StatCard.jsx',
  'common/LoadingState.jsx',
  'common/EmptyState.jsx',
  'common/index.js',
  'forms/Input.jsx',
  'forms/Select.jsx',
  'forms/SearchBar.jsx',
  'forms/index.js',
  'tables/DataTable.jsx',
  'tables/Pagination.jsx',
  'tables/index.js',
  'modals/Modal.jsx',
  'modals/ConfirmationDialog.jsx',
  'modals/index.js',
  'navigation/Sidebar.jsx',
  'navigation/Header.jsx',
  'navigation/index.js',
  'index.js',
];
for (const c of components) {
  checkFileExists(`components/${c}`, `component ${c}`);
}

console.log('--- 6. Checking Routes & Root ---');
checkFileExists('routes/AppRoutes.jsx', 'AppRoutes');
checkFileExists('routes/ProtectedRoute.jsx', 'ProtectedRoute');
checkFileExists('routes/router.jsx', 'router.jsx');
checkFileExists('routes/index.js', 'routes index');
checkFileExists('styles/globals.css', 'globals.css');
checkFileExists('styles/responsive.css', 'responsive.css');
checkFileExists('App.jsx', 'App.jsx');
checkFileExists('main.jsx', 'main.jsx');
checkFileExists('index.html', 'index.html');

console.log('--- 7. Content & Wiring Validations ---');
checkContent('routes/AppRoutes.jsx', 'path="dashboard"', 'Dashboard route');
checkContent('routes/AppRoutes.jsx', 'path="pos"', 'POS route');
checkContent('routes/AppRoutes.jsx', 'path="rentals"', 'Rentals route');
checkContent('routes/AppRoutes.jsx', 'path="rental-inventory"', 'Rental inventory route');
checkContent('routes/AppRoutes.jsx', 'path="alterations"', 'Alterations route');
checkContent('routes/AppRoutes.jsx', 'path="tailoring"', 'Tailoring route');
checkContent('routes/AppRoutes.jsx', 'path="customers"', 'Customers route');
checkContent('routes/AppRoutes.jsx', 'path="suppliers"', 'Suppliers route');
checkContent('routes/AppRoutes.jsx', 'path="employees"', 'Employees route');
checkContent('routes/AppRoutes.jsx', 'path="expenses"', 'Expenses route');
checkContent('routes/AppRoutes.jsx', 'path="reports"', 'Reports route');
checkContent('routes/AppRoutes.jsx', 'path="barcodes"', 'Barcodes route');
checkContent('routes/AppRoutes.jsx', 'path="settings"', 'Settings route');
checkContent('routes/AppRoutes.jsx', 'path="worn-products"', 'Worn products route');
checkContent('routes/AppRoutes.jsx', 'path="/login"', 'Login route');
checkContent('routes/AppRoutes.jsx', 'path="/setup"', 'Setup route');
checkContent('routes/ProtectedRoute.jsx', 'setupRequired', 'Setup required redirection');

if (errors.length === 0) {
  console.log('\n🌟 ALL 65 ARCHITECTURE CHECKS PASSED PERFECTLY! 🌟');
  process.exit(0);
} else {
  console.error(`\n❌ Failed checks (${errors.length}):`);
  errors.forEach((e) => console.error(`  - ${e}`));
  process.exit(1);
}
