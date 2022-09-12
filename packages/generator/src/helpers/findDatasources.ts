import { glob } from 'glob'

type dsDefinition = {
  dsType: 'prisma' | 'elasticgraph'
  dsName: string
  dsFilePath: string
  dsConfig?: string
}

const findDatasources = (datasourceDir: string): Promise<dsDefinition[]> => {
  // this will read the datasources dir, find all prisma, yamls
  // for yaml datasource, look for types, and filter with type elasticgraph
  return new Promise((resolve, reject) => {
    glob(
      datasourceDir + '/**/*.?(prisma|yaml|yml)',
      { ignore: '/**/generated-clients/**/*.?(prisma)' },
      (err: Error | null, datasourcePaths: string[]) => {
        if (err) {
          return reject(err)
        } else {
          if (datasourcePaths.length) {
            // filterout prisma, yaml
            // and make an object like
            // { dsType: 'prisma|elasticgraph', dsName: 'remove extention',  dsFilePath: 'path to the file', dsConfig: 'only availble for non prisma datasource'}
            let dsDefinitions: dsDefinition[] = datasourcePaths.map(
              (datasourcePath) => {
                let _dsDefinition: dsDefinition = {
                  dsType: datasourcePath.lastIndexOf('.prisma')
                    ? 'prisma'
                    : 'elasticgraph',
                  dsFilePath: datasourcePath,
                  dsName: '',
                  dsConfig: '',
                }

                return _dsDefinition
              },
            )
          } else {
            reject(`Can't find any prisma schema's at ${datasourceDir}`)
          }
        }
      },
    )
  })
}

export default findDatasources
