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
      schemaDir + '/*.?(prisma)',
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

const generateCrudAPIs = async () => {
  try {
    let schemaDir = path.join(process.cwd() + '/src/datasources/')

    // find .prisma schemas
    let schemas = await findSchemas(schemaDir)

    // dict  {schemaName: schemaPath }
    let schemasObj = schemas.map((path: string) => ({
      schemaName: path.slice(path.lastIndexOf('/') + 1).replace('.prisma', ''),
      schemaPath: path,
    }))

    console.log(chalk.white('Select schema to generate CRUD apis'))

    let { value: selectedSchema } = await cliSelect({
      values: schemasObj,
      valueRenderer: (value, selected) => {
        if (selected) {
          return chalk.blue(value.schemaName)
        } else {
          return value.schemaName
        }
      },
    })

    const samplePrismaSchema = getSchemaSync(selectedSchema.schemaPath)

    let dmmf = await getDMMF({
      datamodel: samplePrismaSchema,
    })

    const jsonSchema = transformDMMF(dmmf, {
      keepRelationScalarFields: 'true',
    })

    let basePathForGeneration = './src'

    dmmf.datamodel.models.forEach(async (modelInfo) => {
      const METHODS: METHOD[] = ['one', 'create', 'update', 'delete']

      METHODS.map((method) => {
        generateAndStoreEvent({
          basePathForGeneration,
          modelName: modelInfo.name,
          dataSourceName: selectedSchema.schemaName,
          modelFields: modelInfo.fields,
          method,
          jsonSchema,
        })

        // workflows generation for each corresponding crud
        generateAndStorWorkflow({
          basePathForGeneration,
          modelName: modelInfo.name,
          dataSourceName: selectedSchema.schemaName,
          modelFields: modelInfo.fields,
          method,
        })
      })
    })
  } catch (error) {
    throw error
  }
}

generateCrudAPIs()
  .then(() => {
    console.log(chalk.green('APIs are generated'))
  })
  .catch((error) => {
    console.error(chalk.red(error))
  })
