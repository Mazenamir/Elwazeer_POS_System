// scratch/cleanup_test_data.js
// Clean up all transient test fixtures left by audit suites and testing runs

const db = require('../src/server/database/connection');

async function cleanupTestData() {
  console.log('--- STARTING COMPREHENSIVE TEST DATA CLEANUP ---');

  await db.transaction(async (tx) => {
    // 1. Delete test order items
    const delOrderItemsByCustomer = await tx.query(`
      DELETE FROM order_items 
      WHERE order_id IN (
        SELECT id FROM orders 
        WHERE customer_id IN (
          SELECT id FROM customers 
          WHERE name IN ('Sales Test Cust', 'Upcoming Test VIP')
             OR phone IN ('01000000000', '01022222222', '01066666666')
        )
      )
    `);
    console.log(`Deleted ${delOrderItemsByCustomer.rowCount || 0} order items by test customer.`);

    const delOrderItems = await tx.query(`
      DELETE FROM order_items 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      )
    `);
    console.log(`Deleted ${delOrderItems.rowCount || 0} test order items.`);

    // 2. Delete test orders
    const delOrders = await tx.query(`
      DELETE FROM orders 
      WHERE customer_id IN (
        SELECT id FROM customers 
        WHERE name IN ('Sales Test Cust', 'Upcoming Test VIP')
           OR phone IN ('01000000000', '01022222222', '01066666666')
      )
    `);
    console.log(`Deleted ${delOrders.rowCount || 0} test orders.`);

    // 3. Delete test rentals
    const delRentals = await tx.query(`
      DELETE FROM rentals 
      WHERE customer_id IN (
        SELECT id FROM customers 
        WHERE name IN ('Sales Test Cust', 'Upcoming Test VIP')
           OR phone IN ('01000000000', '01022222222', '01066666666')
      )
      OR rental_inventory_id IN (
        SELECT id FROM rental_inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'RENT_DYN_%'
           OR id IN (1010, 1011, 1012)
      )
    `);
    console.log(`Deleted ${delRentals.rowCount || 0} test rentals.`);

    // 4. Delete return items and returns for test products
    await tx.query(`
      DELETE FROM return_items 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      )
    `);

    // 5. Delete stock transfers for test products
    await tx.query(`
      DELETE FROM stock_transfers 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      )
    `);

    // 6. Delete supply records for test products or test suppliers
    const delSupply = await tx.query(`
      DELETE FROM supply_records 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      ) OR supplier_id IN (
        SELECT id FROM suppliers WHERE name = 'Inv Test Supplier'
      )
    `);
    console.log(`Deleted ${delSupply.rowCount || 0} test supply records.`);

    // 7. Delete supplier transactions for test suppliers
    await tx.query(`
      DELETE FROM supplier_transactions 
      WHERE supplier_id IN (
        SELECT id FROM suppliers WHERE name = 'Inv Test Supplier'
      )
    `);

    // 8. Delete inventory sizes & inventory branch stocks
    await tx.query(`
      DELETE FROM inventory_sizes 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      )
    `);

    const delInvBranches = await tx.query(`
      DELETE FROM inventory_branches 
      WHERE inventory_id IN (
        SELECT id FROM inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'TEST_DYN_%'
           OR barcode LIKE '999%'
      )
    `);
    console.log(`Deleted ${delInvBranches.rowCount || 0} test inventory branch rows.`);

    // 9. Delete test inventory items
    const delInv = await tx.query(`
      DELETE FROM inventory 
      WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
         OR name LIKE 'Test Dynamic%' 
         OR category LIKE 'TEST_DYN_%'
         OR barcode LIKE '999%'
    `);
    console.log(`Deleted ${delInv.rowCount || 0} test inventory items.`);

    // 10. Delete rental inventory branches & items
    const delRentBranches = await tx.query(`
      DELETE FROM rental_inventory_branches 
      WHERE rental_inventory_id IN (
        SELECT id FROM rental_inventory 
        WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
           OR name LIKE 'Test Dynamic%' 
           OR category LIKE 'RENT_DYN_%'
           OR id IN (1010, 1011, 1012)
      )
    `);
    console.log(`Deleted ${delRentBranches.rowCount || 0} test rental inventory branch rows.`);

    const delRentInv = await tx.query(`
      DELETE FROM rental_inventory 
      WHERE name LIKE 'بدلة توكسيدو فاخرة للتجربة%' 
         OR name LIKE 'Test Dynamic%' 
         OR category LIKE 'RENT_DYN_%'
         OR id IN (1010, 1011, 1012)
    `);
    console.log(`Deleted ${delRentInv.rowCount || 0} test rental items (including duplicate attempts 1010-1012, keeping 1009).`);

    // 11. Delete test suppliers
    await tx.query(`
      UPDATE inventory 
      SET preferred_supplier_id = NULL 
      WHERE preferred_supplier_id IN (
        SELECT id FROM suppliers WHERE name = 'Inv Test Supplier'
      )
    `);

    const delSups = await tx.query(`
      DELETE FROM suppliers 
      WHERE name = 'Inv Test Supplier'
    `);
    console.log(`Deleted ${delSups.rowCount || 0} test suppliers.`);

    // 12. Delete test customers
    const delCusts = await tx.query(`
      DELETE FROM customers 
      WHERE name IN ('Sales Test Cust', 'Upcoming Test VIP')
         OR phone IN ('01000000000', '01022222222', '01066666666')
    `);
    console.log(`Deleted ${delCusts.rowCount || 0} test customers.`);
  });

  console.log('✅ ALL TEST DATA HAS BEEN COMPLETELY PURGED FROM DATABASE.');
  process.exit(0);
}

cleanupTestData().catch((err) => {
  console.error('❌ Error cleaning test data:', err);
  process.exit(1);
});
