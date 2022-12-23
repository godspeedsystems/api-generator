import { DMMF } from '@prisma/generator-helper'
import assert from 'assert'
import { JSONSchema7 } from 'json-schema'
import replaceValuesByRegx from '../../helpers/replaceValuesByRegx'
import { findIndexField } from './event'
const jsYaml = require('js-yaml')

export const generateDefinitionsFile = (
  dsName: string,
  modelName: string,
  jsonSchema: JSONSchema7,
  modelFields: DMMF.Field[],
) => {
  let indexField = findIndexField(modelFields)
  assert(jsonSchema, `There is no valid jsonSchema present for ${dsName}.`)

  let definitions = jsonSchema.definitions
  assert(definitions, `There is no valid definitions present in jsonSchema.`)

  let modelDefinition = definitions[modelName]
  assert(
    modelDefinition && typeof modelDefinition !== 'boolean',
    `Definition is undefined or boolean(unsupported) for ${modelName}`,
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

      accumulator[propertyName] = property
      return accumulator
    }
  }, {})

  const { id, ...rest } = sanitizedProperties

  let _defs: any = {}

  _defs[modelName] = {
    type: 'object',
    properties: rest,
  }

  return replaceValuesByRegx(
    _defs,
    /^(#\/definitions\/)(.*)/i,
    `$1${dsName}/$2`,
  )
}
