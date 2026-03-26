import { prisma } from '../lib/prisma.js';
import { RoleCode } from '../models/domain.js';
import { hashPassword } from '../utils/password.js';

async function main() {
  const [superAdminRole, managerRole, customerRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: RoleCode.SUPER_ADMIN },
      update: { name: 'Super Admin' },
      create: {
        code: RoleCode.SUPER_ADMIN,
        name: 'Super Admin',
        description: 'Platform owner with cross-tenant access'
      }
    }),
    prisma.role.upsert({
      where: { code: RoleCode.CANTEEN_MANAGER },
      update: { name: 'Canteen Manager' },
      create: {
        code: RoleCode.CANTEEN_MANAGER,
        name: 'Canteen Manager',
        description: 'Manages menu, orders, and QR scanning for a tenant canteen'
      }
    }),
    prisma.role.upsert({
      where: { code: RoleCode.CUSTOMER },
      update: { name: 'Customer' },
      create: {
        code: RoleCode.CUSTOMER,
        name: 'Customer',
        description: 'Student or faculty customer'
      }
    })
  ]);

  const colleges = await Promise.all([
    prisma.college.upsert({
      where: { code: 'ALPHA001' },
      update: {
        name: 'Alpha Engineering College',
        slug: 'alpha-engineering-college',
        contactEmail: 'admin@alpha.edu'
      },
      create: {
        name: 'Alpha Engineering College',
        slug: 'alpha-engineering-college',
        code: 'ALPHA001',
        contactEmail: 'admin@alpha.edu',
        contactPhone: '9000000001',
        address: 'Pune, Maharashtra'
      }
    }),
    prisma.college.upsert({
      where: { code: 'BETA001' },
      update: {
        name: 'Beta Science University',
        slug: 'beta-science-university',
        contactEmail: 'admin@beta.edu'
      },
      create: {
        name: 'Beta Science University',
        slug: 'beta-science-university',
        code: 'BETA001',
        contactEmail: 'admin@beta.edu',
        contactPhone: '9000000002',
        address: 'Mumbai, Maharashtra'
      }
    })
  ]);

  const alphaCollege = colleges[0];
  const betaCollege = colleges[1];

  const [alphaCanteen, betaCanteen] = await Promise.all([
    prisma.canteen.upsert({
      where: {
        tenantId_name: {
          tenantId: alphaCollege.id,
          name: 'Main Canteen'
        }
      },
      update: { location: 'Block A Ground Floor' },
      create: {
        tenantId: alphaCollege.id,
        name: 'Main Canteen',
        location: 'Block A Ground Floor'
      }
    }),
    prisma.canteen.upsert({
      where: {
        tenantId_name: {
          tenantId: betaCollege.id,
          name: 'Central Food Court'
        }
      },
      update: { location: 'Student Plaza' },
      create: {
        tenantId: betaCollege.id,
        name: 'Central Food Court',
        location: 'Student Plaza'
      }
    })
  ]);

  const [superAdmin, alphaManager, betaManager, alphaCustomer, betaCustomer] = await Promise.all([
    prisma.user.upsert({
      where: { email: 'owner@smartcanteen.com' },
      update: {
        fullName: 'Platform Owner',
        phone: '9999999999',
        roleId: superAdminRole.id
      },
      create: {
        email: 'owner@smartcanteen.com',
        passwordHash: await hashPassword('SuperAdmin@123'),
        fullName: 'Platform Owner',
        phone: '9999999999',
        roleId: superAdminRole.id
      }
    }),
    prisma.user.upsert({
      where: { email: 'manager.alpha@smartcanteen.com' },
      update: {
        fullName: 'Alpha Manager',
        phone: '9111111111',
        tenantId: alphaCollege.id,
        roleId: managerRole.id
      },
      create: {
        email: 'manager.alpha@smartcanteen.com',
        passwordHash: await hashPassword('Manager@123'),
        fullName: 'Alpha Manager',
        phone: '9111111111',
        tenantId: alphaCollege.id,
        roleId: managerRole.id
      }
    }),
    prisma.user.upsert({
      where: { email: 'manager.beta@smartcanteen.com' },
      update: {
        fullName: 'Beta Manager',
        phone: '9222222222',
        tenantId: betaCollege.id,
        roleId: managerRole.id
      },
      create: {
        email: 'manager.beta@smartcanteen.com',
        passwordHash: await hashPassword('Manager@123'),
        fullName: 'Beta Manager',
        phone: '9222222222',
        tenantId: betaCollege.id,
        roleId: managerRole.id
      }
    }),
    prisma.user.upsert({
      where: { email: 'student.alpha@smartcanteen.com' },
      update: {
        fullName: 'Alpha Student',
        phone: '9333333333',
        tenantId: alphaCollege.id,
        roleId: customerRole.id
      },
      create: {
        email: 'student.alpha@smartcanteen.com',
        passwordHash: await hashPassword('Customer@123'),
        fullName: 'Alpha Student',
        phone: '9333333333',
        studentFacultyId: 'ALPHA-STU-001',
        yearOfStudy: 3,
        tenantId: alphaCollege.id,
        roleId: customerRole.id
      }
    }),
    prisma.user.upsert({
      where: { email: 'student.beta@smartcanteen.com' },
      update: {
        fullName: 'Beta Faculty',
        phone: '9444444444',
        tenantId: betaCollege.id,
        roleId: customerRole.id
      },
      create: {
        email: 'student.beta@smartcanteen.com',
        passwordHash: await hashPassword('Customer@123'),
        fullName: 'Beta Faculty',
        phone: '9444444444',
        studentFacultyId: 'BETA-FAC-001',
        yearOfStudy: 1,
        tenantId: betaCollege.id,
        roleId: customerRole.id
      }
    })
  ]);

  await Promise.all([
    prisma.managerAssignment.upsert({
      where: {
        tenantId_managerId_canteenId: {
          tenantId: alphaCollege.id,
          managerId: alphaManager.id,
          canteenId: alphaCanteen.id
        }
      },
      update: {},
      create: {
        tenantId: alphaCollege.id,
        managerId: alphaManager.id,
        canteenId: alphaCanteen.id
      }
    }),
    prisma.managerAssignment.upsert({
      where: {
        tenantId_managerId_canteenId: {
          tenantId: betaCollege.id,
          managerId: betaManager.id,
          canteenId: betaCanteen.id
        }
      },
      update: {},
      create: {
        tenantId: betaCollege.id,
        managerId: betaManager.id,
        canteenId: betaCanteen.id
      }
    })
  ]);

  await Promise.all([
    prisma.menuItem.upsert({
      where: {
        tenantId_canteenId_name: {
          tenantId: alphaCollege.id,
          canteenId: alphaCanteen.id,
          name: 'Veg Sandwich'
        }
      },
      update: { priceInPaise: 6000, stockQuantity: 40, isAvailable: true },
      create: {
        tenantId: alphaCollege.id,
        canteenId: alphaCanteen.id,
        name: 'Veg Sandwich',
        description: 'Grilled sandwich with cheese and fresh vegetables',
        category: 'Snacks',
        priceInPaise: 6000,
        stockQuantity: 40,
        isAvailable: true
      }
    }),
    prisma.menuItem.upsert({
      where: {
        tenantId_canteenId_name: {
          tenantId: alphaCollege.id,
          canteenId: alphaCanteen.id,
          name: 'Cold Coffee'
        }
      },
      update: { priceInPaise: 5000, stockQuantity: 50, isAvailable: true },
      create: {
        tenantId: alphaCollege.id,
        canteenId: alphaCanteen.id,
        name: 'Cold Coffee',
        description: 'Chilled coffee shake',
        category: 'Beverages',
        priceInPaise: 5000,
        stockQuantity: 50,
        isAvailable: true
      }
    }),
    prisma.menuItem.upsert({
      where: {
        tenantId_canteenId_name: {
          tenantId: betaCollege.id,
          canteenId: betaCanteen.id,
          name: 'Masala Dosa'
        }
      },
      update: { priceInPaise: 8000, stockQuantity: 30, isAvailable: true },
      create: {
        tenantId: betaCollege.id,
        canteenId: betaCanteen.id,
        name: 'Masala Dosa',
        description: 'Crispy dosa served with chutney and sambar',
        category: 'Breakfast',
        priceInPaise: 8000,
        stockQuantity: 30,
        isAvailable: true
      }
    })
  ]);

  console.log('Seed completed');
  console.log({
    superAdmin: superAdmin.email,
    alphaManager: alphaManager.email,
    betaManager: betaManager.email,
    alphaCustomer: alphaCustomer.email,
    betaCustomer: betaCustomer.email
  });
}

main()
  .catch((error) => {
    console.error('Seed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
