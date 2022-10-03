import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { writeFileSafely } from '../writeFileSafely'
import { JSONSchema7 } from 'json-schema'
import assert from 'assert'

const jsYaml = require('js-yaml')

export type METHOD = 'one' | 'create' | 'update' | 'delete' | 'search'

type EventConfig = {
  dataSourceName: string
  modelFields: DMMF.Field[]
  modelName: string
}

const findIndexField = (modelFields: DMMF.Field[]): DMMF.Field | undefined => {
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

    assert(
      modelDefinition && typeof modelDefinition !== 'boolean',
      `Definition undefined or boolean(unsupported) for ${modelName}`,
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

        // if (property.type === 'array') {
        //   property = {
        //     ...property,
        //     items: {
        //       type: 'object',
        //     },
        //   }
        // }

        if (Array.isArray(property.type)) {
          if (property.type.find((_) => _ === 'null')) {
            // TODO: investigate in future
            _prop['nullable'] = true
            _prop['type'] = property.type[0]
          }
          property = {
            ...property,
            ..._prop,
          }
        }

        if (
          property.hasOwnProperty('anyOf') ||
          property.hasOwnProperty('allOf') ||
          property.hasOwnProperty('oneOf')
        ) {
          let _ = property.anyOf || property.allOf || property.oneOf
          assert(_, 'anyOf/allOf/oneOf not defined')

          let isNullable = false
          let exceptNull = _.filter((key) =>
            key && key !== true && key.type !== 'null' ? true : false,
          )
          if (exceptNull.length !== _.length) {
            isNullable = true
          }

          property = {
            [Object.keys(property).length && Object.keys(property)[0]]:
              exceptNull,
          }

          isNullable && (_prop['nullable'] = true)

          property = {
            ...property,
            ..._prop,
          }
        }

        // if (Array.isArray(property.anyOf)) {
        //   if (
        //     property.anyOf.find(
        //       (_) => typeof _ !== 'boolean' && _.type === 'null',
        //     )
        //   ) {
        //     // TODO: refs comes here
        //     _prop['type'] = 'object'
        //     // TODO: this can be or can not be null, I guess. investigate more
        //     _prop['nullable'] = true
        //   }
        //   property = {
        //     ..._prop,
        //   }
        // }

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
                name: indexField.name,
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
): Promise<string> => {
  const { basePathForGeneration, dataSourceName, modelName } = eventConfig
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
    modelName.toLowerCase(),
  )

  await writeFileSafely(writeLocation, consolidateJsonForEvent)

  return 'Generated all events'
}
