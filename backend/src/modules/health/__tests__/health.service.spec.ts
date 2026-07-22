import { Logger } from '@nestjs/common';
import { HealthService } from '../health.service';
import type { PrismaService } from '../../../infra/prisma/prisma.service';
import type { RedisService } from '../../../infra/redis/redis.service';

describe('HealthService', () => {
  let prisma: { ping: jest.Mock };
  let redis: { ping: jest.Mock };
  let service: HealthService;

  beforeEach(() => {
    // Health check log lỗi khi dependency down — im lặng để output test sạch.
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);

    prisma = { ping: jest.fn().mockResolvedValue(undefined) };
    redis = { ping: jest.fn().mockResolvedValue('PONG') };
    service = new HealthService(
      prisma as unknown as PrismaService,
      redis as unknown as RedisService,
    );
  });

  describe('liveness', () => {
    it('trả về ok kèm uptime là số nguyên', () => {
      const result = service.liveness();

      expect(result.status).toBe('ok');
      expect(Number.isInteger(result.uptime)).toBe(true);
      expect(result.uptime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('readiness', () => {
    it('trả về ok khi cả DB và Redis đều khoẻ', async () => {
      await expect(service.readiness()).resolves.toEqual({
        status: 'ok',
        db: 'ok',
        redis: 'ok',
      });
    });

    it('trả về degraded khi DB lỗi', async () => {
      prisma.ping.mockRejectedValue(new Error('connection refused'));

      await expect(service.readiness()).resolves.toEqual({
        status: 'degraded',
        db: 'down',
        redis: 'ok',
      });
    });

    it('trả về degraded khi Redis lỗi', async () => {
      redis.ping.mockRejectedValue(new Error('redis down'));

      await expect(service.readiness()).resolves.toEqual({
        status: 'degraded',
        db: 'ok',
        redis: 'down',
      });
    });

    it('coi Redis là down khi ping trả về khác PONG', async () => {
      redis.ping.mockResolvedValue('WEIRD');

      await expect(service.readiness()).resolves.toEqual({
        status: 'degraded',
        db: 'ok',
        redis: 'down',
      });
    });

    it('trả về degraded khi cả hai dependency đều lỗi', async () => {
      prisma.ping.mockRejectedValue(new Error('db down'));
      redis.ping.mockRejectedValue(new Error('redis down'));

      await expect(service.readiness()).resolves.toEqual({
        status: 'degraded',
        db: 'down',
        redis: 'down',
      });
    });
  });
});
