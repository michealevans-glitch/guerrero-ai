// ============================================================
// PATCH para leadController.js
// BUSCA la función sendMessage y REEMPLÁZALA con esta versión
// El error "column message_type does not exist" venía de aquí
// ============================================================

// REEMPLAZA tu función sendMessage existente con esta:
exports.sendMessage = async (req, res) => {
  try {
    const { lead_id, message, sent_by } = req.body;

    if (!lead_id || !message) {
      return res.status(400).json({ error: 'lead_id y message son requeridos' });
    }

    let msgRow;

    // Intento 1: columna "body"
    try {
      const r = await pool.query(
        `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
         VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
        [lead_id, message, sent_by || 'sistema']
      );
      msgRow = r.rows[0];
    } catch (e1) {
      // Intento 2: columna "message"
      try {
        const r = await pool.query(
          `INSERT INTO messages (lead_id, message, sent_by, direction, created_at)
           VALUES ($1, $2, $3, 'outgoing', NOW()) RETURNING *`,
          [lead_id, message, sent_by || 'sistema']
        );
        msgRow = r.rows[0];
      } catch (e2) {
        throw new Error(`No se pudo insertar mensaje: ${e2.message}`);
      }
    }

    // Actualizar last_message en lead
    await pool.query(
      `UPDATE leads SET last_message = $1, updated_at = NOW() WHERE id = $2`,
      [message.substring(0, 255), lead_id]
    ).catch(() => {});

    return res.json({ success: true, message: msgRow });
  } catch (err) {
    console.error('[sendMessage]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ============================================================
// REEMPLAZA también markLost con esta versión
// Para que status quede como 'cerrado' y entre a lista Cerrados
// ============================================================
exports.markLost = async (req, res) => {
  try {
    const id = req.params.id || req.params.leadId;
    const { reason_lost, closed_by, status } = req.body;

    const { rows } = await pool.query(
      `UPDATE leads
       SET status = 'cerrado',
           reason_lost = $1,
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [reason_lost || 'Sin razón', id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

    // Log en mensajes
    await pool.query(
      `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
       VALUES ($1, $2, 'sistema', 'system', NOW())`,
      [id, `Marcado como perdido — Razón: ${reason_lost}. Por: ${closed_by || 'sistema'}`]
    ).catch(() => {});

    return res.json({ success: true, lead: rows[0] });
  } catch (err) {
    console.error('[markLost]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ============================================================
// REEMPLAZA claimLead con esta versión
// ============================================================
exports.claimLead = async (req, res) => {
  try {
    const id = req.params.id || req.params.leadId;
    const { staff_name } = req.body;

    if (!staff_name) return res.status(400).json({ error: 'staff_name requerido' });

    const { rows } = await pool.query(
      `UPDATE leads
       SET claimed_by = $1,
           assigned_to = $1,
           status = 'activo',
           updated_at = NOW()
       WHERE id = $2
       RETURNING *`,
      [staff_name, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

    return res.json({ success: true, lead: rows[0] });
  } catch (err) {
    console.error('[claimLead]', err.message);
    return res.status(500).json({ error: err.message });
  }
};

// ============================================================
// REEMPLAZA transferLead con esta versión
// ============================================================
exports.transferLead = async (req, res) => {
  try {
    const id = req.params.id || req.params.leadId;
    const { transferred_to, transferred_by, note, assigned_to } = req.body;

    if (!transferred_to) return res.status(400).json({ error: 'transferred_to requerido' });

    const { rows } = await pool.query(
      `UPDATE leads
       SET transferred_to = $1,
           assigned_to = $2,
           updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [transferred_to, assigned_to || transferred_to, id]
    );

    if (!rows.length) return res.status(404).json({ error: 'Lead no encontrado' });

    const noteText = note ? ` — ${note}` : '';
    await pool.query(
      `INSERT INTO messages (lead_id, body, sent_by, direction, created_at)
       VALUES ($1, $2, 'sistema', 'system', NOW())`,
      [id, `Transferido a ${transferred_to} por ${transferred_by || 'admin'}${noteText}`]
    ).catch(() => {});

    return res.json({ success: true, lead: rows[0], transferred_to });
  } catch (err) {
    console.error('[transferLead]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
