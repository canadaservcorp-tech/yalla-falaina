const express = require('express');
const supabase = require('../db');
const router = express.Router();
// Full bilingual catalog (categories + their professions) for the service picker.
router.get('/catalog', async (_req, res) => {
  const { data: cats } = await supabase.from('categories').select('*').order('name_en');
  const { data: profs } = await supabase.from('professions').select('*').order('name_en');
  const byCat = {};
  (profs || []).forEach(p => { (byCat[p.category_id] ||= []).push(p); });
  res.json({ success: true, categories: (cats || []).map(c => ({ ...c, professions: byCat[c.id] || [] })) });
});
module.exports = router;
