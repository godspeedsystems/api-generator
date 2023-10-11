import { DMMF } from '@prisma/generator-helper'
import assert from 'assert'
import { JSONSchema7 } from 'json-schema'
import replaceValuesByRegx from '../../helpers/replaceValuesByRegx'
import { findIndexField } from './event'

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

      // three cases, where we need to remove another refs
      if (property.type === 'array') {
        if (property.items && property.items.hasOwnProperty('$ref')) {
          return accumulator
        }
      }

      if (property.hasOwnProperty('$ref')) {
        return accumulator
      }

      if (
        property.hasOwnProperty('anyOf') ||
        property.hasOwnProperty('allOf') ||
        property.hasOwnProperty('oneOf')
      ) {
        let _ = property.anyOf || property.allOf || property.oneOf
        assert(_, 'anyOf/allOf/oneOf not defined')

        let refCount = _.filter((obj) => {
          return obj.hasOwnProperty('$ref') ? true : false
        }).length

        if (refCount) {
          return accumulator
        }
      }

      if (Array.isArray(property.type)) {
        if (property.type.length === 2) {
          // TODO: investigate in future
          _prop['nullable'] = true
          _prop['type'] = property.type[0]
        }
        if (property.type.length === 6) {
          // TODO: investigate in future
          _prop['nullable'] = true
          _prop['type'] = 'object'
        }
        property = {
          ...property,
          ..._prop,
        }
      }

      // if (
      //   property.hasOwnProperty('anyOf') ||
      //   property.hasOwnProperty('allOf') ||
      //   property.hasOwnProperty('oneOf')
      // ) {
      //   let _ = property.anyOf || property.allOf || property.oneOf
      //   assert(_, 'anyOf/allOf/oneOf not defined')

      //   let isNullable = false
      //   let exceptNull = _.filter((key) =>
      //     key && key !== true && key.type !== 'null' ? true : false,
      //   )
      //   // NOTE: Removing this because this is not a correct logic
      //   // if (exceptNull.length !== _.length) {
      //   //   isNullable = true
      //   // }

      //   property = {
      //     [Object.keys(property).length && Object.keys(property)[0]]:
      //       exceptNull,
      //   }

      //   isNullable && (_prop['nullable'] = true)

      //   property = {
      //     ...property,
      //     ..._prop,
      //   }
      // }

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
