import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ProfileController } from '../ProfileController';

// Mock the DI setup
vi.mock('../core/di/setup', () => ({
  getProfileApplicationService: async () => ({
    listProfiles: vi.fn().mockResolvedValue({
      success: true,
      profiles: [{ id: '1', name: 'Test Profile' }],
      totalCount: 1
    }),
    getProfile: vi.fn().mockResolvedValue({
      success: true,
      profile: { id: '1', name: 'Test Profile' }
    }),
    createProfile: vi.fn().mockResolvedValue({
      success: true,
      profileId: 'new-profile-id'
    }),
    updateProfileName: vi.fn().mockResolvedValue({
      success: true
    }),
    deleteProfile: vi.fn().mockResolvedValue({
      success: true
    }),
    searchProfiles: vi.fn().mockResolvedValue({
      success: true,
      profiles: [{ id: '1', name: 'Test Profile' }],
      totalCount: 1
    })
  })
}));

describe('ProfileController', () => {
  let mockRequest: any;
  let mockResponse: any;

  beforeEach(() => {
    mockRequest = {
      params: {},
      query: {},
      body: {}
    };
    
    mockResponse = {
      json: vi.fn(),
      status: vi.fn().mockReturnThis()
    };
  });

  describe('listProfiles', () => {
    it('should return profiles list', async () => {
      mockRequest.query = { page: '1', limit: '10' };
      
      await ProfileController.listProfiles(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profiles: [{ id: '1', name: 'Test Profile' }],
          pagination: {
            page: 1,
            limit: 10,
            totalCount: 1,
            totalPages: 1
          }
        },
        timestamp: expect.any(String)
      });
    });
  });

  describe('getProfile', () => {
    it('should return profile by id', async () => {
      mockRequest.params = { id: '1' };
      
      await ProfileController.getProfile(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { id: '1', name: 'Test Profile' },
        timestamp: expect.any(String)
      });
    });
  });

  describe('createProfile', () => {
    it('should create profile successfully', async () => {
      mockRequest.body = { name: 'New Profile' };
      
      await ProfileController.createProfile(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: { profileId: 'new-profile-id' },
        message: 'Profile created successfully',
        timestamp: expect.any(String)
      });
    });

    it('should return error for invalid name', async () => {
      mockRequest.body = { name: '' };
      
      await ProfileController.createProfile(mockRequest, mockResponse);
      
      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Profile name is required',
        timestamp: expect.any(String)
      });
    });
  });

  describe('updateProfileName', () => {
    it('should update profile name', async () => {
      mockRequest.params = { id: '1' };
      mockRequest.body = { name: 'Updated Name' };
      
      await ProfileController.updateProfileName(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: 'Profile name updated successfully',
        timestamp: expect.any(String)
      });
    });
  });

  describe('deleteProfile', () => {
    it('should delete profile', async () => {
      mockRequest.params = { id: '1' };
      
      await ProfileController.deleteProfile(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: null,
        message: 'Profile deleted successfully',
        timestamp: expect.any(String)
      });
    });
  });

  describe('searchProfiles', () => {
    it('should search profiles', async () => {
      mockRequest.query = { name: 'Test' };
      
      await ProfileController.searchProfiles(mockRequest, mockResponse);
      
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          profiles: [{ id: '1', name: 'Test Profile' }],
          totalCount: 1
        },
        timestamp: expect.any(String)
      });
    });
  });
});