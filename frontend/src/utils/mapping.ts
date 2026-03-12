import type { ColumnInfo } from '../types'

export interface MappingRow {
  id: string
  sourceNodeId: string
  sourceColumn: string
  targetName: string
  expression: string
  type: string
}

// Tier 0 Passthrough: Auto Map 시 expression 비움 (컬럼명만 매핑)
// TRIM/COALESCE/UPPER/CAST 자동 삽입은 제거 — 사용자가 Enhancement 메뉴로 명시적 적용
export function getAutoExpression(_col: ColumnInfo): string {
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
    type: (targetColumnMap?.get(col.columnName.toLowerCase()) ?? col.dataType).toUpperCase(),
  }))
}
