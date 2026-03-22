import { Router } from 'express';
import { z } from 'zod';
import { licenseManager } from '../managers/LicenseManager';
import { profileManager } from '../managers/ProfileManager';

const router = Router();

// POST /api/license/activate
router.post('/activate', async (req, res) => {
  const schema = z.object({ licenseKey: z.string().min(1) });
  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ success: false, error: 'licenseKey là bắt buộc', details: parsed.error.flatten() });
    return;
  }
  try {
    const profilesUsed = profileManager.listProfiles().length;
    const status = await licenseManager.activate(parsed.data.licenseKey);
    res.json({ success: true, data: status });
  } catch (err) {
    res.status(400).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// POST /api/license/deactivate
router.post('/deactivate', async (_req, res) => {
  try {
    await licenseManager.deactivate();
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, error: err instanceof Error ? err.message : String(err) });
  }
});

// GET /api/license/status
router.get('/status', (_req, res) => {
  const profilesUsed = profileManager.listProfiles().length;
  const status = licenseManager.getStatus(profilesUsed);
  res.json({ success: true, data: status });
});

export default router;
