import { getDMMF, getSchemaSync } from '@prisma/internals'

import cliSelect from 'cli-select'
import path from 'path'
import fs from 'fs'

import prismaGenerator from './utils/prisma'
import elasticgraphGenerator from './utils/elasticgraph'

import { transformDMMF } from 'prisma-json-schema-generator/dist/generator/transformDMMF'
import type { METHOD } from './utils/prisma/workflow'
import findDatasources, { egDatasourceConfig } from './helpers/findDatasources'
import type { dsDefinition } from './helpers/findDatasources'
import { glob } from 'glob'
import * as toml from 'toml'

const chalk = require('chalk')

const getUserResponseFromCLI: any = async (
  eligibleDatasources: dsDefinition[],
) => {
  console.log(chalk.white('Select datasource / schema to generate CRUD APIs'))

  let { value: selectedDatasource } = await cliSelect({
    values: [
      ...eligibleDatasources,
      { dsName: 'For all', dsFilePath: '' },
      { dsName: 'Cancel', dsFilePath: '' },
    ],
    valueRenderer: (value, selected) => {
      if (selected) {
        return value.dsName === 'Cancel'
          ? chalk.red(value.dsName)
          : chalk.blue(value.dsName)
      } else {
        return value.dsName
      }
    },
  })

  return { selectedDatasource, allDatasources: eligibleDatasources }
}

const invokeGenerationForPrismaDS = async ({
  dsName,
  dsFilePath,
}: dsDefinition) => {
  const samplePrismaSchema = getSchemaSync(dsFilePath)
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
      await prismaGenerator.eventGen({
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: dsName.replace('.prisma', ''),
        modelFields: modelInfo.fields,
        method,
        jsonSchema,
      })

      // workflows generation for each corresponding crud
      await prismaGenerator.workflowGen({
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: dsName.replace('.prisma', ''),
        modelFields: modelInfo.fields,
        method,
      })
    })
  })

  console.log(chalk.green(`Events and Workflows are generated for ${dsName}`))
}

const invokeGenerationForElasticgraphDS = async ({
  dsName,
  dsFilePath,
  dsType,
  dsConfig,
}: dsDefinition) => {
  // get the backend_path from elasticgraph dsConfig
  // read all the ${backend_path}/schema/entities iterativily
  const { schema_backend } = <egDatasourceConfig>dsConfig
  let basePathForGeneration = './src'

  try {
    glob(
      schema_backend + '/schema/entities/*.toml',
      (err: Error | null, entityFiles: string[]) => {
        let entities = entityFiles.reduce((acc: any, filepath) => {
          let entityName = filepath
            .substring(filepath.lastIndexOf('/') + 1)
            .replace('.toml', '')

          try {
            let fileContent = fs.readFileSync(filepath, { encoding: 'utf-8' })
            let parsedToml = toml.parse(fileContent)
            parsedToml = JSON.parse(JSON.stringify(parsedToml))
            acc[entityName] = parsedToml
          } catch (error) {
            console.error(error)
          }

          return acc
        }, {})

        Object.keys(entities).forEach(async (entityKey) => {
          const METHODS: METHOD[] = ['create', 'update', 'delete', 'search']

          METHODS.map(async (method) => {
            await elasticgraphGenerator.eventGen({
              basePathForGeneration,
              dataSourceName: dsName.replace(/(.yml|.yaml)/, ''),
              entityName: entityKey,
              entityFields: entities[entityKey],
              method,
            })

            // workflows generation for each corresponding crud
            await elasticgraphGenerator.workflowGen({
              basePathForGeneration,
              dataSourceName: dsName.replace(/(.yml|.yaml)/, ''),
              entityName: entityKey,
              entityFields: entities[entityKey],
              method,
            })
          })
        })
      },
    )
    console.log(chalk.green(`Events and Workflows are generated for ${dsName}`))
  } catch (error) {
    console.error('Error while reading the schema_backend.')
  }
}

const generateCrudAPIs = async () => {
  try {
    let datasourceDir = path.join(process.cwd() + '/src/datasources/')

    // find eligible datasource, as of now elasticgraph and prisma are eligible
    // for auto generation, and here onwards let's consider .prisma also as a datasource
    let eligibleDatasources = await findDatasources(datasourceDir)

    let { selectedDatasource, allDatasources } = await getUserResponseFromCLI(
      eligibleDatasources,
    )

    if (selectedDatasource.dsName === 'For all') {
      allDatasources.map(async (dsDefinition: dsDefinition) => {
        if (selectedDatasource.dsType === 'prisma') {
          await invokeGenerationForPrismaDS(dsDefinition)
        } else {
          console.error('No mechanism is defined to handle this kinda schema.')
        }
      })
    } else if (selectedDatasource.dsName === 'Cancel') {
      throw Error('Auto API generation canceled.')
    } else {
      if (selectedDatasource.dsType === 'prisma') {
        await invokeGenerationForPrismaDS(selectedDatasource)
      } else if (selectedDatasource.dsType === 'elasticgraph') {
        await invokeGenerationForElasticgraphDS(selectedDatasource)
      } else {
        console.error(
          "No mechanism is defined to generate API's from this kinda schema.",
        )
      }
    }
  } catch (error) {
    throw error
  }
}

generateCrudAPIs().catch((error) => {
  console.log(chalk.red(error))
})
