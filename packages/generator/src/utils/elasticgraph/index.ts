import { generateAndStoreEvent } from './event'
import { generateAndStoreWorkflow } from './workflow'

const elasticgraphGenerator = {
  eventGen: generateAndStoreEvent,
  workflowGen: generateAndStoreWorkflow,
}

export default elasticgraphGenerator
