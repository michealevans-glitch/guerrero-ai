const bcrypt = require('bcryptjs');
const { Pool } = require('pg');
require('dotenv').config();

// Connection logic for the script
const pool = new Pool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
});

async function createAdminUsers() {
  try {
    // Create companies table first
    await pool.query(`
      CREATE TABLE IF NOT EXISTS companies (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        niche VARCHAR(100),
        country VARCHAR(100) DEFAULT 'Costa Rica',
        phone VARCHAR(50),
        email VARCHAR(255),
        subscription_plan VARCHAR(50) DEFAULT 'starter',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        company_id INT REFERENCES companies(id),
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL CHECK (role IN ('superadmin', 'owner', 'staff')),
        is_active BOOLEAN DEFAULT true,
        last_login TIMESTAMP,
        created_at TIMESTAMP DEFAULT NOW()
      );
    `);

    // Insert Alba Lumen as first company
    const company = await pool.query(`
      INSERT INTO companies (name, niche, phone, email)
      VALUES ('Alba Lumen / Huellitas al Cielo', 'cremation', 
              '+50685281312', 'albalumen@gmail.com')
      ON CONFLICT DO NOTHING
      RETURNING id;
    `);

    const companyId = company.rows[0]?.id || 1;

    // Hash passwords (the "shredder")
    const superAdminPass = await bcrypt.hash('MichealSuper2024!', 10);
    const ownerPass = await bcrypt.hash('AlbaLumen2024!', 10);
    const staffPass = await bcrypt.hash('Staff2024!', 10);

    // Create Superadmin (Micheal)
    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Micheal Evans', 'micheal@robotalerts.com', $2, 'superadmin')
      ON CONFLICT (email) DO NOTHING;
    `, [companyId, superAdminPass]);

    // Create Owner (Dad)
    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Alba Lumen Owner', 'owner@albalumen.com', $2, 'owner')
      ON CONFLICT (email) DO NOTHING;
    `, [companyId, ownerPass]);

    // Create Sample Staff
    await pool.query(`
      INSERT INTO users (company_id, name, email, password, role)
      VALUES ($1, 'Staff Member', 'staff@albalumen.com', $2, 'staff')
      ON CONFLICT (email) DO NOTHING;
    `, [companyId, staffPass]);

    console.log('✅ Users created successfully!');
    console.log('SUPERADMIN: micheal@robotalerts.com / MichealSuper2024!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

createAdminUsers();