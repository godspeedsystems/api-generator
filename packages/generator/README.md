# godspeed-crud-api-generator

## Introduction

A custom prisma generator which will generate godspeed `events` and `workflows` for CRUD operations on datasource models. It usages `prisma generator API` to grab the `DMMF` of schema on `npx prisma generate` and based on model definitions it will generate corresponding events and workflows.

## Usages

1. `npm install @godspeedsystems/api-generator` in the project directory
2. Below lines need to be added to the datasource schema file, where auto generation is required

```js
generator godspeed {
  provider = "node ../../node_modules/godspeed-crud-api-generator" // relative path to generator package in node_modules
  output   = "../auto-generated-crud" // basePath for events and functions
}
```

3. `npx prisma generate` in the folder, If schema is located at custom path, specify with `--schema`

## Folder structure:

    * `events` follow this structure, example: CRUD method of a model `User` in `postgres` datasource
        - /[basePath]
            - /[datasourceName]
                - /[modelName]
                    - create.yaml (C)
                    - one.yaml (R)
                    - update.yaml (U)
                    - delete.yaml (D)

    * `workflows` follow this structure, exapmple: corresponding workflows for above `events`
        - /[com.biz]
            - /[datasourceName]
                - /[modelName]
                    - create.yaml (C)
                    - one.yaml (R)
                    - update.yaml (U)
                    - delete.yaml (D)

## Work In Porgress

    1. responses are yet to be generated in `events`
    2. `examples` in `events` schema are WIP
    3. Model relations are still I am trying to figure out, How to represent non scaler fields in OpenAPI schema.

> This generator was bootstraped using [create-prisma-generator](https://github.com/YassinEldeeb/create-prisma-generator)
