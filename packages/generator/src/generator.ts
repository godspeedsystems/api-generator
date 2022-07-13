import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { logger, parseEnvValue } from '@prisma/sdk'

import { transformDMMF } from 'prisma-json-schema-generator/dist/generator/transformDMMF'

import { generateAndStoreEvent, METHOD } from './utils/event'
import { generateAndStorWorkflow } from './utils/workflow'

const { name: generatorName, version } = require('../package.json')

generatorHandler({
  onManifest() {
    return {
      version,
      defaultOutput: '../generated',
      prettyName: generatorName,
    }
  },
  onGenerate: async (options: GeneratorOptions) => {
    if (options.generator.output) {
      const jsonSchema = transformDMMF(options.dmmf, options.generator.config)

      try {
        let basePathForGeneration = parseEnvValue(options.generator.output)
        let dataSourceName =
          options.datasources[0]?.name === 'db'
            ? options.schemaPath
                .slice(options.schemaPath.lastIndexOf('/') + 1)
                .replace('.prisma', '')
            : ''

        options.dmmf.datamodel.models.forEach(async (modelInfo) => {
          const METHODS: METHOD[] = ['one', 'create', 'update', 'delete']

          METHODS.map((method) => {
            if (typeof basePathForGeneration !== 'undefined') {
              // events generation for each method
              generateAndStoreEvent({
                basePathForGeneration,
                modelName: modelInfo.name,
                dataSourceName,
                modelFields: modelInfo.fields,
                method,
                jsonSchema,
              })

              // workflows generation for each corresponding crud
              generateAndStorWorkflow({
                basePathForGeneration,
                modelName: modelInfo.name,
                dataSourceName,
                modelFields: modelInfo.fields,
                method,
              })
            }
          })
        })
      } catch (error) {
        logger.error('Error: unable to write files for ' + `${generatorName}`)
        throw error
      }
    } else {
      throw new Error('No output was specified for ' + `${generatorName}`)
    }
  },
})
