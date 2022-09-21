import type { METHOD } from '../prisma/event'
import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { writeFileSafely } from '../writeFileSafely'
const jsYaml = require('js-yaml')

export type EventConfig = {
  basePathForGeneration: string
  dataSourceName: string
  entityName: string
  entityFields: any
  method: METHOD
}
const genEventKey = (
  dataSourceName: string,
  entityName: string,
  method: METHOD,
): string => {
  switch (method) {
    case 'one':
      return `/${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/:id.http.get`
    case 'create':
      return `/${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}.http.post`
    case 'update':
      return `/${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/:id.http.put`
    case 'delete':
      return `/${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/:id.http.delete`
    case 'search':
      return `/${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/search.http.post`
    default:
      return ''
  }
}
const genEventSummary = (entityName: string, method: METHOD): string => {
  switch (method) {
    case 'one':
      return `Fetch ${entityName}`
    case 'create':
      return `Create a new ${entityName}`
    case 'update':
      return `Update a ${entityName}`
    case 'delete':
      return `Delete a ${entityName}`
    case 'search':
      return `Fetch multiple ${entityName}`
    default:
      return ''
  }
}

const genEventDescription = (entityName: string, method: METHOD): string => {
  switch (method) {
    case 'one':
      return `Fetch ${entityName} from elasticgraph`
    case 'create':
      return `Create ${entityName} from elasticgraph`
    case 'update':
      return `Update ${entityName} from elasticgraph`
    case 'delete':
      return `Delete ${entityName} from elasticgraph`
    case 'search':
      return `Fetch multiple ${entityName} from elasticgraph`
    default:
      return ''
  }
}

const genEventFunction = (
  method: METHOD,
  entityName: string,
  dataSourceName: string,
): string => {
  return `com.eg.${dataSourceName.toLowerCase()}.${entityName.toLowerCase()}.${method}`
}

const processEntityObject = (entityFields: any) => {
  return Object.keys(entityFields).reduce(
    (accumulator: any, fieldKey: string) => {
      let field = entityFields[fieldKey]
      accumulator[fieldKey] = {
        type: !Array.isArray(field.type)
          ? field.type.toLowerCase()
          : [field.type[0].toLowerCase()],
      }
      return accumulator
    },
    {},
  )
}

const genBodyAndParams = (
  method: METHOD,
  entityName: String,
  entityFields: any,
): any => {
  return {
    body: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: { ...processEntityObject(entityFields) },
          },
        },
      },
    },
  }
}

const genResponses = (method: METHOD): any => {
  if (method === 'search') {
    return {
      content: {
        'application/json': {
          schema: {
            type: 'array',
          },
        },
      },
    }
  } else {
    return {
      content: {
        'application/json': {
          schema: {
            type: 'object',
          },
        },
      },
    }
  }
}

export const generateAndStoreEvent = async (
  eventConfig: EventConfig,
): Promise<string> => {
  let json: any = {}
  let {
    basePathForGeneration,
    dataSourceName,
    entityName,
    entityFields,
    method,
  } = eventConfig

  let eventKey = genEventKey(dataSourceName, entityName, method)
  let summary = genEventSummary(entityName, method)
  let description = genEventDescription(entityName, method)
  let fn = genEventFunction(method, entityName, dataSourceName)
  let responses = genResponses(method)
  let bodyAndParams = genBodyAndParams(method, entityName, entityFields)

  json[eventKey] = {
    summary,
    description,
    fn,
    ...bodyAndParams,
    responses,
  }

  const writeLocation = generateWriteLocationForMethod(
    basePathForGeneration,
    '/events',
    dataSourceName,
    entityName.toLowerCase(),
    method,
  )

  await writeFileSafely(writeLocation, jsYaml.dump(json))

  return 'generated all events'
}
