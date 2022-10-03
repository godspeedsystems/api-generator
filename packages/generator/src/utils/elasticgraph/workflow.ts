import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { METHOD } from '../prisma/event'
import type { EventConfig } from './event'
import { writeFileSafely } from '../writeFileSafely'
const jsYaml = require('js-yaml')

const genSummary = (method: METHOD, entityName: string): string => {
  switch (method) {
    case 'one':
      return `Fetch ${entityName}`
    case 'create':
      return `Create ${entityName}`
    case 'update':
      return `Update ${entityName}`
    case 'delete':
      return `Delete ${entityName}`
    case 'search':
      return `Fetch many ${entityName}`
    default:
      return ''
  }
}

const genTaskId = (
  method: METHOD,
  dataSourceName: string,
  entityName: string,
): string => {
  return `${dataSourceName.toLowerCase()}_${entityName.toLowerCase()}_${method}`
}

const genData = (method: METHOD, entityName: string) => {
  return {
    index: `${entityName}s`,
    type: '_doc',
    ...(method === 'search'
      ? {
          query: `<% inputs.body.query %>`,
          from: `<% inputs.body.from || 0 %>`,
          size: `<% inputs.body.size || 10 %>`,
        }
      : method === 'update'
      ? { id: `<% inputs.body.id %>`, body: `<% inputs.body %>` }
      : method === 'delete'
      ? { id: `<% inputs.body.id %>` }
      : { body: `<% inputs.body %>` }),
  }
}

const genEgMethod = (method: METHOD, entityName: string) => {
  switch (method) {
    case 'create':
      return 'index'
    case 'delete':
      return 'delete'
    case 'update':
      return 'index'
    case 'search':
      return 'search'
    default:
      return ''
  }
}

export const generateAndStoreWorkflow = async (
  eventConfig: EventConfig,
  method: METHOD,
) => {
  let { basePathForGeneration, dataSourceName, entityName, entityFields } =
    eventConfig

  let json: any

  const summary = genSummary(method, entityName)
  const taskId = genTaskId(method, dataSourceName, entityName)

  json = {
    summary,
    tasks: [
      {
        id: taskId,
        fn: 'com.gs.elasticgraph',
        args: {
          datasource: dataSourceName,
          data: genData(method, entityName),
          config: {
            method: genEgMethod(method, entityName),
          },
        },
        on_error: { continue: false },
      },
    ],
  }

  const writeLocation = generateWriteLocationForMethod(
    basePathForGeneration,
    '/functions/com/eg',
    dataSourceName,
    entityName,
    method,
  )

  await writeFileSafely(writeLocation, jsYaml.dump(json))
  return 'generated all workflows'
}
