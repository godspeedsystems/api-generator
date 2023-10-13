import { glob } from 'glob'
import * as yaml from 'js-yaml'
import fs from 'fs'
import path from 'path'
export type dsDefinition = {
  dsType?: 'prisma' | 'elasticgraph'
  dsName?: string
  dsFilePath?: string
  dsConfig?: object
}

export type egDatasourceConfig = {
  type: 'elasticgraph'
  schema_backend: string
  deep: boolean
  collect: boolean
}

const findDatasources = (datasourceDir: string): Promise<dsDefinition[]> => {
  // this will read the datasources dir, find all prisma, yamls
  // for yaml datasource, look for types, and filter with type elasticgraph
  return new Promise((resolve, reject) => {
    glob(
      path
        .join(datasourceDir, '**', '*.?(prisma|yaml|yml)')
        .replace(/\\/g, '/'),
      {
        ignore: path
          .join('**', 'generated-clients/**/*.?(prisma)')
          .replace(/\\/g, '/'),
      },
      (err: Error | null, datasourcePaths: string[]) => {
        if (err) {
          return reject(err)
        } else {
          if (datasourcePaths.length) {
            /**
             * filterout prisma, yaml and make an object like
             * {
             *    dsType: 'prisma|elasticgraph',
             *    dsName: 'remove extention',
             *    dsFilePath: 'path to the file',
             *    dsConfig: 'only availble for non prisma datasource'
             * }
             **/

            let dsDefinitions: dsDefinition[] = datasourcePaths
              .map((datasourcePath) => {
                let _dsDefinition: dsDefinition = {
                  dsType: 'prisma',
                  dsFilePath: datasourcePath,
                  dsName: datasourcePath.substring(
                    datasourcePath.lastIndexOf('/') + 1,
                  ),
                }

                if (datasourcePath.includes('.prisma')) {
                  _dsDefinition.dsType = 'prisma'
                } else {
                  try {
                    let _dsConfig = <egDatasourceConfig>(
                      yaml.load(
                        fs.readFileSync(datasourcePath, { encoding: 'utf-8' }),
                      )
                    )

                    if (_dsConfig.type === 'elasticgraph') {
                      _dsDefinition.dsType = 'elasticgraph'
                      _dsDefinition.dsConfig = _dsConfig
                    } else {
                      _dsDefinition = {}
                    }
                  } catch (error) {
                    console.error('error', error)
                  }
                }

                return _dsDefinition
              })
              // remove the empty objects
              .filter((ds) => Object.keys(ds).length)

            resolve(dsDefinitions)
          } else {
            reject(`Can't find any valid datasources at ${datasourceDir}`)
          }
        }
      },
    )
  })
}

export default findDatasources
