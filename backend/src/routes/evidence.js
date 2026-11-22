import { Router } from 'express';
import multer from 'multer';
import { getDb } from '../config/db.js';
import { processEvidenceImage } from '../services/pythonClient.js';

const router = Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// GET /api/evidence
router.get('/', async (req, res) => {
  const { incident_id, dispatch_id } = req.query;
  const db = getDb();

  if (db.isPostgres) {
    let query = 'SELECT * FROM evidence_uploads';
    const params = [];
    if (incident_id) {
      params.push(incident_id);
      query += ` WHERE incident_id = $${params.length}`;
    } else if (dispatch_id) {
      params.push(dispatch_id);
      query += ` WHERE dispatch_id = $${params.length}`;
    }
    query += ' ORDER BY uploaded_at DESC';
    const { rows } = await db.pool.query(query, params);
    return res.json(rows);
  }

  let list = db.mem.evidence_uploads;
  if (incident_id) list = list.filter(e => e.incident_id === Number(incident_id));
  if (dispatch_id) list = list.filter(e => e.dispatch_id === Number(dispatch_id));
  res.json(list.slice().reverse());
});

// POST /api/evidence/upload
router.post('/upload', upload.single('photo'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }

    const { incident_id, dispatch_id, description } = req.body;

    // Process with OpenCV via Python FastAPI microservice
    const processed = await processEvidenceImage(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    const db = getDb();
    const evidenceRecord = {
      evidence_id: db.isPostgres ? null : db.mem.nextEvidenceId++,
      incident_id: incident_id ? Number(incident_id) : 1,
      dispatch_id: dispatch_id ? Number(dispatch_id) : null,
      file_path: `uploads/${Date.now()}_${req.file.originalname}`,
      thumbnail_path: processed.thumbnail_data ? `data:image/jpeg;base64,${processed.thumbnail_data}` : null,
      width: processed.width,
      height: processed.height,
      file_type: processed.format || req.file.mimetype,
      description: description || 'Field Delivery Evidence Photo',
      uploaded_by: req.user?.email || 'staff',
      uploaded_at: new Date().toISOString()
    };

    if (db.isPostgres) {
      const { rows } = await db.pool.query(`
        INSERT INTO evidence_uploads (incident_id, dispatch_id, file_path, thumbnail_path, width, height, file_type, description, uploaded_by, uploaded_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
        RETURNING *
      `, [evidenceRecord.incident_id, evidenceRecord.dispatch_id, evidenceRecord.file_path, evidenceRecord.thumbnail_path, evidenceRecord.width, evidenceRecord.height, evidenceRecord.file_type, evidenceRecord.description, evidenceRecord.uploaded_by]);
      return res.status(201).json(rows[0]);
    }

    db.mem.evidence_uploads.push(evidenceRecord);
    res.status(201).json(evidenceRecord);
  } catch (err) {
    res.status(500).json({ error: 'Image processing failed', details: err.message });
  }
});

export default router;
