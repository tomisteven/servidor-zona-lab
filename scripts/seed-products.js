import { copyFile, mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { connectDatabase, disconnectDatabase } from '../src/config/database.js';
import env from '../src/config/env.js';
import { createStoragePaths } from '../src/config/storage.js';
import { createProduct, updateProduct } from '../src/modules/catalog/catalog.service.js';
import { productInputSchema } from '../src/modules/catalog/product.schemas.js';
import { Product } from '../src/modules/catalog/product.model.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SOURCE_DIR = path.join(SERVER_ROOT, 'seeds', 'assets-bolsos');
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp']);

const PRODUCTS = [
  {
    name: 'Bolso Deportivo Club',
    slug: 'bolso-deportivo-club',
    category: 'bolsos-deportivos',
    shortDescription: 'Bolso deportivo amplio con logo bordado para clubes y equipos.',
    description:
      'Bolso de 50 × 28 cm en poliéster 600D, con cierre reforzado, correa ajustable y bolsillo lateral. Ideal para clubes, delegaciones y eventos deportivos. Se personaliza con logo bordado o impreso.',
    features: [
      'Poliéster 600D resistente',
      'Cierre reforzado',
      'Correa ajustable',
      'Bolsillo lateral',
    ],
    minimumQuantity: 12,
    personalizationFee: 4500,
    priceTiers: [
      { minQuantity: 12, maxQuantity: 49, unitPrice: 12500 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 11200 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 9800 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 500 },
      { label: 'Rojo', additionalUnitPrice: 500 },
      { label: 'Verde', additionalUnitPrice: 500 },
    ],
    extraGroup: {
      name: 'Bordado',
      required: false,
      choices: [
        { label: 'Sin bordado', additionalUnitPrice: 0 },
        { label: 'Logo bordado', additionalUnitPrice: 1800 },
      ],
    },
  },
  {
    name: 'Mochila Urbana Compacta',
    slug: 'mochila-urbana-compacta',
    category: 'mochilas',
    shortDescription: 'Mochila liviana para uso diario con compartimento interno.',
    description:
      'Mochila de 40 × 30 cm en nylon resistente al agua, con cierre principal, bolsillo frontal y compartimento interno. Pensada para marcas, equipos y regalos corporativos.',
    features: [
      'Nylon resistente al agua',
      'Bolsillo frontal',
      'Compartimento interno',
      'Correas acolchadas',
    ],
    minimumQuantity: 10,
    personalizationFee: 3500,
    priceTiers: [
      { minQuantity: 10, maxQuantity: 29, unitPrice: 18900 },
      { minQuantity: 30, maxQuantity: 59, unitPrice: 17500 },
      { minQuantity: 60, maxQuantity: null, unitPrice: 15900 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Bordó', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 500 },
    ],
    extraGroup: {
      name: 'Bolsillo frontal',
      required: false,
      choices: [
        { label: 'Sin bolsillo', additionalUnitPrice: 0 },
        { label: 'Con bolsillo', additionalUnitPrice: 900 },
      ],
    },
  },
  {
    name: 'Bolso Tote Lona Premium',
    slug: 'bolso-tote-lona-premium',
    category: 'bolsos',
    shortDescription: 'Tote de lona gruesa con asas reforzadas y gran capacidad.',
    description:
      'Bolso tote de 42 × 36 cm en lona de algodón 12 oz, con asas reforzadas y bolsillo interno. Una pieza versátil para merchandising, ferias y uso diario.',
    features: ['Lona de algodón 12 oz', 'Asas reforzadas', 'Bolsillo interno', 'Gran capacidad'],
    minimumQuantity: 15,
    personalizationFee: 3000,
    priceTiers: [
      { minQuantity: 15, maxQuantity: 49, unitPrice: 9800 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 8900 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 7900 },
    ],
    colorChoices: [
      { label: 'Natural', additionalUnitPrice: 0 },
      { label: 'Negro', additionalUnitPrice: 300 },
      { label: 'Azul', additionalUnitPrice: 300 },
    ],
    extraGroup: {
      name: 'Asas reforzadas',
      required: false,
      choices: [
        { label: 'Asas estándar', additionalUnitPrice: 0 },
        { label: 'Asas reforzadas', additionalUnitPrice: 700 },
      ],
    },
  },
  {
    name: 'Neceser Viajero',
    slug: 'neceser-viajero',
    category: 'neceseres',
    shortDescription: 'Neceser compacto con cierre impermeable para viajes y eventos.',
    description:
      'Neceser de 24 × 14 cm en poliéster con interior forrado, cierre impermeable y manija lateral. Ideal para kits de higiene, regalos corporativos y viajes.',
    features: ['Interior forrado', 'Cierre impermeable', 'Manija lateral', 'Formato compacto'],
    minimumQuantity: 20,
    personalizationFee: 2500,
    priceTiers: [
      { minQuantity: 20, maxQuantity: 49, unitPrice: 4500 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 3900 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 3400 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 0 },
      { label: 'Verde', additionalUnitPrice: 0 },
    ],
    extraGroup: {
      name: 'Cierre impermeable',
      required: false,
      choices: [
        { label: 'Cierre estándar', additionalUnitPrice: 0 },
        { label: 'Cierre impermeable', additionalUnitPrice: 600 },
      ],
    },
  },
  {
    name: 'Paletero Pro',
    slug: 'paletero-pro',
    category: 'paleteros',
    shortDescription: 'Paletero térmico para entrenamiento y competencia.',
    description:
      'Paletero de 32 × 20 cm con aislante térmico, cierre principal y bolsillo externo. Diseñado para llevar paletas, pelotas y accesorios durante el entrenamiento.',
    features: ['Aislante térmico', 'Bolsillo externo', 'Correa de mano', 'Material resistente'],
    minimumQuantity: 10,
    personalizationFee: 2800,
    priceTiers: [
      { minQuantity: 10, maxQuantity: 29, unitPrice: 7600 },
      { minQuantity: 30, maxQuantity: 59, unitPrice: 6900 },
      { minQuantity: 60, maxQuantity: null, unitPrice: 6200 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Rojo', additionalUnitPrice: 400 },
      { label: 'Azul', additionalUnitPrice: 400 },
    ],
    extraGroup: {
      name: 'Porta botella',
      required: false,
      choices: [
        { label: 'Sin porta botella', additionalUnitPrice: 0 },
        { label: 'Con porta botella', additionalUnitPrice: 750 },
      ],
    },
  },
  {
    name: 'Funda Notebook 14"',
    slug: 'funda-notebook-14',
    category: 'fundas',
    shortDescription: 'Funda acolchada para notebook de 14 pulgadas con cierre magnético.',
    description:
      'Funda de 36 × 26 cm con acolchado interno, cierre magnético y bolsillo frontal. Protege el equipo y suma la identidad visual de tu marca.',
    features: ['Acolchado interno', 'Cierre magnético', 'Bolsillo frontal', 'Interior suave'],
    minimumQuantity: 10,
    personalizationFee: 3200,
    priceTiers: [
      { minQuantity: 10, maxQuantity: 29, unitPrice: 11200 },
      { minQuantity: 30, maxQuantity: 59, unitPrice: 10200 },
      { minQuantity: 60, maxQuantity: null, unitPrice: 9200 },
    ],
    colorChoices: [
      { label: 'Gris', additionalUnitPrice: 0 },
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 500 },
    ],
    extraGroup: {
      name: 'Cierre magnético',
      required: false,
      choices: [
        { label: 'Cierre estándar', additionalUnitPrice: 0 },
        { label: 'Cierre magnético', additionalUnitPrice: 800 },
      ],
    },
  },
  {
    name: 'Mochila Escolar Cordura',
    slug: 'mochila-escolar-cordura',
    category: 'mochilas',
    shortDescription: 'Mochila escolar resistente con porta notebook y refuerzos.',
    description:
      'Mochila de 44 × 32 cm en Cordura, con porta notebook acolchado, bolsillos laterales y costuras reforzadas. Pensada para el uso diario y la personalización con logo.',
    features: [
      'Tela Cordura resistente',
      'Porta notebook acolchado',
      'Bolsillos laterales',
      'Costuras reforzadas',
    ],
    minimumQuantity: 12,
    personalizationFee: 3800,
    priceTiers: [
      { minQuantity: 12, maxQuantity: 49, unitPrice: 15600 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 14200 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 12800 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 0 },
      { label: 'Verde', additionalUnitPrice: 500 },
    ],
    extraGroup: {
      name: 'Porta notebook',
      required: false,
      choices: [
        { label: 'Sin porta notebook', additionalUnitPrice: 0 },
        { label: 'Con porta notebook', additionalUnitPrice: 1200 },
      ],
    },
  },
  {
    name: 'Bolso Crossbody Nylon',
    slug: 'bolso-crossbody-nylon',
    category: 'bolsos',
    shortDescription: 'Bolso cruzado liviano con correa ajustable y cierre seguro.',
    description:
      'Bolso crossbody de 26 × 18 cm en nylon, con correa ajustable, bolsillo interno y cierre seguro. Una pieza práctica para eventos, ferias y uso cotidiano.',
    features: ['Nylon liviano', 'Correa ajustable', 'Bolsillo interno', 'Cierre seguro'],
    minimumQuantity: 15,
    personalizationFee: 2600,
    priceTiers: [
      { minQuantity: 15, maxQuantity: 49, unitPrice: 8700 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 7900 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 7100 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Azul', additionalUnitPrice: 0 },
      { label: 'Beige', additionalUnitPrice: 300 },
    ],
    extraGroup: {
      name: 'Correa ajustable',
      required: false,
      choices: [
        { label: 'Correa fija', additionalUnitPrice: 0 },
        { label: 'Correa ajustable', additionalUnitPrice: 650 },
      ],
    },
  },
  {
    name: 'Neceser Doble Compartimento',
    slug: 'neceser-doble-compartimento',
    category: 'neceseres',
    shortDescription: 'Neceser amplio con dos compartimentos y divisiones internas.',
    description:
      'Neceser de 28 × 16 cm con dos compartimentos, divisiones internas y base reforzada. Organiza mejor los kits de higiene y los productos de tu marca.',
    features: [
      'Dos compartimentos',
      'Divisiones internas',
      'Base reforzada',
      'Interior fácil de limpiar',
    ],
    minimumQuantity: 20,
    personalizationFee: 2400,
    priceTiers: [
      { minQuantity: 20, maxQuantity: 49, unitPrice: 5200 },
      { minQuantity: 50, maxQuantity: 99, unitPrice: 4600 },
      { minQuantity: 100, maxQuantity: null, unitPrice: 4100 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Gris', additionalUnitPrice: 0 },
      { label: 'Bordó', additionalUnitPrice: 0 },
    ],
    extraGroup: {
      name: 'Divisiones internas',
      required: false,
      choices: [
        { label: 'Sin divisiones', additionalUnitPrice: 0 },
        { label: 'Con divisiones', additionalUnitPrice: 500 },
      ],
    },
  },
  {
    name: 'Paletero Entrenamiento',
    slug: 'paletero-entrenamiento',
    category: 'paleteros',
    shortDescription: 'Paletero liviano con gancho para paleta y bolsillo para pelotas.',
    description:
      'Paletero de 30 × 18 cm en poliéster resistente, con gancho para paleta, bolsillo para pelotas y correa de mano. Personalizable con logo para clubes y academias.',
    features: [
      'Poliéster resistente',
      'Gancho para paleta',
      'Bolsillo para pelotas',
      'Correa de mano',
    ],
    minimumQuantity: 10,
    personalizationFee: 2800,
    priceTiers: [
      { minQuantity: 10, maxQuantity: 29, unitPrice: 8200 },
      { minQuantity: 30, maxQuantity: 59, unitPrice: 7400 },
      { minQuantity: 60, maxQuantity: null, unitPrice: 6600 },
    ],
    colorChoices: [
      { label: 'Negro', additionalUnitPrice: 0 },
      { label: 'Verde', additionalUnitPrice: 400 },
      { label: 'Rojo', additionalUnitPrice: 400 },
    ],
    extraGroup: {
      name: 'Gancho para paleta',
      required: false,
      choices: [
        { label: 'Sin gancho', additionalUnitPrice: 0 },
        { label: 'Con gancho', additionalUnitPrice: 550 },
      ],
    },
  },
];

function buildOptionGroups(product) {
  return [
    {
      name: 'Color',
      required: true,
      choices: product.colorChoices,
    },
    product.extraGroup,
  ];
}

async function copyProductImages({ sourceDir, mediaDir, product, fileNames }) {
  const images = [];

  for (const [index, fileName] of fileNames.entries()) {
    const extension = path.extname(fileName).toLowerCase() || '.jpg';
    const destinationName = `seed-${product.slug}-${String(index + 1).padStart(2, '0')}${
      extension === '.jpeg' ? '.jpg' : extension
    }`;

    await copyFile(path.join(sourceDir, fileName), path.join(mediaDir, destinationName));
    images.push(`/uploads/media/${destinationName}`);
  }

  return images;
}

async function main() {
  const sourceArgument = process.argv.find((argument) => argument.startsWith('--source='));
  const sourceDir = sourceArgument
    ? path.resolve(sourceArgument.split('=').slice(1).join('='))
    : DEFAULT_SOURCE_DIR;
  const fileNames = (await readdir(sourceDir))
    .filter((fileName) => IMAGE_EXTENSIONS.has(path.extname(fileName).toLowerCase()))
    .sort();

  if (fileNames.length < PRODUCTS.length) {
    throw new Error('No hay suficientes imágenes para repartir entre los productos.');
  }

  const base = Math.floor(fileNames.length / PRODUCTS.length);
  const remainder = fileNames.length % PRODUCTS.length;
  const storagePaths = createStoragePaths();
  let cursor = 0;
  let created = 0;
  let updated = 0;

  await mkdir(storagePaths.media, { recursive: true });
  await connectDatabase(env.mongodbUri);

  try {
    for (const [index, definition] of PRODUCTS.entries()) {
      const count = base + (index < remainder ? 1 : 0);
      const productImages = await copyProductImages({
        sourceDir,
        mediaDir: storagePaths.media,
        product: definition,
        fileNames: fileNames.slice(cursor, cursor + count),
      });

      cursor += count;

      const input = {
        name: definition.name,
        slug: definition.slug,
        category: definition.category,
        shortDescription: definition.shortDescription,
        seoTitle: `${definition.name} personalizado`.slice(0, 70),
        seoDescription: definition.shortDescription.slice(0, 160),
        description: definition.description,
        features: definition.features,
        imageUrl: productImages[0],
        imageAlt: `${definition.name} personalizado`.slice(0, 200),
        images: productImages,
        active: true,
        minimumQuantity: definition.minimumQuantity,
        personalizationFee: definition.personalizationFee,
        priceTiers: definition.priceTiers,
        optionGroups: buildOptionGroups(definition),
      };
      const parsed = productInputSchema.safeParse(input);

      if (!parsed.success) {
        throw new Error(
          `Producto inválido ${definition.slug}: ${parsed.error.issues
            .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
            .join(' | ')}`,
        );
      }

      const existing = await Product.findOne({ slug: definition.slug }).select('_id').lean();

      if (existing) {
        await updateProduct(existing._id.toString(), parsed.data);
        updated += 1;
      } else {
        await createProduct(parsed.data);
        created += 1;
      }

      console.log(`✓ ${definition.name} (${productImages.length} imágenes) — ${definition.slug}`);
    }

    console.log(`\nListo: ${created} creados, ${updated} actualizados.`);
  } finally {
    await disconnectDatabase();
  }
}

main().catch(async (error) => {
  console.error(error.message);
  await disconnectDatabase().catch(() => {});
  process.exitCode = 1;
});
