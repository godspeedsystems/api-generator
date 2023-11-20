import type { METHOD } from '../prisma/event'
import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { writeFileSafely } from '../writeFileSafely'
const jsYaml = require('js-yaml')

export type EventConfig = {
  basePathForGeneration: string
  dataSourceName: string
  entityName: string
  entityFields: any
}

const genEventKey = (
  dataSourceName: string,
  entityName: string,
  method: METHOD,
): string => {
  switch (method) {
    case 'one':
      return `http.get./${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/:id`
    case 'create':
      return `http.post./${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}`
    case 'update':
      return `http.put./${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}`
    case 'delete':
      return `http.delete./${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}`
    case 'search':
      return `http.post./${dataSourceName.toLowerCase()}/${entityName.toLowerCase()}/search`
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
      let oasCompatibleFieldDescriptor = {
        type: !Array.isArray(field.type)
          ? field.type.toLowerCase() === 'date'
            ? 'string'
            : field.type.toLowerCase()
          : [field.type[0].toLowerCase()],
        ...(!Array.isArray(field.type) &&
          field.type.toLowerCase() === 'date' && { format: 'date-time' }),
      }

      accumulator[fieldKey] = {
        ...oasCompatibleFieldDescriptor,
      }

      return accumulator
    },
    {},
  )
}

const genBodyAndParams = (method: METHOD, entityFields: any): any => {
  return {
    body: {
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              ...((method === 'delete' ||
                method === 'update' ||
                method === 'one') && {
                id: {
                  type: 'string',
                },
              }),
              ...((method === 'update' || method === 'create') && {
                data: {
                  type: 'object',
                  properties: { ...processEntityObject(entityFields) },
                },
              }),
              ...(method === 'search' && {
                query: {
                  type: 'object',
                },
                from: {
                  type: 'number',
                },
                size: {
                  type: 'number',
                },
              }),
            },
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

const generateEvent = (
  eventConfig: EventConfig & {
    method: METHOD
  },
): any => {
  let json: any = {}

  let { dataSourceName, entityName, entityFields, method } = eventConfig

  let eventKey = genEventKey(dataSourceName, entityName, method)
  let summary = genEventSummary(entityName, method)
  let description = genEventDescription(entityName, method)
  let fn = genEventFunction(method, entityName, dataSourceName)
  let responses = genResponses(method)
  let { body } = genBodyAndParams(method, entityFields)

  json.eventKey = eventKey

  json.structure = {
    summary,
    description,
    fn,
    body,
    responses,
  }

  return json
}

export const generateAndStoreEvent = async (
  eventConfig: EventConfig,
): Promise<string> => {
  let json: any = {}
  let { basePathForGeneration, dataSourceName, entityName, entityFields } =
    eventConfig
  const METHODS: METHOD[] = ['one', 'create', 'update', 'delete', 'search']

  let consolidateJsonForEvent = METHODS.map((method) => {
    let content = `# ${method.toUpperCase()}\r\n`
    let { eventKey, structure } = generateEvent({ ...eventConfig, method })
    content = content + `${jsYaml.dump({ [eventKey]: structure })}\r\n`
    return content
  }).join('')

  const writeLocation = generateWriteLocationForMethod(
    basePathForGeneration,
    '/events',
    dataSourceName,
    entityName.toLowerCase(),
  )

  await writeFileSafely(writeLocation, consolidateJsonForEvent)

  return 'Generated all events'
}
