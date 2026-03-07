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

  // 1. PK 컬럼은 expression 작성 안함 (SRC-ODS 1:1 추적 보장)
  if (col.isPrimaryKey) {
    return ''
  }

  // 2. 숫자/시리얼 타입은 이름 패턴보다 우선 적용
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

  // 3. 문자열 타입에서만 이름 패턴 적용
  if (
    type.includes('varchar') || type.includes('char') || type.includes('text') ||
    type.includes('clob') || type === 'bpchar'
  ) {
    if (
      name.endsWith('_id') || name.endsWith('_cd') || name.endsWith('_code') ||
      name.endsWith('_key') || name.endsWith('_no') || name === 'id'
    ) {
      return `UPPER(TRIM(${col.columnName}))`
    }
    return `TRIM(${col.columnName})`
  }

  return ''
}

// 소스 컬럼 목록으로 자동 매핑 행 생성
// targetColumnMap: 타겟 테이블 컬럼명(소문자) → dataType 매핑
export function buildAutoMappings(
  sourceNodeId: string,
  columns: ColumnInfo[],
  targetColumnMap?: Map<string, string>
): MappingRow[] {
  return columns.map(col => ({
    id: `${sourceNodeId}-${col.columnName}-auto`,
    sourceNodeId,
    sourceColumn: col.columnName,
    targetName: col.columnName.toLowerCase(),
    expression: getAutoExpression(col),
    type: targetColumnMap?.get(col.columnName.toLowerCase()) ?? col.dataType,
  }))
}
