import path from 'path'

export const generateWriteLocationForMethod = (
  outputPath: string,
  subPath: string,
  dsName: string,
  modelName: string,
  method: string,
): string => {
  return path.join(
    outputPath,
    subPath,
    dsName,
    modelName.toLowerCase(),
    `${method}.yaml`,
  )
}
