import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

async function main() {
  const categorias = [
    { cod: '01', nombre: 'Jean' },
    { cod: '02', nombre: 'Remera' },
    { cod: '03', nombre: 'Campera' },
  ]
  const tipos = [
    { cod: '01', nombre: 'Manga Corta' },
    { cod: '02', nombre: 'Manga Larga' },
    { cod: '10', nombre: 'Slim' },
  ]
  const clasif = [
    { cod: '12', nombre: 'Hombre' },
    { cod: '21', nombre: 'Mujer' },
  ]

  await prisma.dicCategoria.deleteMany()
  await prisma.dicTipo.deleteMany()
  await prisma.dicClasif.deleteMany()
  await prisma.dicCategoria.createMany({ data: categorias })
  await prisma.dicTipo.createMany({ data: tipos })
  await prisma.dicClasif.createMany({ data: clasif })

  await prisma.maestro.deleteMany()
  await prisma.maestro.createMany({
    data: [
      { sku: 'THJ00406207', descripcion: 'Jean Runden Slim Hombre', categoria_cod: '01', tipo_cod: '10', clasif_cod: '12' },
      { sku: 'ABC123', descripcion: 'Remera Básica MC Mujer', categoria_cod: '02', tipo_cod: '01', clasif_cod: '21' },
      { sku: 'ZZTOP1', descripcion: 'Campera Liviana Hombre', categoria_cod: '03', tipo_cod: '02', clasif_cod: '12' },
    ]
  })

  await prisma.campania.deleteMany()

  const camp1 = await prisma.campania.create({
    data: {
      nombre: 'Campaña Jeans H 2025',
      inicia: new Date('2025-08-01'),
      termina: new Date('2025-08-31'),
      categoria_objetivo_cod: '01',
      clasif_objetivo_cod: '12',
      activa: true
    }
  })

  const camp2 = await prisma.campania.create({
    data: {
      nombre: 'Campaña Remeras',
      inicia: new Date('2025-09-01'),
      termina: new Date('2025-09-30'),
      categoria_objetivo_cod: '02',
      tipo_objetivo_cod: '01',
      activa: false
    }
  })

  const maestro = await prisma.maestro.findMany()
  for (const camp of [camp1, camp2]) {
    await prisma.campaniaMaestro.createMany({
      data: maestro.map(m => ({
        campaniaId: camp.id,
        sku: m.sku,
        descripcion: m.descripcion,
        categoria_cod: m.categoria_cod,
        tipo_cod: m.tipo_cod,
        clasif_cod: m.clasif_cod,
      }))
    })
  }

  console.log('Seed completado')
}

main().catch(e => { console.error(e); process.exit(1) }).finally(async () => prisma.$disconnect())
