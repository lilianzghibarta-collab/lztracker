const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const bcrypt = require('bcrypt');

async function main() {
  const pw = await bcrypt.hash('changeme', 10);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: { email: 'admin@example.com', password: pw, name: 'Admin', role: 'admin' }
  });
  const comp = await prisma.company.upsert({
    where: { name: 'ExampleCo' },
    update: {},
    create: { name: 'ExampleCo', subscriptionUnits: 1, logoUrl: '' }
  });
  console.log('seed done');
}
main().catch(e=>{console.error(e);process.exit(1)}).finally(()=>prisma.$disconnect());
