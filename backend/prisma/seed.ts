import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '../generated/prisma/client';

const BCRYPT_COST = 12;

const ADMIN_EMAIL = 'admin@company.local';
const ADMIN_PASSWORD = 'ChangeMe123!';

/**
 * Plan 26 §3.5 — tạo THÊM một user SUPER_ADMIN, không nâng cấp admin sẵn có.
 * Giữ admin cũ nguyên role để còn kiểm chứng "ADMIN sau plan 26 làm được đúng
 * như trước" và để test phân quyền có đủ 2 vai đối chiếu.
 */
async function seedSuperAdmin(prisma: PrismaClient): Promise<void> {
  const email = process.env.SEED_SUPER_ADMIN_EMAIL;
  const password = process.env.SEED_SUPER_ADMIN_PASSWORD;
  const name = process.env.SEED_SUPER_ADMIN_NAME ?? 'Super Admin';

  if (!email || !password) {
    // Dừng có thông báo rõ, KHÔNG tạo user với mật khẩu mặc định kiểu 'admin123'.
    throw new Error(
      'Thiếu SEED_SUPER_ADMIN_EMAIL hoặc SEED_SUPER_ADMIN_PASSWORD — ' +
        'đặt 2 biến này trong backend/.env rồi chạy lại seed.',
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing !== null) {
    // Idempotent: chạy seed lần 2 KHÔNG ghi đè mật khẩu người ta đã đổi.
    console.log(
      `SUPER_ADMIN đã tồn tại: ${existing.email} (role: ${existing.role}) — bỏ qua.`,
    );
    return;
  }

  const created = await prisma.user.create({
    data: {
      name,
      email,
      passwordHash: await bcrypt.hash(password, BCRYPT_COST),
      role: UserRole.SUPER_ADMIN,
    },
  });

  // KHÔNG log mật khẩu (rule 01 §Bảo mật).
  console.log(`Seed xong SUPER_ADMIN: ${created.email} (role: ${created.role})`);
  console.log('ĐỔI MẬT KHẨU NGAY sau lần đăng nhập đầu tiên.');
}

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Thiếu DATABASE_URL');

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  try {
    const admin = await prisma.user.upsert({
      where: { email: ADMIN_EMAIL },
      update: {},
      create: {
        name: 'System Admin',
        email: ADMIN_EMAIL,
        passwordHash: await bcrypt.hash(ADMIN_PASSWORD, BCRYPT_COST),
        role: UserRole.ADMIN,
      },
    });

    console.log(`Seed xong admin: ${admin.email} (mật khẩu mặc định: ${ADMIN_PASSWORD})`);
    console.log('ĐỔI MẬT KHẨU NGAY sau lần đăng nhập đầu tiên.');

    await seedSuperAdmin(prisma);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed thất bại:', error);
  process.exit(1);
});
