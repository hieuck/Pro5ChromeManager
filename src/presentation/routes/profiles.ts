import { Router } from 'express';
import { ProfileController } from './ProfileController';

const router = Router();

// Profile routes
router.get('/', ProfileController.listProfiles);
router.post('/', ProfileController.createProfile);
router.get('/search', ProfileController.searchProfiles);
router.get('/:id', ProfileController.getProfile);
router.put('/:id/name', ProfileController.updateProfileName);
router.delete('/:id', ProfileController.deleteProfile);

export default router;