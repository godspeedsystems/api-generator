import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { writeFileSafely } from '../writeFileSafely'
import { JSONSchema7 } from 'json-schema'
import assert from 'assert'
import { generateDefinitionsFile } from './definitions'

const jsYaml = require('js-yaml')
export type METHOD = 'one' | 'create' | 'update' | 'delete' | 'search'

type EventConfig = {
  dataSourceName: string
  modelFields: DMMF.Field[]
  modelName: string
}

export const findIndexField = (
  modelFields: DMMF.Field[],
): DMMF.Field | undefined => {
  let indexField = modelFields.find(
    ({ isId }: { isId: DMMF.Field['isId'] }) => isId,
  )
  return indexField
}

const generateEventKey = (
  { dataSourceName, modelName, modelFields }: EventConfig,
  method: METHOD,
): string => {
  let indexField = findIndexField(modelFields)

  switch (method) {
    case 'one':
      return `/${dataSourceName.toLowerCase()}/${modelName.toLowerCase()}/:${
        indexField?.name
      }.http.get`
    case 'create':
      return `/${dataSourceName.toLowerCase()}/${modelName.toLowerCase()}.http.post`
    case 'update':
      return `/${dataSourceName.toLowerCase()}/${modelName.toLowerCase()}/:${
        indexField?.name
      }.http.put`
    case 'delete':
      return `/${dataSourceName.toLowerCase()}/${modelName.toLowerCase()}/:${
        indexField?.name
      }.http.delete`
    case 'search':
      return `/${dataSourceName.toLowerCase()}/${modelName.toLowerCase()}/search.http.post`
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
    case 'search':
      return `Fetch multiple ${modelName}`
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
    case 'search':
      return `Fetch multiple ${modelName} from database`
    default:
      return ''
  }
}

type Param = {
  name: string
  // TODO: handle other in props
  in: 'path'
  required: true
  schema: { type: 'string' | 'integer' }
}

type Body = {
  content: { 'application/json': { schema: JSONSchema7 } }
}

type BodyAndParams = {
  body?: Body
  params?: Param[] | undefined
}

const _generateBodyAndParamsFromJsonSchema = (
  method: METHOD,
  modelName: string,
  jsonSchema: JSONSchema7,
  modelFields: DMMF.Field[],
  dataSourceName: string,
): BodyAndParams => {
  let indexField = findIndexField(modelFields)

  return {
    body:
      method === 'create' || method === 'update'
        ? {
            content: {
              'application/json': {
                schema: {
                  $ref: `${dataSourceName}.${modelName}`,
                },
              },
            },
          }
        : method === 'search'
        ? {
            content: {
              'application/json': {
                schema: {
                  $ref: `${dataSourceName}.${modelName}`,
                },
              },
            },
          }
        : undefined,
    params:
      method !== 'create' && method !== 'search'
        ? [
            {
              name: indexField ? indexField.name : '',
              in: 'path',
              required: true,
              schema: { type: 'string' },
            },
          ]
        : undefined,
  }
}

const generateFn = (
  method: METHOD,
  modelName: String,
  dataSourceName: String,
): String => {
  return `com.biz.${dataSourceName.toLowerCase()}.${modelName.toLowerCase()}.${method}`
}

type Responses = {
  content: {
    'application/json': {
      schema: {
        type: 'object' | 'array'
      }
    }
  }
}

const generateResponses = (method: METHOD): Responses => {
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
    jsonSchema: JSONSchema7
    method: METHOD
  },
): any => {
  let json: any = {}

  let { dataSourceName, modelName, method, modelFields, jsonSchema } =
    eventConfig

  let eventKey = generateEventKey(
    {
      dataSourceName: dataSourceName,
      modelName: modelName,
      modelFields: modelFields,
    },
    method,
  )

  let summary = generateSummaryBasedOnModelAndMethod(modelName, method)
  let description = generateDescriptionBasedOnModelAndMethod(modelName, method)
  let fn = generateFn(method, modelName, dataSourceName)

  let bodyAndParams: BodyAndParams = {}

  try {
    let { body, params } = _generateBodyAndParamsFromJsonSchema(
      method,
      modelName,
      jsonSchema,
      modelFields,
      dataSourceName,
    )

    bodyAndParams = { body, params }
  } catch (error) {
    console.warn(error)
  }

  let responses = generateResponses(method)

  json.eventKey = eventKey
  json.structure = {
    summary,
    description,
    fn,
    ...bodyAndParams,
    responses,
  }

  return json
}

export const generateAndStoreEvent = async (
  eventConfig: EventConfig & {
    basePathForGeneration: string
    jsonSchema: JSONSchema7
  },
  setDefs: any,
): Promise<string> => {
  const {
    basePathForGeneration,
    dataSourceName,
    modelName,
    modelFields,
    jsonSchema,
  } = eventConfig

  const METHODS: METHOD[] = ['one', 'create', 'update', 'delete', 'search']

  // refs
  let _defs = generateDefinitionsFile(
    dataSourceName,
    modelName,
    jsonSchema,
    modelFields,
  )

  setDefs(_defs)

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
    modelName.toLowerCase(),
  )

  await writeFileSafely(writeLocation, consolidateJsonForEvent)

  return 'Generated all events'
}
