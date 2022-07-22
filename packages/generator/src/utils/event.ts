import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from './generateWriteLocationForMethod'
import { writeFileSafely } from './writeFileSafely'
import { JSONSchema7 } from 'json-schema'
import assert from 'assert'

const jsYaml = require('js-yaml')

export type METHOD = 'one' | 'create' | 'update' | 'delete' | 'search'

type EventConfig = {
  dataSourceName: string
  modelFields: DMMF.Field[]
  modelName: string
  method: METHOD
}

const findIndexField = (modelFields: DMMF.Field[]): DMMF.Field | undefined => {
  let indexField = modelFields.find(
    ({ isId }: { isId: DMMF.Field['isId'] }) => isId,
  )

  return indexField
}

const generateEventKey = ({
  dataSourceName,
  modelName,
  modelFields,
  method,
}: EventConfig): string => {
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

const generateBodyAndParamsFromJsonSchema = (
  method: METHOD,
  modelName: string,
  jsonSchema: JSONSchema7,
  modelFields: DMMF.Field[],
): BodyAndParams => {
  // lets find the index field
  let indexField = findIndexField(modelFields)
  assert(indexField, 'Model has no index field')

  let definitions = jsonSchema['definitions']
  if (definitions) {
    let modelDefinition = definitions[modelName]

    assert(modelDefinition, `Definition undefined for ${modelName}`)
    assert(
      typeof modelDefinition !== 'boolean',
      `Definition of type boolean unsupported`,
    )

    let sanitizedProperties = Object.keys(
      modelDefinition.properties ?? {},
    ).reduce((accumulator: any, propertyName) => {
      assert(
        typeof modelDefinition !== 'boolean',
        `Definition of type boolean unsupported`,
      )
      if (typeof modelDefinition.properties !== 'undefined') {
        let property = modelDefinition.properties[propertyName]
        let _prop: { nullable?: boolean; type?: any } = {}

        assert(
          typeof property !== 'boolean',
          'Property of type boolean unsupported',
        )

        if (property.type === 'array') {
          property = {
            ...property,
            items: {
              type: 'object',
            },
          }
        }

        if (Array.isArray(property.type)) {
          if (property.type.find((_) => _ === 'null')) {
            _prop['nullable'] = true
            _prop['type'] = property.type[0]
          }
          property = {
            ...property,
            ..._prop,
          }
        }

        if (Array.isArray(property.anyOf)) {
          if (
            property.anyOf.find(
              (_) => typeof _ !== 'boolean' && _.type === 'null',
            )
          ) {
            _prop['type'] = 'object'
            _prop['nullable'] = true
          }
          property = {
            ..._prop,
          }
        }

        accumulator[propertyName] = property
        return accumulator
      }
    }, {})

    let { [indexField.name]: id, ...rest } = sanitizedProperties

    assert(typeof id !== 'undefined', 'Definition must have property `id`')
    assert(typeof id !== 'boolean', `id of type boolean unsupported`)
    assert(
      id.type === 'string' || id.type === 'integer',
      `id must be of type string or integer but got ${id.type}`,
    )

    return {
      body:
        method === 'create' || method === 'update'
          ? {
              content: {
                'application/json': {
                  schema: {
                    ...modelDefinition,
                    properties: {
                      ...rest,
                    },
                  },
                },
              },
            }
          : method === 'search'
          ? {
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                  },
                },
              },
            }
          : undefined,
      params:
        method !== 'create' && method !== 'search'
          ? [
              {
                name: 'id',
                in: 'path',
                required: true,
                schema: { type: 'string' },
              },
            ]
          : undefined,
    }
  } else {
    return {
      body: undefined,
      params: undefined,
    }
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

export const generateAndStoreEvent = async (
  eventConfig: EventConfig & {
    basePathForGeneration: string
    jsonSchema: JSONSchema7
  },
): Promise<string> => {
  let json: any = {}

  let {
    basePathForGeneration,
    dataSourceName,
    modelName,
    method,
    modelFields,
    jsonSchema,
  } = eventConfig

  let eventKey = generateEventKey({
    dataSourceName: dataSourceName,
    modelName: modelName,
    method: method,
    modelFields: modelFields,
  })

  let summary = generateSummaryBasedOnModelAndMethod(modelName, method)
  let description = generateDescriptionBasedOnModelAndMethod(modelName, method)
  let fn = generateFn(method, modelName, dataSourceName)

  let bodyAndParams: BodyAndParams = {}

  try {
    let { body, params } = generateBodyAndParamsFromJsonSchema(
      method,
      modelName,
      jsonSchema,
      modelFields,
    )

    bodyAndParams = { body, params }
  } catch (error) {
    console.warn(error)
  }

  let responses = generateResponses(method)
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
    modelName.toLowerCase(),
    method,
  )

  await writeFileSafely(writeLocation, jsYaml.dump(json))

  return 'generated all events'
}
