const db = require('./src/server/database/connection');

async function main() {
  const orders = await db.query(`
    SELECT id, branch_invoice_number, customer_name, total_amount, status, created_at 
    FROM orders 
    WHERE customer_name ILIKE '%Partial%' 
       OR customer_name ILIKE '%Customer%' 
       OR id IN (630, 631, 632)
    ORDER BY id DESC
  `);
  console.log('--- MATCHING ORDERS ---');
  console.table(orders.rows);

  const last10 = await db.query(`
    SELECT id, branch_invoice_number, customer_name, total_amount, status, created_at 
    FROM orders 
    ORDER BY id DESC 
    LIMIT 15
  `);
  console.log('--- LAST 15 ORDERS ---');
  console.table(last10.rows);

  process.exit(0);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
