import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from './generateWriteLocationForMethod'
import { writeFileSafely } from './writeFileSafely'

const jsYaml = require('js-yaml')

export type METHOD = 'one' | 'create' | 'update' | 'delete'
type EventConfig = {
  dataSourceName: string
  modelFields: DMMF.Field[]
  modelName: string
  method: METHOD
}

const generateEventKey = ({
  modelName,
  modelFields,
  method,
}: EventConfig): string => {
  let indexField = modelFields.find((field) => field.isId)

  switch (method) {
    case 'one':
      return `/${modelName.toLowerCase()}/:${indexField?.name}.http.get`
    case 'create':
      return `/${modelName.toLowerCase()}/:${indexField?.name}.http.post`
    case 'update':
      return `/${modelName.toLowerCase()}/:${indexField?.name}.http.put`
    case 'delete':
      return `/${modelName.toLowerCase()}/:${indexField?.name}.http.delete`
    default:
      return ''
  }
}

const generateSummaryBasedOnModelAndMethod = (
  modelName: string,
  method: METHOD,
): string => {
  switch (method) {
    case 'one':
      return `Fetch ${modelName}`
    case 'create':
      return `Create a new ${modelName}`
    case 'update':
      return `Update a ${modelName}`
    case 'delete':
      return `Delete a ${modelName}`
    default:
      return ''
  }
}

const generateDescriptionBasedOnModelAndMethod = (
  modelName: string,
  method: METHOD,
): string => {
  switch (method) {
    case 'one':
      return `Fetch ${modelName} from database`
    case 'create':
      return `Create ${modelName} from database`
    case 'update':
      return `Update ${modelName} from database`
    case 'delete':
      return `Delete ${modelName} from database`
    default:
      return ''
  }
}

const generateParams = (
  method: METHOD,
  modelFields: Array<DMMF.Field>,
): any => {
  switch (method) {
    case 'one':
    case 'update':
    case 'delete': {
      return {
        params: modelFields
          .filter((field) => field.isId)
          .map((field) => ({
            name: field.name,
            in: 'path',
            required: field.isRequired,
            schema: {
              type: field.type.toLowerCase(),
            },
          })),
      }
    }

    case 'create':
      return {}

    default:
      return {}
  }
}

const generateBody = (method: METHOD, modelFields: DMMF.Field[]) => {
  switch (method) {
    case 'one':
    case 'delete': {
      return {}
    }
    case 'create':
      return {
        body: {
          content: {
            'applicaion/json': {
              schema: {
                type: 'object',
                properties: {
                  data: modelFields
                    .filter((field) => !field.isId)
                    .reduce((accumulator: any, field) => {
                      accumulator[field.name] = {
                        type:
                          field.kind === 'object'
                            ? 'object'
                            : field.type.toLowerCase(),
                      }

                      return accumulator
                    }, {}),
                },
              },
            },
          },
        },
      }
    case 'update':
      return {
        body: {
          content: {
            'applicaion/json': {
              schema: {
                type: 'object',
                properties: {
                  data: modelFields
                    .filter((field) => !field.isId)
                    .reduce((accumulator: any, field) => {
                      accumulator[field.name] = {
                        type: field.type,
                      }

                      return accumulator
                    }, {}),
                },
              },
            },
          },
        },
      }
    default:
      return {}
  }
}

const generateFn = (
  method: METHOD,
  modelName: String,
  dataSourceName: String,
): String => {
  return `com.biz.${dataSourceName.toLowerCase()}_${modelName.toLowerCase()}_${method}`
}

export const generateAndStoreEvent = async (
  eventConfig: EventConfig & { basePathForGeneration: string },
): Promise<string> => {
  let json: any = {}

  let {
    basePathForGeneration,
    dataSourceName,
    modelName,
    method,
    modelFields,
  } = eventConfig

  let eventKey = generateEventKey({
    dataSourceName: dataSourceName,
    modelName: modelName,
    method: method,
    modelFields: modelFields,
  })

  let summary = generateSummaryBasedOnModelAndMethod(modelName, method)
  let description = generateDescriptionBasedOnModelAndMethod(modelName, method)
  let params = generateParams(method, modelFields)
  let fn = generateFn(method, modelName, dataSourceName)
  let body = generateBody(method, modelFields)

  json[eventKey] = {
    summary,
    description,
    fn,
    ...params,
    ...body,
  }

  const writeLocation = generateWriteLocationForMethod(
    basePathForGeneration,
    '/events',
    dataSourceName,
    modelName.toLowerCase(),
    method,
  )

  await writeFileSafely(writeLocation, jsYaml.dump(json))

  return 'generated all events'
}
