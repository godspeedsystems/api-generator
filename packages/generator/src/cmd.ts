import { getDMMF, getSchemaSync } from '@prisma/sdk'
import glob from 'glob'
import cliSelect from 'cli-select'
import { generateAndStorWorkflow } from './utils/workflow'
import { generateAndStoreEvent } from './utils/event'
import type { METHOD } from './utils/workflow'
import { transformDMMF } from 'prisma-json-schema-generator/dist/generator/transformDMMF'
import path from 'path'
const chalk = require('chalk')

const findSchemas = (schemaDir: string): Promise<string[]> => {
  return new Promise((resolve, reject) => {
    glob(
      schemaDir + '/**/*.?(prisma)',
      { ignore: '/**/generated-clients/**/*.?(prisma)' },
      (err: Error | null, schemaFilePaths: string[]) => {
        if (err) {
          return reject(err)
        } else {
          if (schemaFilePaths.length) {
            return resolve(schemaFilePaths)
          } else {
            reject(`Can't find any prisma schema's at ${schemaDir}`)
          }
        }
      },
    )
  })
}

const getUserResponseFromCLI: any = async (scannedSchemasPaths: string[]) => {
  // dict  { schemaName: schemaPath }
  let schemas = scannedSchemasPaths.map((path: string) => ({
    schemaName: path.slice(path.lastIndexOf('/') + 1).replace('.prisma', ''),
    schemaPath: path,
  }))

  console.log(chalk.white('Select schema to generate CRUD apis.'))

  let { value: selectedSchema } = await cliSelect({
    values: [
      ...schemas,
      { schemaName: 'For all', schemaPath: '' },
      { schemaName: 'Cancel', schemaPath: '' },
    ],
    valueRenderer: (value, selected) => {
      if (selected) {
        return value.schemaName === 'Cancel'
          ? chalk.red(value.schemaName)
          : chalk.blue(value.schemaName)
      } else {
        return value.schemaName
      }
    },
  })

  return { selectedSchema, allSchemas: schemas }
}

const invokeGenerationForSchema = async ({
  schemaName,
  schemaPath,
}: {
  schemaName: string
  schemaPath: string
}) => {
  const samplePrismaSchema = getSchemaSync(schemaPath)
  let dmmf = await getDMMF({
    datamodel: samplePrismaSchema,
  })

  const jsonSchema = transformDMMF(dmmf, {
    keepRelationScalarFields: 'true',
  })
  let basePathForGeneration = './src'

  dmmf.datamodel.models.forEach(async (modelInfo) => {
    const METHODS: METHOD[] = ['one', 'create', 'update', 'delete']

    METHODS.map(async (method) => {
      await generateAndStoreEvent({
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: schemaName,
        modelFields: modelInfo.fields,
        method,
        jsonSchema,
      })

      // workflows generation for each corresponding crud
      await generateAndStorWorkflow({
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: schemaName,
        modelFields: modelInfo.fields,
        method,
      })
    })
  })

  console.log(
    chalk.green(`Events and Workflows are generated for ${schemaName}`),
  )
}

const generateCrudAPIs = async () => {
  try {
    let schemaDir = path.join(process.cwd() + '/src/datasources/')

    // find .prisma schemas
    let scannedSchemasPaths = await findSchemas(schemaDir)
    let { selectedSchema, allSchemas } = await getUserResponseFromCLI(
      scannedSchemasPaths,
    )

    if (selectedSchema.schemaName === 'For all') {
      allSchemas.map(
        async (schema: { schemaName: string; schemaPath: string }) => {
          await invokeGenerationForSchema(schema)
        },
      )
    } else if (selectedSchema.schemaName === 'Cancel') {
      throw Error('Auto API generation canceled.')
    } else {
      await invokeGenerationForSchema(selectedSchema)
    }
  } catch (error) {
    throw error
  }
}

generateCrudAPIs().catch((error) => {
  console.log(chalk.red(error))
})
