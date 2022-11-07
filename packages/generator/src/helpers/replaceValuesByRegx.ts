// recursively applies regx to the string values in the obj, and modified obj inplace
const replaceValuesByRegx = (
  obj: { [key: string]: any },
  regx: RegExp,
  replacement: string,
) => {
  if (!obj || typeof obj !== 'object') {
    return
  }

  Object.keys(obj).forEach((key: any) => {
    const value: any = obj[key]
    if (typeof value === 'string' && value.match(regx)) {
      obj[key] = value.replace(regx, replacement)
    } else if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i++) {
        return replaceValuesByRegx(value, regx, replacement)
      }
    } else if (typeof value === 'object') {
      return replaceValuesByRegx(value, regx, replacement)
    }
  })

  return obj
}

export default replaceValuesByRegx
