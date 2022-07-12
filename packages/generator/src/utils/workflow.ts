import { DMMF } from '@prisma/generator-helper'
import { generateWriteLocationForMethod } from './generateWriteLocationForMethod'
import { writeFileSafely } from './writeFileSafely'

const jsYaml = require('js-yaml')

export type METHOD = 'one' | 'create' | 'update' | 'delete'
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
      return `${modelName.toLowerCase()}.findUnique`
    case 'create':
      return `${modelName.toLowerCase()}.create`
    case 'delete':
      return `${modelName.toLowerCase()}.delete`
    case 'update':
      return `${modelName}.update`
    default:
      return ''
  }
}

const generateData = (modelFields: DMMF.Field[], method: METHOD): any => {
  let indexField = modelFields.find((field) => field.isId)
  switch (method) {
    case 'one':
      return {
        data: {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `std.parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
          },
        },
      }
    case 'create':
      return {
        data: `<% inputs.body %>`,
      }
    case 'delete':
      return {
        data: {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `std.parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
          },
        },
      }
    // <js% Integer.parseInt(`inputs.params.${indexField?.name})`) %>
    case 'update':
      return {
        data: {
          where: {
            [`${indexField?.name}`]: `<% ${
              indexField?.type === 'Int'
                ? `std.parseInt(inputs.params.${indexField?.name})`
                : `inputs.params.${indexField?.name}`
            } %>`,
          },
          data: `<% inputs.body.data %>`,
        },
      }
    default:
      return ''
  }
}

export const generateAndStorWorkflow = async (
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
        fn: 'com.gs.datastore',
        args: {
          datasource: dataSourceName,
          ...data,
          config: {
            method: generateDsMethod(modelName, method),
          },
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

/*
summary: create a new user
tasks:
  - id: create_user
    description: create a new user
    fn: com.gs.datastore
    args:
        datasource: <%inputs.body.db%>
        data: <% inputs.body.data %>
        config:
          method: <% inputs.params.entity_type %>.create
*/
