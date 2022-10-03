import path from 'path'

export const generateWriteLocationForMethod = (
  outputPath: string,
  subPath: string,
  dsName: string,
  modelName: string,
  method?: string,
): string => {
  let fileName = method
    ? path.join(modelName.toLowerCase(), `${method}.yaml`)
    : `${modelName.toLowerCase()}.yaml`

  return path.join(outputPath, subPath, dsName, fileName)
}
