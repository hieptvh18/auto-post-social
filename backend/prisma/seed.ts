import 'dotenv/config';
import * as bcrypt from 'bcrypt';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, UserRole } from '../generated/prisma/client';

const BCRYPT_COST = 12;

const ADMIN_EMAIL = 'admin@company.local';
const ADMIN_PASSWORD = 'ChangeMe123!';

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
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error('Seed thất bại:', error);
  process.exit(1);
});
