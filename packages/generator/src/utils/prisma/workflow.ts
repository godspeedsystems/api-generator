import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from '../generateWriteLocationForMethod'
import { writeFileSafely } from '../writeFileSafely'

const jsYaml = require('js-yaml')

export type METHOD = 'one' | 'create' | 'update' | 'delete' | 'search'
type WorkflowConfig = {
  dataSourceName: string
  modelFields: DMMF.Field[]
  modelName: string
  method: METHOD
}

const generateSummaryBasedOnModelAndMethod = (
  modelName: string,
  method: METHOD,
): string => {
  switch (method) {
    case 'one':
      return `Fetch ${modelName}`
    case 'create':
      return `Create ${modelName}`
    case 'update':
      return `Update ${modelName}`
    case 'delete':
      return `Delete ${modelName}`
    case 'search':
      return `Fetch many ${modelName}`
    default:
      return ''
  }
}

const generateTaskId = (
  dataSourceName: string,
  modelName: string,
  method: string,
): any => {
  return `${dataSourceName.toLowerCase()}_${modelName.toLowerCase()}_${method}`
}

const generateDsMethod = (modelName: string, method: METHOD): string => {
  switch (method) {
    case 'one':
      return `${modelName}.findUnique`
    case 'create':
      return `${modelName}.create`
    case 'delete':
      return `${modelName}.delete`
    case 'update':
      return `${modelName}.update`
    case 'search':
      return `${modelName}.findMany`
    default:
      return ''
  }
}

const generateData = (modelFields: DMMF.Field[], method: METHOD): any => {
  let indexField = modelFields.find((field) => field.isId)
  switch (method) {
    case 'one':
      return {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
        },
      }
    case 'create':
      return {
        data: `<% inputs.body %>` ,
      }
    case 'delete':
      return {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
        },
      }
    case 'update':
      return {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
          },
          data: `<% inputs.body %>`,
      }
    case 'search':
      return {
        // data: `<% inputs.body %>`,
      }
    default:
      return ''
  }
}

export const generateAndStoreWorkflow = async (
  config: WorkflowConfig & { basePathForGeneration: string },
): Promise<string> => {
  let json: any
  const {
    basePathForGeneration,
    dataSourceName,
    modelName,
    method,
    modelFields,
  } = config

  const summary = generateSummaryBasedOnModelAndMethod(modelName, method)
  const taskId = generateTaskId(dataSourceName, modelName, method)
  const data = generateData(modelFields, method)

  json = {
    summary,
    tasks: [
      {
        id: taskId,
        // fn: 'com.gs.datastore',
        fn: `datasource.${dataSourceName}.${generateDsMethod(modelName, method)}`,
        args: {
          // datasource: dataSourceName,
          ...data,
          // config: {
          //   method: generateDsMethod(modelName, method),
          // },
        },
      },
    ],
  }

  const writeLocation = generateWriteLocationForMethod(
    basePathForGeneration,
    '/functions/com/biz',
    dataSourceName,
    modelName,
    method,
  )

  await writeFileSafely(writeLocation, jsYaml.dump(json))
  return 'generated all workflows'
}
