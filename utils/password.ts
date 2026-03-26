import bcrypt from 'bcryptjs';

export const hashPassword = (value: string) => bcrypt.hash(value, 10);

export const comparePassword = (plainText: string, hash: string) => bcrypt.compare(plainText, hash);
