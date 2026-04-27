const pool = require('../config/database');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
require('dotenv').config();

sgMail.setApiKey(process.env.SENDGRID_API_KEY);
const twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

const isCRBusinessHours = () => {
  const now = new Date();
  const crHour = parseInt(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Costa_Rica', hour: 'numeric', hour12: false
  }).format(now));
  return crHour >= 8 && crHour < 19;
};

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const getSettings = async () => {
  const result = await pool.query('SELECT setting_key, setting_value FROM outreach_settings');
  const settings = {};
  result.rows.forEach(r => settings[r.setting_key] = r.setting_value);
  return settings;
};

const updateSetting = async (req, res) => {
  try {
    const { key, value } = req.body;
    await pool.query(
      `UPDATE outreach_settings SET setting_value = $1, updated_at = NOW() WHERE setting_key = $2`,
      [value, key]
    );
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const getSettingsAPI = async (req, res) => {
  try {
    const settings = await getSettings();
    res.json(settings);
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const markContacted = async (req, res) => {
  try {
    const { id, channel } = req.body;
    const colMap = { whatsapp: 'last_whatsapp_at', sms: 'last_sms_at', email: 'last_email_at', call: 'last_call_at' };
    const col = colMap[channel] || 'last_whatsapp_at';
    await pool.query(`
      UPDATE external_leads_pool 
      SET status = 'contacted', ${col} = NOW(),
          outreach_attempts = outreach_attempts + 1,
          total_contacts = total_contacts + 1,
          last_contact_at = NOW()
      WHERE id = $1
    `, [id]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const handleStop = async (req, res) => {
  try {
    const { phone } = req.body;
    await pool.query(`
      UPDATE external_leads_pool 
      SET excluded = true, excluded_reason = 'STOP request', status = 'excluded'
      WHERE phone LIKE $1
    `, [`%${phone.slice(-8)}%`]);
    res.json({ success: true });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const getOutreachStats = async (req, res) => {
  try {
    const total = await pool.query('SELECT COUNT(*) FROM external_leads_pool WHERE excluded = false');
    const contacted = await pool.query('SELECT COUNT(*) FROM external_leads_pool WHERE status = \'contacted\' AND excluded = false');
    const pending = await pool.query('SELECT COUNT(*) FROM external_leads_pool WHERE status = \'new\' AND excluded = false');
    const excluded = await pool.query('SELECT COUNT(*) FROM external_leads_pool WHERE excluded = true');
    const byNiche = await pool.query(`
      SELECT niche, COUNT(*) as total,
        COUNT(CASE WHEN status = 'contacted' THEN 1 END) as contacted,
        COUNT(CASE WHEN status = 'new' THEN 1 END) as pending
      FROM external_leads_pool WHERE excluded = false
      GROUP BY niche ORDER BY niche
    `);
    const todayLog = await pool.query(`
      SELECT channel, COUNT(*) as count 
      FROM outreach_log 
      WHERE sent_at > NOW() - INTERVAL '24 hours'
      GROUP BY channel
    `);
    res.json({
      total: parseInt(total.rows[0].count),
      contacted: parseInt(contacted.rows[0].count),
      pending: parseInt(pending.rows[0].count),
      excluded: parseInt(excluded.rows[0].count),
      by_niche: byNiche.rows,
      today: todayLog.rows
    });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const sendWhatsAppOutreach = async (req, res) => {
  if (!isCRBusinessHours()) return res.status(400).json({ error: 'Fuera de horario. Solo 8am-7pm CR.' });
  try {
    const settings = await getSettings();
    if (settings.whatsapp_active !== 'true') return res.status(400).json({ error: 'WhatsApp outreach desactivado.' });

    const { niche, city, business, limit } = req.body;
    const dailyLimit = parseInt(limit || settings.daily_limit || 50);

    const todayCount = await pool.query(`SELECT COUNT(*) FROM outreach_log WHERE channel = 'whatsapp' AND sent_at > NOW() - INTERVAL '24 hours'`);
    if (parseInt(todayCount.rows[0].count) >= dailyLimit) {
      return res.status(400).json({ error: `Límite diario de ${dailyLimit} mensajes alcanzado.` });
    }

    let query = `SELECT * FROM external_leads_pool WHERE status = 'new' AND excluded = false AND phone IS NOT NULL AND (last_whatsapp_at IS NULL OR last_whatsapp_at < NOW() - INTERVAL '7 days')`;
    const params = [];
    if (niche) { params.push(niche); query += ` AND niche = $${params.length}`; }
    if (city) { params.push(city); query += ` AND city = $${params.length}`; }
    query += ` LIMIT ${dailyLimit}`;

    const prospects = await pool.query(query, params);
    const delayMs = parseInt(settings.delay_ms || 2000);

    const messages = {
      huellitas: `Estimados colegas de {name}, somos Huellitas al Cielo, crematorio certificado de mascotas en San José. 🐾\n\nCremación 0-15kg: ₡40,000 | 16-30kg: ₡59,000\nPlan Preventivo: 18 cuotas ₡4,900\n\n📞 +506 7046 9290\n\nPara no recibir más mensajes responda STOP.`,
      alba_funeraria: `Estimados colegas de {name}, somos Albalumen, crematorio y funeraria en San José, atención 24/7. ⚰️\n\nPaquete Emergencias: ₡350,000+IVA\nPaquete Completo: ₡650,000+IVA\n\n📞 +506 8528 1312\ninfo@albalumen.com\n\nPara no recibir más mensajes responda STOP.`,
      alba_hospital: `Estimados profesionales de {name}, somos Albalumen, crematorio y funeraria en San José, disponibles 24/7. ⚰️\n\nEstamos aquí para apoyarles cuando sus pacientes y familias lo necesiten.\n\n📞 +506 8528 1312\n\nPara no recibir más mensajes responda STOP.`
    };

    const msgKey = business === 'huellitas' ? 'huellitas' : niche === 'funeraria' ? 'alba_funeraria' : 'alba_hospital';

    let sent = 0, failed = 0, skipped = 0;
    res.writeHead(200, { 'Content-Type': 'application/json' });

    for (const prospect of prospects.rows) {
      try {
        if (!isCRBusinessHours()) { skipped++; continue; }
        const cleanPhone = prospect.phone.replace(/\D/g, '');
        const fullPhone = cleanPhone.length === 8 ? `506${cleanPhone}` : cleanPhone;
        const msgText = messages[msgKey].replace('{name}', prospect.business_name);

        const response = await fetch(`https://graph.facebook.com/v18.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ messaging_product: 'whatsapp', to: fullPhone, type: 'text', text: { body: msgText } })
        });

        if (response.ok) {
          await pool.query(`UPDATE external_leads_pool SET status = 'contacted', last_whatsapp_at = NOW(), outreach_attempts = outreach_attempts + 1, last_contact_at = NOW(), total_contacts = total_contacts + 1 WHERE id = $1`, [prospect.id]);
          await pool.query(`INSERT INTO outreach_log (prospect_id, channel, message_text, status) VALUES ($1, 'whatsapp', $2, 'sent')`, [prospect.id, msgText]);
          sent++;
        } else { failed++; }

        await delay(delayMs + Math.random() * 1000);
      } catch(e) { failed++; }
    }

    res.end(JSON.stringify({ success: true, sent, failed, skipped, total: prospects.rows.length }));
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const sendSMSOutreach = async (req, res) => {
  if (!isCRBusinessHours()) return res.status(400).json({ error: 'Fuera de horario. Solo 8am-7pm CR.' });
  try {
    const settings = await getSettings();
    if (settings.sms_active !== 'true') return res.status(400).json({ error: 'SMS outreach desactivado.' });

    const { niche, business, limit } = req.body;
    const dailyLimit = parseInt(limit || 50);

    const prospects = await pool.query(`
      SELECT * FROM external_leads_pool 
      WHERE status = 'new' AND excluded = false AND phone IS NOT NULL
      AND (last_sms_at IS NULL OR last_sms_at < NOW() - INTERVAL '7 days')
      ${niche ? `AND niche = '${niche}'` : ''}
      LIMIT ${dailyLimit}
    `);

    const delayMs = parseInt(settings.delay_ms || 3000);
    let sent = 0, failed = 0;

    for (const prospect of prospects.rows) {
      try {
        const cleanPhone = prospect.phone.replace(/\D/g, '');
        const fullPhone = `+506${cleanPhone.slice(-8)}`;
        const msgText = business === 'huellitas'
          ? `Huellitas al Cielo: Cremación mascotas San José. 0-15kg ₡40,000. Info: +506 7046 9290. STOP para no recibir.`
          : `Albalumen: Servicios funerarios 24/7 San José. Desde ₡350,000. Info: +506 8528 1312. STOP para no recibir.`;

        await twilioClient.messages.create({
          body: msgText,
          from: process.env.TWILIO_PHONE,
          to: fullPhone
        });

        await pool.query(`UPDATE external_leads_pool SET last_sms_at = NOW(), outreach_attempts = outreach_attempts + 1, last_contact_at = NOW(), total_contacts = total_contacts + 1 WHERE id = $1`, [prospect.id]);
        await pool.query(`INSERT INTO outreach_log (prospect_id, channel, message_text, status) VALUES ($1, 'sms', $2, 'sent')`, [prospect.id, msgText]);
        sent++;
        await delay(delayMs);
      } catch(e) { failed++; console.log('SMS error:', e.message); }
    }

    res.json({ success: true, sent, failed, total: prospects.rows.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const sendEmailOutreach = async (req, res) => {
  if (!isCRBusinessHours()) return res.status(400).json({ error: 'Fuera de horario. Solo 8am-7pm CR.' });
  try {
    const settings = await getSettings();
    if (settings.email_active !== 'true') return res.status(400).json({ error: 'Email outreach desactivado.' });

    const { niche, business, limit } = req.body;
    const dailyLimit = parseInt(limit || 100);

    const prospects = await pool.query(`
      SELECT * FROM external_leads_pool 
      WHERE status = 'new' AND excluded = false AND email IS NOT NULL
      AND (last_email_at IS NULL OR last_email_at < NOW() - INTERVAL '7 days')
      ${niche ? `AND niche = '${niche}'` : ''}
      LIMIT ${dailyLimit}
    `);

    let sent = 0, failed = 0;
    const isHuellitas = business === 'huellitas';

    for (const prospect of prospects.rows) {
      try {
        await sgMail.send({
          to: prospect.email,
          from: { email: process.env.EMAIL_USER, name: isHuellitas ? 'Huellitas al Cielo' : 'Albalumen' },
          subject: isHuellitas ? `Alianza de Servicio — Crematorio Huellitas al Cielo 🐾` : `Servicios Funerarios y de Cremación — Albalumen ⚰️`,
          html: isHuellitas ? `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#FFF9F4;border-radius:12px;">
              <h2 style="color:#C9184A;">🐾 Huellitas al Cielo</h2>
              <p>Estimados colegas de <strong>${prospect.business_name}</strong>,</p>
              <p>Somos <strong>Huellitas al Cielo</strong>, crematorio certificado de mascotas en San José, Costa Rica.</p>
              <h3 style="color:#C9184A;">Nuestros servicios:</h3>
              <ul>
                <li>🐱 Cremación Peluditos (0-15kg): <strong>₡40,000</strong></li>
                <li>🐕 Cremación Huellita (16-30kg): <strong>₡59,000</strong></li>
                <li>📋 Plan Preventivo: 18 cuotas de <strong>₡4,900</strong></li>
                <li>💉 Servicio de Eutanasia disponible</li>
              </ul>
              <p><strong>WhatsApp: +506 7046 9290</strong></p>
              <p style="font-size:11px;color:#888;margin-top:20px;">Para no recibir más mensajes, responda con la palabra STOP.</p>
            </div>` : `
            <div style="font-family:sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#F4F9F6;border-radius:12px;">
              <h2 style="color:#2D6A4F;">⚰️ Albalumen</h2>
              <p>Estimados de <strong>${prospect.business_name}</strong>,</p>
              <p>Somos <strong>Albalumen</strong>, crematorio y funeraria en San José, Costa Rica. Atención 24/7, 365 días.</p>
              <h3 style="color:#2D6A4F;">Nuestros servicios:</h3>
              <ul>
                <li>🕊️ Paquete Emergencias: <strong>₡350,000+IVA</strong></li>
                <li>🕊️ Paquete Completo: <strong>₡650,000+IVA</strong> (cuotas ₡13,000 quincenal)</li>
                <li>⚰️ Sepultura: <strong>₡400,000+IVA</strong></li>
                <li>🏛️ Columbarios: <strong>₡910,000</strong> pago único</li>
              </ul>
              <p><strong>Email: info@albalumen.com | WhatsApp: +506 8528 1312</strong></p>
              <p style="font-size:11px;color:#888;margin-top:20px;">Para no recibir más mensajes, responda con la palabra STOP.</p>
            </div>`
        });

        await pool.query(`UPDATE external_leads_pool SET last_email_at = NOW(), outreach_attempts = outreach_attempts + 1, last_contact_at = NOW(), total_contacts = total_contacts + 1 WHERE id = $1`, [prospect.id]);
        await pool.query(`INSERT INTO outreach_log (prospect_id, channel, message_text, status) VALUES ($1, 'email', $2, 'sent')`, [prospect.id, prospect.email]);
        sent++;
        await delay(500);
      } catch(e) { failed++; console.log('Email error:', e.message); }
    }

    res.json({ success: true, sent, failed, total: prospects.rows.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

const importCSV = async (req, res) => {
  try {
    const { data } = req.body;
    if (!Array.isArray(data)) return res.status(400).json({ error: 'Data debe ser un array' });
    let saved = 0;
    for (const row of data) {
      try {
        await pool.query(`
          INSERT INTO external_leads_pool (business_name, phone, email, city, country, niche, source, status)
          VALUES ($1, $2, $3, $4, $5, $6, 'csv_import', 'new')
          ON CONFLICT (business_name, phone) DO NOTHING
        `, [row.business_name || row.nombre, row.phone || row.telefono, row.email, row.city || row.ciudad, row.country || 'Costa Rica', row.niche || row.categoria]);
        saved++;
      } catch(e) {}
    }
    res.json({ success: true, saved, total: data.length });
  } catch(err) { res.status(500).json({ error: err.message }); }
};

module.exports = { markContacted, handleStop, getOutreachStats, getSettingsAPI, updateSetting, sendWhatsAppOutreach, sendSMSOutreach, sendEmailOutreach, importCSV };