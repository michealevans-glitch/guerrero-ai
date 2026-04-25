Recibido. El error del "niche" es simple — el createAdmin.js viejo todavía tiene esa columna. Reemplazá el archivo completo.
Abrí scripts\createAdmin.js, seleccioná todo Ctrl+A, borrá y pegá esto:
javascriptconst bcrypt = require('bcryptjs');
const pool = require('../config/database');

async function createAdminUsers() {
  try {
    // Verify exact columns in companies table
    const cols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'companies'
    `);
    console.log('📋 Companies columns:', cols.rows.map(r => r.column_name));

    // Create company using ONLY existing columns
    const company = await pool.query(`
      INSERT INTO companies (name) 
      VALUES ('Alba Lumen / Huellitas al Cielo')
      ON CONFLICT DO NOTHING
      RETURNING id
    `);

    const companyId = company.rows[0]?.id || 1;
    console.log('✅ Company ID:', companyId);

    // Hash passwords
    const superAdminPass = await bcrypt.hash('MichealSuper2024!', 10);
    const ownerPass = await bcrypt.hash('AlbaLumen2024!', 10);
    const staffPass = await bcrypt.hash('Staff2024!', 10);

    // Verify exact columns in users table
    const userCols = await pool.query(`
      SELECT column_name FROM information_schema.columns 
      WHERE table_name = 'users'
    `);
    console.log('📋 Users columns:', userCols.rows.map(r => r.column_name));

    // Create users using ONLY existing columns
    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Micheal Evans', 'micheal@robotalerts.com', $2, 'superadmin')
      ON CONFLICT (email) DO NOTHING
    `, [companyId, superAdminPass]);

    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Alba Lumen Owner', 'owner@albalumen.com', $2, 'owner')
      ON CONFLICT (email) DO NOTHING
    `, [companyId, ownerPass]);

    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Staff Member', 'staff@albalumen.com', $2, 'staff')
      ON CONFLICT (email) DO NOTHING
    `, [companyId, staffPass]);

    console.log('');
    console.log('✅ USERS CREATED SUCCESSFULLY!');
    console.log('================================');
    console.log('SUPERADMIN: micheal@robotalerts.com / MichealSuper2024!');
    console.log('OWNER:      owner@albalumen.com / AlbaLumen2024!');
    console.log('STAFF:      staff@albalumen.com / Staff2024!');
    console.log('================================');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    console.error('Detail:', err.detail);
    process.exit(1);
  }
}

createAdminUsers();