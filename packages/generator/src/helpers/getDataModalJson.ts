import { DMMF } from '@prisma/generator-helper'

export const getDataModelJSON = (dataModel: DMMF.Model): string => {
  return JSON.stringify(dataModel, null, 2)
}
