import { generatorHandler, GeneratorOptions } from '@prisma/generator-helper'
import { logger } from '@prisma/sdk'
import path from 'path'

import { generateAndStoreEvent, METHOD } from './utils/event'
import { generateAndStorWorkflow } from './utils/workflow'
import { writeFileSafely } from './utils/writeFileSafely'

const { name: generatorName, version } = require('../package.json')

generatorHandler({
  onManifest() {
    logger.info(`${generatorName}:Registered`)
    return {
      version,
      defaultOutput: '../generated',
      prettyName: generatorName,
    }
  },
  onGenerate: async (options: GeneratorOptions) => {
    // lets investigate options
    await writeFileSafely(
      path.join(options.generator.output?.value!, 'options.json'),
      JSON.stringify(options, null, 2),
    )

    let basePathForGeneration = options.generator.output?.value

    let dsName =
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
            dataSourceName: dsName,
            modelFields: modelInfo.fields,
            method,
          })

          // workflows generation for each corresponding crud
          generateAndStorWorkflow({
            basePathForGeneration,
            modelName: modelInfo.name,
            dataSourceName: dsName,
            modelFields: modelInfo.fields,
            method,
          })
        }
      })
    })
  },
})
