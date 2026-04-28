const createLead = async (req, res) => {
    const { contact_name, phone, service_type, source, business, category, registered_by } = req.body;
    try {
        const result = await pool.query(
            `INSERT INTO leads 
            (name, phone, service_type, source, business, category, status, registered_by, created_at) 
            VALUES ($1, $2, $3, $4, $5, $6, 'nuevo', $7, NOW()) 
            RETURNING *`,
            [contact_name, phone, service_type, source, business, category, registered_by]
        );
        console.log(`✅ Lead registrado: ${contact_name} para ${business}`);
        res.json(result.rows[0]);
    } catch (err) {
        console.error('❌ Error registrando lead:', err.message);
        res.status(500).json({ error: err.message });
    }
};