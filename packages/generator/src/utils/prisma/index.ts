import { generateAndStoreEvent } from './event'
import { generateAndStoreWorkflow } from './workflow'

const prismaGenerator = {
  eventGen: generateAndStoreEvent,
  workflowGen: generateAndStoreWorkflow,
}

export default prismaGenerator
