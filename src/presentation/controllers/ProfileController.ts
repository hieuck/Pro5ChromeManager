import { Request, Response } from 'express';
import { getProfileApplicationService } from '../../core/di/setup';

// API Response helpers
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  message?: string;
  timestamp: string;
}

function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return {
    success: true,
    data,
    message,
    timestamp: new Date().toISOString()
  };
}

function errorResponse(message: string, statusCode: number = 400): ApiResponse<never> {
  return {
    success: false,
    message,
    timestamp: new Date().toISOString()
  };
}

// Profile API Controller
export class ProfileController {
  // GET /api/profiles
  static async listProfiles(req: Request, res: Response) {
    try {
      const page = parseInt(req.query.page as string) || 1;
      const limit = parseInt(req.query.limit as string) || 50;
      
      const service = await getProfileApplicationService();
      const result = await service.listProfiles(page, limit);
      
      if (result.success) {
        res.json(successResponse({
          profiles: result.profiles,
          pagination: {
            page,
            limit,
            totalCount: result.totalCount,
            totalPages: Math.ceil(result.totalCount / limit)
          }
        }));
      } else {
        res.status(400).json(errorResponse(result.message || 'Failed to list profiles'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // GET /api/profiles/:id
  static async getProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const service = await getProfileApplicationService();
      const result = await service.getProfile(id);
      
      if (result.success) {
        res.json(successResponse(result.profile));
      } else {
        res.status(404).json(errorResponse(result.message || 'Profile not found'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // POST /api/profiles
  static async createProfile(req: Request, res: Response) {
    try {
      const { name, groupId, ownerId, tags, extensionIds } = req.body;
      
      // Basic validation
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json(errorResponse('Profile name is required'));
      }
      
      const service = await getProfileApplicationService();
      const result = await service.createProfile({
        name: name.trim(),
        groupId,
        ownerId,
        tags,
        extensionIds
      });
      
      if (result.success) {
        res.status(201).json(successResponse(
          { profileId: result.profileId },
          'Profile created successfully'
        ));
      } else {
        res.status(400).json(errorResponse(result.message || 'Failed to create profile'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // PUT /api/profiles/:id/name
  static async updateProfileName(req: Request, res: Response) {
    try {
      const { id } = req.params;
      const { name } = req.body;
      
      if (!name || typeof name !== 'string' || name.trim().length === 0) {
        return res.status(400).json(errorResponse('Profile name is required'));
      }
      
      const service = await getProfileApplicationService();
      const result = await service.updateProfileName(id, name.trim());
      
      if (result.success) {
        res.json(successResponse(null, 'Profile name updated successfully'));
      } else {
        res.status(400).json(errorResponse(result.message || 'Failed to update profile name'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // DELETE /api/profiles/:id
  static async deleteProfile(req: Request, res: Response) {
    try {
      const { id } = req.params;
      
      const service = await getProfileApplicationService();
      const result = await service.deleteProfile(id);
      
      if (result.success) {
        res.json(successResponse(null, 'Profile deleted successfully'));
      } else {
        res.status(400).json(errorResponse(result.message || 'Failed to delete profile'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }

  // GET /api/profiles/search
  static async searchProfiles(req: Request, res: Response) {
    try {
      const { name, groupId, tags } = req.query;
      
      const service = await getProfileApplicationService();
      const result = await service.searchProfiles({
        name: name as string,
        groupId: groupId as string,
        tags: tags ? (Array.isArray(tags) ? tags : [tags]) as string[] : undefined
      });
      
      if (result.success) {
        res.json(successResponse({
          profiles: result.profiles,
          totalCount: result.totalCount
        }));
      } else {
        res.status(400).json(errorResponse(result.message || 'Failed to search profiles'));
      }
    } catch (error) {
      res.status(500).json(errorResponse('Internal server error'));
    }
  }
}