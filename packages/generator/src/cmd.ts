import { getDMMF, getSchemaSync } from '@prisma/internals'

import cliSelect from 'cli-select'
import path from 'path'

import { generateAndStorWorkflow } from './utils/workflow'
import { generateAndStoreEvent } from './utils/event'

import { transformDMMF } from 'prisma-json-schema-generator/dist/generator/transformDMMF'
import type { METHOD } from './utils/workflow'
import findDatasources from './helpers/findDatasources'

const chalk = require('chalk')

const getUserResponseFromCLI: any = async (eligibleDatasources: string[]) => {
  let allDatasources = eligibleDatasources.map((path: string) => ({
    schemaName: path.slice(path.lastIndexOf('/') + 1).replace('.prisma', ''),
    schemaPath: path,
  }))

  console.log(chalk.white('Select datasource / schema to generate CRUD APIs'))

  let { value: selectedDatasource } = await cliSelect({
    values: [
      ...allDatasources,
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

  return { selectedDatasource, allDatasources }
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
    const METHODS: METHOD[] = ['one', 'create', 'update', 'delete', 'search']

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
    let datasourceDir = path.join(process.cwd() + '/src/datasources/')

    // find eligible datasource, as of now elastickgraph and prisma are eligible
    // for auto generation, and here onwards let's consider .prisma also as a datasource
    let eligibleDatasources = await findDatasources(datasourceDir)

    let { selectedDatasource, allDatasources } = await getUserResponseFromCLI(
      eligibleDatasources,
    )

    if (selectedDatasource.schemaName === 'For all') {
      allDatasources.map(
        async (schema: { schemaName: string; schemaPath: string }) => {
          await invokeGenerationForSchema(schema)
        },
      )
    } else if (selectedDatasource.schemaName === 'Cancel') {
      throw Error('Auto API generation canceled.')
    } else {
      await invokeGenerationForSchema(selectedDatasource)
    }
  } catch (error) {
    throw error
  }
}

generateCrudAPIs().catch((error) => {
  console.log(chalk.red(error))
})
