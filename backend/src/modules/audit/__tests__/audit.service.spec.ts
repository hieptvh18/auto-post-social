import { Logger } from '@nestjs/common';
import type { AuditRepository } from '../audit.repository';
import { AuditAction, AuditService } from '../audit.service';

describe('AuditService', () => {
  let repository: { create: jest.Mock };
  let service: AuditService;

  beforeEach(() => {
    repository = { create: jest.fn().mockResolvedValue(undefined) };
    service = new AuditService(repository as unknown as AuditRepository);
  });

  describe('log', () => {
    it('ghi bản ghi audit qua repository', async () => {
      const data = {
        userId: 'u1',
        action: AuditAction.USER_CREATE,
        resource: 'user:u2',
      };

      await service.log(data);

      expect(repository.create).toHaveBeenCalledWith(data);
    });

    it('nuốt lỗi ghi log để không làm hỏng nghiệp vụ chính', async () => {
      const spy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
      repository.create.mockRejectedValue(new Error('DB down'));

      await expect(
        service.log({
          userId: 'u1',
          action: AuditAction.USER_UPDATE,
          resource: 'user:u2',
        }),
      ).resolves.toBeUndefined();
      expect(spy).toHaveBeenCalledWith(expect.stringContaining('DB down'));
    });
  });
});
