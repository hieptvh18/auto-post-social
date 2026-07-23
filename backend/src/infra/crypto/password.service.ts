import { Injectable } from '@nestjs/common';
import * as bcrypt from 'bcrypt';

/** bcrypt cost 12 theo rule 01 §Bảo mật. */
export const BCRYPT_COST = 12;

@Injectable()
export class PasswordService {
  hash(plain: string): Promise<string> {
    return bcrypt.hash(plain, BCRYPT_COST);
  }

  compare(plain: string, hash: string): Promise<boolean> {
    return bcrypt.compare(plain, hash);
  }
}
