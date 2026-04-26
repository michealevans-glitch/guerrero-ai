const pool = require('../config/database');
require('dotenv').config();

const scrapeVeterinarias = async (req, res) => {
  try {
    const { city, country, niche } = req.body;
    const searchQuery = `${niche || 'veterinaria'} en ${city || 'San José'} ${country || 'Costa Rica'}`;
const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    console.log(`🔍 Scraping Google Maps: ${searchQuery}`);

    const searchUrl = `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${encodeURIComponent(searchQuery)}&key=${apiKey}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK') {
      return res.status(400).json({ error: searchData.status, message: searchData.error_message });
    }

    const places = searchData.results;
    let saved = 0;
    let details = [];

    for (const place of places) {
      try {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}&fields=name,formatted_phone_number,website,formatted_address,rating,user_ratings_total&key=${apiKey}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        const detail = detailData.result || {};

        const business = {
          business_name: place.name,
          phone: detail.formatted_phone_number || null,
          website: detail.website || null,
          address: detail.formatted_address || place.formatted_address || null,
          city: city || 'San José',
          country: country || 'Costa Rica',
          niche: niche || 'veterinaria',
          google_rating: place.rating || null,
          google_reviews: place.user_ratings_total || null
        };

        details.push(business);

        await pool.query(
          `INSERT INTO external_leads_pool 
          (business_name, phone, website, address, city, country, niche, google_rating, google_reviews, source, status)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'google_maps', 'new')
          ON CONFLICT (business_name, phone) DO NOTHING`,
          [
            business.business_name, business.phone, business.website,
            business.address, business.city, business.country,
            business.niche, business.google_rating, business.google_reviews
          ]
        );
        saved++;
      } catch(itemErr) {
        console.log('Skipping place:', place.name, itemErr.message);
      }
    }

    console.log(`✅ Scraped ${places.length} places, saved ${saved}`);
    res.json({ success: true, total_found: places.length, saved, results: details });

  } catch (err) {
    console.error('❌ Scraper error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const scrapePaginasAmarillas = async (req, res) => {
  try {
    const { niche, provincia } = req.body;
    const searchTerm = niche || 'veterinaria';
    const location = provincia || 'san-jose';

    console.log(`🔍 Scraping Páginas Amarillas: ${searchTerm} en ${location}`);

    const url = `https://www.paginasamarillas.cr/search/${encodeURIComponent(searchTerm)}?where=${encodeURIComponent(location)}`;
    
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-CR,es;q=0.9,en;q=0.8'
      }
    });

    const html = await response.text();
    
    const results = [];
    const businessPattern = /<h2[^>]*class="[^"]*business-name[^"]*"[^>]*>(.*?)<\/h2>/gs;
    const phonePattern = /tel:(\+?[0-9\s\-]{7,15})/g;
    const emailPattern = /href="mailto:([^"]+)"/g;
    const websitePattern = /href="(https?:\/\/(?!www\.paginasamarillas)[^"]+)"/g;

    let businessMatches = [...html.matchAll(businessPattern)];
    let phoneMatches = [...html.matchAll(phonePattern)];
    let emailMatches = [...html.matchAll(emailPattern)];

    let saved = 0;

    for (let i = 0; i < Math.min(businessMatches.length, 20); i++) {
      const business = {
        business_name: businessMatches[i][1].replace(/<[^>]*>/g, '').trim(),
        phone: phoneMatches[i] ? phoneMatches[i][1].trim() : null,
        email: emailMatches[i] ? emailMatches[i][1] : null,
        city: location,
        country: 'Costa Rica',
        niche: searchTerm,
        source: 'paginas_amarillas',
        status: 'new'
      };

      if (business.business_name) {
        results.push(business);
        try {
          await pool.query(
            `INSERT INTO external_leads_pool 
            (business_name, phone, email, city, country, niche, source, status)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            ON CONFLICT (business_name, phone) DO NOTHING`,
            [business.business_name, business.phone, business.email,
             business.city, business.country, business.niche,
             business.source, business.status]
          );
          saved++;
        } catch(dbErr) {
          console.log('DB skip:', dbErr.message);
        }
      }
    }

    console.log(`✅ Páginas Amarillas: found ${results.length}, saved ${saved}`);
    res.json({ success: true, total_found: results.length, saved, results });

  } catch (err) {
    console.error('❌ Páginas Amarillas error:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const getProspects = async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT * FROM external_leads_pool
      ORDER BY google_rating DESC NULLS LAST, created_at DESC
      LIMIT 200
    `);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { scrapeVeterinarias, scrapePaginasAmarillas, getProspects };