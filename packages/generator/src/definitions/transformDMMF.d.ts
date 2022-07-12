declare module 'prisma-json-schema-generator/dist/generator/transformDMMF' {
  import type { DMMF } from '@prisma/generator-helper'
  import type { JSONSchema7 } from 'json-schema'

  export interface TransformOptions {
    keepRelationScalarFields?: 'true' | 'false'
    schemaId?: string
  }

  export function transformDMMF(
    dmmf: DMMF.Document,
    transformOptions: TransformOptions = {},
  ): JSONSchema7
}
