import type { ColumnInfo } from '../types'

export interface MappingRow {
  id: string
  sourceNodeId: string
  sourceColumn: string
  targetName: string
  expression: string
  type: string
}

// 타입 및 컬럼명 패턴 기반 Expression 자동 제안
export function getAutoExpression(col: ColumnInfo): string {
  const name = col.columnName.toLowerCase()
  const type = col.dataType.toLowerCase()

  if (
    name.endsWith('_id') || name.endsWith('_cd') || name.endsWith('_code') ||
    name.endsWith('_key') || name.endsWith('_no') || name === 'id'
  ) {
    return `UPPER(TRIM(${col.columnName}))`
  }

  if (
    type.includes('int') || type.includes('decimal') || type.includes('numeric') ||
    type.includes('float') || type.includes('double') || type.includes('number') ||
    type.includes('serial') || type === 'money'
  ) {
    return `COALESCE(${col.columnName}, 0)`
  }

  if (type === 'date') {
    return `CAST(${col.columnName} AS DATE)`
  }

  if (type.includes('timestamp')) {
    return col.columnName
  }

  if (
    type.includes('varchar') || type.includes('char') || type.includes('text') ||
    type.includes('clob') || type === 'bpchar'
  ) {
    return `TRIM(${col.columnName})`
  }

  return ''
}

// 소스 컬럼 목록으로 자동 매핑 행 생성
export function buildAutoMappings(sourceNodeId: string, columns: ColumnInfo[]): MappingRow[] {
  return columns.map(col => ({
    id: `${sourceNodeId}-${col.columnName}-auto`,
    sourceNodeId,
    sourceColumn: col.columnName,
    targetName: col.columnName.toLowerCase(),
    expression: getAutoExpression(col),
    type: col.dataType,
  }))
}
