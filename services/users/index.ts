import { prisma } from '../../lib/prisma.js';

export const userService = {
  getUserByEmail(email: string) {
    return prisma.user.findUnique({
      where: { email },
      include: { role: true }
    });
  },
  getUserById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      include: { role: true }
    });
  }
};
