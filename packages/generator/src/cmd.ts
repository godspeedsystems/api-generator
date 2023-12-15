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
import { writeFileSafely } from './utils/writeFileSafely'

const jsYaml = require('js-yaml')
const chalk = require('chalk')

const getUserResponseFromCLI: any = async (
  eligibleDatasources: dsDefinition[],
) => {
  console.log(chalk.white('Select') + chalk.green(' datasource / schema') + chalk.white(' to generate CRUD APIs'))

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
const getUserResponseFromCLIForEventsource: any = async () => {
  const pattern = path.join(process.cwd(), 'src/eventsources/*.yaml').replace(/\\/g, '/');
  const findApoloEventSources = async (pattern: any) => {
    return new Promise((resolve, reject) => {
      glob(pattern, (err, files) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(files);
      });
    });
  };
  const availableApolloEventSources: any = await findApoloEventSources(pattern);
  const allEventsources = availableApolloEventSources
    .map((file: any) => path.parse(file).name)
    .filter((name: string) => name !== "cron");
  console.log(chalk.white('Select') + chalk.green(' eventsource') + chalk.white(' to generate CRUD APIs. Currently we are supporting')+chalk.blue(' http')+chalk.white(' and ')+chalk.blue('graphql ')+chalk.white('eventsources'))
  let { value: selectedEventsource } = await cliSelect({
    values: [
      ...allEventsources,
    ],
    valueRenderer: (value, selected) => {

      return value

    },
  })
  return selectedEventsource
}

const invokeGenerationForPrismaDS = async ({
  dsName,
  dsFilePath,
}: dsDefinition, eventsource: string) => {
  const samplePrismaSchema = getSchemaSync(dsFilePath)
  let dmmf = await getDMMF({
    datamodel: samplePrismaSchema,
  })

  const jsonSchema = transformDMMF(dmmf, {
    keepRelationScalarFields: 'true',
  })

  let basePathForGeneration = './src'
  let defs: any = {}
  const setDefs = (def: any) => {
    defs = { ...defs, ...def }
  }
  dmmf.datamodel.models.forEach(async (modelInfo) => {
    // {dataModel}.yaml has all the events for each method

    await prismaGenerator.eventGen(
      {
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: (dsName || '').replace('.prisma', ''),
        modelFields: modelInfo.fields,
        jsonSchema,
        eventsource,
      },
      setDefs,
    )

    // each method has a seprate file
    const METHODS: METHOD[] = ['one', 'create', 'update', 'delete', 'search']
    METHODS.map(async (method) => {
      await prismaGenerator.workflowGen({
        basePathForGeneration,
        modelName: modelInfo.name,
        dataSourceName: (dsName || '').replace('.prisma', ''),
        modelFields: modelInfo.fields,
        method,
      })
    })
  })

  writeFileSafely(
    `./src/definitions/${(dsName || '').replace('.prisma', '')}.yaml`,
    jsYaml.dump(defs),
  )

  console.log(chalk.green(`Events and Workflows are generated for ${dsName}`))
}

const invokeGenerationForElasticgraphDS = async ({
  dsName,
  dsFilePath,
  dsType,
  dsConfig,
}: dsDefinition, eventsource: string) => {
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
          await elasticgraphGenerator.eventGen({
            basePathForGeneration,
            dataSourceName: (dsName || '').replace(/(.yml|.yaml)/, ''),
            entityName: entityKey,
            entityFields: entities[entityKey],
          }, eventsource,
          )

          const METHODS: METHOD[] = ['create', 'update', 'delete', 'search']
          METHODS.map(async (method) => {
            // workflows generation for each corresponding crud
            await elasticgraphGenerator.workflowGen(
              {
                basePathForGeneration,
                dataSourceName: (dsName || '').replace(/(.yml|.yaml)/, ''),
                entityName: entityKey,
                entityFields: entities[entityKey],
              },
              method,
            )
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
    let datasourceDir = path.join(process.cwd(), 'src', 'datasources')

    // find eligible datasource, as of now elasticgraph and prisma are eligible
    // for auto generation, and here onwards let's consider .prisma also as a datasource
    let eligibleDatasources = await findDatasources(datasourceDir)

    let { selectedDatasource, allDatasources } = await getUserResponseFromCLI(
      eligibleDatasources,
    )

    let availableEventsource = await getUserResponseFromCLIForEventsource();
    // console.log(eligibleeventsource)
    if (selectedDatasource.dsName === 'For all') {
      allDatasources.map(async (dsDefinition: dsDefinition, availableEventsource: any) => {
        if (selectedDatasource.dsType === 'prisma') {
          await invokeGenerationForPrismaDS(dsDefinition, availableEventsource)
        } else {
          console.error('No mechanism is defined to handle this kinda schema.')
        }
      })
    } else if (selectedDatasource.dsName === 'Cancel') {
      throw Error('Auto API generation canceled.')
    } else {
      if (selectedDatasource.dsType === 'prisma') {
        await invokeGenerationForPrismaDS(selectedDatasource, availableEventsource)
      } else if (selectedDatasource.dsType === 'elasticgraph') {
        await invokeGenerationForElasticgraphDS(selectedDatasource, availableEventsource)
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